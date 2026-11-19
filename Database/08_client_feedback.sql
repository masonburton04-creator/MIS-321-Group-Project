-- =====================================================================
-- Client feedback update (meeting notes, November 2026). Run AFTER 01-07
-- (and after 03_mock_data.sql if you use the mock data). Safe to re-run.
--
-- Adds:
--   * customer_accounts / customer_sessions   customer sign-in (applying needs an account)
--   * staff role 'specialist'                  escalations are routed to specialists
--   * applications.account_id                  which customer account owns an application
--   * applications.rejection_code              why an application was rejected (rejection_reasons)
--   * applications.auto_decision               'approved' / 'escalated' when a rule decided it, not a person
--   * rejection_reasons                        reason list agents pick from; customers see the message
--   * zip_risk_factors                         natural-hazard ratings by ZIP code (DEMO values)
--   * demo specialist + demo customer accounts (password ValentDemo2026!, demo only)
--
-- If you re-run 03_mock_data.sql later, re-run this file too: it re-links the
-- demo customer accounts and specialists to the regenerated mock applications.
-- =====================================================================

USE valent_insurance;

SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------
-- 1. Schema changes (each one is skipped if it was already made)
-- ---------------------------------------------------------------------

-- Customer accounts. Separate from staff_users so a customer can never reach
-- the dashboard, and from customers (one row per application's applicant details).
CREATE TABLE IF NOT EXISTS customer_accounts (
  account_id    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,           -- salted PBKDF2, never plain text
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME     NULL
);

-- Signed-in customer sessions. Only a SHA-256 hash of each token is stored.
CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash  CHAR(64)  NOT NULL PRIMARY KEY,
  account_id  INT       NOT NULL,
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME  NOT NULL,
  FOREIGN KEY (account_id) REFERENCES customer_accounts(account_id) ON DELETE CASCADE
);

-- Why an application was rejected. agent_label is what agents pick from;
-- customer_message is what the customer sees on My Applications.
CREATE TABLE IF NOT EXISTS rejection_reasons (
  code             VARCHAR(30)  NOT NULL PRIMARY KEY,
  agent_label      VARCHAR(100) NOT NULL,
  customer_message VARCHAR(500) NOT NULL,
  sort_order       INT          NOT NULL DEFAULT 0
);

-- Natural-hazard ratings by ZIP code, 1 = very low ... 5 = very high.
-- The intended real source is FEMA's National Risk Index (hazards.fema.gov/nri),
-- which is published by county and census tract, mapped to ZIP codes.
-- is_mock = TRUE: the values below are DEMO ratings, not FEMA data.
CREATE TABLE IF NOT EXISTS zip_risk_factors (
  zip_code      CHAR(5)      NOT NULL PRIMARY KEY,
  state_code    CHAR(2)      NOT NULL,
  place_name    VARCHAR(100) NOT NULL,
  flood_risk    TINYINT      NOT NULL,
  wind_risk     TINYINT      NOT NULL,           -- hurricane / strong wind
  hail_risk     TINYINT      NOT NULL,
  wildfire_risk TINYINT      NOT NULL,
  is_mock       BOOLEAN      NOT NULL DEFAULT TRUE,
  source        VARCHAR(255) NULL,
  FOREIGN KEY (state_code) REFERENCES states(state_code)
);

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column) THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table, ' ADD COLUMN ', p_column, ' ', p_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL add_column_if_missing('applications', 'account_id', 'INT NULL AFTER customer_id');
CALL add_column_if_missing('applications', 'rejection_code', 'VARCHAR(30) NULL AFTER rejection_reason');
CALL add_column_if_missing('applications', 'auto_decision', 'VARCHAR(20) NULL AFTER rejection_code');
DROP PROCEDURE add_column_if_missing;

-- Foreign key for account_id (only if it isn't there yet)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints
                  WHERE table_schema = DATABASE() AND table_name = 'applications'
                    AND constraint_name = 'fk_applications_account');
SET @ddl = IF(@fk_exists = 0,
  'ALTER TABLE applications ADD CONSTRAINT fk_applications_account FOREIGN KEY (account_id) REFERENCES customer_accounts(account_id)',
  'SELECT ''fk_applications_account already exists''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- New staff role. Specialists receive escalated applications.
ALTER TABLE staff_users MODIFY role ENUM('employee', 'specialist', 'admin') NOT NULL DEFAULT 'employee';

-- ---------------------------------------------------------------------
-- 2. Rejection reasons (edit the wording here any time)
-- ---------------------------------------------------------------------

INSERT INTO rejection_reasons (code, agent_label, customer_message, sort_order) VALUES
('flood_zone',        'Property is in a high-risk flood zone',
                      'Your property is in a high-risk flood zone where we can''t offer this coverage right now. A flood policy through the National Flood Insurance Program (NFIP) may still be available to you.', 10),
('driving_record',    'Driving record (tickets / violations)',
                      'The driving record for one or more drivers on your application has more tickets or violations than we can accept right now.', 20),
('accident_history',  'Too many accidents or claims',
                      'The number of recent accidents or claims on your application is more than we can accept right now.', 30),
('property_claims',   'Prior property claims',
                      'The property''s recent claims history is more than we can accept right now.', 40),
('property_condition','Property age or condition',
                      'We can''t insure the property in its current condition (for example, the roof or the age of the electrical system).', 50),
('high_value',        'Value is higher than we can insure',
                      'The value you asked us to insure is higher than we can cover. A specialist can suggest other options.', 60),
('area_not_served',   'Not offered in this area',
                      'We don''t offer this coverage in your area right now.', 70),
('missing_documents', 'Missing or unverifiable documents',
                      'We couldn''t verify the documents or details we needed. You''re welcome to apply again with the missing information.', 80),
('customer_withdrew', 'Customer withdrew',
                      'This application was closed at your request.', 90),
('other',             'Other (explain in the note)',
                      'Your application didn''t meet our current requirements. Contact us for details.', 100)
ON DUPLICATE KEY UPDATE agent_label = VALUES(agent_label), customer_message = VALUES(customer_message),
                        sort_order = VALUES(sort_order);

-- ---------------------------------------------------------------------
-- 3. ZIP risk ratings: DEMO values for the demo states' ZIP codes
-- ---------------------------------------------------------------------
-- 1 very low, 2 low, 3 moderate, 4 high, 5 very high. Coastal ZIPs get high
-- flood/wind, north Texas gets high hail, etc. These are illustrations only;
-- replace them with FEMA National Risk Index values before relying on them.

INSERT INTO zip_risk_factors (zip_code, state_code, place_name, flood_risk, wind_risk, hail_risk, wildfire_risk, is_mock, source) VALUES
('36542', 'AL', 'Gulf Shores',    5, 5, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('36561', 'AL', 'Orange Beach',   5, 5, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('36605', 'AL', 'Mobile',         4, 4, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('36526', 'AL', 'Daphne',         3, 4, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('35801', 'AL', 'Huntsville',     2, 3, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('35401', 'AL', 'Tuscaloosa',     2, 3, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('35226', 'AL', 'Hoover',         1, 3, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('35203', 'AL', 'Birmingham',     2, 3, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('77550', 'TX', 'Galveston',      5, 5, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('78404', 'TX', 'Corpus Christi', 4, 5, 2, 2, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('77706', 'TX', 'Beaumont',       4, 4, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('77068', 'TX', 'Houston',        4, 4, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('77005', 'TX', 'Houston',        4, 4, 3, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('75214', 'TX', 'Dallas',         2, 3, 5, 2, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('78249', 'TX', 'San Antonio',    2, 2, 4, 3, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('78701', 'TX', 'Austin',         3, 2, 4, 3, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('78704', 'TX', 'Austin',         3, 2, 4, 3, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('11758', 'NY', 'Massapequa',     4, 4, 1, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('12203', 'NY', 'Albany',         2, 2, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('14604', 'NY', 'Rochester',      2, 2, 2, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('10001', 'NY', 'New York',       3, 3, 1, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index'),
('11201', 'NY', 'Brooklyn',       4, 3, 1, 1, TRUE, 'DEMO rating - replace with FEMA National Risk Index')
ON DUPLICATE KEY UPDATE state_code = VALUES(state_code), place_name = VALUES(place_name),
  flood_risk = VALUES(flood_risk), wind_risk = VALUES(wind_risk), hail_risk = VALUES(hail_risk),
  wildfire_risk = VALUES(wildfire_risk), is_mock = VALUES(is_mock), source = VALUES(source);

-- ---------------------------------------------------------------------
-- 4. Demo accounts (password ValentDemo2026!, same demo hash as 03_mock_data.sql)
-- ---------------------------------------------------------------------
SET @demo_hash = 'AQAAAAIAAYagAAAAEAUWjGDemw6lbHLAeIAya/D7uSCP/K6zw6PyMDubrPYfGdLTbUdXdtj6rV56w5heEQ==';

-- Specialists: receive every escalated application
INSERT INTO staff_users (email, first_name, last_name, password_hash, role, is_active) VALUES
('taylor.nguyen@valentpartners.example', 'Taylor', 'Nguyen', @demo_hash, 'specialist', TRUE),
('sam.ortiz@valentpartners.example',     'Sam',    'Ortiz',  @demo_hash, 'specialist', TRUE)
ON DUPLICATE KEY UPDATE role = VALUES(role), is_active = VALUES(is_active), password_hash = VALUES(password_hash);

-- Customer accounts for a few mock applicants, so "My Applications" has something to show:
--   jordan.rivera@example.com   submitted (waiting for an agent)
--   priya.shah@example.com      escalated to a specialist
--   samuel.okoro@example.com    approved
--   tyler.henderson@example.com rejected (with a reason)
INSERT INTO customer_accounts (email, first_name, last_name, password_hash) VALUES
('jordan.rivera@example.com',   'Jordan', 'Rivera',    @demo_hash),
('priya.shah@example.com',      'Priya',  'Shah',      @demo_hash),
('samuel.okoro@example.com',    'Samuel', 'Okoro',     @demo_hash),
('tyler.henderson@example.com', 'Tyler',  'Henderson', @demo_hash)
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);

-- Link each demo account to the mock applications with the same applicant email
UPDATE applications a
JOIN customers c ON c.customer_id = a.customer_id
JOIN customer_accounts ca ON ca.email = c.email
SET a.account_id = ca.account_id
WHERE a.account_id IS NULL;

-- ---------------------------------------------------------------------
-- 5. Bring the mock applications in line with the new rules
-- ---------------------------------------------------------------------

-- Rejection reasons for the mock rejected applications (matched on the agent's note)
UPDATE applications SET rejection_code = 'missing_documents'
WHERE status = 'rejected' AND rejection_code IS NULL
  AND (rejection_reason LIKE '%verify%' OR rejection_reason LIKE '%documentation%');
UPDATE applications SET rejection_code = 'customer_withdrew'
WHERE status = 'rejected' AND rejection_code IS NULL AND rejection_reason LIKE '%withdrew%';
UPDATE applications SET rejection_code = 'other'
WHERE status = 'rejected' AND rejection_code IS NULL;

-- Open escalations go to a specialist (round-robin by application id)
DROP TEMPORARY TABLE IF EXISTS specialist_list;
CREATE TEMPORARY TABLE specialist_list AS
SELECT staff_id, ROW_NUMBER() OVER (ORDER BY staff_id) - 1 AS slot
FROM staff_users WHERE role = 'specialist' AND is_active = TRUE;
SET @specialists = (SELECT COUNT(*) FROM specialist_list);

UPDATE applications a
JOIN specialist_list s ON s.slot = MOD(a.application_id, GREATEST(@specialists, 1))
SET a.assigned_staff_id = s.staff_id
WHERE a.status = 'escalated';

UPDATE escalations e
JOIN applications a ON a.application_id = e.application_id
SET e.assigned_staff_id = a.assigned_staff_id
WHERE e.status <> 'resolved' AND a.status = 'escalated';

DROP TEMPORARY TABLE specialist_list;

SET SQL_SAFE_UPDATES = 1;

-- Quick checks
SELECT role, COUNT(*) AS staff FROM staff_users GROUP BY role;
SELECT ca.email, a.application_id, a.status, a.rejection_code
FROM customer_accounts ca LEFT JOIN applications a ON a.account_id = ca.account_id
ORDER BY ca.email;
