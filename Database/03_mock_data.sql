-- =====================================================================
-- Mock accounts and applications for demos/testing. Run AFTER 01_schema.sql
-- and 02_seed.sql. Safe to re-run: it deletes the mock rows it made last
-- time (and nothing else) before inserting them again.
--
-- What it creates:
--   * 5 staff (agent) accounts: 1 admin, 3 employees, 1 inactive employee
--   * 32 mock customers with applications in every status, including
--     bundles, vehicles/drivers, jewelry pieces, review history, and escalations
--   * Behavior-analytics events (step views, time on step, exits, validation
--     errors) for those applications, so the agent dashboard has data
--
-- Everything is FAKE: names, @example.com emails, 555-01xx phone numbers.
-- Staff password_hash is NULL because there is no login system yet.
-- Dates are relative to NOW(), so the data always looks recent.
-- =====================================================================

USE valent_insurance;

-- MySQL Workbench blocks DELETEs that don't filter on a key column by default
SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------
-- 1. Remove the previous run's mock data
-- ---------------------------------------------------------------------
-- Every mock customer gets an analytics session whose id starts with
-- 'mock-sess-', which is how we find them again here.

DROP TEMPORARY TABLE IF EXISTS mock_customers;
DROP TEMPORARY TABLE IF EXISTS mock_apps;

CREATE TEMPORARY TABLE mock_customers AS
SELECT customer_id FROM analytics_sessions WHERE session_id LIKE 'mock-sess-%';

CREATE TEMPORARY TABLE mock_apps AS
SELECT application_id FROM applications
WHERE customer_id IN (SELECT customer_id FROM mock_customers);

DELETE FROM analytics_events   WHERE session_id LIKE 'mock-sess-%';
DELETE FROM analytics_sessions WHERE session_id LIKE 'mock-sess-%';
DELETE FROM escalations        WHERE application_id IN (SELECT application_id FROM mock_apps);
DELETE FROM quotes             WHERE application_id IN (SELECT application_id FROM mock_apps);
-- answers, items, lines, and status history are deleted by ON DELETE CASCADE
DELETE FROM applications       WHERE application_id IN (SELECT application_id FROM mock_apps);
DELETE FROM customers          WHERE customer_id IN (SELECT customer_id FROM mock_customers);

DROP TEMPORARY TABLE mock_customers;
DROP TEMPORARY TABLE mock_apps;

-- ---------------------------------------------------------------------
-- 2. Staff (agent) accounts
-- ---------------------------------------------------------------------
-- Insert or refresh. Staff rows are never deleted because real test
-- applications may already be assigned to them.

INSERT INTO staff_users (email, first_name, last_name, password_hash, role, is_active) VALUES
('morgan.ellis@valentpartners.example',  'Morgan', 'Ellis',    NULL, 'admin',    TRUE),
('casey.patel@valentpartners.example',   'Casey',  'Patel',    NULL, 'employee', TRUE),
('drew.thompson@valentpartners.example', 'Drew',   'Thompson', NULL, 'employee', TRUE),
('riley.brooks@valentpartners.example',  'Riley',  'Brooks',   NULL, 'employee', TRUE),
('avery.kim@valentpartners.example',     'Avery',  'Kim',      NULL, 'employee', FALSE)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name  = VALUES(last_name),
  role       = VALUES(role),
  is_active  = VALUES(is_active);

-- ---------------------------------------------------------------------
-- 3. Helper procedures (dropped again at the end of this script)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS mock_application;
DROP PROCEDURE IF EXISTS mock_answer;
DROP PROCEDURE IF EXISTS mock_home;
DROP PROCEDURE IF EXISTS mock_vehicle;
DROP PROCEDURE IF EXISTS mock_driver;
DROP PROCEDURE IF EXISTS mock_jewelry;

DELIMITER //

-- Creates one customer + application the same way the API would, plus its
-- status history. Returns the new application_id in p_app_id.
--   p_lines:  'HOME', or several for a bundle: 'HOME,FLOOD,AUTO'
--   p_status: in_progress | abandoned | submitted | under_review | approved | rejected | escalated
--   p_step:   furthest step reached (only used for in_progress / abandoned)
--   p_staff_email / p_note: reviewing agent and their decision note (NULL if not reviewed yet)
CREATE PROCEDURE mock_application(
  IN p_first VARCHAR(100), IN p_last VARCHAR(100), IN p_email VARCHAR(255), IN p_phone VARCHAR(25),
  IN p_state CHAR(2), IN p_lines VARCHAR(100), IN p_status VARCHAR(20), IN p_step INT,
  IN p_days_ago INT, IN p_staff_email VARCHAR(255), IN p_note VARCHAR(255),
  OUT p_app_id INT)
BEGIN
  DECLARE v_created   DATETIME;
  DECLARE v_submitted DATETIME DEFAULT NULL;
  DECLARE v_reviewed  DATETIME DEFAULT NULL;
  DECLARE v_decided   DATETIME DEFAULT NULL;
  DECLARE v_was_submitted BOOLEAN;
  DECLARE v_has_name  BOOLEAN;
  DECLARE v_step      INT;
  DECLARE v_staff     INT;
  DECLARE v_customer  INT;

  SET v_was_submitted = p_status NOT IN ('in_progress', 'abandoned');
  SET v_step = IF(v_was_submitted, 5, p_step);
  -- The customer's name/email are saved at step 3, so current_step >= 4 means we have them
  SET v_has_name = v_step >= 4;
  SET v_staff = (SELECT staff_id FROM staff_users WHERE email = p_staff_email);

  -- Spread times out a little so they don't all land on the same hour
  SET v_created = NOW() - INTERVAL p_days_ago DAY - INTERVAL (MOD(p_days_ago * 7, 9) + 1) HOUR;
  IF v_was_submitted THEN
    SET v_submitted = v_created + INTERVAL (12 + MOD(CHAR_LENGTH(p_email) * 7, 40)) MINUTE;
    SET v_reviewed  = LEAST(v_submitted + INTERVAL (2 + MOD(p_days_ago * 5, 20)) HOUR, NOW());
    SET v_decided   = LEAST(v_reviewed + INTERVAL 90 MINUTE, NOW());
  END IF;

  INSERT INTO customers (first_name, last_name, email, phone, state_code, created_at)
  VALUES (IF(v_has_name, p_first, NULL), IF(v_has_name, p_last, NULL),
          IF(v_has_name, p_email, NULL), IF(v_has_name, p_phone, NULL), p_state, v_created);
  SET v_customer = LAST_INSERT_ID();

  -- Tags this customer as mock data (see the cleanup section at the top)
  INSERT INTO analytics_sessions (session_id, customer_id, state_code, device_type, started_at)
  VALUES (CONCAT('mock-sess-', LPAD(v_customer, 26, '0')), v_customer, p_state,
          ELT(MOD(v_customer, 3) + 1, 'desktop', 'mobile', 'tablet'), v_created);

  INSERT INTO applications (customer_id, state_code, status, current_step, assigned_staff_id,
                            rejection_reason, created_at, updated_at, submitted_at)
  VALUES (v_customer, p_state, p_status, v_step,
          IF(p_status IN ('under_review', 'approved', 'rejected', 'escalated'), v_staff, NULL),
          IF(p_status = 'rejected', p_note, NULL),
          v_created, COALESCE(v_decided, v_created), v_submitted);
  SET p_app_id = LAST_INSERT_ID();

  INSERT INTO application_lines (application_id, line_id)
  SELECT p_app_id, line_id FROM insurance_lines WHERE FIND_IN_SET(line_code, p_lines);

  -- Status history, matching what the API writes at each stage
  INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note, changed_at)
  VALUES (p_app_id, NULL, 'in_progress', NULL,
          IF(LOCATE(',', p_lines) > 0, CONCAT('Bundle started: ', REPLACE(p_lines, ',', ' + ')), 'Application started'),
          v_created);

  IF p_status = 'abandoned' THEN
    INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note, changed_at)
    VALUES (p_app_id, 'in_progress', 'abandoned', NULL, 'No activity - marked abandoned',
            LEAST(v_created + INTERVAL 3 DAY, NOW()));
  END IF;

  IF v_was_submitted THEN
    INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note, changed_at)
    VALUES (p_app_id, 'in_progress', 'submitted', NULL, 'Submitted by customer', v_submitted);
  END IF;

  IF p_status IN ('under_review', 'approved', 'rejected', 'escalated') THEN
    INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note, changed_at)
    VALUES (p_app_id, 'submitted', 'under_review', v_staff, 'Review started', v_reviewed);
  END IF;

  IF p_status IN ('approved', 'rejected', 'escalated') THEN
    INSERT INTO application_status_history (application_id, old_status, new_status, changed_by, note, changed_at)
    VALUES (p_app_id, 'under_review', p_status, v_staff, p_note, v_decided);
  END IF;

  IF p_status = 'escalated' THEN
    INSERT INTO escalations (application_id, reason, status, assigned_staff_id, created_at)
    VALUES (p_app_id, p_note, 'open', v_staff, v_decided);
  END IF;
END //

-- One form answer (same as application_answers rows the API saves)
CREATE PROCEDURE mock_answer(IN p_app INT, IN p_step INT, IN p_key VARCHAR(100), IN p_value TEXT)
BEGIN
  INSERT INTO application_answers (application_id, step_number, field_key, field_value)
  VALUES (p_app, p_step, p_key, p_value);
END //

-- Step 2 property details for Homeowners / Flood
CREATE PROCEDURE mock_home(IN p_app INT, IN p_street VARCHAR(200), IN p_city VARCHAR(100), IN p_zip CHAR(5),
                           IN p_home_type VARCHAR(30), IN p_year_built INT, IN p_square_feet INT)
BEGIN
  INSERT INTO application_answers (application_id, step_number, field_key, field_value) VALUES
  (p_app, 2, 'street', p_street), (p_app, 2, 'city', p_city), (p_app, 2, 'zip', p_zip),
  (p_app, 2, 'home_type', p_home_type), (p_app, 2, 'year_built', p_year_built),
  (p_app, 2, 'square_feet', p_square_feet);
END //

CREATE PROCEDURE mock_vehicle(IN p_app INT, IN p_num INT, IN p_year INT, IN p_make VARCHAR(50), IN p_model VARCHAR(50),
                              IN p_use VARCHAR(20), IN p_miles INT, IN p_zip CHAR(5), IN p_ownership VARCHAR(20))
BEGIN
  INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value) VALUES
  (p_app, 'vehicle', p_num, 'year', p_year), (p_app, 'vehicle', p_num, 'make', p_make),
  (p_app, 'vehicle', p_num, 'model', p_model), (p_app, 'vehicle', p_num, 'use', p_use),
  (p_app, 'vehicle', p_num, 'annual_mileage', p_miles), (p_app, 'vehicle', p_num, 'garaging_zip', p_zip),
  (p_app, 'vehicle', p_num, 'ownership', p_ownership);
END //

CREATE PROCEDURE mock_driver(IN p_app INT, IN p_num INT, IN p_first VARCHAR(100), IN p_last VARCHAR(100),
                             IN p_relationship VARCHAR(20), IN p_years_licensed INT, IN p_primary_vehicle INT)
BEGIN
  INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value) VALUES
  (p_app, 'driver', p_num, 'first_name', p_first), (p_app, 'driver', p_num, 'last_name', p_last),
  (p_app, 'driver', p_num, 'relationship', p_relationship),
  (p_app, 'driver', p_num, 'years_licensed', p_years_licensed),
  (p_app, 'driver', p_num, 'primary_vehicle', p_primary_vehicle);
END //

-- p_appraisal_days_ago = NULL when there is no appraisal date
CREATE PROCEDURE mock_jewelry(IN p_app INT, IN p_num INT, IN p_type VARCHAR(20), IN p_value INT,
                              IN p_description VARCHAR(500), IN p_appraised VARCHAR(3), IN p_appraisal_days_ago INT)
BEGIN
  INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value) VALUES
  (p_app, 'jewelry', p_num, 'item_type', p_type), (p_app, 'jewelry', p_num, 'value', p_value),
  (p_app, 'jewelry', p_num, 'description', p_description), (p_app, 'jewelry', p_num, 'appraised', p_appraised);
  IF p_appraisal_days_ago IS NOT NULL THEN
    INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value)
    VALUES (p_app, 'jewelry', p_num, 'appraisal_date', DATE_FORMAT(CURDATE() - INTERVAL p_appraisal_days_ago DAY, '%Y-%m-%d'));
  END IF;
END //

DELIMITER ;

-- Coverage start dates ~2-4 weeks out from today
SET @start1 = DATE_FORMAT(CURDATE() + INTERVAL 14 DAY, '%Y-%m-%d');
SET @start2 = DATE_FORMAT(CURDATE() + INTERVAL 30 DAY, '%Y-%m-%d');

-- ---------------------------------------------------------------------
-- 4. Submitted applications waiting for an agent
-- ---------------------------------------------------------------------

CALL mock_application('Jordan', 'Rivera', 'jordan.rivera@example.com', '(205) 555-0101', 'AL', 'HOME,AUTO', 'submitted', 5, 0, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,D,E,F');
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_home(@app, '418 Magnolia Ave', 'Tuscaloosa', '35401', 'single_family', 1998, 2100);
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2019, 'Toyota', 'Camry', 'commute', 12000, '35401', 'owned');
CALL mock_vehicle(@app, 2, 2022, 'Honda', 'CR-V', 'pleasure', 8000, '35401', 'financed');
CALL mock_driver(@app, 1, 'Jordan', 'Rivera', 'self', 15, 1);
CALL mock_driver(@app, 2, 'Sam', 'Rivera', 'spouse', 12, 2);

CALL mock_application('Grace', 'Liu', 'grace.liu@example.com', '(813) 555-0102', 'FL', 'HOME,FLOOD', 'submitted', 5, 1, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL mock_home(@app, '2207 Bayshore Ct', 'Tampa', '33611', 'single_family', 2004, 1850);
CALL mock_answer(@app, 2, 'flood_zone', 'A');
CALL mock_answer(@app, 2, 'has_basement', 'no');

CALL mock_application('Hannah', 'Weiss', 'hannah.weiss@example.com', '(718) 555-0103', 'NY', 'JEWELRY', 'submitted', 5, 0, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_jewelry(@app, 1, 'ring', 8500, '1.2 ct diamond engagement ring, platinum band', 'yes', 40);
CALL mock_jewelry(@app, 2, 'watch', 3200, 'Stainless steel automatic watch', 'no', NULL);

CALL mock_application('Ben', 'Carter', 'ben.carter@example.com', '(919) 555-0104', 'NC', 'HOME', 'submitted', 5, 2, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,C,E');
CALL mock_home(@app, '57 Oak Hollow Rd', 'Raleigh', '27606', 'townhouse', 2012, 1600);

CALL mock_application('Noah', 'Fischer', 'noah.fischer@example.com', '(615) 555-0105', 'TN', 'AUTO', 'submitted', 5, 1, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'no');
CALL mock_answer(@app, 2, 'recent_incidents', 'yes');
CALL mock_vehicle(@app, 1, 2016, 'Ford', 'F-150', 'business', 18000, '37203', 'owned');
CALL mock_driver(@app, 1, 'Noah', 'Fischer', 'self', 6, 1);

-- ---------------------------------------------------------------------
-- 5. Applications an agent is working on
-- ---------------------------------------------------------------------

CALL mock_application('Marcus', 'Bell', 'marcus.bell@example.com', '(512) 555-0106', 'TX', 'AUTO', 'under_review', 5, 1, 'riley.brooks@valentpartners.example', NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_answer(@app, 2, 'recent_incidents', 'yes');
CALL mock_vehicle(@app, 1, 2020, 'Chevrolet', 'Malibu', 'commute', 15000, '78704', 'financed');
CALL mock_driver(@app, 1, 'Marcus', 'Bell', 'self', 9, 1);
CALL mock_driver(@app, 2, 'Tia', 'Bell', 'child', 1, 1);

CALL mock_application('Aisha', 'Mohammed', 'aisha.mohammed@example.com', '(504) 555-0107', 'LA', 'FLOOD', 'under_review', 5, 4, 'casey.patel@valentpartners.example', NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL mock_home(@app, '930 Esplanade Ave', 'New Orleans', '70116', 'single_family', 1925, 1700);
CALL mock_answer(@app, 2, 'flood_zone', 'unknown');
CALL mock_answer(@app, 2, 'has_basement', 'no');

CALL mock_application('Ella', 'Parker', 'ella.parker@example.com', '(404) 555-0108', 'GA', 'JEWELRY', 'under_review', 5, 2, 'riley.brooks@valentpartners.example', NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_jewelry(@app, 1, 'necklace', 4100, 'Gold pendant necklace with sapphire', 'yes', 200);
CALL mock_jewelry(@app, 2, 'earrings', 1900, 'Diamond stud earrings, 0.5 ct total', 'no', NULL);
CALL mock_jewelry(@app, 3, 'bracelet', 2600, 'White gold tennis bracelet', 'yes', 365);

-- ---------------------------------------------------------------------
-- 6. Escalated to a specialist / supervisor
-- ---------------------------------------------------------------------

CALL mock_application('Priya', 'Shah', 'priya.shah@example.com', '(305) 555-0109', 'FL', 'FLOOD', 'escalated', 5, 2, 'casey.patel@valentpartners.example', 'Coastal Zone VE property - needs flood specialist review', @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL mock_home(@app, '1440 Ocean Dr', 'Miami Beach', '33139', 'condo', 1987, 1100);
CALL mock_answer(@app, 2, 'flood_zone', 'V');
CALL mock_answer(@app, 2, 'has_basement', 'no');

CALL mock_application('Elena', 'Novak', 'elena.novak@example.com', '(415) 555-0110', 'CA', 'JEWELRY', 'escalated', 5, 3, 'riley.brooks@valentpartners.example', 'High-value ring - supervisor sign-off requested', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_jewelry(@app, 1, 'ring', 32000, '3 ct emerald-cut diamond ring, platinum', 'yes', 90);

CALL mock_application('Chloe', 'Martin', 'chloe.martin@example.com', '(850) 555-0111', 'FL', 'HOME,FLOOD,AUTO', 'escalated', 5, 5, 'morgan.ellis@valentpartners.example', 'Three-line bundle in a coastal area - specialist review requested', @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,D,E');
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_home(@app, '12 Gulf Breeze Pkwy', 'Pensacola', '32507', 'single_family', 2008, 2400);
CALL mock_answer(@app, 2, 'flood_zone', 'A');
CALL mock_answer(@app, 2, 'has_basement', 'no');
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2021, 'Subaru', 'Outback', 'commute', 11000, '32507', 'financed');
CALL mock_driver(@app, 1, 'Chloe', 'Martin', 'self', 20, 1);

-- ---------------------------------------------------------------------
-- 7. Decided: approved / rejected
-- ---------------------------------------------------------------------

CALL mock_application('Samuel', 'Okoro', 'samuel.okoro@example.com', '(256) 555-0112', 'AL', 'HOME', 'approved', 5, 6, 'casey.patel@valentpartners.example', 'Approved - property details verified', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,E,F');
CALL mock_home(@app, '305 Pine Ridge Dr', 'Huntsville', '35801', 'single_family', 2015, 2600);

CALL mock_application('Luis', 'Ortega', 'luis.ortega@example.com', '(210) 555-0113', 'TX', 'HOME,AUTO', 'approved', 5, 12, 'drew.thompson@valentpartners.example', 'Approved - bundle confirmed with customer', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,D,E,F');
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_home(@app, '8812 Mesquite Trl', 'San Antonio', '78249', 'single_family', 2001, 2200);
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2018, 'Nissan', 'Altima', 'commute', 14000, '78249', 'owned');
CALL mock_driver(@app, 1, 'Luis', 'Ortega', 'self', 22, 1);

CALL mock_application('Olivia', 'Grant', 'olivia.grant@example.com', '(334) 555-0114', 'AL', 'JEWELRY', 'approved', 5, 15, 'riley.brooks@valentpartners.example', 'Approved - appraisal on file', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_jewelry(@app, 1, 'ring', 6200, 'Vintage sapphire ring, yellow gold', 'yes', 120);

CALL mock_application('Maya', 'Johnson', 'maya.johnson@example.com', '(228) 555-0115', 'MS', 'FLOOD', 'approved', 5, 25, 'casey.patel@valentpartners.example', 'Approved - flood zone confirmed', @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL mock_home(@app, '77 Beach Blvd', 'Biloxi', '39530', 'single_family', 1995, 1500);
CALL mock_answer(@app, 2, 'flood_zone', 'A');
CALL mock_answer(@app, 2, 'has_basement', 'no');

CALL mock_application('Ava', 'Ramirez', 'ava.ramirez@example.com', '(407) 555-0116', 'FL', 'HOME', 'approved', 5, 45, 'casey.patel@valentpartners.example', 'Approved', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL mock_home(@app, '2650 Lake Nona Blvd', 'Orlando', '32827', 'townhouse', 2017, 1750);

CALL mock_application('Leo', 'Bennett', 'leo.bennett@example.com', '(704) 555-0117', 'NC', 'AUTO', 'approved', 5, 60, 'riley.brooks@valentpartners.example', 'Approved', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2023, 'Hyundai', 'Tucson', 'commute', 10000, '28202', 'leased');
CALL mock_driver(@app, 1, 'Leo', 'Bennett', 'self', 8, 1);

CALL mock_application('Tyler', 'Henderson', 'tyler.henderson@example.com', '(678) 555-0118', 'GA', 'AUTO', 'rejected', 5, 9, 'drew.thompson@valentpartners.example', 'Could not verify vehicle ownership documents', @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'no');
CALL mock_answer(@app, 2, 'recent_incidents', 'yes');
CALL mock_vehicle(@app, 1, 2014, 'Dodge', 'Charger', 'rideshare', 30000, '30318', 'financed');
CALL mock_driver(@app, 1, 'Tyler', 'Henderson', 'self', 3, 1);

CALL mock_application('Daniel', 'Kim', 'daniel.kim@example.com', '(619) 555-0119', 'CA', 'HOME', 'rejected', 5, 20, 'drew.thompson@valentpartners.example', 'Customer could not provide required property documentation', @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C');
CALL mock_home(@app, '4021 Canyon View Dr', 'San Diego', '92117', 'single_family', 1972, 1900);

CALL mock_application('Mia', 'Foster', 'mia.foster@example.com', '(251) 555-0120', 'AL', 'HOME,FLOOD', 'rejected', 5, 75, 'drew.thompson@valentpartners.example', 'Customer withdrew the application', @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL mock_home(@app, '19 Dauphin Island Pkwy', 'Mobile', '36605', 'mobile', 1990, 1200);
CALL mock_answer(@app, 2, 'flood_zone', 'X');
CALL mock_answer(@app, 2, 'has_basement', 'no');

-- ---------------------------------------------------------------------
-- 8. Unfinished applications (feed the funnel / drop-off metrics)
-- ---------------------------------------------------------------------
-- p_step = the step they stopped on. Answers are only saved for the steps
-- before it, and there is no name/email unless they finished step 3.

-- Still in progress
CALL mock_application('Ethan', 'Wright', 'ethan.wright@example.com', '(205) 555-0121', 'AL', 'HOME', 'in_progress', 3, 0, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C');
CALL mock_home(@app, '210 University Blvd', 'Tuscaloosa', '35401', 'condo', 2010, 950);

CALL mock_application('Sofia', 'Garcia', 'sofia.garcia@example.com', '(713) 555-0122', 'TX', 'AUTO', 'in_progress', 4, 1, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2017, 'Mazda', 'CX-5', 'pleasure', 9000, '77005', 'owned');
CALL mock_driver(@app, 1, 'Sofia', 'Garcia', 'self', 11, 1);

CALL mock_application('Owen', 'Price', 'owen.price@example.com', '(251) 555-0123', 'AL', 'FLOOD', 'in_progress', 2, 0, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'has_homeowners_policy', 'no');

-- Abandoned (two left on the very first step without saving anything)
CALL mock_application('Wes', 'Lambert', 'wes.lambert@example.com', '(205) 555-0131', 'AL', 'FLOOD', 'abandoned', 1, 6, NULL, NULL, @app);
CALL mock_application('Ruth', 'Delgado', 'ruth.delgado@example.com', '(956) 555-0132', 'TX', 'HOME,FLOOD', 'abandoned', 1, 3, NULL, NULL, @app);

CALL mock_application('Ryan', 'Cole', 'ryan.cole@example.com', '(904) 555-0124', 'FL', 'FLOOD', 'abandoned', 2, 10, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'has_homeowners_policy', 'yes');

CALL mock_application('Lily', 'Evans', 'lily.evans@example.com', '(310) 555-0125', 'CA', 'AUTO', 'abandoned', 2, 4, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');

CALL mock_application('Caleb', 'Ward', 'caleb.ward@example.com', '(214) 555-0126', 'TX', 'JEWELRY', 'abandoned', 2, 18, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);

CALL mock_application('Zoe', 'Adams', 'zoe.adams@example.com', '(212) 555-0127', 'NY', 'JEWELRY', 'abandoned', 3, 14, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_jewelry(@app, 1, 'watch', 12500, 'Luxury chronograph watch', 'no', NULL);

CALL mock_application('Nora', 'Hughes', 'nora.hughes@example.com', '(337) 555-0128', 'LA', 'HOME', 'abandoned', 3, 21, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start2);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,D');
CALL mock_home(@app, '600 Bayou Rd', 'Lafayette', '70501', 'single_family', 1964, 1650);

CALL mock_application('Isaac', 'Turner', 'isaac.turner@example.com', '(470) 555-0129', 'GA', 'HOME,AUTO', 'abandoned', 4, 8, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL mock_answer(@app, 1, 'currently_insured_auto', 'yes');
CALL mock_home(@app, '1150 Peachtree Ln', 'Marietta', '30060', 'single_family', 1999, 2300);
CALL mock_answer(@app, 2, 'recent_incidents', 'no');
CALL mock_vehicle(@app, 1, 2019, 'Jeep', 'Grand Cherokee', 'commute', 13000, '30060', 'financed');
CALL mock_driver(@app, 1, 'Isaac', 'Turner', 'self', 17, 1);

CALL mock_application('Jack', 'Simmons', 'jack.simmons@example.com', '(281) 555-0130', 'TX', 'HOME', 'abandoned', 3, 50, NULL, NULL, @app);
CALL mock_answer(@app, 1, 'start_date', @start1);
CALL mock_answer(@app, 1, 'coverage_components', 'A,B,C');
CALL mock_home(@app, '4400 Cypress Creek Pkwy', 'Houston', '77068', 'single_family', 1985, 2000);

-- ---------------------------------------------------------------------
-- 9. Behavior analytics for the mock applications
-- ---------------------------------------------------------------------
-- Generated from each application's progress so the friction table agrees
-- with the funnel. Times and error counts come from simple arithmetic on the
-- ids (not random), so re-running gives the same pattern.
--   step_enter       - opened a step
--   step_complete    - finished a step (duration_ms = time spent on it)
--   page_exit        - left the site on that step (duration_ms = time before leaving)
--   validation_error - tried to continue with an invalid/missing answer
--   step_back        - pressed Back from that step

DROP TEMPORARY TABLE IF EXISTS mock_steps;
CREATE TEMPORARY TABLE mock_steps (n INT PRIMARY KEY, base_seconds INT);
INSERT INTO mock_steps VALUES (1, 40), (2, 110), (3, 75), (4, 60), (5, 20);

DROP TEMPORARY TABLE IF EXISTS mock_progress;
CREATE TEMPORARY TABLE mock_progress AS
SELECT s.session_id, a.application_id, a.current_step, a.submitted_at IS NOT NULL AS submitted, a.created_at
FROM analytics_sessions s
JOIN applications a ON a.customer_id = s.customer_id
WHERE s.session_id LIKE 'mock-sess-%';

-- Opened each step up to the furthest one reached
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, created_at)
SELECT p.session_id, p.application_id, 'step_enter', 'apply', st.n, p.created_at + INTERVAL st.n * 3 MINUTE
FROM mock_progress p JOIN mock_steps st ON st.n <= p.current_step;

-- Finished every step before the furthest one (and all 5 if submitted)
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, duration_ms, created_at)
SELECT p.session_id, p.application_id, 'step_complete', 'apply', st.n,
       st.base_seconds * (75 + MOD(p.application_id * 31 + st.n * 17, 60)) * 10,
       p.created_at + INTERVAL st.n * 3 + 2 MINUTE
FROM mock_progress p JOIN mock_steps st ON st.n < p.current_step OR (p.submitted AND st.n <= 5);

-- Left the site on the step they stopped at. About a third leave within 10 seconds.
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, duration_ms, created_at)
SELECT p.session_id, p.application_id, 'page_exit', 'apply', p.current_step,
       IF(MOD(p.application_id, 3) = 0,
          3000 + MOD(p.application_id * 53, 6000),
          st.base_seconds * (60 + MOD(p.application_id * 29, 80)) * 10),
       p.created_at + INTERVAL p.current_step * 3 + 2 MINUTE
FROM mock_progress p JOIN mock_steps st ON st.n = p.current_step
WHERE NOT p.submitted;

-- Validation errors on the details (2) and applicant (3) steps.
-- metadata holds the field NAME only, never what the customer typed.
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, metadata, created_at)
SELECT p.session_id, p.application_id, 'validation_error', 'apply', st.n,
       JSON_OBJECT('field', IF(st.n = 2, ELT(MOD(p.application_id, 3) + 1, 'zip', 'year_built', 'annual_mileage'), 'email')),
       p.created_at + INTERVAL st.n * 3 + 1 MINUTE
FROM mock_progress p JOIN mock_steps st ON st.n IN (2, 3) AND st.n <= p.current_step
WHERE MOD(p.application_id + st.n, 3) = 0;

-- Went back from the details step or the quote step to change something
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, created_at)
SELECT p.session_id, p.application_id, 'step_back', 'apply', st.n, p.created_at + INTERVAL st.n * 3 + 1 MINUTE
FROM mock_progress p JOIN mock_steps st ON st.n IN (2, 4) AND st.n <= p.current_step
WHERE MOD(p.application_id * 7 + st.n, 4) = 0;

UPDATE analytics_sessions s
JOIN (SELECT session_id, MAX(created_at) AS last_event FROM analytics_events
      WHERE session_id LIKE 'mock-sess-%' GROUP BY session_id) e ON e.session_id = s.session_id
SET s.ended_at = e.last_event;

DROP TEMPORARY TABLE mock_steps;
DROP TEMPORARY TABLE mock_progress;

-- ---------------------------------------------------------------------
-- 10. Clean up helpers
-- ---------------------------------------------------------------------

DROP PROCEDURE mock_application;
DROP PROCEDURE mock_answer;
DROP PROCEDURE mock_home;
DROP PROCEDURE mock_vehicle;
DROP PROCEDURE mock_driver;
DROP PROCEDURE mock_jewelry;

SET SQL_SAFE_UPDATES = 1;

-- Quick check: how many mock applications are in each status
SELECT a.status, COUNT(*) AS applications
FROM applications a
JOIN analytics_sessions s ON s.customer_id = a.customer_id AND s.session_id LIKE 'mock-sess-%'
GROUP BY a.status
ORDER BY FIELD(a.status, 'in_progress', 'abandoned', 'submitted', 'under_review', 'escalated', 'approved', 'rejected');
