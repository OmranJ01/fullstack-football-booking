const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware");

// ══════════════════════════════════════════════════════════════════
//  GROUP MATCHES
// ══════════════════════════════════════════════════════════════════

// GET /api/match-results/groups/:groupId  — list matches for a group
router.get('/groups/:groupId', authenticate, async (req, res) => {
  try {
    const mem = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [req.params.groupId, req.user.id]
    );
    if (!mem.rows.length) return res.status(403).json({ error: 'Not a member' });

    const r = await pool.query(
      `SELECT mr.*, u.name AS created_by_name,
              (SELECT json_agg(json_build_object(
                'id', pms.id,
                'player_id', pms.player_id,
                'player_name', us.name,
                'goals', pms.goals,
                'assists', pms.assists,
                'position', pms.position,
                'rating', pms.rating
              ) ORDER BY pms.goals DESC)
               FROM player_match_stats pms
               JOIN users us ON pms.player_id=us.id
               WHERE pms.match_result_id=mr.id) AS player_stats
       FROM match_results mr
       JOIN users u ON mr.created_by=u.id
       WHERE mr.group_id=$1
       ORDER BY mr.played_on DESC, mr.created_at DESC`,
      [req.params.groupId]
    );
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/match-results/groups/:groupId  — log a match (admin only)
router.post('/groups/:groupId', authenticate, async (req, res) => {
  const { played_on, score_a, score_b, notes } = req.body;
  try {
    const admin = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND role='admin' AND status='active'`,
      [req.params.groupId, req.user.id]
    );
    if (!admin.rows.length) return res.status(403).json({ error: 'Only admins can log matches' });

    const r = await pool.query(
      `INSERT INTO match_results (group_id, played_on, score_a, score_b, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.groupId,
       played_on || new Date().toISOString().slice(0, 10),
       score_a ?? 0, score_b ?? 0, notes || null, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/match-results/:id  — edit match (admin only)
router.patch('/:id', authenticate, async (req, res) => {
  const { played_on, score_a, score_b, notes } = req.body;
  try {
    const check = await pool.query(
      `SELECT mr.id FROM match_results mr
       JOIN group_members gm ON gm.group_id=mr.group_id AND gm.user_id=$2 AND gm.role='admin' AND gm.status='active'
       WHERE mr.id=$1`,
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Only admins can edit matches' });

    const r = await pool.query(
      `UPDATE match_results SET played_on=$1, score_a=$2, score_b=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [played_on, score_a ?? 0, score_b ?? 0, notes || null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/match-results/:id  — delete match (admin only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT mr.id FROM match_results mr
       JOIN group_members gm ON gm.group_id=mr.group_id AND gm.user_id=$2 AND gm.role='admin' AND gm.status='active'
       WHERE mr.id=$1`,
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Only admins can delete matches' });
    await pool.query('DELETE FROM match_results WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  PLAYER STATS (per match)
// ══════════════════════════════════════════════════════════════════

// POST /api/match-results/:id/stats  — log/update own stats for a match
router.post('/:id/stats', authenticate, async (req, res) => {
  const { goals, assists, position, rating } = req.body;
  try {
    const check = await pool.query(
      `SELECT mr.id FROM match_results mr
       JOIN group_members gm ON gm.group_id=mr.group_id AND gm.user_id=$2 AND gm.status='active'
       WHERE mr.id=$1`,
      [req.params.id, req.user.id]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'Not a member of this group' });

    const r = await pool.query(
      `INSERT INTO player_match_stats (match_result_id, player_id, goals, assists, position, rating)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (match_result_id, player_id) DO UPDATE
         SET goals=$3, assists=$4, position=$5, rating=$6
       RETURNING *`,
      [req.params.id, req.user.id, goals ?? 0, assists ?? 0, position || null, rating || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  AGGREGATED PLAYER STATS
// ══════════════════════════════════════════════════════════════════

// GET /api/match-results/players/:playerId/stats
// playerId can be "me" to get own stats
router.get('/players/:playerId/stats', authenticate, async (req, res) => {
  const playerId = req.params.playerId === 'me' ? req.user.id : parseInt(req.params.playerId);
  try {
    const summaryRes = await pool.query(
      `SELECT
         COUNT(DISTINCT pms.match_result_id)::int AS matches_played,
         COALESCE(SUM(pms.goals), 0)::int         AS total_goals,
         COALESCE(SUM(pms.assists), 0)::int       AS total_assists,
         ROUND(AVG(pms.rating), 1)                AS avg_rating
       FROM player_match_stats pms
       WHERE pms.player_id = $1`,
      [playerId]
    );
    const recentRes = await pool.query(
      `SELECT mr.id AS match_id, mr.played_on, mr.score_a, mr.score_b, mr.notes,
              g.name AS group_name, g.id AS group_id,
              pms.goals, pms.assists, pms.position, pms.rating
       FROM player_match_stats pms
       JOIN match_results mr ON pms.match_result_id = mr.id
       JOIN groups g ON mr.group_id = g.id
       WHERE pms.player_id = $1
       ORDER BY mr.played_on DESC
       LIMIT 20`,
      [playerId]
    );
    res.json({ summary: summaryRes.rows[0], recent: recentRes.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════════
//  SMART SCHEDULING
// ══════════════════════════════════════════════════════════════════

// GET /api/match-results/groups/:groupId/smart-schedule?stadium_id=X
// Finds time slots where the most group members are available AND the stadium has a free slot
router.get('/groups/:groupId/smart-schedule', authenticate, async (req, res) => {
  const { stadium_id } = req.query;
  if (!stadium_id) return res.status(400).json({ error: 'stadium_id is required' });

  try {
    // Check membership
    const mem = await pool.query(
      `SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active'`,
      [req.params.groupId, req.user.id]
    );
    if (!mem.rows.length) return res.status(403).json({ error: 'Not a member' });

    // Get total member count
    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM group_members WHERE group_id=$1 AND status='active'`,
      [req.params.groupId]
    );
    const totalMembers = totalRes.rows[0].total;

    // Get all members' availability
    const availRes = await pool.query(
      `SELECT pa.day_of_week, pa.slot_start, pa.slot_end, u.id AS user_id, u.name
       FROM player_availability pa
       JOIN group_members gm ON gm.user_id=pa.player_id AND gm.group_id=$1 AND gm.status='active'
       JOIN users u ON u.id=pa.player_id`,
      [req.params.groupId]
    );

    // Get stadium's available schedule slots
    const stadiumRes = await pool.query(
      `SELECT day_of_week, slot_start, slot_end FROM stadium_schedule
       WHERE stadium_id=$1 AND is_available=TRUE
       ORDER BY day_of_week, slot_start`,
      [stadium_id]
    );

    if (!stadiumRes.rows.length) {
      return res.json({ suggestions: [], totalMembers, message: 'Stadium has no available slots configured' });
    }

    // Build member availability map: day → array of {start, end, userId, name}
    const memberAvail = {};
    for (const row of availRes.rows) {
      const d = row.day_of_week;
      if (!memberAvail[d]) memberAvail[d] = [];
      memberAvail[d].push({
        start: toMinutes(row.slot_start),
        end: toMinutes(row.slot_end),
        userId: row.user_id,
        name: row.name,
      });
    }

    // For each stadium slot, scan in 1-hour windows and count available members
    const suggestions = [];
    for (const slot of stadiumRes.rows) {
      const d = slot.day_of_week;
      const sStart = toMinutes(slot.slot_start);
      const sEnd = toMinutes(slot.slot_end);

      // Slide a 1-hour window across the stadium slot
      for (let t = sStart; t + 60 <= sEnd; t += 60) {
        const windowEnd = t + 60;
        const available = [];
        const unavailable = [];
        const dayAvail = memberAvail[d] || [];

        // Get unique members who have set availability
        const membersWithAvail = new Set(dayAvail.map(m => m.userId));

        for (const m of dayAvail) {
          // Member is available if their slot covers the entire window
          if (m.start <= t && m.end >= windowEnd) {
            if (!available.find(a => a.userId === m.userId)) {
              available.push({ userId: m.userId, name: m.name });
            }
          }
        }

        // Only include slots with at least 2 members available
        if (available.length >= 2) {
          suggestions.push({
            day: d,
            start: fromMinutes(t),
            end: fromMinutes(windowEnd),
            available_count: available.length,
            available_members: available,
            total_members: totalMembers,
            members_with_availability: membersWithAvail.size,
          });
        }
      }
    }

    // Sort by available count desc, then by day + time
    suggestions.sort((a, b) =>
      b.available_count - a.available_count || a.day - b.day || a.start.localeCompare(b.start)
    );

    res.json({ suggestions: suggestions.slice(0, 20), totalMembers });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

function toMinutes(t) {
  const [h, m] = (t || '00:00').toString().split(':').map(Number);
  return h * 60 + m;
}
function fromMinutes(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

module.exports = router;
