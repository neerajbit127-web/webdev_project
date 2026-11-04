CREATE TABLE IF NOT EXISTS login_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_events_logged_in_at
  ON login_events (logged_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_user_id_logged_in_at
  ON login_events (user_id, logged_in_at DESC);
