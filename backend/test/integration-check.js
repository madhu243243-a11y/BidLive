require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { io: connectSocket } = require('socket.io-client');
const pool = require('../src/db');

const api = `http://127.0.0.1:${process.env.PORT || 3000}/api`;
const password = `QA-${crypto.randomBytes(10).toString('hex')}`;
const suffix = crypto.randomBytes(6).toString('hex');
const emails = [`buyer-${suffix}@example.test`, `seller-${suffix}@example.test`, `other-${suffix}@example.test`];
const auctionIds = [];
const passed = [];
const sockets = [];

async function call(path, { method = 'GET', body, token, expected } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function check(name, path, options) {
  const data = await call(path, options);
  passed.push(name);
  return data;
}

async function register(role, email) {
  return check(`register ${role}`, '/auth/register', { method: 'POST', body: { name: `QA ${role}`, email, password, role }, expected: 201 });
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = connectSocket(api.replace(/\/api$/, ''), { forceNew: true, reconnection: false, timeout: 5000 });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function socketAck(socket, event, payload) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}

function nextSocketEvent(socket, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('bid:updated', onEvent); reject(new Error('Timed out waiting for bid:updated.')); }, timeoutMs);
    const onEvent = payload => { clearTimeout(timer); resolve(payload); };
    socket.once('bid:updated', onEvent);
  });
}

function waitFor(condition, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (condition()) { clearInterval(timer); resolve(); }
      else if (Date.now() - started >= timeoutMs) { clearInterval(timer); reject(new Error('Timed out waiting for socket event delivery.')); }
    }, 10);
  });
}

(async () => {
  const health = await check('health and MySQL connection', '/health', { expected: 200 });
  assert.equal(health.database, 'connected');
  const healthResponse = await fetch(`${api}/health`);
  assert.equal(healthResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(healthResponse.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(healthResponse.headers.get('x-powered-by'), null);
  passed.push('Helmet security headers and server fingerprint protection');

  const allowedOrigin = (process.env.CORS_ORIGIN || 'http://127.0.0.1:5500').split(',')[0].trim();
  const allowedPreflight = await fetch(`${api}/auth/login`, { method: 'OPTIONS', headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(allowedPreflight.status, 204);
  assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), allowedOrigin);
  const deniedOrigin = await fetch(`${api}/health`, { headers: { Origin: 'https://not-allowed.example.test' } });
  assert.equal(deniedOrigin.status, 403);
  assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await deniedOrigin.json(), { error: 'Origin is not allowed by CORS.' });
  passed.push('CORS allows configured frontend origins and rejects unconfigured origins');

  const largeBody = await fetch(`${api}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(110_000) }) });
  assert.equal(largeBody.status, 413);
  assert.deepEqual(await largeBody.json(), { error: 'Request body is too large.' });
  passed.push('oversized JSON request is rejected with safe 413 response');

  const buyer = await register('buyer', emails[0]);
  const seller = await register('seller', emails[1]);
  const otherSeller = await register('seller', emails[2]);
  await check('invalid email rejected during registration', '/auth/register', { method: 'POST', body: { name: 'Bad Email', email: `invalid-email-${suffix}`, password, role: 'buyer' }, expected: 400 });
  await check('empty registration fields rejected', '/auth/register', { method: 'POST', body: { name: ' ', email: '', password: '', role: 'buyer' }, expected: 400 });
  await check('excessive user name length rejected', '/auth/register', { method: 'POST', body: { name: 'x'.repeat(101), email: `long-name-${suffix}@example.test`, password, role: 'buyer' }, expected: 400 });
  await check('bcrypt maximum password byte length enforced', '/auth/register', { method: 'POST', body: { name: 'Long Password', email: `long-password-${suffix}@example.test`, password: 'x'.repeat(73), role: 'buyer' }, expected: 400 });
  assert.ok(buyer.token && !('password' in buyer.user) && !('passwordHash' in buyer.user));
  await check('invalid role rejected', '/auth/register', { method: 'POST', body: { name: 'Invalid Role', email: `invalid-${suffix}@example.test`, password, role: 'admin' }, expected: 400 });
  await check('duplicate email rejected', '/auth/register', { method: 'POST', body: { name: 'Duplicate', email: emails[0], password, role: 'buyer' }, expected: 409 });
  await check('invalid login rejected', '/auth/login', { method: 'POST', body: { email: emails[0], password: 'wrong-password' }, expected: 401 });
  const login = await check('valid login returns JWT', '/auth/login', { method: 'POST', body: { email: emails[0], password }, expected: 200 });
  assert.ok(login.token);
  await check('unauthorized watchlist rejected', '/watchlist', { expected: 401 });
  await check('invalid JWT rejected', '/watchlist', { token: 'not-a-valid-token', expected: 401 });
  await check('malformed JWT rejected', '/watchlist', { token: 'eyJhbGciOiJIUzI1NiJ9.e30.invalid', expected: 401 });
  const malformedToken = await fetch(`${api}/watchlist`, { headers: { Authorization: 'Bearer one two' } });
  assert.equal(malformedToken.status, 401);
  assert.deepEqual(await malformedToken.json(), { error: 'Authentication required.' });
  const expiredToken = jwt.sign({ name: 'Expired', role: 'buyer' }, process.env.JWT_SECRET, { subject: '1', expiresIn: -1 });
  await check('expired JWT rejected', '/watchlist', { token: expiredToken, expected: 401 });
  const storedUser = await pool.execute('SELECT password, role FROM users WHERE email = ?', [emails[0]]);
  assert.match(storedUser[0][0].password, /^\$2[aby]\$/);
  passed.push('registration stores bcrypt hash and never returns it');
  const secretLeakCheck = JSON.stringify(await (await fetch(`${api}/watchlist`, { headers: { Authorization: 'Bearer invalid' } })).json());
  assert.doesNotMatch(secretLeakCheck, /stack|JWT_SECRET|DB_PASSWORD|C:\\\\Users/i);
  passed.push('authentication error response does not expose secrets or stack details');

  const input = (title, price = 1000) => ({ title: `${title} ${suffix}`, description: 'Temporary integration-test lot with a sufficiently detailed description.', category: 'Electronics', startingPrice: price, minimumIncrement: 100, endTime: new Date(Date.now() + 300000).toISOString() });
  const created = await check('seller creates auction', '/auctions', { method: 'POST', body: input('QA Auction'), token: seller.token, expected: 201 });
  const auctionId = created.auction.id;
  auctionIds.push(auctionId);
  assert.equal(created.auction.sellerId, seller.user.id, 'seller id must come from the JWT');
  const otherCreated = await check('seller creates isolated room auction', '/auctions', { method: 'POST', body: input('QA Room Isolation'), token: seller.token, expected: 201 });
  auctionIds.push(otherCreated.auction.id);
  await check('buyer cannot create auction', '/auctions', { method: 'POST', body: input('Buyer Auction'), token: buyer.token, expected: 403 });
  const spoofedOwner = input('Spoofed Owner'); spoofedOwner.sellerId = otherSeller.user.id;
  const sellerAuction = await check('seller ID is sourced from authenticated token', '/auctions', { method: 'POST', body: spoofedOwner, token: seller.token, expected: 201 });
  auctionIds.push(sellerAuction.auction.id);
  assert.equal(Number(sellerAuction.auction.sellerId), Number(seller.user.id));
  await check('malformed auction ID rejected', '/auctions/1.0', { expected: 400 });
  await check('malformed bid ID rejected before DB work', '/auctions/1e2/bids', { method: 'POST', body: { amount: 1100 }, token: buyer.token, expected: 400 });
  await check('invalid listing category rejected', '/auctions?category=not-a-category', { expected: 400 });
  await check('excessive search query rejected', `/auctions?search=${'x'.repeat(101)}`, { expected: 400 });
  const longInput = input('Valid title');
  longInput.title = 'x'.repeat(161);
  await check('excessive auction title rejected', '/auctions', { method: 'POST', body: longInput, token: seller.token, expected: 400 });
  const invalidImage = input('Invalid image URL');
  invalidImage.imageUrl = 'javascript:alert(1)';
  await check('unsafe image URL rejected', '/auctions', { method: 'POST', body: invalidImage, token: seller.token, expected: 400 });
  const listing = await check('public auction listing', '/auctions?status=all', { expected: 200 });
  assert.ok(listing.auctions.some(item => Number(item.id) === Number(auctionId)));
  const details = await check('public auction details', `/auctions/${auctionId}`, { expected: 200 });
  assert.equal(Number(details.auction.id), Number(auctionId));
  await check('seller cannot update another seller auction', `/auctions/${auctionId}`, { method: 'PUT', body: { title: 'Unauthorized title' }, token: otherSeller.token, expected: 403 });
  await check('seller cannot delete another seller auction', `/auctions/${auctionId}`, { method: 'DELETE', token: otherSeller.token, expected: 403 });
  await check('buyer cannot modify seller auction', `/auctions/${auctionId}`, { method: 'PUT', body: { title: 'Buyer-modified title' }, token: buyer.token, expected: 403 });
  await check('buyer cannot delete seller auction', `/auctions/${auctionId}`, { method: 'DELETE', token: buyer.token, expected: 403 });

  const socketA = await openSocket();
  const socketB = await openSocket();
  const socketC = await openSocket();
  passed.push('Socket.IO clients connect');
  assert.deepEqual(await socketAck(socketA, 'auction:join', { auctionId }), { ok: true, auctionId });
  assert.deepEqual(await socketAck(socketB, 'auction:join', { auctionId }), { ok: true, auctionId });
  assert.deepEqual(await socketAck(socketC, 'auction:join', { auctionId: otherCreated.auction.id }), { ok: true, auctionId: otherCreated.auction.id });
  passed.push('clients join validated auction-specific rooms');
  assert.equal((await socketAck(socketA, 'auction:join', { auctionId: '../../other' })).ok, false);
  assert.equal((await socketAck(socketA, 'auction:join', { auctionId: 2147483647 })).ok, false);
  passed.push('invalid and nonexistent auction rooms rejected');

  const socketD = await openSocket();
  const concurrentRoomAcks = await Promise.all([
    socketAck(socketD, 'auction:join', { auctionId: otherCreated.auction.id }),
    socketAck(socketD, 'auction:join', { auctionId })
  ]);
  assert.deepEqual(concurrentRoomAcks, [
    { ok: true, auctionId: otherCreated.auction.id },
    { ok: true, auctionId }
  ]);
  passed.push('concurrent room changes are serialized and retain the last requested room');

  const unrelatedUpdates = [];
  socketC.on('bid:updated', update => unrelatedUpdates.push(update));
  const eventA = nextSocketEvent(socketA);
  const eventB = nextSocketEvent(socketB);
  const bid = await check('valid transactional bid', `/auctions/${auctionId}/bids`, { method: 'POST', body: { amount: 1100, currentBid: 0, bidderId: seller.user.id, sellerId: otherSeller.user.id }, token: buyer.token, expected: 201 });
  const [broadcastA, broadcastB] = await Promise.all([eventA, eventB]);
  assert.equal(Number(bid.auction.currentBid), 1100);
  assert.equal(Number(bid.auction.sellerId), Number(seller.user.id), 'client owner ID fields must be ignored');
  assert.equal('bidderEmail' in bid.auction.bidHistory[0], false);
  assert.equal(Number(broadcastA.auctionId), Number(auctionId));
  assert.equal(Number(broadcastB.currentBid), 1100);
  assert.equal(Number(broadcastA.bidAmount), 1100);
  assert.equal(broadcastA.bidderName, 'QA buyer');
  for (const forbidden of ['password', 'passwordHash', 'token', 'email', 'role', 'sellerId']) assert.equal(forbidden in broadcastA, false);
  const persistedAtBroadcast = await check('database commit is visible when bid event is received', `/auctions/${auctionId}`, { expected: 200 });
  assert.equal(Number(persistedAtBroadcast.auction.currentBid), Number(broadcastA.currentBid));
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(unrelatedUpdates.length, 0, 'a different auction room must not receive the event');
  passed.push('committed bid broadcasts safe payload only to matching room');

  assert.deepEqual(await socketAck(socketB, 'auction:leave', { auctionId }), { ok: true, auctionId });
  const updatesA = [];
  const updatesB = [];
  const updatesC = unrelatedUpdates;
  const updatesD = [];
  socketA.on('bid:updated', update => updatesA.push(update));
  socketB.on('bid:updated', update => updatesB.push(update));
  socketD.on('bid:updated', update => updatesD.push(update));
  const concurrentBids = await Promise.all([1200, 1300].map(amount => fetch(`${api}/auctions/${auctionId}/bids`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${buyer.token}` }, body: JSON.stringify({ amount })
  })));
  const concurrentResults = await Promise.all(concurrentBids.map(response => response.json()));
  assert.ok(concurrentBids.every(response => [201, 400].includes(response.status)));
  assert.ok(concurrentBids.some(response => response.status === 201));
  await waitFor(() => updatesA.length === concurrentBids.filter(response => response.status === 201).length);
  const afterRace = await check('database remains source of truth after rapid bids', `/auctions/${auctionId}`, { expected: 200 });
  assert.equal(Number(afterRace.auction.currentBid), 1300);
  assert.equal(Number(afterRace.auction.bidsCount), 1 + concurrentBids.filter(response => response.status === 201).length);
  assert.equal(updatesB.length, 0, 'a client that left the room must not receive later events');
  assert.equal(updatesC.length, 0, 'a different auction room must not receive unrelated bids');
  assert.equal(updatesD.length, concurrentBids.filter(response => response.status === 201).length, 'the client must receive events only from its final room');
  passed.push('near-simultaneous bids preserve row-locked database state and room isolation');

  const updateCountBeforeFailure = updatesA.length;
  await check('failed bid rejected without broadcast', `/auctions/${auctionId}/bids`, { method: 'POST', body: { amount: 1299 }, token: buyer.token, expected: 400 });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(updatesA.length, updateCountBeforeFailure, 'a rejected bid must not emit bid:updated');
  passed.push('rejected bid emits no successful bid update');

  const auctionAEventCountBeforeY = updatesA.length;
  const auctionBEvent = nextSocketEvent(socketC);
  const yBid = await check('valid bid on second auction', `/auctions/${otherCreated.auction.id}/bids`, { method: 'POST', body: { amount: 1100 }, token: buyer.token, expected: 201 });
  const broadcastY = await auctionBEvent;
  assert.equal(Number(broadcastY.auctionId), Number(otherCreated.auction.id));
  assert.equal(Number(yBid.auction.currentBid), 1100);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(updatesA.length, auctionAEventCountBeforeY, 'auction A clients must not receive auction B events');
  assert.equal(updatesD.length, concurrentBids.filter(response => response.status === 201).length, 'a client switched to auction A must not receive auction B events');
  passed.push('reverse auction room isolation verified');
  await check('bid with excess decimal precision rejected', `/auctions/${auctionId}/bids`, { method: 'POST', body: { amount: 1200.001 }, token: buyer.token, expected: 400 });
  await check('low bid rejected', `/auctions/${auctionId}/bids`, { method: 'POST', body: { amount: 1199 }, token: buyer.token, expected: 400 });
  await check('public bid history', `/auctions/${auctionId}/bids`, { expected: 200 });

  await check('watchlist add', `/watchlist/${auctionId}`, { method: 'POST', body: {}, token: buyer.token, expected: 201 });
  await check('duplicate watchlist add is idempotent', `/watchlist/${auctionId}`, { method: 'POST', body: {}, token: buyer.token, expected: 200 });
  const watchlist = await check('watchlist list', '/watchlist', { token: buyer.token, expected: 200 });
  assert.equal(watchlist.auctions.filter(item => Number(item.id) === Number(auctionId)).length, 1);
  await check('watchlist remove', `/watchlist/${auctionId}`, { method: 'DELETE', token: buyer.token, expected: 200 });
  const otherUsersWatchlist = await check('another user receives only their own watchlist', '/watchlist', { token: otherSeller.token, expected: 200 });
  assert.equal(otherUsersWatchlist.auctions.length, 0);

  const ended = await check('create auction for ended-bid check', '/auctions', { method: 'POST', body: input('QA Ended Lot', 2000), token: seller.token, expected: 201 });
  auctionIds.push(ended.auction.id);
  await pool.execute("UPDATE auctions SET end_time = DATE_SUB(NOW(), INTERVAL 1 MINUTE), status = 'ended' WHERE id = ?", [ended.auction.id]);
  await check('ended auction rejects bids', `/auctions/${ended.auction.id}/bids`, { method: 'POST', body: { amount: 2200 }, token: buyer.token, expected: 409 });
  await check('unauthenticated bid rejected', `/auctions/${otherCreated.auction.id}/bids`, { method: 'POST', body: { amount: 1200 }, expected: 401 });
  await check('seller role cannot place a buyer bid', `/auctions/${otherCreated.auction.id}/bids`, { method: 'POST', body: { amount: 1200 }, token: seller.token, expected: 403 });
  await check('owner can update own auction', `/auctions/${auctionId}`, { method: 'PUT', body: { title: `QA Updated ${suffix}` }, token: seller.token, expected: 200 });
  await check('owner can delete own auction', `/auctions/${auctionId}`, { method: 'DELETE', token: seller.token, expected: 200 });

  const authLimitResults = await Promise.all(Array.from({ length: 15 }, () => fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bad-email', password: 'bad' })
  })));
  assert.ok(authLimitResults.some(response => response.status === 429), 'auth endpoints must return 429 when over limit');
  passed.push('authentication endpoint rate limit returns HTTP 429');
  const bidLimitResults = await Promise.all(Array.from({ length: 60 }, () => fetch(`${api}/auctions/999999999/bids`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 1 })
  })));
  assert.ok(bidLimitResults.some(response => response.status === 429), 'bid endpoint must return 429 when over limit');
  assert.ok(bidLimitResults.every(response => [401, 429].includes(response.status)));
  passed.push('bid endpoint rate limit returns HTTP 429 before database access');
  for (const name of passed) console.log(`PASS ${name}`);
  console.log(`PASS ${passed.length} backend integration checks`);
})().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  try {
    if (auctionIds.length) await pool.query(`DELETE FROM auctions WHERE id IN (${auctionIds.map(() => '?').join(',')})`, auctionIds);
    if (emails.length) await pool.query(`DELETE FROM users WHERE email IN (${emails.map(() => '?').join(',')})`, emails);
  } catch (error) {
    console.error(`QA cleanup failed; inspect temporary test records: ${error.message}`);
    process.exitCode = 1;
  }
  await pool.end();
});

