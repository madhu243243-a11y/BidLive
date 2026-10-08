const express = require('express');
const pool = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
router.get('/mine', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(`SELECT b.id, b.auction_id AS auctionId, b.bid_amount AS amount,
      b.created_at AS createdAt, a.title, a.current_bid AS currentBid, a.end_time AS endTime,
      a.status, (SELECT MAX(b2.bid_amount) FROM bids b2 WHERE b2.auction_id = a.id) AS highestBid,
      (SELECT bidder_id FROM bids b3 WHERE b3.auction_id = a.id ORDER BY b3.bid_amount DESC, b3.created_at ASC LIMIT 1) AS highestBidderId
      FROM bids b JOIN auctions a ON a.id = b.auction_id WHERE b.bidder_id = ?
      ORDER BY b.created_at DESC`, [req.user.id]);
    return res.json({ bids: rows.map(row => ({ ...row, id: Number(row.id), auctionId: Number(row.auctionId), amount: Number(row.amount), currentBid: Number(row.currentBid), highestBid: Number(row.highestBid || 0), endTimestamp: new Date(row.endTime).getTime(), status: new Date(row.endTime).getTime() <= Date.now() ? 'ended' : row.status, isWinning: Number(row.highestBidderId) === req.user.id })) });
  } catch (error) { return next(error); }
});
module.exports = router;

