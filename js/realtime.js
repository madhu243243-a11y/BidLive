let socketClientLoad = null;
let auctionSocket = null;
let activeRealtimeAuctionId = null;
let activeBidUpdateHandler = null;

function loadSocketClient() {
  if (window.io) return Promise.resolve();
  if (socketClientLoad) return socketClientLoad;

  socketClientLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('/socket.io/socket.io.js', window.BIDLIVE_SOCKET_URL).href;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Live updates are unavailable. Bidding still works; reload to reconnect.'));
    document.head.appendChild(script);
  });
  return socketClientLoad;
}

function setRealtimeStatus(message, state = 'info') {
  const status = document.getElementById('bid-realtime-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function connectAuctionRealtime(auctionId, onBidUpdated) {
  const id = Number(auctionId);
  if (!Number.isSafeInteger(id) || id < 1) return;
  activeRealtimeAuctionId = id;
  setRealtimeStatus('Connecting to live bid updates…');

  try {
    await loadSocketClient();
    if (activeRealtimeAuctionId !== id) return;

    if (auctionSocket && auctionSocket.connected && activeBidUpdateHandler) {
      auctionSocket.off('bid:updated', activeBidUpdateHandler);
      if (activeRealtimeAuctionId !== id) auctionSocket.emit('auction:leave', { auctionId: id });
    }

    if (!auctionSocket) {
      auctionSocket = window.io(window.BIDLIVE_SOCKET_URL, { reconnection: true });
      auctionSocket.on('connect', () => {
        const joinedAuctionId = activeRealtimeAuctionId;
        if (!joinedAuctionId) return;
        auctionSocket.emit('auction:join', { auctionId: joinedAuctionId }, result => {
          if (joinedAuctionId !== activeRealtimeAuctionId) return;
          if (result && result.ok) setRealtimeStatus('Live bid updates connected.', 'success');
          else setRealtimeStatus(result?.error || 'Live bid updates could not join this auction.', 'error');
        });
      });
      auctionSocket.on('disconnect', () => setRealtimeStatus('Live updates disconnected. Reconnecting…', 'warning'));
      auctionSocket.on('connect_error', () => setRealtimeStatus('Live updates unavailable. Bidding still works; reconnecting…', 'warning'));
    }

    if (activeBidUpdateHandler) auctionSocket.off('bid:updated', activeBidUpdateHandler);
    activeBidUpdateHandler = payload => {
      if (!payload || Number(payload.auctionId) !== activeRealtimeAuctionId) return;
      onBidUpdated(payload);
    };
    auctionSocket.on('bid:updated', activeBidUpdateHandler);

    if (!auctionSocket.connected) auctionSocket.connect();
    else auctionSocket.emit('auction:join', { auctionId: id }, result => {
      if (result && result.ok) setRealtimeStatus('Live bid updates connected.', 'success');
      else setRealtimeStatus(result?.error || 'Live bid updates could not join this auction.', 'error');
    });
  } catch (error) {
    setRealtimeStatus(error.message || 'Live updates unavailable. Bidding still works.', 'warning');
  }
}

function cleanupAuctionRealtime() {
  if (!auctionSocket) return;
  if (activeRealtimeAuctionId) auctionSocket.emit('auction:leave', { auctionId: activeRealtimeAuctionId });
  if (activeBidUpdateHandler) auctionSocket.off('bid:updated', activeBidUpdateHandler);
  auctionSocket.disconnect();
  auctionSocket = null;
  activeBidUpdateHandler = null;
  activeRealtimeAuctionId = null;
}

window.addEventListener('pagehide', cleanupAuctionRealtime, { once: true });
