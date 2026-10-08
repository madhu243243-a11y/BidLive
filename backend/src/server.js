require('dotenv').config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random secret with at least 32 characters.');
}

const app = require('./app');
const pool = require('./db');
const http = require('node:http');
const attachRealtimeServer = require('./realtime');
const port = Number(process.env.PORT || 3000);
const server = http.createServer(app);
const io = attachRealtimeServer(server, pool, app.get('allowedOrigins'));
app.set('io', io);
server.listen(port, () => console.log(`BidLive API and Socket.IO listening on port ${port}`));

async function shutdown() {
  io.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

