-- =====================================================================
-- Adds the staff_sessions table (dashboard login) to a database created
-- before it was added to 01_schema.sql. Safe to re-run, and it doesn't
-- touch any existing data. Not needed right after running 01_schema.sql.
-- =====================================================================

USE valent_insurance;

-- Same definition as in 01_schema.sql. Only a SHA-256 hash of each token is
-- stored, so a copy of this table can't be used to sign in.
CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash  CHAR(64)  NOT NULL PRIMARY KEY,
  staff_id    INT       NOT NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME  NOT NULL,
  FOREIGN KEY (staff_id) REFERENCES staff_users(staff_id) ON DELETE CASCADE
);

SHOW TABLES LIKE 'staff_sessions';
