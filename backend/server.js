const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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
  const { name, email, password, userType, location } = req.body;
  if (!name || !email || !password || !userType)
    return res.status(400).json({ error: 'All fields are required' });
  if (!['player', 'stadium_owner'].includes(userType))
    return res.status(400).json({ error: 'Invalid user type' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name,email,password,user_type,location) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,user_type',
      [name, email, hash, userType, location || null]
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
    const r = await pool.query('SELECT id,name,email,user_type,location FROM users WHERE id=$1', [req.user.id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ id: u.id, name: u.name, email: u.email, userType: u.user_type, location: u.location });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  FRIENDS
// ══════════════════════════════════════════════════════════════════

app.get('/api/players/search', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const myId = parseInt(req.user.id, 10);
  try {
    const r = await pool.query(
      `SELECT u.id, u.name, u.location,
         f.status AS friendship_status, f.requester_id AS friendship_requester
       FROM users u
       LEFT JOIN friendships f
         ON (f.requester_id=u.id AND f.addressee_id=$2) OR (f.addressee_id=u.id AND f.requester_id=$2)
       WHERE u.user_type='player' AND u.id<>$2 AND (u.name ILIKE $1 OR u.location ILIKE $1)
       ORDER BY u.name LIMIT 20`,
      [`%${q}%`, myId]
    );
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
      `SELECT u.id,u.name,u.location,f.created_at AS friends_since
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
      `SELECT u.id,u.name,u.location,f.created_at AS requested_at
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
      `SELECT u.id,u.name,u.location,f.created_at AS requested_at
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
  const { name, location, description, price_per_hour, capacity, surface, phone, open_time, close_time } = req.body;
  if (!name || !location || !price_per_hour) return res.status(400).json({ error: 'Name, location and price are required' });
  try {
    const r = await pool.query(
      `INSERT INTO stadiums (owner_id,name,location,description,price_per_hour,capacity,surface,phone,open_time,close_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, name, location, description || null, price_per_hour, capacity || null,
       surface || 'grass', phone || null, open_time || '08:00', close_time || '22:00']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/stadiums/:id', authenticate, requireOwner, async (req, res) => {
  const { name, location, description, price_per_hour, capacity, surface, phone, open_time, close_time, is_active } = req.body;
  try {
    const check = await pool.query('SELECT id FROM stadiums WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Stadium not found' });
    const r = await pool.query(
      `UPDATE stadiums SET name=$1,location=$2,description=$3,price_per_hour=$4,capacity=$5,surface=$6,
         phone=$7,open_time=$8,close_time=$9,is_active=$10,updated_at=NOW()
       WHERE id=$11 AND owner_id=$12 RETURNING *`,
      [name, location, description || null, price_per_hour, capacity || null, surface || 'grass',
       phone || null, open_time || '08:00', close_time || '22:00',
       is_active !== undefined ? is_active : true, req.params.id, req.user.id]
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

// Browse stadiums (players) — filter by location, day, time range
app.get('/api/stadiums', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  const day = req.query.day !== undefined && req.query.day !== '' ? parseInt(req.query.day) : null;
  const slotStart = req.query.slot_start || null;
  const slotEnd = req.query.slot_end || null;
  try {
    let query, params;
    if (day !== null && slotStart && slotEnd) {
      query = `
        SELECT DISTINCT s.*, u.name AS owner_name
        FROM stadiums s JOIN users u ON s.owner_id=u.id
        JOIN stadium_schedule ss ON ss.stadium_id=s.id
        WHERE s.is_active=TRUE AND ss.day_of_week=$3
          AND ss.slot_start <= $4::time AND ss.slot_end >= $5::time
          AND ss.is_available=TRUE
          AND ($1='' OR s.name ILIKE $2 OR s.location ILIKE $2)
        ORDER BY s.name`;
      params = [q, `%${q}%`, day, slotStart, slotEnd];
    } else if (day !== null) {
      query = `
        SELECT DISTINCT s.*, u.name AS owner_name
        FROM stadiums s JOIN users u ON s.owner_id=u.id
        JOIN stadium_schedule ss ON ss.stadium_id=s.id
        WHERE s.is_active=TRUE AND ss.day_of_week=$3 AND ss.is_available=TRUE
          AND ($1='' OR s.name ILIKE $2 OR s.location ILIKE $2)
        ORDER BY s.name`;
      params = [q, `%${q}%`, day];
    } else {
      query = `
        SELECT s.*, u.name AS owner_name
        FROM stadiums s JOIN users u ON s.owner_id=u.id
        WHERE s.is_active=TRUE
          AND ($1='' OR s.name ILIKE $2 OR s.location ILIKE $2)
        ORDER BY s.created_at DESC LIMIT 50`;
      params = [q, `%${q}%`];
    }
    const r = await pool.query(query, params);
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
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Player: view my bookings
app.get('/api/bookings/mine', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*, s.name AS stadium_name, s.location AS stadium_location,
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
