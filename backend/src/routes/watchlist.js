const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { parsePositiveId } = require('../utils/validation');

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT a.id, a.title, a.description, a.category,
      a.starting_price AS startingPrice, a.current_bid AS currentBid,
      a.minimum_increment AS minimumIncrement, a.image_url AS imageUrl, a.end_time AS endTime,
      a.status, u.name AS seller, a.seller_id AS sellerId,
      (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bidsCount
      FROM watchlist w JOIN auctions a ON a.id = w.auction_id JOIN users u ON u.id = a.seller_id
      WHERE w.user_id = ? ORDER BY w.created_at DESC`, [req.user.id]);
    return res.json({ auctions: rows.map(row => ({ ...row, id: Number(row.id), currentBid: Number(row.currentBid), startingPrice: Number(row.startingPrice), minimumIncrement: Number(row.minimumIncrement), bidsCount: Number(row.bidsCount), endTimestamp: new Date(row.endTime).getTime() })) });
  } catch (error) { return next(error); }
});

router.post('/:auctionId', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.auctionId);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const [result] = await pool.execute('INSERT IGNORE INTO watchlist (user_id, auction_id) SELECT ?, id FROM auctions WHERE id = ?', [req.user.id, id]);
    if (!result.affectedRows) {
      const [rows] = await pool.execute('SELECT id FROM auctions WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Auction not found.' });
      return res.status(200).json({ message: 'Auction is already in your watchlist.' });
    }
    return res.status(201).json({ message: 'Auction added to your watchlist.' });
  } catch (error) { return next(error); }
});

router.delete('/:auctionId', async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.auctionId);
    if (id === null) return res.status(400).json({ error: 'Invalid auction id.' });
    const [result] = await pool.execute('DELETE FROM watchlist WHERE user_id = ? AND auction_id = ?', [req.user.id, id]);
    return res.json({ message: result.affectedRows ? 'Auction removed from your watchlist.' : 'Auction was not in your watchlist.', removed: Boolean(result.affectedRows) });
  } catch (error) { return next(error); }
});

module.exports = router;

