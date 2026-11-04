-- =====================================================================
-- Sprint 2 client feedback: customer sign-in and "save and finish later".
-- Adds to a database created before these were in 01_schema.sql. Safe to
-- re-run, and it doesn't touch any existing data. Not needed right after
-- running 01_schema.sql (it already has everything below).
--
-- After this, re-run 04_demo_quote_rates.sql for the state eligibility
-- factors (rule version demo-2026-11).
-- =====================================================================

USE valent_insurance;

-- Same definitions as in 01_schema.sql
CREATE TABLE IF NOT EXISTS customer_accounts (
  account_id    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash  CHAR(64)  NOT NULL PRIMARY KEY,
  account_id  INT       NOT NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME  NOT NULL,
  FOREIGN KEY (account_id) REFERENCES customer_accounts(account_id) ON DELETE CASCADE
);

-- MySQL has no "ADD COLUMN IF NOT EXISTS", so each column is only added when it's missing
SET @has_account = (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'account_id');
SET @sql = IF(@has_account = 0,
    'ALTER TABLE applications ADD COLUMN account_id INT NULL, ADD FOREIGN KEY (account_id) REFERENCES customer_accounts(account_id)',
    'SELECT ''account_id already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_guest_key = (SELECT COUNT(*) FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME = 'guest_key_hash');
SET @sql = IF(@has_guest_key = 0,
    'ALTER TABLE applications ADD COLUMN guest_key_hash CHAR(64) NULL',
    'SELECT ''guest_key_hash already exists'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Check: should list account_id and guest_key_hash
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applications' AND COLUMN_NAME IN ('account_id', 'guest_key_hash');
