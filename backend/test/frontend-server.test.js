const test = require('node:test');
const assert = require('node:assert/strict');
const { createFrontendServer } = require('../src/frontend-server');

const publicPaths = [
  '/', '/index.html', '/auctions.html', '/auction-details.html', '/login.html',
  '/register.html', '/buyer-dashboard.html', '/seller-dashboard.html',
  '/create-auction.html', '/css/style.css', '/js/config.js', '/js/api.js', '/js/auctions.js',
  '/js/auth.js', '/js/bidding.js', '/js/dashboard.js', '/js/data.js',
  '/js/main.js?v=step4', '/js/realtime.js'
];

test('allowlisted frontend server serves required BidLive pages and assets only', async t => {
  const server = createFrontendServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const pathname of publicPaths) {
    const response = await fetch(`${origin}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should be public`);
  }

  const config = await fetch(`${origin}/js/config.js`);
  assert.match(await config.text(), /window\.BIDLIVE_API_BASE = null;/);

  for (const pathname of [
    '/backend/.env',
    '/backend/.env.example',
    '/backend/src/app.js',
    '/backend/sql/schema.sql',
    '/backend/package.json',
    '/backend/node_modules/express/package.json',
    '/backend/../../backend/.env',
    '/%2e%2e/backend/.env'
  ]) {
    const response = await fetch(`${origin}${pathname}`, { method: 'HEAD', redirect: 'manual' });
    assert.equal(response.status, 404, `${pathname} must not be served`);
  }
});

test('frontend runtime API configuration comes from an absolute HTTP(S) environment URL', async t => {
  const previous = process.env.BIDLIVE_API_BASE;
  process.env.BIDLIVE_API_BASE = 'https://api.example.test/api/';
  t.after(() => {
    if (previous === undefined) delete process.env.BIDLIVE_API_BASE;
    else process.env.BIDLIVE_API_BASE = previous;
  });

  const server = createFrontendServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/js/config.js`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), 'window.BIDLIVE_API_BASE = "https://api.example.test/api";');
});
