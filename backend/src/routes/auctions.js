const express = require('express');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { ALLOWED_CATEGORIES, parsePositiveId, validAuctionInput, validDecimalAmount } = require('../utils/validation');
const { bidLimiter } = require('../middleware/rate-limit');

const router = express.Router();
const auctionSelect = `SELECT a.id, a.seller_id AS sellerId, a.title, a.description, a.category,
  a.starting_price AS startingPrice, a.current_bid AS currentBid,
  a.minimum_increment AS minimumIncrement, a.image_url AS imageUrl, a.end_time AS endTime,
  a.status, u.name AS seller, a.created_at AS createdAt,
  (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bidsCount
  FROM auctions a JOIN users u ON u.id = a.seller_id`;

function serializeAuction(row) {
  const end = new Date(row.endTime).getTime();
  return { ...row, id: Number(row.id), sellerId: Number(row.sellerId), startingPrice: Number(row.startingPrice), currentBid: Number(row.currentBid), minimumIncrement: Number(row.minimumIncrement), bidsCount: Number(row.bidsCount), endTimestamp: end, endsInSeconds: Math.max(0, Math.ceil((end - Date.now()) / 1000)), status: end <= Date.now() ? 'ended' : row.status };
}

router.get('/', async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    const where = [];
    const params = [];
    if (category !== undefined && (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category))) return res.status(400).json({ error: 'Choose a valid auction category.' });
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) return res.status(400).json({ error: 'Search must be a string of no more than 100 characters.' });
    if (status === 'live' || !status) where.push("a.status = 'active' AND a.end_time > NOW()");
    else if (status === 'ended') where.push('(a.status = ? OR a.end_time <= NOW())'), params.push('ended');
    else if (status !== 'all') return res.status(400).json({ error: 'Status must be live, ended, or all.' });
    if (category) where.push('a.category = ?'), params.push(String(category));
    if (search) where.push('(a.title LIKE ? OR a.description LIKE ? OR a.category LIKE ?)'), params.push(...Array(3).fill(`%${String(search).slice(0, 100)}%`));
    const [rows] = await pool.execute(`${auctionSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.end_time ASC`, params);
    return res.json({ auctions: rows.map(serializeAuction) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const [rows] = await pool.execute(`${auctionSelect} WHERE a.id = ? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Auction not found.' });
    const auction = serializeAuction(rows[0]);
    const [bidRows] = await pool.execute('SELECT b.bid_amount AS amount, b.created_at AS createdAt, u.name AS bidder FROM bids b JOIN users u ON u.id = b.bidder_id WHERE b.auction_id = ? ORDER BY b.created_at DESC LIMIT 50', [id]);
    auction.bidHistory = bidRows.map(bid => ({ bidder: bid.bidder, amount: Number(bid.amount), time: new Date(bid.createdAt).toLocaleString() }));
    return res.json({ auction });
  } catch (error) { return next(error); }
});

router.post('/', authenticateToken, requireRole('seller'), async (req, res, next) => {
  try {
    const errors = validAuctionInput(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    const input = req.body;
    const [result] = await pool.execute(`INSERT INTO auctions
      (seller_id, title, description, category, starting_price, current_bid, minimum_increment, image_url, end_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`, [req.user.id, input.title.trim(), input.description.trim(), input.category, Number(input.startingPrice), Number(input.startingPrice), Number(input.minimumIncrement || 100), input.imageUrl || null, new Date(input.endTime)]);
    const [rows] = await pool.execute(`${auctionSelect} WHERE a.id = ?`, [result.insertId]);
    return res.status(201).json({ auction: serializeAuction(rows[0]) });
  } catch (error) { return next(error); }
});

router.put('/:id', authenticateToken, requireRole('seller'), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const errors = validAuctionInput(req.body || {}, true);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });
    const fields = { title: ['title', v => v.trim()], description: ['description', v => v.trim()], category: ['category', v => v], startingPrice: ['starting_price', Number], minimumIncrement: ['minimum_increment', Number], imageUrl: ['image_url', v => v || null], endTime: ['end_time', v => new Date(v)] };
    const sets = []; const values = [];
    for (const [key, [column, convert]] of Object.entries(fields)) if (Object.hasOwn(req.body, key)) { sets.push(`${column} = ?`); values.push(convert(req.body[key])); }
    if (!sets.length) return res.status(400).json({ error: 'Provide at least one field to update.' });
    const [result] = await pool.execute(`UPDATE auctions SET ${sets.join(', ')} WHERE id = ? AND seller_id = ?`, [...values, id, req.user.id]);
    if (!result.affectedRows) {
      const [found] = await pool.execute('SELECT seller_id FROM auctions WHERE id = ?', [id]);
      return found.length ? res.status(403).json({ error: 'You can only modify your own auctions.' }) : res.status(404).json({ error: 'Auction not found.' });
    }
    const [rows] = await pool.execute(`${auctionSelect} WHERE a.id = ?`, [id]);
    return res.json({ auction: serializeAuction(rows[0]) });
  } catch (error) { return next(error); }
});

router.delete('/:id', authenticateToken, requireRole('seller'), async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const [result] = await pool.execute('DELETE FROM auctions WHERE id = ? AND seller_id = ?', [id, req.user.id]);
    if (!result.affectedRows) {
      const [found] = await pool.execute('SELECT seller_id, status FROM auctions WHERE id = ?', [id]);
      if (!found.length) return res.status(404).json({ error: 'Auction not found.' });
      if (Number(found[0].seller_id) !== req.user.id) return res.status(403).json({ error: 'You can only delete your own auctions.' });
      return res.status(404).json({ error: 'Auction not found.' });
    }
    return res.json({ message: 'Auction cancelled.' });
  } catch (error) { return next(error); }
});

router.get('/:id/bids', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const [found] = await pool.execute('SELECT id FROM auctions WHERE id = ?', [id]);
    if (!found.length) return res.status(404).json({ error: 'Auction not found.' });
    const [rows] = await pool.execute('SELECT b.id, b.bid_amount AS amount, b.created_at AS createdAt, u.name AS bidder FROM bids b JOIN users u ON u.id = b.bidder_id WHERE b.auction_id = ? ORDER BY b.created_at DESC', [id]);
    return res.json({ bids: rows.map(row => ({ ...row, id: Number(row.id), amount: Number(row.amount) })) });
  } catch (error) { return next(error); }
});

router.post('/:id/bids', bidLimiter, authenticateToken, requireRole('buyer'), async (req, res, next) => {
  const id = parsePositiveId(req.params.id);
  const amount = Number(req.body && req.body.amount);
  if (id === null || !validDecimalAmount(req.body && req.body.amount) || amount <= 0) return res.status(400).json({ error: 'Provide a valid auction id and bid amount below 100,000,000 with no more than 2 decimal places.' });

  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.execute('SELECT id, current_bid, minimum_increment, status, end_time FROM auctions WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await connection.rollback(); transactionStarted = false; return res.status(404).json({ error: 'Auction not found.' }); }
    const auction = rows[0];
    if (auction.status !== 'active' || new Date(auction.end_time).getTime() <= Date.now()) { await connection.rollback(); transactionStarted = false; return res.status(409).json({ error: 'Auction has ended and cannot accept bids.' }); }
    const minimumBid = Number(auction.current_bid) + Number(auction.minimum_increment);
    if (amount < minimumBid) { await connection.rollback(); transactionStarted = false; return res.status(400).json({ error: `Bid must be at least ${minimumBid}.`, minimumBid }); }
    const [insertResult] = await connection.execute('INSERT INTO bids (auction_id, bidder_id, bid_amount) VALUES (?, ?, ?)', [id, req.user.id, amount]);
    const extendsAuction = new Date(auction.end_time).getTime() - Date.now() <= 30000;
    await connection.execute(`UPDATE auctions SET current_bid = ?, end_time = ${extendsAuction ? 'DATE_ADD(end_time, INTERVAL 30 SECOND)' : 'end_time'} WHERE id = ?`, [amount, id]);
    const [eventRows] = await connection.execute(`SELECT a.current_bid AS currentBid, a.end_time AS endTime,
      (SELECT COUNT(*) FROM bids WHERE auction_id = a.id) AS bidsCount,
      b.id AS bidId, b.bid_amount AS bidAmount, b.created_at AS createdAt, u.name AS bidderName
      FROM auctions a JOIN bids b ON b.auction_id = a.id JOIN users u ON u.id = b.bidder_id
      WHERE a.id = ? AND b.id = ? LIMIT 1`, [id, insertResult.insertId]);
    const eventRow = eventRows[0];
    const endTimestamp = new Date(eventRow.endTime).getTime();
    const realtimeBid = {
      auctionId: id,
      bidId: Number(eventRow.bidId),
      currentBid: Number(eventRow.currentBid),
      bidAmount: Number(eventRow.bidAmount),
      bidderName: eventRow.bidderName,
      createdAt: new Date(eventRow.createdAt).toISOString(),
      bidsCount: Number(eventRow.bidsCount),
      endTimestamp,
      endsInSeconds: Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000))
    };
    await connection.commit();
    transactionStarted = false;
    const io = req.app.get('io');
    if (io) io.to(`auction:${id}`).emit('bid:updated', realtimeBid);
    const [updated] = await pool.execute(`${auctionSelect} WHERE a.id = ?`, [id]);
    const [history] = await pool.execute('SELECT b.bid_amount AS amount, b.created_at AS createdAt, u.name AS bidder FROM bids b JOIN users u ON u.id = b.bidder_id WHERE b.auction_id = ? ORDER BY b.created_at DESC LIMIT 50', [id]);
    const resultAuction = serializeAuction(updated[0]);
    resultAuction.bidHistory = history.map(bid => ({ bidder: bid.bidder, amount: Number(bid.amount), time: new Date(bid.createdAt).toLocaleString() }));
    return res.status(201).json({ message: 'Bid placed successfully.', auction: resultAuction, extended: extendsAuction });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally { connection.release(); }
});

module.exports = router;

