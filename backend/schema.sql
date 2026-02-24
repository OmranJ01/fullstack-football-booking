-- Run this in pgAdmin Query Tool on your football_db database

CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  email        VARCHAR(150) UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  user_type    VARCHAR(20) NOT NULL CHECK (user_type IN ('player', 'stadium_owner')),
  location     VARCHAR(100),
  created_at   TIMESTAMP DEFAULT NOW()
);
