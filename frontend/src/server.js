const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer: memory storage, images saved as base64 in DB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

// ── Middleware ───────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

const requireOwner = (req, res, next) => {
  if (req.user.userType !== 'stadium_owner')
    return res.status(403).json({ error: 'Only stadium owners can do this' });
  next();
};

// ── Time helpers ─────────────────────────────────────────────────
// Convert "HH:MM" or "HH:MM:SS" to minutes since midnight
function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMin(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, userType, city, country } = req.body;
  if (!name || !email || !password || !userType)
    return res.status(400).json({ error: 'All fields are required' });
  if (!['player', 'stadium_owner'].includes(userType))
    return res.status(400).json({ error: 'Invalid user type' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name,email,password,user_type,city,country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,email,user_type',
      [name, email, hash, userType, city || null, country || null]
    );
    const u = r.rows[0];
    const token = jwt.sign({ id: u.id, userType: u.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: u.id, name: u.name, email: u.email, userType: u.user_type } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(password, u.password)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: u.id, userType: u.user_type }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, userType: u.user_type } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT id,name,email,user_type,city,country,avatar_url FROM users WHERE id=$1', [req.user.id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ id: u.id, name: u.name, email: u.email, userType: u.user_type, city: u.city, country: u.country, avatarUrl: u.avatar_url });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Upload/update profile picture (base64)
app.put('/api/auth/avatar', authenticate, async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });
  // Limit ~2MB base64
  if (imageBase64.length > 2800000) return res.status(400).json({ error: 'Image too large (max 2MB)' });
  try {
    await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [imageBase64, req.user.id]);
    res.json({ avatarUrl: imageBase64 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Delete own account — handles all cascades explicitly
app.delete('/api/auth/delete-account', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = req.user.id;

    // If stadium owner: cancel all bookings for their stadiums (so players' bookings disappear),
    // then nullify stadium_id in groups (keep groups, just unlink the stadium)
    if (req.user.userType === 'stadium_owner') {
      // Cancel all bookings for owner's stadiums
      await client.query(
        `UPDATE bookings SET status='cancelled' WHERE stadium_id IN (SELECT id FROM stadiums WHERE owner_id=$1)`,
        [userId]
      );
      // Unlink stadiums from groups (keep groups, just remove the stadium reference)
      await client.query(
        `UPDATE groups SET stadium_id=NULL WHERE stadium_id IN (SELECT id FROM stadiums WHERE owner_id=$1)`,
        [userId]
      );
    }

    // Delete the user — FK cascades handle the rest:
    // friendships, messages (sender/receiver), group_members, group_messages, bookings (player_id), stadiums+schedule (owner)
    await client.query('DELETE FROM users WHERE id=$1', [userId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});


// ── Upload profile picture ────────────────────────────────────────
app.post('/api/auth/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' });
  try {
    const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [b64, req.user.id]);
    res.json({ avatar_url: b64 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Remove profile picture ─────────────────────────────────────────
app.delete('/api/auth/avatar', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE users SET avatar_url=NULL WHERE id=$1', [req.user.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  FRIENDS
// ══════════════════════════════════════════════════════════════════

app.get('/api/players/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  const city = (req.query.city || '').trim();
  const country = (req.query.country || '').trim();
  const day = req.query.day !== undefined && req.query.day !== '' ? parseInt(req.query.day) : null;
  const myId = parseInt(req.user.id, 10);
  try {
    let baseWhere = `u.user_type='player' AND u.id<>$1`;
    const params = [myId];
    let idx = 2;

    if (q) { baseWhere += ` AND (u.name ILIKE $${idx} OR u.city ILIKE $${idx} OR u.country ILIKE $${idx})`; params.push(`%${q}%`); idx++; }
    if (city) { baseWhere += ` AND u.city ILIKE $${idx}`; params.push(`%${city}%`); idx++; }
    if (country) { baseWhere += ` AND u.country ILIKE $${idx}`; params.push(`%${country}%`); idx++; }

    let joinClause = '';
    if (day !== null) {
      joinClause = `JOIN player_availability pa ON pa.player_id=u.id AND pa.day_of_week=$${idx}`;
      params.push(day); idx++;
    }

    const sql = `
      SELECT DISTINCT u.id, u.name, u.city, u.country, u.avatar_url,
        f.status AS friendship_status, f.requester_id AS friendship_requester
      FROM users u
      LEFT JOIN friendships f
        ON (f.requester_id=u.id AND f.addressee_id=$1) OR (f.addressee_id=u.id AND f.requester_id=$1)
      ${joinClause}
      WHERE ${baseWhere}
      ORDER BY u.name LIMIT 30`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/friends/request', authenticate, async (req, res) => {
  const { addresseeId } = req.body;
  if (!addresseeId) return res.status(400).json({ error: 'addresseeId is required' });
  if (Number(addresseeId) === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });
  try {
    const t = await pool.query('SELECT id FROM users WHERE id=$1 AND user_type=$2', [addresseeId, 'player']);
    if (!t.rows.length) return res.status(404).json({ error: 'Player not found' });
    const r = await pool.query(
      `INSERT INTO friendships (requester_id,addressee_id,status) VALUES ($1,$2,'pending')
       ON CONFLICT (requester_id,addressee_id) DO UPDATE SET status='pending',updated_at=NOW() RETURNING *`,
      [req.user.id, addresseeId]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/friends/:requesterId/respond', authenticate, async (req, res) => {
  const { action } = req.body;
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const r = await pool.query(
      `UPDATE friendships SET status=$1,updated_at=NOW()
       WHERE requester_id=$2 AND addressee_id=$3 AND status='pending' RETURNING *`,
      [action === 'accept' ? 'accepted' : 'declined', req.params.requesterId, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/friends/:otherId', authenticate, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [req.user.id, req.params.otherId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/friends', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS friends_since
       FROM friendships f
       JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END=u.id)
       WHERE (f.requester_id=$1 OR f.addressee_id=$1) AND f.status='accepted' ORDER BY u.name`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/friends/requests/incoming', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS requested_at
       FROM friendships f JOIN users u ON f.requester_id=u.id
       WHERE f.addressee_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/friends/requests/outgoing', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id,u.name,u.city,u.country,u.avatar_url,f.created_at AS requested_at
       FROM friendships f JOIN users u ON f.addressee_id=u.id
       WHERE f.requester_id=$1 AND f.status='pending' ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  STADIUMS (CRUD)
// ══════════════════════════════════════════════════════════════════

app.get('/api/stadiums/mine', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM stadiums WHERE owner_id=$1 ORDER BY created_at DESC', [req.user.id]);
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/stadiums', authenticate, requireOwner, async (req, res) => {
  const { name, city, country, description, price_per_hour, capacity, surface, phone, open_time, close_time, image_url } = req.body;
  if (!name || !city || !price_per_hour) return res.status(400).json({ error: 'Name, city and price are required' });
  try {
    const r = await pool.query(
      `INSERT INTO stadiums (owner_id,name,city,country,description,price_per_hour,capacity,surface,phone,open_time,close_time,image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.user.id, name, city, country || null, description || null, price_per_hour, capacity || null,
       surface || 'grass', phone || null, open_time || '08:00', close_time || '22:00', image_url || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/stadiums/:id', authenticate, requireOwner, async (req, res) => {
  const { name, city, country, description, price_per_hour, capacity, surface, phone, open_time, close_time, is_active, image_url } = req.body;
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      `UPDATE stadiums SET name=$1,city=$2,country=$3,description=$4,price_per_hour=$5,capacity=$6,surface=$7,
         phone=$8,open_time=$9,close_time=$10,is_active=$11,image_url=$12,updated_at=NOW()
       WHERE id=$13 AND owner_id=$14 RETURNING *`,
      [name, city, country || null, description || null, price_per_hour, capacity || null, surface || 'grass',
       phone || null, open_time || '08:00', close_time || '22:00',
       is_active !== undefined ? is_active : true, image_url || null, req.params.id, req.user.id]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/stadiums/:id', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM stadiums WHERE id=$1 AND owner_id=$2 RETURNING id', [req.params.id, req.user.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/stadiums/:id/toggle', authenticate, requireOwner, async (req, res) => {
  try {
    const r = await pool.query(
      'UPDATE stadiums SET is_active=NOT is_active,updated_at=NOW() WHERE id=$1 AND owner_id=$2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Browse stadiums (players) — filter by name, city, country, day, time range
app.get('/api/stadiums', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  const city = (req.query.city || '').trim();
  const country = (req.query.country || '').trim();
  const day = req.query.day !== undefined && req.query.day !== '' ? parseInt(req.query.day) : null;
  const slotStart = req.query.slot_start || null;
  const slotEnd = req.query.slot_end || null;
  try {
    const conditions = ['s.is_active=TRUE'];
    const params = [];
    let idx = 1;
    if (q) { conditions.push(`(s.name ILIKE $${idx} OR s.city ILIKE $${idx} OR s.country ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    if (city) { conditions.push(`s.city ILIKE $${idx}`); params.push(`%${city}%`); idx++; }
    if (country) { conditions.push(`s.country ILIKE $${idx}`); params.push(`%${country}%`); idx++; }
    let joinClause = '';
    if (day !== null) {
      joinClause = `JOIN stadium_schedule ss ON ss.stadium_id=s.id AND ss.day_of_week=$${idx} AND ss.is_available=TRUE`;
      params.push(day); idx++;
      if (slotStart && slotEnd) {
        joinClause += ` AND ss.slot_start<=$${idx}::time AND ss.slot_end>=$${idx+1}::time`;
        params.push(slotStart, slotEnd); idx += 2;
      }
    }
    const where = conditions.join(' AND ');
    const sql = `SELECT DISTINCT s.*, u.name AS owner_name FROM stadiums s JOIN users u ON s.owner_id=u.id ${joinClause} WHERE ${where} ORDER BY s.created_at DESC LIMIT 50`;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  SCHEDULE
// ══════════════════════════════════════════════════════════════════

app.get('/api/stadiums/:id/schedule', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM stadium_schedule WHERE stadium_id=$1 ORDER BY day_of_week,slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/stadiums/:id/schedule', authenticate, requireOwner, async (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be an array' });
  const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM stadium_schedule WHERE stadium_id=$1', [req.params.id]);
    for (const s of slots) {
      await client.query(
        `INSERT INTO stadium_schedule (stadium_id,day_of_week,slot_start,slot_end,is_available)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, s.day_of_week, s.slot_start, s.slot_end, s.is_available !== false]
      );
    }
    await client.query('COMMIT');
    const r = await client.query(
      'SELECT * FROM stadium_schedule WHERE stadium_id=$1 ORDER BY day_of_week,slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Get available slots for a stadium on a given day
// Returns real schedule slots with overlap info for the player booking UI
// GET /api/stadiums/:id/slots?day=1
app.get('/api/stadiums/:id/slots', authenticate, async (req, res) => {
  const day = parseInt(req.query.day);
  if (isNaN(day)) return res.status(400).json({ error: 'day is required' });
  try {
    // Get available schedule slots
    const scheduleRes = await pool.query(
      `SELECT * FROM stadium_schedule
       WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE
       ORDER BY slot_start`,
      [req.params.id, day]
    );

    // Get confirmed/pending bookings for this day to show taken ranges
    const bookingsRes = await pool.query(
      `SELECT booked_start, booked_end, status FROM bookings
       WHERE stadium_id=$1 AND day_of_week=$2 AND status IN ('pending','confirmed')`,
      [req.params.id, day]
    );

    res.json({
      slots: scheduleRes.rows,
      bookings: bookingsRes.rows
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  BOOKINGS
// ══════════════════════════════════════════════════════════════════

// Player: create a booking with custom time range
// Validates: booked range must fit inside an available slot
// Does NOT split immediately — split happens on owner confirmation
app.post('/api/bookings', authenticate, async (req, res) => {
  if (req.user.userType !== 'player') return res.status(403).json({ error: 'Only players can book' });
  const { stadium_id, day_of_week, booked_start, booked_end, note } = req.body;
  if (!stadium_id || day_of_week === undefined || !booked_start || !booked_end)
    return res.status(400).json({ error: 'stadium_id, day_of_week, booked_start, booked_end are required' });

  const bStart = toMin(booked_start);
  const bEnd = toMin(booked_end);
  if (bEnd <= bStart) return res.status(400).json({ error: 'End time must be after start time' });

  try {
    // Find a parent slot that fully contains the requested range
    const slotRes = await pool.query(
      `SELECT * FROM stadium_schedule
       WHERE stadium_id=$1 AND day_of_week=$2 AND is_available=TRUE
         AND slot_start <= $3::time AND slot_end >= $4::time
       ORDER BY slot_start LIMIT 1`,
      [stadium_id, day_of_week, booked_start, booked_end]
    );
    if (!slotRes.rows.length)
      return res.status(400).json({ error: 'Your chosen time range is not within any available slot' });

    const parentSlot = slotRes.rows[0];

    // Check no overlapping confirmed/pending booking exists
    const conflict = await pool.query(
      `SELECT id FROM bookings
       WHERE stadium_id=$1 AND day_of_week=$2 AND status IN ('pending','confirmed')
         AND booked_start < $4::time AND booked_end > $3::time`,
      [stadium_id, day_of_week, booked_start, booked_end]
    );
    if (conflict.rows.length) return res.status(409).json({ error: 'This time range overlaps with an existing booking' });

    const r = await pool.query(
      `INSERT INTO bookings (stadium_id,player_id,day_of_week,booked_start,booked_end,parent_schedule_id,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [stadium_id, req.user.id, day_of_week, booked_start, booked_end, parentSlot.id, note || null]
    );
    const booking = r.rows[0];

    // Notify the stadium owner
    try {
      const infoRes = await pool.query(
        `SELECT u.name AS player_name, s.name AS stadium_name, s.owner_id
         FROM users u, stadiums s WHERE u.id=$1 AND s.id=$2`,
        [req.user.id, stadium_id]
      );
      if (infoRes.rows.length) {
        const { player_name, stadium_name, owner_id } = infoRes.rows[0];
        const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day_of_week];
        await pool.query(
          `INSERT INTO notifications (user_id, type, message, related_id, related_type)
           VALUES ($1, 'booking', $2, $3, 'booking')`,
          [owner_id,
           `📅 ${player_name} requested a booking at ${stadium_name} on ${dayName} (${String(booked_start).slice(0,5)}–${String(booked_end).slice(0,5)})`,
           booking.id]
        );
      }
    } catch (notifErr) { console.error('Notification error:', notifErr); }

    res.status(201).json(booking);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Player: view my bookings
app.get('/api/bookings/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country,
              s.price_per_hour, s.phone AS stadium_phone
       FROM bookings b JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.player_id=$1 ORDER BY b.day_of_week, b.booked_start`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Player: cancel own booking — restores the slot
app.patch('/api/bookings/:id/cancel', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch BEFORE updating so we have the original status
    const fetchRes = await client.query(
      `SELECT * FROM bookings WHERE id=$1 AND player_id=$2 AND status IN ('pending','confirmed')`,
      [req.params.id, req.user.id]
    );
    if (!fetchRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = fetchRes.rows[0];

    const bRes = await client.query(
      `UPDATE bookings SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );

    // Only restore if confirmed — confirmed bookings split the slot, pending ones did not
    if (b.status === 'confirmed') {
      await restoreSlot(client, b);
    }

    await client.query('COMMIT');
    res.json(bRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Owner: view all bookings for a stadium
app.get('/api/bookings/stadium/:stadiumId', authenticate, requireOwner, async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.stadiumId, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      `SELECT b.*, u.name AS player_name, u.email AS player_email
       FROM bookings b JOIN users u ON b.player_id=u.id
       WHERE b.stadium_id=$1 ORDER BY b.day_of_week, b.booked_start, b.created_at DESC`,
      [req.params.stadiumId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Owner: confirm or cancel a booking
// On CONFIRM → split the parent slot into up to 2 remaining pieces
// On CANCEL  → restore the slot
app.patch('/api/bookings/:id/status', authenticate, requireOwner, async (req, res) => {
  const { status } = req.body;
  if (!['confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify owner owns the stadium
    const bRes = await client.query(
      `SELECT b.* FROM bookings b
       JOIN stadiums s ON b.stadium_id=s.id
       WHERE b.id=$1 AND s.owner_id=$2`,
      [req.params.id, req.user.id]
    );
    if (!bRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }

    const b = bRes.rows[0];
    if (b.status === status) { await client.query('ROLLBACK'); return res.json(b); }

    // Update booking status
    const updated = await client.query(
      'UPDATE bookings SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, b.id]
    );

    if (status === 'confirmed') {
      // Split the parent slot
      await splitSlot(client, b);
    } else if (status === 'cancelled') {
      // Restore: re-merge the cancelled range back into the schedule
      await restoreSlot(client, b);
    }

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Slot splitting logic ─────────────────────────────────────────
// Called when owner confirms a booking.
// Deletes the parent slot and inserts up to 2 new slots for the remaining time.
// e.g. parent: 10:00-19:00, booked: 12:00-14:00
//   → new slots: 10:00-12:00 and 14:00-19:00
async function splitSlot(client, booking) {
  if (!booking.parent_schedule_id) return;

  const slotRes = await client.query(
    'SELECT * FROM stadium_schedule WHERE id=$1',
    [booking.parent_schedule_id]
  );
  if (!slotRes.rows.length) return;

  const slot = slotRes.rows[0];
  const sStart = toMin(slot.slot_start);
  const sEnd = toMin(slot.slot_end);
  const bStart = toMin(booking.booked_start);
  const bEnd = toMin(booking.booked_end);

  // Delete the original parent slot
  await client.query('DELETE FROM stadium_schedule WHERE id=$1', [slot.id]);

  // Left piece: original_start → booked_start (if gap exists)
  if (bStart > sStart) {
    await client.query(
      `INSERT INTO stadium_schedule (stadium_id,day_of_week,slot_start,slot_end,is_available)
       VALUES ($1,$2,$3,$4,TRUE)
       ON CONFLICT (stadium_id,day_of_week,slot_start) DO NOTHING`,
      [slot.stadium_id, slot.day_of_week, fromMin(sStart), fromMin(bStart)]
    );
  }

  // Right piece: booked_end → original_end (if gap exists)
  if (bEnd < sEnd) {
    await client.query(
      `INSERT INTO stadium_schedule (stadium_id,day_of_week,slot_start,slot_end,is_available)
       VALUES ($1,$2,$3,$4,TRUE)
       ON CONFLICT (stadium_id,day_of_week,slot_start) DO NOTHING`,
      [slot.stadium_id, slot.day_of_week, fromMin(bEnd), fromMin(sEnd)]
    );
  }

  // Update all other pending bookings that referenced the old parent slot
  // to reference the appropriate new slot (the one that still contains their range)
  const newSlotsRes = await client.query(
    `SELECT * FROM stadium_schedule
     WHERE stadium_id=$1 AND day_of_week=$2
       AND slot_start IN ($3::time, $4::time)`,
    [slot.stadium_id, slot.day_of_week, fromMin(sStart), fromMin(bEnd)]
  );

  const otherBookings = await client.query(
    `SELECT * FROM bookings
     WHERE parent_schedule_id=$1 AND status='pending' AND id<>$2`,
    [booking.parent_schedule_id, booking.id]
  );

  for (const ob of otherBookings.rows) {
    const obStart = toMin(ob.booked_start);
    const obEnd = toMin(ob.booked_end);
    for (const ns of newSlotsRes.rows) {
      const nsStart = toMin(ns.slot_start);
      const nsEnd = toMin(ns.slot_end);
      if (obStart >= nsStart && obEnd <= nsEnd) {
        await client.query(
          'UPDATE bookings SET parent_schedule_id=$1 WHERE id=$2',
          [ns.id, ob.id]
        );
        break;
      }
    }
  }
}

// ── Slot restoration logic ───────────────────────────────────────
// Called when a confirmed booking is cancelled.
// Re-inserts the booked range and tries to merge with adjacent free slots.
async function restoreSlot(client, booking) {
  const stadiumId = booking.stadium_id;
  const day = booking.day_of_week;
  const bStart = toMin(booking.booked_start);
  const bEnd = toMin(booking.booked_end);

  // Find adjacent slots to potentially merge with
  const adjacentRes = await client.query(
    `SELECT * FROM stadium_schedule
     WHERE stadium_id=$1 AND day_of_week=$2
       AND (slot_end=$3::time OR slot_start=$4::time)
     ORDER BY slot_start`,
    [stadiumId, day, fromMin(bStart), fromMin(bEnd)]
  );

  let mergedStart = bStart;
  let mergedEnd = bEnd;
  const toDelete = [];

  for (const adj of adjacentRes.rows) {
    const adjStart = toMin(adj.slot_start);
    const adjEnd = toMin(adj.slot_end);
    if (adjEnd === bStart) { mergedStart = adjStart; toDelete.push(adj.id); }
    if (adjStart === bEnd) { mergedEnd = adjEnd; toDelete.push(adj.id); }
  }

  // Delete adjacent slots that get merged
  for (const id of toDelete) {
    await client.query('DELETE FROM stadium_schedule WHERE id=$1', [id]);
  }

  // Insert the merged/restored slot
  await client.query(
    `INSERT INTO stadium_schedule (stadium_id,day_of_week,slot_start,slot_end,is_available)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (stadium_id,day_of_week,slot_start) DO UPDATE SET slot_end=$4,is_available=TRUE`,
    [stadiumId, day, fromMin(mergedStart), fromMin(mergedEnd)]
  );
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ══════════════════════════════════════════════════════════════════
//  PLAYER AVAILABILITY
// ══════════════════════════════════════════════════════════════════

// Get my availability
app.get('/api/players/availability', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM player_availability WHERE player_id=$1 ORDER BY day_of_week, slot_start',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Save availability for a day (replace all slots for that day)
app.put('/api/players/availability/:day', authenticate, async (req, res) => {
  const day = parseInt(req.params.day);
  if (isNaN(day) || day < 0 || day > 6) return res.status(400).json({ error: 'Invalid day' });
  const { slots } = req.body; // array of { slot_start, slot_end }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM player_availability WHERE player_id=$1 AND day_of_week=$2', [req.user.id, day]);
    if (slots && slots.length) {
      for (const s of slots) {
        await client.query(
          'INSERT INTO player_availability (player_id,day_of_week,slot_start,slot_end) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [req.user.id, day, s.slot_start, s.slot_end]
        );
      }
    }
    await client.query('COMMIT');
    const r = await client.query('SELECT * FROM player_availability WHERE player_id=$1 ORDER BY day_of_week,slot_start', [req.user.id]);
    res.json(r.rows);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});

// Get a specific player's availability (for viewing profile)
app.get('/api/players/:id/availability', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT day_of_week, slot_start, slot_end FROM player_availability WHERE player_id=$1 ORDER BY day_of_week, slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════

// Helper: create a notification
async function createNotification(client, userId, type, message, relatedId = null, relatedType = null) {
  await client.query(
    `INSERT INTO notifications (user_id, type, message, related_id, related_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, type, message, relatedId, relatedType]
  );
}

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
      [req.user.id]
    );
    res.json({ count: r.rows[0].count });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  DIRECT MESSAGES (Chat)
// ══════════════════════════════════════════════════════════════════

// Get all conversations for current user (list of unique partners)
app.get('/api/messages/conversations', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (partner_id)
         partner_id, partner_name, partner_city, partner_country,
         last_message, last_message_at, unread_count
       FROM (
         SELECT
           CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END AS partner_id,
           u.name AS partner_name, u.city AS partner_city, u.country AS partner_country, u.avatar_url AS partner_avatar,
           m.content AS last_message, m.created_at AS last_message_at,
           (SELECT COUNT(*) FROM messages m2
            WHERE m2.sender_id=CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
              AND m2.receiver_id=$1 AND m2.is_read=FALSE) AS unread_count
         FROM messages m
         JOIN users u ON u.id=CASE WHEN m.sender_id=$1 THEN m.receiver_id ELSE m.sender_id END
         WHERE m.sender_id=$1 OR m.receiver_id=$1
         ORDER BY m.created_at DESC
       ) t
       ORDER BY partner_id, last_message_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Get messages with a specific user
app.get('/api/messages/:partnerId', authenticate, async (req, res) => {
  try {
    // Mark as read
    await pool.query(
      `UPDATE messages SET is_read=TRUE WHERE sender_id=$1 AND receiver_id=$2 AND is_read=FALSE`,
      [req.params.partnerId, req.user.id]
    );
    const r = await pool.query(
      `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar FROM messages m
       JOIN users u ON m.sender_id=u.id
       WHERE (m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1)
       ORDER BY m.created_at ASC LIMIT 200`,
      [req.user.id, req.params.partnerId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Send a message
app.post('/api/messages', authenticate, async (req, res) => {
  const { receiverId, content } = req.body;
  if (!receiverId || !content?.trim()) return res.status(400).json({ error: 'receiverId and content required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, receiverId, content.trim()]
    );
    // Notify receiver
    const senderRes = await client.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    await createNotification(client, receiverId, 'message', `${senderRes.rows[0].name} sent you a message`, req.user.id, 'user');
    await client.query('COMMIT');
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════
//  GROUPS / MATCHES
// ══════════════════════════════════════════════════════════════════

// Create a group/match
app.post('/api/groups', authenticate, async (req, res) => {
  const { name, description, stadium_id, match_day, match_start, match_end, max_players } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO groups (name, description, creator_id, stadium_id, match_day, match_start, match_end, max_players)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, description||null, req.user.id, stadium_id||null, match_day||null, match_start||null, match_end||null, max_players||10]
    );
    const group = r.rows[0];
    // Creator auto-joins as admin
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'admin')`,
      [group.id, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(group);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Get my groups
app.get('/api/groups/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.*, u.name AS creator_name,
              s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country,
              gm.role AS my_role,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id=g.id AND gm2.status='active')::int AS member_count,
              (SELECT COUNT(*) FROM group_messages gm3 WHERE gm3.group_id=g.id AND gm3.created_at > COALESCE(gm.last_read_at, '1970-01-01'))::int AS unread_count
       FROM groups g
       JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1 AND gm.status='active'
       JOIN users u ON g.creator_id=u.id
       LEFT JOIN stadiums s ON g.stadium_id=s.id
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Get group details with members
app.get('/api/groups/:id', authenticate, async (req, res) => {
  try {
    const g = await pool.query(
      `SELECT g.*, u.name AS creator_name, s.name AS stadium_name, s.city AS stadium_city, s.country AS stadium_country
       FROM groups g JOIN users u ON g.creator_id=u.id LEFT JOIN stadiums s ON g.stadium_id=s.id
       WHERE g.id=$1`, [req.params.id]
    );
    if (!g.rows.length) return res.status(404).json({ error: 'Group not found' });
    const members = await pool.query(
      `SELECT u.id, u.name, u.city, u.country, u.avatar_url, gm.role, gm.joined_at
       FROM group_members gm JOIN users u ON gm.user_id=u.id
       WHERE gm.group_id=$1 AND gm.status='active' ORDER BY gm.joined_at`,
      [req.params.id]
    );
    res.json({ ...g.rows[0], members: members.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Invite a friend to group
app.post('/api/groups/:id/invite', authenticate, async (req, res) => {
  const { userId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Check admin
    const admin = await client.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can invite' });
    // Add member as pending
    await client.query(
      `INSERT INTO group_members (group_id, user_id, status) VALUES ($1,$2,'invited')
       ON CONFLICT (group_id, user_id) DO UPDATE SET status='invited'`,
      [req.params.id, userId]
    );
    const groupRes = await client.query('SELECT name FROM groups WHERE id=$1', [req.params.id]);
    const inviterRes = await client.query('SELECT name FROM users WHERE id=$1', [req.user.id]);
    await createNotification(client, userId, 'group_invite',
      `${inviterRes.rows[0].name} invited you to join "${groupRes.rows[0].name}"`,
      parseInt(req.params.id), 'group'
    );
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// Accept/decline group invite
app.patch('/api/groups/:id/respond', authenticate, async (req, res) => {
  const { action } = req.body; // 'accept' or 'decline'
  try {
    if (action === 'accept') {
      await pool.query(
        `UPDATE group_members SET status='active', joined_at=NOW() WHERE group_id=$1 AND user_id=$2 AND status='invited'`,
        [req.params.id, req.user.id]
      );
    } else {
      await pool.query(
        `DELETE FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='invited'`,
        [req.params.id, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Leave group
// Edit group (admin only)
app.put('/api/groups/:id', authenticate, async (req, res) => {
  const { name, description, stadium_id, match_day, match_start, match_end, max_players } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    // Check admin
    const admin = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can edit the group' });
    const r = await pool.query(
      `UPDATE groups SET name=$1, description=$2, stadium_id=$3, match_day=$4, match_start=$5, match_end=$6, max_players=$7
       WHERE id=$8 RETURNING *`,
      [name, description || null, stadium_id || null, match_day !== undefined ? match_day : null,
       match_start || null, match_end || null, max_players || 10, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/groups/:id/leave', authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE group_members SET status='left' WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Get pending group invites for current user
app.get('/api/groups/invites/pending', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT g.*, u.name AS creator_name,
              s.name AS stadium_name,
              (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id=g.id AND gm2.status='active')::int AS member_count
       FROM group_members gm
       JOIN groups g ON gm.group_id=g.id
       JOIN users u ON g.creator_id=u.id
       LEFT JOIN stadiums s ON g.stadium_id=s.id
       WHERE gm.user_id=$1 AND gm.status='invited'
       ORDER BY g.created_at DESC`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Group Chat ─────────────────────────────────────────────────────

app.get('/api/groups/:id/messages', authenticate, async (req, res) => {
  try {
    // Mark as read
    await pool.query(
      `UPDATE group_members SET last_read_at=NOW() WHERE group_id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    const r = await pool.query(
      `SELECT gm.*, u.name AS sender_name, u.avatar_url AS sender_avatar FROM group_messages gm
       JOIN users u ON gm.sender_id=u.id
       WHERE gm.group_id=$1 ORDER BY gm.created_at ASC LIMIT 200`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/groups/:id/messages', authenticate, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  try {
    // Check membership
    const mem = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [req.params.id, req.user.id]
    );
    if (!mem.rows.length) return res.status(403).json({ error: 'Not a member' });
    const r = await pool.query(
      `INSERT INTO group_messages (group_id, sender_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, content.trim()]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

