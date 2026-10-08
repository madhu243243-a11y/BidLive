require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function seed() {
  const accounts = [
    { role: 'buyer', name: process.env.SEED_BUYER_NAME || 'BidLive Test Buyer', email: process.env.SEED_BUYER_EMAIL, password: process.env.SEED_BUYER_PASSWORD },
    { role: 'seller', name: process.env.SEED_SELLER_NAME || 'BidLive Test Seller', email: process.env.SEED_SELLER_EMAIL, password: process.env.SEED_SELLER_PASSWORD }
  ];
  if (accounts.some(account => !account.email || !account.password || account.password.length < 8 || account.password.length > 72)) {
    throw new Error('Set unique SEED_BUYER_EMAIL/PASSWORD and SEED_SELLER_EMAIL/PASSWORD values in .env (passwords 8–72 characters).');
  }
  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    await pool.execute('INSERT IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [account.name, account.email.trim().toLowerCase(), passwordHash, account.role]);
    console.log(`Test ${account.role} available: ${account.email}`);
  }
}

seed().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());

