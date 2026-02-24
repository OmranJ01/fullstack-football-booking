const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth Middleware ──────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── SIGNUP ───────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, userType, location } = req.body;
  if (!name || !email || !password || !userType)
    return res.status(400).json({ error: 'All fields are required' });
  if (!['player', 'stadium_owner'].includes(userType))
    return res.status(400).json({ error: 'Invalid user type' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email already registered' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, user_type, location) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, user_type',
      [name, email, hashedPassword, userType, location || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, userType: user.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, userType: user.user_type } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── LOGIN ────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, userType: user.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, userType: user.user_type } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ME ───────────────────────────────────────────────────────────
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, user_type, location FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, name: user.name, email: user.email, userType: user.user_type, location: user.location });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
