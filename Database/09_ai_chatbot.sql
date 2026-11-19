-- =====================================================================
-- AI chatbot ("Ask Val") update. Run AFTER 08_client_feedback.sql. Safe to re-run.
--
-- The chat_sessions / chat_messages tables from 01_schema.sql were placeholders.
-- This adds what the chatbot and the dashboard's "AI Assistant" section need:
--   chat_sessions:  public_id (the id the browser holds), account_id, state_code,
--                   last_message_at, clicked_apply, is_mock
--   chat_messages:  topic, outcome, quote_lines, response timings, model, helpful
-- and seeds DEMO conversations (is_mock = TRUE) so the dashboard isn't empty.
--
-- Message text is stored (as 01_schema.sql planned) so the team can review
-- real questions. User messages are cut to 500 characters, replies to 2,000.
-- =====================================================================

USE valent_insurance;

SET SQL_SAFE_UPDATES = 0;

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

-- One row per chat conversation (one browser tab's chat)
CALL add_column_if_missing('chat_sessions', 'public_id', 'CHAR(36) NULL AFTER chat_id');
CALL add_column_if_missing('chat_sessions', 'account_id', 'INT NULL AFTER customer_id');            -- signed-in customer, if any
CALL add_column_if_missing('chat_sessions', 'state_code', 'CHAR(2) NULL AFTER line_id');             -- state picked on the site
CALL add_column_if_missing('chat_sessions', 'last_message_at', 'DATETIME NULL AFTER started_at');
CALL add_column_if_missing('chat_sessions', 'clicked_apply', 'BOOLEAN NOT NULL DEFAULT FALSE');      -- pressed "Start an application" in the chat
CALL add_column_if_missing('chat_sessions', 'is_mock', 'BOOLEAN NOT NULL DEFAULT FALSE');

-- One row per message. The metric columns are filled on assistant replies.
CALL add_column_if_missing('chat_messages', 'topic', 'VARCHAR(20) NULL');            -- HOME, FLOOD, JEWELRY, AUTO, GENERAL
CALL add_column_if_missing('chat_messages', 'outcome', 'VARCHAR(30) NULL');          -- answered, off_topic, quote, quote_incomplete, quote_referred, error
CALL add_column_if_missing('chat_messages', 'quote_lines', 'VARCHAR(60) NULL');      -- e.g. 'HOME,FLOOD' when a quote was given
CALL add_column_if_missing('chat_messages', 'quote_source', 'VARCHAR(10) NULL');     -- 'chat' (asked in words) or 'form' (Quick estimate form)
CALL add_column_if_missing('chat_messages', 'first_token_ms', 'INT NULL');           -- wait before the first word appeared
CALL add_column_if_missing('chat_messages', 'total_ms', 'INT NULL');                 -- time for the whole reply
CALL add_column_if_missing('chat_messages', 'output_tokens', 'INT NULL');
CALL add_column_if_missing('chat_messages', 'model', 'VARCHAR(60) NULL');
CALL add_column_if_missing('chat_messages', 'helpful', 'BOOLEAN NULL');              -- thumbs up / down, NULL = not rated
CALL add_column_if_missing('chat_messages', 'sources', 'VARCHAR(255) NULL');         -- API/Knowledge sections the answer used
DROP PROCEDURE add_column_if_missing;

-- Indexes (skipped if they exist)
SET @has = (SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'chat_sessions' AND index_name = 'ux_chat_public_id');
SET @ddl = IF(@has = 0, 'CREATE UNIQUE INDEX ux_chat_public_id ON chat_sessions (public_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has = (SELECT COUNT(*) FROM information_schema.statistics
            WHERE table_schema = DATABASE() AND table_name = 'chat_messages' AND index_name = 'ix_chat_messages_sent');
SET @ddl = IF(@has = 0, 'CREATE INDEX ix_chat_messages_sent ON chat_messages (sent_at)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- DEMO conversations for the dashboard (replaced on every run)
-- ---------------------------------------------------------------------
DELETE FROM chat_sessions WHERE is_mock = TRUE;   -- chat_messages cascade

DROP PROCEDURE IF EXISTS seed_demo_chats;
DELIMITER //
CREATE PROCEDURE seed_demo_chats()
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE v_chat INT;
  DECLARE v_start DATETIME;
  DECLARE v_turns INT;
  DECLARE t INT;
  DECLARE v_topic VARCHAR(20);
  DECLARE v_outcome VARCHAR(30);
  DECLARE v_question VARCHAR(500);
  DECLARE r DOUBLE;

  WHILE i < 48 DO
    SET v_start = NOW() - INTERVAL FLOOR(RAND(i) * 75) DAY - INTERVAL FLOOR(RAND(i + 100) * 600) MINUTE;
    INSERT INTO chat_sessions (public_id, state_code, started_at, last_message_at, clicked_apply, is_mock)
    VALUES (UUID(), ELT(1 + (i MOD 3), 'AL', 'TX', 'NY'), v_start, v_start + INTERVAL 4 MINUTE,
            RAND(i + 200) < 0.3, TRUE);
    SET v_chat = LAST_INSERT_ID();

    SET v_turns = 1 + FLOOR(RAND(i + 300) * 4);
    SET t = 0;
    WHILE t < v_turns DO
      SET r = RAND(i * 10 + t);
      SET v_topic = ELT(1 + FLOOR(RAND(i * 7 + t) * 5), 'HOME', 'FLOOD', 'JEWELRY', 'AUTO', 'GENERAL');
      SET v_outcome = CASE
        WHEN r < 0.08 THEN 'off_topic'
        WHEN r < 0.30 AND v_topic <> 'GENERAL' THEN 'quote'
        WHEN r < 0.36 AND v_topic <> 'GENERAL' THEN 'quote_incomplete'
        WHEN r < 0.39 AND v_topic IN ('HOME', 'FLOOD') THEN 'quote_referred'
        WHEN r > 0.985 THEN 'error'
        ELSE 'answered' END;
      SET v_question = CASE
        WHEN v_outcome = 'off_topic' THEN '(demo) Can you help with my math homework?'
        WHEN v_outcome LIKE 'quote%' THEN CONCAT('(demo) How much would ', LOWER(v_topic), ' insurance cost?')
        ELSE CONCAT('(demo) What does ', LOWER(v_topic), ' insurance cover?') END;
      IF v_outcome = 'off_topic' THEN SET v_topic = 'GENERAL'; END IF;

      INSERT INTO chat_messages (chat_id, sender, content, sent_at, topic)
      VALUES (v_chat, 'customer', v_question, v_start + INTERVAL t MINUTE, v_topic);
      INSERT INTO chat_messages (chat_id, sender, content, sent_at, topic, outcome, quote_lines, quote_source,
                                 first_token_ms, total_ms, output_tokens, model, helpful)
      VALUES (v_chat, 'assistant', '(demo reply)', v_start + INTERVAL t MINUTE + INTERVAL 5 SECOND, v_topic, v_outcome,
              IF(v_outcome LIKE 'quote%', v_topic, NULL),
              IF(v_outcome LIKE 'quote%', IF(RAND(i + t) < 0.6, 'chat', 'form'), NULL),
              IF(v_outcome LIKE 'quote%', 300 + FLOOR(RAND(i + t + 7) * 400), 700 + FLOOR(RAND(i + t + 1) * 1800)),
              IF(v_outcome LIKE 'quote%', 900 + FLOOR(RAND(i + t + 2) * 1500), 3000 + FLOOR(RAND(i + t + 3) * 6000)),
              IF(v_outcome LIKE 'quote%', 0, 40 + FLOOR(RAND(i + t + 4) * 140)),
              'llama3.2:3b',
              CASE WHEN RAND(i + t + 5) < 0.55 THEN NULL WHEN RAND(i + t + 6) < 0.82 THEN TRUE ELSE FALSE END);
      SET t = t + 1;
    END WHILE;
    SET i = i + 1;
  END WHILE;
END //
DELIMITER ;

CALL seed_demo_chats();
DROP PROCEDURE seed_demo_chats;

SET SQL_SAFE_UPDATES = 1;

SELECT COUNT(*) AS demo_conversations FROM chat_sessions WHERE is_mock = TRUE;
SELECT outcome, COUNT(*) AS replies FROM chat_messages WHERE sender = 'assistant' GROUP BY outcome ORDER BY replies DESC;
