const express = require("express");
const router = express.Router({ mergeParams: true });
const pool = require("../db");
const { authenticate } = require("../middleware");

// GET /api/stadiums/:id/reviews
router.get('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT sr.id, sr.rating, sr.comment, sr.created_at,
              u.name AS player_name, u.avatar_url AS player_avatar,
              (sr.player_id = $2) AS is_mine
       FROM stadium_reviews sr
       JOIN users u ON sr.player_id = u.id
       WHERE sr.stadium_id = $1
       ORDER BY sr.created_at DESC`,
      [req.params.id, req.user.id]
    );
    const aggRes = await pool.query(
      `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*)::int AS total
       FROM stadium_reviews WHERE stadium_id = $1`,
      [req.params.id]
    );
    res.json({
      reviews: r.rows,
      avg_rating: aggRes.rows[0].avg_rating ? parseFloat(aggRes.rows[0].avg_rating) : null,
      total: aggRes.rows[0].total,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/stadiums/:id/reviews  (upsert — one review per player per stadium)
router.post('/', authenticate, async (req, res) => {
  if (req.user.userType !== 'player') return res.status(403).json({ error: 'Only players can review stadiums' });
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

  try {
    // Must have a confirmed booking at this stadium
    const eligible = await pool.query(
      `SELECT id FROM bookings WHERE player_id=$1 AND stadium_id=$2 AND status='confirmed' LIMIT 1`,
      [req.user.id, req.params.id]
    );
    if (!eligible.rows.length)
      return res.status(403).json({ error: 'You can only review stadiums you have a confirmed booking at' });

    const r = await pool.query(
      `INSERT INTO stadium_reviews (stadium_id, player_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stadium_id, player_id) DO UPDATE SET rating=$3, comment=$4, created_at=NOW()
       RETURNING *`,
      [req.params.id, req.user.id, rating, comment || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/stadiums/:id/reviews  (delete own review)
router.delete('/', authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `DELETE FROM stadium_reviews WHERE stadium_id=$1 AND player_id=$2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Review not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
