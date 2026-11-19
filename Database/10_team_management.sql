-- =====================================================================
-- Team management update (admin "Team" page). Run AFTER 08_client_feedback.sql.
-- Safe to re-run.
--
-- Adds staff_users.auto_assign: whether automatic assignment may send this person
-- new work. Escalations still go to the active specialist with the fewest open
-- escalations, but only among specialists with auto_assign = TRUE. An admin turns it
-- off on the Team page (vacation, training, too busy) and can still assign that
-- person applications by hand.
-- =====================================================================

USE valent_insurance;

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

CALL add_column_if_missing('staff_users', 'auto_assign', 'BOOLEAN NOT NULL DEFAULT TRUE AFTER is_active');
DROP PROCEDURE add_column_if_missing;

SELECT staff_id, CONCAT(first_name, ' ', last_name) AS name, role, is_active, auto_assign
FROM staff_users ORDER BY FIELD(role, 'admin', 'specialist', 'employee'), last_name;
