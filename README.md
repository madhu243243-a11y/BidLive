# BidLive — Real-Time Online Auction & Bidding Platform

BidLive is a full-stack online auction marketplace. Sellers create auctions, buyers browse and bid, and Socket.IO delivers successful bid updates live to clients viewing the same auction. Users can maintain a watchlist, while JWT authentication and role/ownership checks protect private actions.

## Features

- Buyer and seller registration/login with JWT authentication
- Seller auction creation and ownership-protected editing/deletion
- Auction browsing, search, category filtering, details, and countdowns
- Transaction-protected bidding, bid history, and real-time updates
- Buyer watchlist and buyer/seller dashboards
- bcrypt password hashing, input validation, parameterized SQL, and authorization
- Helmet security headers, request limits, rate limiting, and explicit-origin CORS
- Socket.IO auction room isolation
- Responsive HTML/CSS/vanilla JavaScript interface

## Technology

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Realtime:** Socket.IO
- **Authentication:** JWT and bcrypt
- **Security:** Helmet and express-rate-limit

## Project structure

```text
BidLive/
├── index.html, auctions.html, auction-details.html, login.html, register.html
├── buyer-dashboard.html, seller-dashboard.html, create-auction.html
├── css/style.css
├── js/                         # API client, pages, auth, bidding, Socket.IO client
└── backend/
    ├── src/                    # Express app/server, DB pool, routes, middleware, realtime
    ├── sql/schema.sql          # Reference only; not run automatically
    ├── test/                   # Unit/security and integration checks
    ├── package.json
    └── .env.example            # Placeholder settings; copy to the private .env file
```

## Requirements

- Node.js 18 or newer and npm
- MySQL 8 or a compatible MySQL server, with the existing `bidlive` database/schema
- A modern browser

## Windows setup and local run

1. Clone or download the project and open PowerShell in the project directory.
2. Open a second terminal and enter the backend folder:

   ```powershell
   cd C:\path\to\BidLive\backend
   npm install
   Copy-Item .env.example .env
   notepad .env
   ```

3. Fill in the local MySQL connection values and set `JWT_SECRET` to a randomly generated value of at least 32 characters. Keep `.env` private; never commit it or paste its contents into support requests.
4. Start MySQL. Use the existing `bidlive` database and schema. **Do not create or recreate the database for this project setup.** The server does not execute `backend/sql/schema.sql` or alter tables.
5. In the backend terminal, start the API and Socket.IO server:

   ```powershell
   npm run dev
   ```

   For a normal start, use `npm start` instead.

6. In another PowerShell terminal, start the allowlisted frontend server:

   ```powershell
   cd C:\path\to\BidLive\backend
   npm run frontend
   ```

7. Open `http://127.0.0.1:5500` in a browser. The API defaults to port 3000; the frontend defaults to port 5500. Both ports and hosts can be configured through environment variables as described below.

## Environment configuration

Copy `backend/.env.example` to `backend/.env` and provide values privately. The example contains placeholders only. Backend settings include `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and `CORS_ORIGIN`. Frontend-server settings include `FRONTEND_HOST`, `FRONTEND_PORT`, and `BIDLIVE_API_BASE`.

Set `CORS_ORIGIN` to the exact frontend origin or comma-separated origins, including scheme and port when applicable; wildcard origins are rejected. In production, configure explicit HTTPS frontend origin(s). Set `BIDLIVE_API_BASE` to the deployed API URL ending in `/api` (for example, `https://api.example.com/api`). The allowlisted frontend server exposes this URL through `/js/config.js`; Socket.IO uses the same API origin. When unset in local development, the existing browser default remains `http://localhost:3000/api`.

`backend/.env.example` also documents optional seed-account environment variables. They are only needed if you intentionally run `npm run seed`; do not use permanent demo credentials in a public deployment.

## Database

BidLive uses the existing `bidlive` schema and the `users`, `auctions`, `bids`, and `watchlist` tables. `backend/sql/schema.sql` is reference documentation for a fresh, separate setup only; it is not run during startup. Preserve the project’s existing database and compare schema requirements before making any database changes.

## Commands and tests

Run these commands from `backend`:

```powershell
npm run dev          # Development API + Socket.IO server (Node watch mode)
npm start            # Normal API + Socket.IO server start
npm run frontend     # Allowlisted frontend server
npm test             # Unit, validation, frontend escaping and static allowlist tests
npm run integration  # API, MySQL, auth, bidding, CORS, rate-limit, and Socket.IO checks
npm audit            # Dependency vulnerability audit
```

The integration suite requires the configured MySQL database and API server to be running. It creates unique temporary records and removes its own records after a successful run. Check `GET /api/health` for API and database connectivity. Keep existing or real records backed up; tests should not be run against production data.

## Security

The API uses bcrypt password hashes, JWT verification with an explicit algorithm, role and seller ownership checks, input validation, parameterized SQL, Helmet headers, JSON body limits, per-IP authentication/bid rate limits, explicit-origin CORS, and safe error responses. The frontend server serves an explicit allowlist of the eight pages and required CSS/JavaScript assets; it does not serve backend source, `.env`, SQL files, package files, or arbitrary project files. Use HTTPS in production, protect environment settings, and configure production-only origins. The in-memory rate-limit store is suitable for a single instance; use a shared store before horizontally scaling.

## Realtime architecture

```text
Browser ── REST API ── MySQL
   └────── Socket.IO ── auction:<id> room
```

REST remains authoritative: it authenticates the buyer, validates the bid, locks and updates the auction within a MySQL transaction, and emits only after commit. Socket.IO broadcasts the public update to clients in that auction’s room. Clients in other rooms do not receive the event. If Socket.IO is unavailable, REST bidding continues to work.

## Deployment readiness

The application is **not deployed**. A practical deployment needs an HTTPS-capable Node.js service for the Express API and Socket.IO (same origin/port), a managed MySQL service reachable from that backend, and a frontend host that can run the allowlisted Node frontend server or otherwise provide equivalent runtime configuration for `BIDLIVE_API_BASE`. Keep the API and database in a compatible network/region, configure the frontend origin in `CORS_ORIGIN`, and set all secrets as deployment environment variables. Do not expose MySQL publicly; restrict database access to the backend service.

Before public release, create/provision the MySQL service and load/verify a compatible schema without overwriting existing data, configure HTTPS and production environment values, confirm the frontend runtime configuration and WebSocket upgrade support, and run the health and integration checks in the deployment environment. No cloud provider has been selected or configured, and no deployment has been performed.

## Demo flow

For a live demonstration: home → register/login as seller → create an auction → log out → register/login as buyer → browse and watch the auction → open its details → place a bid → view the same auction in another client to show the live update → review bid history and buyer/seller dashboards. No permanent demo accounts or auctions are included.

## Future improvements

- Payment processing and auction settlement
- Email and auction-winner notifications
- Managed image upload/storage
- Admin dashboard and advanced analytics
- Cloud deployment, monitoring, and backups
