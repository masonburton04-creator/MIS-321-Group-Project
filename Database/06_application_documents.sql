-- =====================================================================
-- Adds the application_documents table (current-policy uploads) to a
-- database created before it was added to 01_schema.sql. Safe to re-run,
-- and it doesn't touch any existing data.
-- Not needed if you just ran 01_schema.sql, which already includes it.
-- =====================================================================

USE valent_insurance;

-- Same definition as in 01_schema.sql
CREATE TABLE IF NOT EXISTS application_documents (
  document_id    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  application_id INT          NOT NULL,
  doc_type       VARCHAR(30)  NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  content_type   VARCHAR(100) NOT NULL,            -- application/pdf, image/jpeg, image/png
  size_bytes     INT          NOT NULL,
  content        MEDIUMBLOB   NOT NULL,            -- up to 16 MB; the API allows 5 MB
  uploaded_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (application_id, doc_type),
  FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
);

SHOW TABLES LIKE 'application_documents';
