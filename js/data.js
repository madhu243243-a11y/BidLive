/* Shared client-side state and API-backed auction/watchlist helpers. */
const CATEGORIES_DATA = [
  { name: 'Electronics', icon: '⚡' }, { name: 'Mobiles', icon: '📱' },
  { name: 'Laptops', icon: '💻' }, { name: 'Fashion', icon: '👟' },
  { name: 'Watches', icon: '⌚' }, { name: 'Cameras', icon: '📷' },
  { name: 'Vehicles', icon: '🏍️' }, { name: 'Collectibles', icon: '💎' }
];

function getCurrentUser() {
  try { return JSON.parse(sessionStorage.getItem('bidlive_user') || 'null'); }
  catch (error) { return null; }
}

function getAccessToken() {
  return sessionStorage.getItem('bidlive_token') || '';
}

function setCurrentUser(user, token, remember = true) {
  logoutUser();
  sessionStorage.setItem('bidlive_user', JSON.stringify(user));
  sessionStorage.setItem('bidlive_token', token);
  if (remember) localStorage.setItem('bidlive_remembered_email', user.email);
}

function logoutUser() {
  sessionStorage.removeItem('bidlive_user');
  sessionStorage.removeItem('bidlive_token');
}

async function getAuctions(options = {}) {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.category) params.set('category', options.category);
  if (options.search) params.set('search', options.search);
  if (options.mine) params.set('mine', 'true');
  const query = params.toString();
  const data = await apiRequest(`/auctions${query ? `?${query}` : ''}`);
  return data.auctions || [];
}

async function getAuctionById(id) {
  const data = await apiRequest(`/auctions/${encodeURIComponent(id)}`);
  return data.auction;
}

async function getMyBids() {
  const data = await apiRequest('/bids/mine');
  return data.bids || [];
}

async function getWatchlist() {
  const data = await apiRequest('/watchlist');
  return data.auctions || [];
}

async function isAuctionSaved(auctionId) {
  const saved = await getWatchlist();
  return saved.some(auction => Number(auction.id) === Number(auctionId));
}

function syncWatchlistButtons(auctionId, saved) {
  document.querySelectorAll('[data-watchlist-id]').forEach(button => {
    if (Number(button.getAttribute('data-watchlist-id')) !== Number(auctionId)) return;
    button.textContent = saved ? '★ Saved' : '☆ Save';
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? 'Remove from saved auctions' : 'Save auction');
  });
}

function initWatchlistButton(button, auctionId) {
  if (!button || button.dataset.watchlistInitialized) return;
  button.setAttribute('data-watchlist-id', String(auctionId));
  button.dataset.watchlistInitialized = 'true';
  if (!getCurrentUser()) {
    button.textContent = '☆ Save';
    button.setAttribute('aria-pressed', 'false');
  } else {
    isAuctionSaved(auctionId).then(saved => syncWatchlistButtons(auctionId, saved)).catch(error => showToast(error.message, 'danger'));
  }
  button.addEventListener('click', async () => {
    if (!getCurrentUser()) {
      showToast('Sign in to save auctions to your watchlist.', 'info');
      sessionStorage.setItem('bidlive_return_to', window.location.href);
      window.location.href = 'login.html';
      return;
    }
    try {
      const saved = await isAuctionSaved(auctionId);
      if (saved) await apiRequest(`/watchlist/${encodeURIComponent(auctionId)}`, { method: 'DELETE' });
      else await apiRequest(`/watchlist/${encodeURIComponent(auctionId)}`, { method: 'POST', body: '{}' });
      syncWatchlistButtons(auctionId, !saved);
      showToast(saved ? 'Auction removed from your watchlist.' : 'Auction saved to your watchlist.', 'success');
    } catch (error) { showToast(error.message, 'danger'); }
  });
}

async function placeBid(auctionId, amount) {
  return apiRequest(`/auctions/${encodeURIComponent(auctionId)}/bids`, { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) });
}

async function createNewAuction(data) {
  const result = await apiRequest('/auctions', { method: 'POST', body: JSON.stringify(data) });
  return result.auction;
}

