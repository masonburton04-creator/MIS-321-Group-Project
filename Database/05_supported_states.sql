-- =====================================================================
-- Supported states for the current sprint: Alabama, Texas, New York.
-- Run AFTER 02_seed.sql. Safe to re-run.
--
-- The states table keeps all 50 states + DC as reference data; this only
-- changes which states can start an application. The API rejects any
-- state where is_available is FALSE ("coverage is not offered in ...").
-- To add a state later, add its code to the list below and re-run.
-- =====================================================================

USE valent_insurance;

-- MySQL Workbench blocks UPDATEs that don't filter on a key column by default
SET SQL_SAFE_UPDATES = 0;

UPDATE line_state_availability
SET is_available = state_code IN ('AL', 'TX', 'NY'),
    notes = IF(state_code IN ('AL', 'TX', 'NY'),
               'Sprint demo state - carrier availability not yet verified',
               'Not offered in this prototype');

SET SQL_SAFE_UPDATES = 1;

-- Check: should list AL, NY, TX for each insurance line
SELECT l.line_code, GROUP_CONCAT(a.state_code ORDER BY a.state_code) AS available_states
FROM line_state_availability a
JOIN insurance_lines l ON l.line_id = a.line_id
WHERE a.is_available
GROUP BY l.line_code;
