-- =====================================================================
-- Valent Partners - AI Insurance Quote & Application Assistant
-- Database schema (MySQL 8.0+)
--
-- Run this whole file in MySQL Workbench (lightning bolt icon).
-- WARNING: re-running drops and recreates every table, which deletes all data.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS valent_insurance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE valent_insurance;

-- Drop in reverse dependency order so the script can be re-run
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS analytics_events;
DROP TABLE IF EXISTS analytics_sessions;
DROP TABLE IF EXISTS escalations;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_sessions;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS application_status_history;
DROP TABLE IF EXISTS application_item_answers;
DROP TABLE IF EXISTS application_answers;
DROP TABLE IF EXISTS application_lines;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS application_steps;
DROP TABLE IF EXISTS coverage_options;
DROP TABLE IF EXISTS line_state_availability;
DROP TABLE IF EXISTS insurance_lines;
DROP TABLE IF EXISTS states;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS staff_users;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. Lookup / reference data
-- ---------------------------------------------------------------------

CREATE TABLE states (
  state_code  CHAR(2)      NOT NULL PRIMARY KEY,   -- 'AL', 'TX', ...
  state_name  VARCHAR(50)  NOT NULL
);

CREATE TABLE insurance_lines (
  line_id     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  line_code   VARCHAR(20)  NOT NULL UNIQUE,        -- 'HOME', 'FLOOD', 'JEWELRY', 'AUTO'
  line_name   VARCHAR(100) NOT NULL,
  description TEXT         NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Which lines are offered in which states.
-- is_mock = TRUE until the client/carrier confirms the rule.
CREATE TABLE line_state_availability (
  line_id      INT          NOT NULL,
  state_code   CHAR(2)      NOT NULL,
  is_available BOOLEAN      NOT NULL DEFAULT TRUE,
  notes        VARCHAR(255) NULL,
  is_mock      BOOLEAN      NOT NULL DEFAULT TRUE,
  source       VARCHAR(255) NULL,                  -- where the rule came from
  PRIMARY KEY (line_id, state_code),
  FOREIGN KEY (line_id)    REFERENCES insurance_lines(line_id),
  FOREIGN KEY (state_code) REFERENCES states(state_code)
);

-- Coverage tiers/options shown on comparison cards.
CREATE TABLE coverage_options (
  coverage_id     INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  line_id         INT           NOT NULL,
  option_name     VARCHAR(100)  NOT NULL,          -- e.g. 'Basic', 'Standard', 'Premium'
  description     TEXT          NULL,
  coverage_limit  DECIMAL(12,2) NULL,
  deductible      DECIMAL(12,2) NULL,
  is_mock         BOOLEAN       NOT NULL DEFAULT TRUE,
  source          VARCHAR(255)  NULL,
  FOREIGN KEY (line_id) REFERENCES insurance_lines(line_id)
);

-- The steps of the multi-step application, per line.
-- Kept in a table so steps can change without schema changes,
-- and so analytics can report drop-off by step.
CREATE TABLE application_steps (
  step_id     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  line_id     INT          NOT NULL,
  step_number INT          NOT NULL,
  step_key    VARCHAR(50)  NOT NULL,               -- e.g. 'personal_info'
  step_name   VARCHAR(100) NOT NULL,
  UNIQUE (line_id, step_number),
  FOREIGN KEY (line_id) REFERENCES insurance_lines(line_id)
);

-- ---------------------------------------------------------------------
-- 2. People
-- ---------------------------------------------------------------------

-- Reviewers / employees / admins (dashboard users).
-- Exact employee vs admin permissions are still an open question.
CREATE TABLE staff_users (
  staff_id      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,                 -- never store plain-text passwords
  role          ENUM('employee','admin') NOT NULL DEFAULT 'employee',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Applicants / website visitors who start an application.
CREATE TABLE customers (
  customer_id INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  first_name  VARCHAR(100) NULL,
  last_name   VARCHAR(100) NULL,
  email       VARCHAR(255) NULL,
  phone       VARCHAR(25)  NULL,
  state_code  CHAR(2)      NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (state_code) REFERENCES states(state_code)
);

-- ---------------------------------------------------------------------
-- 3. Applications + reviewer workflow
-- ---------------------------------------------------------------------

-- One application can cover several insurance lines (a bundle).
-- The lines are listed in application_lines below.
CREATE TABLE applications (
  application_id  INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT      NOT NULL,
  state_code      CHAR(2)  NOT NULL,
  status          ENUM('in_progress','submitted','under_review',
                       'approved','rejected','escalated','abandoned')
                  NOT NULL DEFAULT 'in_progress',
  current_step    INT      NULL,                   -- step_number they're on
  assigned_staff_id INT    NULL,
  rejection_reason VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  submitted_at    DATETIME NULL,
  FOREIGN KEY (customer_id)       REFERENCES customers(customer_id),
  FOREIGN KEY (state_code)        REFERENCES states(state_code),
  FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(staff_id),
  INDEX idx_app_status (status)
);

-- Which insurance lines an application covers. One row = single-line application;
-- two or more rows = a bundle (e.g. HOME + AUTO).
CREATE TABLE application_lines (
  application_id INT NOT NULL,
  line_id        INT NOT NULL,
  coverage_id    INT NULL,                         -- chosen coverage option for this line, if any
  PRIMARY KEY (application_id, line_id),
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (line_id)        REFERENCES insurance_lines(line_id),
  FOREIGN KEY (coverage_id)    REFERENCES coverage_options(coverage_id)
);

-- One row per form answer. Because the front end isn't final, answers are
-- stored as key/value pairs instead of one column per form field.
CREATE TABLE application_answers (
  answer_id      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT          NOT NULL,
  step_number    INT          NULL,
  field_key      VARCHAR(100) NOT NULL,            -- e.g. 'year_built', 'item_value'
  field_value    TEXT         NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE (application_id, field_key),
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
);

-- Answers for repeatable items: each vehicle, driver, or jewelry item the
-- customer adds. One row per field per item, e.g.
--   (12, 'vehicle', 2, 'make', 'Honda')  = application 12, vehicle #2, make = Honda
CREATE TABLE application_item_answers (
  application_id INT          NOT NULL,
  item_type      VARCHAR(30)  NOT NULL,            -- 'vehicle', 'driver', 'jewelry'
  item_number    INT          NOT NULL,            -- 1, 2, 3... within its type
  field_key      VARCHAR(100) NOT NULL,
  field_value    TEXT         NULL,
  PRIMARY KEY (application_id, item_type, item_number, field_key),
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
);

-- Audit trail of status changes (approval queue history).
CREATE TABLE application_status_history (
  history_id     INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT      NOT NULL,
  old_status     VARCHAR(20) NULL,
  new_status     VARCHAR(20) NOT NULL,
  changed_by     INT      NULL,                    -- staff_id, NULL = system/customer
  note           TEXT     NULL,
  changed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by)     REFERENCES staff_users(staff_id)
);

-- ---------------------------------------------------------------------
-- 4. AI Quote Assistant + escalation
-- ---------------------------------------------------------------------

-- Quote estimates. is_mock flags estimates not based on client-approved rules.
CREATE TABLE quotes (
  quote_id       INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT           NULL,
  line_id        INT           NOT NULL,
  state_code     CHAR(2)       NOT NULL,
  estimate_low   DECIMAL(10,2) NULL,
  estimate_high  DECIMAL(10,2) NULL,
  rule_version   VARCHAR(50)   NULL,               -- which rule set produced it
  is_mock        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(application_id),
  FOREIGN KEY (line_id)        REFERENCES insurance_lines(line_id),
  FOREIGN KEY (state_code)     REFERENCES states(state_code)
);

CREATE TABLE chat_sessions (
  chat_id        INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id    INT      NULL,
  application_id INT      NULL,
  line_id        INT      NULL,
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       DATETIME NULL,
  FOREIGN KEY (customer_id)    REFERENCES customers(customer_id),
  FOREIGN KEY (application_id) REFERENCES applications(application_id),
  FOREIGN KEY (line_id)        REFERENCES insurance_lines(line_id)
);

CREATE TABLE chat_messages (
  message_id INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_id    INT      NOT NULL,
  sender     ENUM('customer','assistant','staff') NOT NULL,
  content    TEXT     NOT NULL,
  sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chat_sessions(chat_id) ON DELETE CASCADE
);

-- Hand-offs from the AI / application to a human specialist.
CREATE TABLE escalations (
  escalation_id     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id    INT          NULL,
  chat_id           INT          NULL,
  reason            VARCHAR(255) NOT NULL,
  status            ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  assigned_staff_id INT          NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME     NULL,
  FOREIGN KEY (application_id)    REFERENCES applications(application_id),
  FOREIGN KEY (chat_id)           REFERENCES chat_sessions(chat_id),
  FOREIGN KEY (assigned_staff_id) REFERENCES staff_users(staff_id)
);

-- ---------------------------------------------------------------------
-- 5. Behavioral analytics (dwell time, exits, drop-off, errors)
-- ---------------------------------------------------------------------

-- One row per browser visit.
CREATE TABLE analytics_sessions (
  session_id   CHAR(36)    NOT NULL PRIMARY KEY,   -- UUID generated in the browser
  customer_id  INT         NULL,
  state_code   CHAR(2)     NULL,
  device_type  VARCHAR(20) NULL,                   -- 'desktop', 'mobile', 'tablet'
  started_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     DATETIME    NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (state_code)  REFERENCES states(state_code)
);

-- One row per tracked event. event_name examples:
--   'page_view', 'page_exit', 'step_enter', 'step_complete', 'step_back',
--   'validation_error', 'field_change', 'chat_open', 'escalation_requested'
-- metadata (JSON) holds anything extra so new events don't need new columns.
-- Do NOT put sensitive form values in here.
CREATE TABLE analytics_events (
  event_id       BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id     CHAR(36)     NOT NULL,
  application_id INT          NULL,
  event_name     VARCHAR(50)  NOT NULL,
  page           VARCHAR(100) NULL,
  line_id        INT          NULL,
  step_number    INT          NULL,
  duration_ms    INT          NULL,                -- time on page/step for exit events
  metadata       JSON         NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (session_id)     REFERENCES analytics_sessions(session_id),
  FOREIGN KEY (application_id) REFERENCES applications(application_id),
  FOREIGN KEY (line_id)        REFERENCES insurance_lines(line_id),
  INDEX idx_event_name_time (event_name, created_at),
  INDEX idx_event_page (page)
);
