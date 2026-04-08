-- ── Match results (per group match) ──────────────────────────────
CREATE TABLE IF NOT EXISTS match_results (
  id          SERIAL PRIMARY KEY,
  group_id    INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  played_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  score_a     INTEGER DEFAULT 0,
  score_b     INTEGER DEFAULT 0,
  notes       TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Per-player stats per match ───────────────────────────────────
CREATE TABLE IF NOT EXISTS player_match_stats (
  id               SERIAL PRIMARY KEY,
  match_result_id  INTEGER REFERENCES match_results(id) ON DELETE CASCADE,
  player_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
  goals            INTEGER DEFAULT 0,
  assists          INTEGER DEFAULT 0,
  position         VARCHAR(50),
  rating           NUMERIC(3,1) CHECK (rating >= 1 AND rating <= 10),
  UNIQUE(match_result_id, player_id)
);

-- ── Stadium reviews ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stadium_reviews (
  id          SERIAL PRIMARY KEY,
  stadium_id  INTEGER REFERENCES stadiums(id) ON DELETE CASCADE,
  player_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stadium_id, player_id)
);
