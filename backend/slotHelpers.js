function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMin(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

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

  // If the original parent slot still exists, the booking was never confirmed
  // (splitSlot was never called), so there is nothing to restore — bail out.
  if (booking.parent_schedule_id) {
    const parentCheck = await client.query(
      'SELECT id FROM stadium_schedule WHERE id=$1',
      [booking.parent_schedule_id]
    );
    if (parentCheck.rows.length) return; // parent untouched — nothing to restore
  }

  // Find adjacent slots to potentially merge with (after a split was done)
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

module.exports = { toMin, fromMin, splitSlot, restoreSlot };
