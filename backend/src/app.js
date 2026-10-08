const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const auctionRoutes = require('./routes/auctions');
const watchlistRoutes = require('./routes/watchlist');
const bidRoutes = require('./routes/bids');

const app = express();
const localDevelopmentOrigins = ['http://localhost:5500', 'http://127.0.0.1:5500'];
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
if (configuredOrigins.includes('*')) throw new Error('CORS_ORIGIN must list explicit frontend origins; wildcard origins are not allowed.');
const allowedOrigins = configuredOrigins.length ? configuredOrigins : (process.env.NODE_ENV === 'production' ? [] : localDevelopmentOrigins);
app.set('allowedOrigins', allowedOrigins);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, credentials: false }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', database: 'connected' });
  } catch (error) { return next(error); }
});
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/bids', bidRoutes);

app.use((req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed' || error.status === 400) return res.status(400).json({ error: 'Request body is invalid.' });
  if (error.type === 'entity.too.large' || error.status === 413) return res.status(413).json({ error: 'Request body is too large.' });
  if (error.message === 'Origin is not allowed by CORS.') return res.status(403).json({ error: error.message });
  if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') return res.status(500).json({ error: 'The BidLive database schema is incompatible or incomplete. Check the setup documentation.' });
  console.error(`Unhandled API error (${error.code || 'unknown'}).`);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

module.exports = app;

