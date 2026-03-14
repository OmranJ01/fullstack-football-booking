const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");

// Get my availability
router.get('/availability', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM player_availability WHERE player_id=$1 ORDER BY day_of_week, slot_start',
      [req.user.id]
    );
    res.json(r.rows);
  } 
  
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


// Save availability for a day (replace all slots for that day)
router.put('/availability/:day', authenticate, async (req, res) => {
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
  } 
  
  catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
});


// Get a specific player's availability (for viewing profile)
router.get('/:id/availability', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT day_of_week, slot_start, slot_end FROM player_availability WHERE player_id=$1 ORDER BY day_of_week, slot_start',
      [req.params.id]
    );
    res.json(r.rows);
  } 
  catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});


module.exports = router;
