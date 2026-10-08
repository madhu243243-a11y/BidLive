const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const projectRoot = path.resolve(__dirname, '../..');
const publicFiles = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/auctions.html', 'text/html; charset=utf-8'],
  ['/auction-details.html', 'text/html; charset=utf-8'],
  ['/login.html', 'text/html; charset=utf-8'],
  ['/register.html', 'text/html; charset=utf-8'],
  ['/buyer-dashboard.html', 'text/html; charset=utf-8'],
  ['/seller-dashboard.html', 'text/html; charset=utf-8'],
  ['/create-auction.html', 'text/html; charset=utf-8'],
  ['/css/style.css', 'text/css; charset=utf-8'],
  ['/js/api.js', 'text/javascript; charset=utf-8'],
  ['/js/auctions.js', 'text/javascript; charset=utf-8'],
  ['/js/auth.js', 'text/javascript; charset=utf-8'],
  ['/js/bidding.js', 'text/javascript; charset=utf-8'],
  ['/js/dashboard.js', 'text/javascript; charset=utf-8'],
  ['/js/data.js', 'text/javascript; charset=utf-8'],
  ['/js/main.js', 'text/javascript; charset=utf-8'],
  ['/js/realtime.js', 'text/javascript; charset=utf-8']
]);

function createFrontendServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed.');
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Invalid path.');
    }
    if (pathname === '/') pathname = '/index.html';

    if (pathname === '/js/config.js') {
      const configuredApiBase = process.env.BIDLIVE_API_BASE;
      let apiBase = null;
      if (configuredApiBase) {
        try {
          const parsed = new URL(configuredApiBase);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Invalid API URL');
          apiBase = parsed.href.replace(/\/$/, '');
        } catch {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
          return res.end('Frontend API configuration is invalid.');
        }
      }
      const content = `window.BIDLIVE_API_BASE = ${JSON.stringify(apiBase)};`;
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return req.method === 'HEAD' ? res.end() : res.end(content);
    }

    const contentType = publicFiles.get(pathname);
    if (!contentType) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end('Not found.');
    }

    const filePath = path.resolve(projectRoot, `.${pathname}`);
    if (!filePath.startsWith(`${projectRoot}${path.sep}`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end('Not found.');
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        return res.end('Not found.');
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN'
      });
      return req.method === 'HEAD' ? res.end() : res.end(content);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.FRONTEND_PORT || 5500);
  const host = process.env.FRONTEND_HOST || '127.0.0.1';
  createFrontendServer().listen(port, host, () => {
    console.log(`BidLive allowlisted frontend listening on http://${host}:${port}`);
  });
}

module.exports = { createFrontendServer };
