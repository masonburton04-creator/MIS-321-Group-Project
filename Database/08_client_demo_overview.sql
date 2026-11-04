-- =====================================================================
-- Client demo: database overview. READ-ONLY - only SELECTs, changes nothing.
--
-- Run the whole file in MySQL Workbench (lightning bolt icon). Each query
-- opens its own result tab, in the order below. Or put the cursor in one
-- query and press Ctrl+Enter to run just that one.
--
-- Passwords, login tokens, and uploaded file contents are left out on purpose.
-- =====================================================================

USE valent_insurance;

-- ---------------------------------------------------------------------
-- 1. Big picture: how many rows are in each main table
-- ---------------------------------------------------------------------
SELECT 'Customers'             AS what, COUNT(*) AS total FROM customers UNION ALL
SELECT 'Applications',                  COUNT(*) FROM applications UNION ALL
SELECT 'Quotes',                        COUNT(*) FROM quotes UNION ALL
SELECT 'Uploaded documents',            COUNT(*) FROM application_documents UNION ALL
SELECT 'AI chat sessions',              COUNT(*) FROM chat_sessions UNION ALL
SELECT 'Escalations to a human',        COUNT(*) FROM escalations UNION ALL
SELECT 'Staff users',                   COUNT(*) FROM staff_users UNION ALL
SELECT 'Analytics events tracked',      COUNT(*) FROM analytics_events;

-- ---------------------------------------------------------------------
-- 2. Products: the 4 insurance lines and the states they're offered in
-- ---------------------------------------------------------------------
SELECT l.line_code,
       l.line_name,
       l.description,
       GROUP_CONCAT(IF(a.is_available, a.state_code, NULL) ORDER BY a.state_code) AS offered_in
FROM insurance_lines l
LEFT JOIN line_state_availability a ON a.line_id = l.line_id
GROUP BY l.line_id, l.line_code, l.line_name, l.description
ORDER BY l.line_id;

-- ---------------------------------------------------------------------
-- 3. Application form steps (same 5 steps for every line)
-- ---------------------------------------------------------------------
SELECT l.line_code, s.step_number, s.step_name
FROM application_steps s
JOIN insurance_lines l ON l.line_id = s.line_id
ORDER BY l.line_id, s.step_number;

-- ---------------------------------------------------------------------
-- 4. Applications by status (the reviewer approval queue)
-- ---------------------------------------------------------------------
SELECT status, COUNT(*) AS applications
FROM applications
GROUP BY status
ORDER BY applications DESC;

-- ---------------------------------------------------------------------
-- 5. Most recent applications: who, where, which lines, status, reviewer
-- ---------------------------------------------------------------------
SELECT a.application_id,
       COALESCE(CONCAT(c.first_name, ' ', c.last_name), '(name not entered yet)') AS customer,
       a.state_code,
       GROUP_CONCAT(l.line_code ORDER BY l.line_id)       AS lines_applied_for,
       a.status,
       a.current_step,
       CONCAT(s.first_name, ' ', s.last_name)            AS assigned_reviewer,
       a.created_at,
       a.submitted_at
FROM applications a
JOIN customers c              ON c.customer_id = a.customer_id
LEFT JOIN application_lines al ON al.application_id = a.application_id
LEFT JOIN insurance_lines l    ON l.line_id = al.line_id
LEFT JOIN staff_users s        ON s.staff_id = a.assigned_staff_id
GROUP BY a.application_id, c.first_name, c.last_name, a.state_code, a.status,
         a.current_step, s.first_name, s.last_name, a.created_at, a.submitted_at
ORDER BY a.created_at DESC
LIMIT 25;

-- ---------------------------------------------------------------------
-- 6. Bundles: applications covering more than one line (e.g. HOME + AUTO)
-- ---------------------------------------------------------------------
SELECT bundle, COUNT(*) AS applications
FROM (
  SELECT GROUP_CONCAT(l.line_code ORDER BY l.line_id SEPARATOR ' + ') AS bundle
  FROM application_lines al
  JOIN insurance_lines l ON l.line_id = al.line_id
  GROUP BY al.application_id
  HAVING COUNT(*) > 1
) b
GROUP BY bundle
ORDER BY applications DESC;

-- ---------------------------------------------------------------------
-- 7. One application in full: its form answers and items (vehicles,
--    drivers, jewelry). Change @app to show a different application.
-- ---------------------------------------------------------------------
SET @app = (SELECT MAX(application_id) FROM applications WHERE status <> 'in_progress');

SELECT 'answer' AS kind, NULL AS item, step_number, field_key, field_value
FROM application_answers
WHERE application_id = @app
UNION ALL
SELECT 'item', CONCAT(item_type, ' #', item_number), NULL, field_key, field_value
FROM application_item_answers
WHERE application_id = @app
ORDER BY kind, item, step_number, field_key;

-- ---------------------------------------------------------------------
-- 8. Status history / audit trail: who changed what and when
-- ---------------------------------------------------------------------
SELECT h.application_id,
       h.old_status,
       h.new_status,
       COALESCE(CONCAT(s.first_name, ' ', s.last_name), 'customer/system') AS changed_by,
       h.note,
       h.changed_at
FROM application_status_history h
LEFT JOIN staff_users s ON s.staff_id = h.changed_by
ORDER BY h.changed_at DESC
LIMIT 25;

-- ---------------------------------------------------------------------
-- 9. Quote estimates (all labeled DEMO until the client approves real rates)
-- ---------------------------------------------------------------------
SELECT l.line_code,
       COUNT(*)                     AS quotes,
       ROUND(AVG(q.estimate_low))  AS avg_low,
       ROUND(AVG(q.estimate_high)) AS avg_high,
       SUM(q.is_mock)               AS marked_demo
FROM quotes q
JOIN insurance_lines l ON l.line_id = q.line_id
GROUP BY l.line_id, l.line_code
ORDER BY l.line_id;

-- The numbers behind the quote ranges, with sources
SELECT line_code, factor_key, factor_value, description, source
FROM demo_quote_factors
ORDER BY line_code, factor_id;

-- ---------------------------------------------------------------------
-- 10. Uploaded documents (file details only, not the file itself)
-- ---------------------------------------------------------------------
SELECT application_id, doc_type, file_name, content_type,
       ROUND(size_bytes / 1024) AS size_kb, uploaded_at
FROM application_documents
ORDER BY uploaded_at DESC;

-- ---------------------------------------------------------------------
-- 11. Escalations: hand-offs from the AI assistant to a human
-- ---------------------------------------------------------------------
SELECT e.escalation_id,
       e.application_id,
       e.reason,
       e.status,
       CONCAT(s.first_name, ' ', s.last_name) AS assigned_to,
       e.created_at,
       e.resolved_at
FROM escalations e
LEFT JOIN staff_users s ON s.staff_id = e.assigned_staff_id
ORDER BY e.created_at DESC;

-- ---------------------------------------------------------------------
-- 12. Sample AI chat conversation (most recent chat)
-- ---------------------------------------------------------------------
SELECT m.sender, m.content, m.sent_at
FROM chat_messages m
WHERE m.chat_id = (SELECT MAX(chat_id) FROM chat_messages)
ORDER BY m.sent_at, m.message_id;

-- ---------------------------------------------------------------------
-- 13. Staff users (dashboard reviewers and admins - no passwords shown)
-- ---------------------------------------------------------------------
SELECT staff_id, CONCAT(first_name, ' ', last_name) AS name, email, role, is_active
FROM staff_users
ORDER BY role, last_name;

-- ---------------------------------------------------------------------
-- 14. Analytics: where people drop off in the application form
-- ---------------------------------------------------------------------
SELECT step_number,
       SUM(event_name = 'step_enter')       AS entered,
       SUM(event_name = 'step_complete')    AS completed,
       SUM(event_name = 'validation_error') AS errors,
       ROUND(AVG(IF(event_name = 'page_exit', duration_ms, NULL)) / 1000) AS avg_seconds_on_exit
FROM analytics_events
WHERE step_number IS NOT NULL
GROUP BY step_number
ORDER BY step_number;

-- Most common tracked events overall
SELECT event_name, COUNT(*) AS events
FROM analytics_events
GROUP BY event_name
ORDER BY events DESC;
