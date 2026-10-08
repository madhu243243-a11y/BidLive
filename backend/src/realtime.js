const { Server } = require('socket.io');
const { parsePositiveId } = require('./utils/validation');

function attachRealtimeServer(server, pool, allowedOrigins) {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin is not allowed by CORS.'));
      },
      methods: ['GET', 'POST'],
      credentials: false
    }
  });

  io.on('connection', socket => {
    socket.data.auctionRoom = null;
    socket.data.auctionRoomOperation = Promise.resolve();

    const queueRoomOperation = (operation, acknowledge) => {
      const pending = socket.data.auctionRoomOperation.then(operation);
      socket.data.auctionRoomOperation = pending.catch(() => {});
      pending.catch(() => {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Could not update auction room.' });
      });
    };

    socket.on('auction:join', (payload = {}, acknowledge) => {
      const auctionId = parsePositiveId(payload && payload.auctionId);
      if (auctionId === null) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Invalid auction id.' });
        return;
      }

      queueRoomOperation(async () => {
        if (!socket.connected) return;
        const [rows] = await pool.execute('SELECT id FROM auctions WHERE id = ? LIMIT 1', [auctionId]);
        if (!rows.length) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Auction not found.' });
          return;
        }
        if (!socket.connected) return;

        const room = `auction:${auctionId}`;
        const previousRoom = socket.data.auctionRoom;
        if (previousRoom && previousRoom !== room) await socket.leave(previousRoom);
        if (previousRoom !== room) await socket.join(room);
        if (!socket.connected) {
          await socket.leave(room);
          return;
        }
        socket.data.auctionRoom = room;
        if (typeof acknowledge === 'function') acknowledge({ ok: true, auctionId });
      }, acknowledge);
    });

    socket.on('auction:leave', (payload = {}, acknowledge) => {
      const auctionId = parsePositiveId(payload && payload.auctionId);
      if (auctionId === null) {
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Invalid auction id.' });
        return;
      }

      queueRoomOperation(async () => {
        const room = `auction:${auctionId}`;
        await socket.leave(room);
        if (socket.data.auctionRoom === room) socket.data.auctionRoom = null;
        if (typeof acknowledge === 'function') acknowledge({ ok: true, auctionId });
      }, acknowledge);
    });

    socket.on('disconnect', () => { socket.data.auctionRoom = null; });
  });

  return io;
}

module.exports = attachRealtimeServer;
