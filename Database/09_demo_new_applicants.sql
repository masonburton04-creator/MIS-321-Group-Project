-- =====================================================================
-- Client demo: adds 30 new applicants, most of them from the last few
-- days, so the dashboard's approval queue fills up live during the demo.
-- Run AFTER 03_mock_data.sql (it uses the mock staff accounts).
--
-- Safe to re-run: it deletes the rows it made last time (and nothing else)
-- before inserting them again. Re-running 03_mock_data.sql does NOT remove
-- these - its rows are tagged 'mock-sess-', these are tagged 'demo-sess-'.
-- To remove them, run only section 1 below.
--
-- What it creates (all FAKE: @example.com emails, 555-02xx phone numbers):
--   13 submitted (waiting for an agent), 5 under review, 5 approved,
--   2 rejected, 2 escalated, 3 still in progress - with form answers,
--   vehicles/drivers, jewelry pieces, status history, and analytics events.
-- Times are relative to NOW(), so the newest ones show "an hour ago".
-- =====================================================================

USE valent_insurance;

-- MySQL Workbench blocks DELETEs that don't filter on a key column by default
SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------
-- 1. Remove the previous run's demo applicants
-- ---------------------------------------------------------------------

DROP TEMPORARY TABLE IF EXISTS demo_customers;
DROP TEMPORARY TABLE IF EXISTS demo_apps;

CREATE TEMPORARY TABLE demo_customers AS
SELECT customer_id FROM analytics_sessions WHERE session_id LIKE 'demo-sess-%';

CREATE TEMPORARY TABLE demo_apps AS
SELECT application_id FROM applications
WHERE customer_id IN (SELECT customer_id FROM demo_customers);

DELETE FROM analytics_events   WHERE session_id LIKE 'demo-sess-%'
                                  OR application_id IN (SELECT application_id FROM demo_apps);
DELETE FROM analytics_sessions WHERE session_id LIKE 'demo-sess-%';
DELETE FROM escalations        WHERE application_id IN (SELECT application_id FROM demo_apps);
DELETE FROM quotes             WHERE application_id IN (SELECT application_id FROM demo_apps);
DELETE FROM chat_sessions      WHERE application_id IN (SELECT application_id FROM demo_apps);
-- answers, items, lines, documents, and status history are deleted by ON DELETE CASCADE
DELETE FROM applications       WHERE application_id IN (SELECT application_id FROM demo_apps);
DELETE FROM customers          WHERE customer_id IN (SELECT customer_id FROM demo_customers);

DROP TEMPORARY TABLE demo_customers;
DROP TEMPORARY TABLE demo_apps;

-- ---------------------------------------------------------------------
-- 2. Helper procedures (dropped again at the end of this script)
-- ---------------------------------------------------------------------
-- Same as the ones in 03_mock_data.sql, except demo_application takes
-- HOURS ago instead of days, so several can land on the same day.

DROP PROCEDURE IF EXISTS demo_application;
DROP PROCEDURE IF EXISTS demo_answer;
DROP PROCEDURE IF EXISTS demo_home;
DROP PROCEDURE IF EXISTS demo_vehicle;
DROP PROCEDURE IF EXISTS demo_driver;
DROP PROCEDURE IF EXISTS demo_jewelry;

DELIMITER //

-- Creates one customer + application the same way the API would, plus its
-- status history. Returns the new application_id in p_app_id.
--   p_lines:  'HOME', or several for a bundle: 'HOME,FLOOD,AUTO'
--   p_status: in_progress | submitted | under_review | approved | rejected | escalated
--   p_step:   furthest step reached (only used for in_progress)
--   p_staff_email / p_note: reviewing agent and their decision note (NULL if not reviewed yet)
CREATE PROCEDURE demo_application(
  IN p_first VARCHAR(100), IN p_last VARCHAR(100), IN p_email VARCHAR(255), IN p_phone VARCHAR(25),
  IN p_state CHAR(2), IN p_lines VARCHAR(100), IN p_status VARCHAR(20), IN p_step INT,
  IN p_hours_ago INT, IN p_staff_email VARCHAR(255), IN p_note VARCHAR(255),
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

  -- Spread minutes out so they don't all land on the hour
  SET v_created = NOW() - INTERVAL p_hours_ago HOUR - INTERVAL (MOD(CHAR_LENGTH(p_email) * 11, 50) + 5) MINUTE;
  IF v_was_submitted THEN
    SET v_submitted = LEAST(v_created + INTERVAL (8 + MOD(CHAR_LENGTH(p_email) * 7, 25)) MINUTE, NOW());
    SET v_reviewed  = LEAST(v_submitted + INTERVAL (1 + MOD(p_hours_ago, 6)) HOUR, NOW());
    SET v_decided   = LEAST(v_reviewed + INTERVAL 75 MINUTE, NOW());
  END IF;

  INSERT INTO customers (first_name, last_name, email, phone, state_code, created_at)
  VALUES (IF(v_has_name, p_first, NULL), IF(v_has_name, p_last, NULL),
          IF(v_has_name, p_email, NULL), IF(v_has_name, p_phone, NULL), p_state, v_created);
  SET v_customer = LAST_INSERT_ID();

  -- Tags this customer as demo data (see the cleanup section at the top)
  INSERT INTO analytics_sessions (session_id, customer_id, state_code, device_type, started_at)
  VALUES (CONCAT('demo-sess-', LPAD(v_customer, 26, '0')), v_customer, p_state,
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
CREATE PROCEDURE demo_answer(IN p_app INT, IN p_step INT, IN p_key VARCHAR(100), IN p_value TEXT)
BEGIN
  INSERT INTO application_answers (application_id, step_number, field_key, field_value)
  VALUES (p_app, p_step, p_key, p_value);
END //

-- Step 2 property details for Homeowners / Flood
CREATE PROCEDURE demo_home(IN p_app INT, IN p_street VARCHAR(200), IN p_city VARCHAR(100), IN p_zip CHAR(5),
                           IN p_home_type VARCHAR(30), IN p_year_built INT, IN p_square_feet INT)
BEGIN
  INSERT INTO application_answers (application_id, step_number, field_key, field_value) VALUES
  (p_app, 2, 'street', p_street), (p_app, 2, 'city', p_city), (p_app, 2, 'zip', p_zip),
  (p_app, 2, 'home_type', p_home_type), (p_app, 2, 'year_built', p_year_built),
  (p_app, 2, 'square_feet', p_square_feet);
END //

CREATE PROCEDURE demo_vehicle(IN p_app INT, IN p_num INT, IN p_year INT, IN p_make VARCHAR(50), IN p_model VARCHAR(50),
                              IN p_use VARCHAR(20), IN p_miles INT, IN p_zip CHAR(5), IN p_ownership VARCHAR(20))
BEGIN
  INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value) VALUES
  (p_app, 'vehicle', p_num, 'year', p_year), (p_app, 'vehicle', p_num, 'make', p_make),
  (p_app, 'vehicle', p_num, 'model', p_model), (p_app, 'vehicle', p_num, 'use', p_use),
  (p_app, 'vehicle', p_num, 'annual_mileage', p_miles), (p_app, 'vehicle', p_num, 'garaging_zip', p_zip),
  (p_app, 'vehicle', p_num, 'ownership', p_ownership);
END //

CREATE PROCEDURE demo_driver(IN p_app INT, IN p_num INT, IN p_first VARCHAR(100), IN p_last VARCHAR(100),
                             IN p_relationship VARCHAR(20), IN p_years_licensed INT, IN p_primary_vehicle INT)
BEGIN
  INSERT INTO application_item_answers (application_id, item_type, item_number, field_key, field_value) VALUES
  (p_app, 'driver', p_num, 'first_name', p_first), (p_app, 'driver', p_num, 'last_name', p_last),
  (p_app, 'driver', p_num, 'relationship', p_relationship),
  (p_app, 'driver', p_num, 'years_licensed', p_years_licensed),
  (p_app, 'driver', p_num, 'primary_vehicle', p_primary_vehicle);
END //

-- p_appraisal_days_ago = NULL when there is no appraisal date
CREATE PROCEDURE demo_jewelry(IN p_app INT, IN p_num INT, IN p_type VARCHAR(20), IN p_value INT,
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
-- 3. Submitted - waiting for an agent (13)
-- ---------------------------------------------------------------------

CALL demo_application('Derek', 'Holloway', 'derek.holloway@example.com', '(205) 555-0201', 'AL', 'HOME', 'submitted', 5, 1, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'dwelling_coverage', '340000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL demo_home(@app, '2814 Highland Ave S', 'Birmingham', '35205', 'single_family', 1994, 2050);

CALL demo_application('Natalie', 'Chen', 'natalie.chen@example.com', '(469) 555-0202', 'TX', 'AUTO', 'submitted', 5, 2, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'switching_carrier', 'yes');
CALL demo_answer(@app, 1, 'current_insurer', 'Example Mutual Insurance');
CALL demo_answer(@app, 1, 'current_policy_end', DATE_FORMAT(CURDATE() + INTERVAL 18 DAY, '%Y-%m-%d'));
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2022, 'Tesla', 'Model 3', 'commute', 11000, '75024', 'financed');
CALL demo_driver(@app, 1, 'Natalie', 'Chen', 'self', 10, 1);

CALL demo_application('Victor', 'Alvarez', 'victor.alvarez@example.com', '(512) 555-0203', 'TX', 'HOME,AUTO', 'submitted', 5, 3, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '410000');
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,D,E,F');
CALL demo_home(@app, '6107 Manchaca Rd', 'Austin', '78745', 'single_family', 2006, 2350);
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2021, 'Toyota', 'Tacoma', 'commute', 14000, '78745', 'owned');
CALL demo_vehicle(@app, 2, 2019, 'Kia', 'Sorento', 'pleasure', 7000, '78745', 'owned');
CALL demo_driver(@app, 1, 'Victor', 'Alvarez', 'self', 19, 1);
CALL demo_driver(@app, 2, 'Lucia', 'Alvarez', 'spouse', 16, 2);

CALL demo_application('Brianna', 'Scott', 'brianna.scott@example.com', '(212) 555-0204', 'NY', 'JEWELRY', 'submitted', 5, 4, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'ring', 11200, '1.5 ct oval diamond engagement ring, rose gold', 'yes', 25);

CALL demo_application('Kevin', 'Murphy', 'kevin.murphy@example.com', '(716) 555-0205', 'NY', 'HOME', 'submitted', 5, 6, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '260000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C');
CALL demo_home(@app, '88 Parkside Ave', 'Buffalo', '14214', 'single_family', 1948, 1800);

CALL demo_application('Jasmine', 'Reed', 'jasmine.reed@example.com', '(251) 555-0206', 'AL', 'FLOOD', 'submitted', 5, 8, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'flood_building_coverage', '200000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '75000');
CALL demo_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL demo_home(@app, '3320 Old Shell Rd', 'Mobile', '36607', 'single_family', 1979, 1550);
CALL demo_answer(@app, 2, 'flood_zone', 'X');
CALL demo_answer(@app, 2, 'has_basement', 'no');

CALL demo_application('Andre', 'Washington', 'andre.washington@example.com', '(334) 555-0207', 'AL', 'AUTO', 'submitted', 5, 11, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'liability');
CALL demo_answer(@app, 1, 'switching_carrier', 'no');
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2015, 'Honda', 'Accord', 'commute', 16000, '36117', 'owned');
CALL demo_driver(@app, 1, 'Andre', 'Washington', 'self', 12, 1);

CALL demo_application('Emily', 'Sato', 'emily.sato@example.com', '(281) 555-0208', 'TX', 'HOME,FLOOD', 'submitted', 5, 14, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '380000');
CALL demo_answer(@app, 1, 'flood_building_coverage', '250000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '100000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL demo_home(@app, '1902 Marina Bay Dr', 'League City', '77573', 'single_family', 2011, 2400);
CALL demo_answer(@app, 2, 'flood_zone', 'A');
CALL demo_answer(@app, 2, 'has_basement', 'no');

CALL demo_application('Henry', 'Lawson', 'henry.lawson@example.com', '(315) 555-0209', 'NY', 'AUTO', 'submitted', 5, 19, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'switching_carrier', 'yes');
CALL demo_answer(@app, 1, 'current_insurer', 'Sample Casualty Co.');
CALL demo_answer(@app, 1, 'current_policy_end', DATE_FORMAT(CURDATE() + INTERVAL 40 DAY, '%Y-%m-%d'));
CALL demo_answer(@app, 2, 'recent_incidents', 'yes');
CALL demo_vehicle(@app, 1, 2020, 'Subaru', 'Forester', 'commute', 12500, '13210', 'financed');
CALL demo_driver(@app, 1, 'Henry', 'Lawson', 'self', 7, 1);

CALL demo_application('Camila', 'Torres', 'camila.torres@example.com', '(210) 555-0210', 'TX', 'JEWELRY', 'submitted', 5, 23, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'necklace', 2800, 'Pearl strand necklace with gold clasp', 'no', NULL);
CALL demo_jewelry(@app, 2, 'earrings', 3400, 'Emerald drop earrings, white gold', 'yes', 150);

CALL demo_application('Patrick', 'Doyle', 'patrick.doyle@example.com', '(334) 555-0211', 'AL', 'HOME', 'submitted', 5, 28, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'dwelling_coverage', '295000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,D');
CALL demo_home(@app, '415 Shug Jordan Pkwy', 'Auburn', '36830', 'townhouse', 2018, 1700);

CALL demo_application('Rachel', 'Goldberg', 'rachel.goldberg@example.com', '(914) 555-0212', 'NY', 'HOME,AUTO', 'submitted', 5, 34, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '520000');
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,D,E,F');
CALL demo_answer(@app, 1, 'switching_carrier', 'yes');
CALL demo_answer(@app, 1, 'current_insurer', 'Placeholder Insurance Group');
CALL demo_answer(@app, 1, 'current_policy_end', DATE_FORMAT(CURDATE() + INTERVAL 29 DAY, '%Y-%m-%d'));
CALL demo_home(@app, '12 Ridgeway Ave', 'White Plains', '10605', 'single_family', 1962, 2700);
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2023, 'Volvo', 'XC60', 'commute', 9000, '10605', 'leased');
CALL demo_driver(@app, 1, 'Rachel', 'Goldberg', 'self', 24, 1);

CALL demo_application('Marco', 'Rossi', 'marco.rossi@example.com', '(409) 555-0213', 'TX', 'FLOOD', 'submitted', 5, 41, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'flood_building_coverage', '150000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '50000');
CALL demo_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL demo_home(@app, '3901 Procter St', 'Port Arthur', '77642', 'single_family', 1970, 1400);
CALL demo_answer(@app, 2, 'flood_zone', 'unknown');
CALL demo_answer(@app, 2, 'has_basement', 'no');

-- ---------------------------------------------------------------------
-- 4. Under review - an agent is working on them (5)
-- ---------------------------------------------------------------------

CALL demo_application('Lauren', 'Mitchell', 'lauren.mitchell@example.com', '(256) 555-0214', 'AL', 'HOME,AUTO', 'under_review', 5, 20, 'casey.patel@valentpartners.example', NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'dwelling_coverage', '360000');
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL demo_home(@app, '140 Hughes Rd', 'Madison', '35758', 'single_family', 2009, 2250);
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2020, 'Ford', 'Explorer', 'commute', 13000, '35758', 'financed');
CALL demo_driver(@app, 1, 'Lauren', 'Mitchell', 'self', 14, 1);
CALL demo_driver(@app, 2, 'Evan', 'Mitchell', 'child', 2, 1);

CALL demo_application('Omar', 'Haddad', 'omar.haddad@example.com', '(713) 555-0215', 'TX', 'AUTO', 'under_review', 5, 26, 'drew.thompson@valentpartners.example', NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'liability');
CALL demo_answer(@app, 1, 'switching_carrier', 'yes');
CALL demo_answer(@app, 1, 'current_insurer', 'Demo Auto Insurance');
CALL demo_answer(@app, 1, 'current_policy_end', DATE_FORMAT(CURDATE() + INTERVAL 12 DAY, '%Y-%m-%d'));
CALL demo_answer(@app, 2, 'recent_incidents', 'yes');
CALL demo_vehicle(@app, 1, 2017, 'Nissan', 'Rogue', 'rideshare', 24000, '77036', 'owned');
CALL demo_driver(@app, 1, 'Omar', 'Haddad', 'self', 5, 1);

CALL demo_application('Sophie', 'Larsen', 'sophie.larsen@example.com', '(646) 555-0216', 'NY', 'JEWELRY', 'under_review', 5, 30, 'riley.brooks@valentpartners.example', NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'watch', 9800, 'Swiss automatic dive watch, steel', 'yes', 60);
CALL demo_jewelry(@app, 2, 'bracelet', 2200, 'Gold link bracelet', 'no', NULL);

CALL demo_application('Gabriel', 'Moreno', 'gabriel.moreno@example.com', '(915) 555-0217', 'TX', 'HOME', 'under_review', 5, 38, 'casey.patel@valentpartners.example', NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '275000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C');
CALL demo_home(@app, '5520 Sunland Park Dr', 'El Paso', '79912', 'single_family', 1999, 1950);

CALL demo_application('Kayla', 'Brown', 'kayla.brown@example.com', '(251) 555-0218', 'AL', 'FLOOD', 'under_review', 5, 47, 'drew.thompson@valentpartners.example', NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'flood_building_coverage', '250000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '100000');
CALL demo_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL demo_home(@app, '27 Main St', 'Fairhope', '36532', 'single_family', 2002, 2100);
CALL demo_answer(@app, 2, 'flood_zone', 'A');
CALL demo_answer(@app, 2, 'has_basement', 'no');

-- ---------------------------------------------------------------------
-- 5. Decided: approved (5), rejected (2), escalated (2)
-- ---------------------------------------------------------------------

CALL demo_application('Nathan', 'Cooper', 'nathan.cooper@example.com', '(205) 555-0219', 'AL', 'HOME', 'approved', 5, 52, 'casey.patel@valentpartners.example', 'Approved - property details verified', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'dwelling_coverage', '315000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL demo_home(@app, '1820 Lorna Rd', 'Hoover', '35216', 'single_family', 1988, 2000);

CALL demo_application('Isabella', 'Ruiz', 'isabella.ruiz@example.com', '(956) 555-0220', 'TX', 'HOME,AUTO', 'approved', 5, 60, 'drew.thompson@valentpartners.example', 'Approved - bundle confirmed with customer', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'dwelling_coverage', '255000');
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,D,E');
CALL demo_home(@app, '2410 N 10th St', 'McAllen', '78501', 'single_family', 2013, 1850);
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2021, 'Chevrolet', 'Equinox', 'commute', 12000, '78501', 'financed');
CALL demo_driver(@app, 1, 'Isabella', 'Ruiz', 'self', 13, 1);

CALL demo_application('William', 'Chang', 'william.chang@example.com', '(718) 555-0221', 'NY', 'AUTO', 'approved', 5, 70, 'riley.brooks@valentpartners.example', 'Approved', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'switching_carrier', 'no');
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2022, 'Toyota', 'RAV4', 'commute', 8500, '11354', 'leased');
CALL demo_driver(@app, 1, 'William', 'Chang', 'self', 18, 1);

CALL demo_application('Harper', 'Collins', 'harper.collins@example.com', '(256) 555-0222', 'AL', 'JEWELRY', 'approved', 5, 85, 'riley.brooks@valentpartners.example', 'Approved - appraisal on file', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'ring', 5400, 'Diamond wedding band set, platinum', 'yes', 45);

CALL demo_application('Thomas', 'Baker', 'thomas.baker@example.com', '(361) 555-0223', 'TX', 'FLOOD', 'approved', 5, 100, 'casey.patel@valentpartners.example', 'Approved - flood zone confirmed', @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'flood_building_coverage', '200000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '75000');
CALL demo_answer(@app, 1, 'has_homeowners_policy', 'yes');
CALL demo_home(@app, '415 S Water St', 'Rockport', '78382', 'single_family', 2005, 1600);
CALL demo_answer(@app, 2, 'flood_zone', 'X');
CALL demo_answer(@app, 2, 'has_basement', 'no');

CALL demo_application('Brandon', 'Hayes', 'brandon.hayes@example.com', '(817) 555-0224', 'TX', 'AUTO', 'rejected', 5, 75, 'drew.thompson@valentpartners.example', 'Vehicle used for commercial delivery - not eligible for personal auto', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'liability');
CALL demo_answer(@app, 1, 'switching_carrier', 'no');
CALL demo_answer(@app, 2, 'recent_incidents', 'yes');
CALL demo_vehicle(@app, 1, 2016, 'Ram', 'ProMaster', 'business', 38000, '76104', 'owned');
CALL demo_driver(@app, 1, 'Brandon', 'Hayes', 'self', 4, 1);

CALL demo_application('Megan', 'Ross', 'megan.ross@example.com', '(205) 555-0225', 'AL', 'HOME', 'rejected', 5, 90, 'casey.patel@valentpartners.example', 'Home is vacant most of the year - not eligible for standard homeowners', @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '190000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B');
CALL demo_home(@app, '77 Lakeshore Dr', 'Guntersville', '35976', 'single_family', 1976, 1300);

CALL demo_application('Diego', 'Navarro', 'diego.navarro@example.com', '(409) 555-0226', 'TX', 'HOME,FLOOD', 'escalated', 5, 44, 'morgan.ellis@valentpartners.example', 'Coastal home with prior flood claims - specialist review requested', @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '330000');
CALL demo_answer(@app, 1, 'flood_building_coverage', '250000');
CALL demo_answer(@app, 1, 'flood_contents_coverage', '100000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C,E');
CALL demo_home(@app, '1611 Ave L', 'Galveston', '77550', 'single_family', 1958, 1750);
CALL demo_answer(@app, 2, 'flood_zone', 'A');
CALL demo_answer(@app, 2, 'has_basement', 'no');

CALL demo_application('Charlotte', 'Wells', 'charlotte.wells@example.com', '(212) 555-0227', 'NY', 'JEWELRY', 'escalated', 5, 32, 'riley.brooks@valentpartners.example', 'Watch collection over $50,000 - supervisor sign-off requested', @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'watch', 28000, 'Gold chronograph watch', 'yes', 30);
CALL demo_jewelry(@app, 2, 'watch', 19500, 'Platinum dress watch', 'yes', 30);
CALL demo_jewelry(@app, 3, 'watch', 7200, 'Steel GMT watch', 'yes', 30);

-- ---------------------------------------------------------------------
-- 6. Still filling out the form (3)
-- ---------------------------------------------------------------------
-- p_step = the step they're on. Answers are only saved for the steps
-- before it, and there is no name/email unless they finished step 3.

CALL demo_application('Jayden', 'Lewis', 'jayden.lewis@example.com', '(205) 555-0228', 'AL', 'AUTO', 'in_progress', 3, 0, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_answer(@app, 1, 'auto_coverage', 'full');
CALL demo_answer(@app, 1, 'switching_carrier', 'no');
CALL demo_answer(@app, 2, 'recent_incidents', 'no');
CALL demo_vehicle(@app, 1, 2018, 'Hyundai', 'Elantra', 'commute', 15000, '35203', 'owned');
CALL demo_driver(@app, 1, 'Jayden', 'Lewis', 'self', 2, 1);

CALL demo_application('Amelia', 'Ford', 'amelia.ford@example.com', '(607) 555-0229', 'NY', 'HOME', 'in_progress', 2, 0, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start2);
CALL demo_answer(@app, 1, 'dwelling_coverage', '240000');
CALL demo_answer(@app, 1, 'coverage_components', 'A,B,C');

CALL demo_application('Ian', 'McCarthy', 'ian.mccarthy@example.com', '(214) 555-0230', 'TX', 'JEWELRY', 'in_progress', 4, 1, NULL, NULL, @app);
CALL demo_answer(@app, 1, 'start_date', @start1);
CALL demo_jewelry(@app, 1, 'ring', 7600, 'Sapphire and diamond halo ring', 'no', NULL);

-- ---------------------------------------------------------------------
-- 7. Behavior analytics for these applications
-- ---------------------------------------------------------------------
-- Same pattern as 03_mock_data.sql section 9, so the funnel and friction
-- charts on the dashboard include the new applicants.

DROP TEMPORARY TABLE IF EXISTS demo_steps;
CREATE TEMPORARY TABLE demo_steps (n INT PRIMARY KEY, base_seconds INT);
INSERT INTO demo_steps VALUES (1, 40), (2, 110), (3, 75), (4, 60), (5, 20);

DROP TEMPORARY TABLE IF EXISTS demo_progress;
CREATE TEMPORARY TABLE demo_progress AS
SELECT s.session_id, a.application_id, a.current_step, a.submitted_at IS NOT NULL AS submitted, a.created_at
FROM analytics_sessions s
JOIN applications a ON a.customer_id = s.customer_id
WHERE s.session_id LIKE 'demo-sess-%';

-- Opened each step up to the furthest one reached
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, created_at)
SELECT p.session_id, p.application_id, 'step_enter', 'apply', st.n, p.created_at + INTERVAL st.n * 3 MINUTE
FROM demo_progress p JOIN demo_steps st ON st.n <= p.current_step;

-- Finished every step before the furthest one (and all 5 if submitted)
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, duration_ms, created_at)
SELECT p.session_id, p.application_id, 'step_complete', 'apply', st.n,
       st.base_seconds * (75 + MOD(p.application_id * 31 + st.n * 17, 60)) * 10,
       p.created_at + INTERVAL st.n * 3 + 2 MINUTE
FROM demo_progress p JOIN demo_steps st ON st.n < p.current_step OR (p.submitted AND st.n <= 5);

-- Validation errors on the details (2) and applicant (3) steps.
-- metadata holds the field NAME only, never what the customer typed.
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, metadata, created_at)
SELECT p.session_id, p.application_id, 'validation_error', 'apply', st.n,
       JSON_OBJECT('field', IF(st.n = 2, ELT(MOD(p.application_id, 3) + 1, 'zip', 'year_built', 'annual_mileage'), 'email')),
       p.created_at + INTERVAL st.n * 3 + 1 MINUTE
FROM demo_progress p JOIN demo_steps st ON st.n IN (2, 3) AND st.n <= p.current_step
WHERE MOD(p.application_id + st.n, 3) = 0;

-- Went back from the details step or the quote step to change something
INSERT INTO analytics_events (session_id, application_id, event_name, page, step_number, created_at)
SELECT p.session_id, p.application_id, 'step_back', 'apply', st.n, p.created_at + INTERVAL st.n * 3 + 1 MINUTE
FROM demo_progress p JOIN demo_steps st ON st.n IN (2, 4) AND st.n <= p.current_step
WHERE MOD(p.application_id * 7 + st.n, 4) = 0;

-- Submitted applicants are done; the in-progress ones are still on the site
UPDATE analytics_sessions s
JOIN (SELECT session_id, MAX(created_at) AS last_event FROM analytics_events
      WHERE session_id LIKE 'demo-sess-%' GROUP BY session_id) e ON e.session_id = s.session_id
JOIN applications a ON a.customer_id = s.customer_id
SET s.ended_at = e.last_event
WHERE a.submitted_at IS NOT NULL;

DROP TEMPORARY TABLE demo_steps;
DROP TEMPORARY TABLE demo_progress;

-- ---------------------------------------------------------------------
-- 8. Clean up helpers
-- ---------------------------------------------------------------------

DROP PROCEDURE demo_application;
DROP PROCEDURE demo_answer;
DROP PROCEDURE demo_home;
DROP PROCEDURE demo_vehicle;
DROP PROCEDURE demo_driver;
DROP PROCEDURE demo_jewelry;

SET SQL_SAFE_UPDATES = 1;

-- ---------------------------------------------------------------------
-- 9. Show what was added (newest first)
-- ---------------------------------------------------------------------
SELECT a.application_id,
       COALESCE(CONCAT(c.first_name, ' ', c.last_name), '(name not entered yet)') AS applicant,
       a.state_code,
       GROUP_CONCAT(l.line_code ORDER BY l.line_id SEPARATOR ' + ') AS coverage,
       a.status,
       CONCAT(st.first_name, ' ', st.last_name) AS assigned_agent,
       a.created_at
FROM applications a
JOIN customers c          ON c.customer_id = a.customer_id
JOIN analytics_sessions s ON s.customer_id = a.customer_id AND s.session_id LIKE 'demo-sess-%'
JOIN application_lines al ON al.application_id = a.application_id
JOIN insurance_lines l    ON l.line_id = al.line_id
LEFT JOIN staff_users st  ON st.staff_id = a.assigned_staff_id
GROUP BY a.application_id, c.first_name, c.last_name, a.state_code, a.status,
         st.first_name, st.last_name, a.created_at
ORDER BY a.created_at DESC;
