const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authLimiter } = require('../middleware/rate-limit');
const { ALLOWED_ROLES, validEmail } = require('../utils/validation');

const router = express.Router();
const publicUser = (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role });
const makeToken = (user) => jwt.sign(
  { name: user.name, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
);

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100 || !validEmail(email) || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || !ALLOWED_ROLES.has(role)) {
      return res.status(400).json({ error: 'Provide a name, valid email, password of 8–72 characters, and buyer or seller role.' });
    }
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name.trim(), email.trim().toLowerCase(), passwordHash, role]);
    const user = { id: result.insertId, name: name.trim(), email: email.trim().toLowerCase(), role };
    return res.status(201).json({ user, token: makeToken(user) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Enter a valid email and password of no more than 72 bytes.' });
    const [rows] = await pool.execute('SELECT id, name, email, role, password AS passwordHash FROM users WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (!rows.length || !await bcrypt.compare(password, rows[0].passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const user = publicUser(rows[0]);
    return res.json({ user, token: makeToken(user) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

