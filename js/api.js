/* BidLive API client. Configure before this file with window.BIDLIVE_API_BASE if needed. */
const BIDLIVE_API_BASE = window.BIDLIVE_API_BASE || 'http://localhost:3000/api';
window.BIDLIVE_SOCKET_URL = window.BIDLIVE_SOCKET_URL || new URL(BIDLIVE_API_BASE, window.location.href).origin;

async function apiRequest(path, options = {}) {
  const token = getAccessToken();
  const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers };
  let response;
  try {
    response = await fetch(`${BIDLIVE_API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error('Cannot connect to BidLive. Check that the backend is running.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) logoutUser();
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.details = data.details;
    throw error;
  }
  return data;
}

