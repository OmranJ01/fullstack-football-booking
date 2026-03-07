-- ── Add profile picture to users ──────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── Add image to stadiums ─────────────────────────────────────────
ALTER TABLE stadiums ADD COLUMN IF NOT EXISTS image_url TEXT;
