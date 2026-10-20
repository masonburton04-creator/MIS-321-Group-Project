-- =====================================================================
-- Seed / reference data. Run AFTER 01_schema.sql.
-- Only lookup data here: states, the 4 insurance lines, application steps.
-- No pricing or eligibility rules. Those must come from research/the client.
-- =====================================================================

USE valent_insurance;

INSERT INTO states (state_code, state_name) VALUES
('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),
('CA','California'),('CO','Colorado'),('CT','Connecticut'),('DE','Delaware'),
('DC','District of Columbia'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),
('ID','Idaho'),('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),
('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),('ME','Maine'),
('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),
('MS','Mississippi'),('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),
('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),
('NY','New York'),('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),
('OK','Oklahoma'),('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),
('SC','South Carolina'),('SD','South Dakota'),('TN','Tennessee'),('TX','Texas'),
('UT','Utah'),('VT','Vermont'),('VA','Virginia'),('WA','Washington'),
('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming');

INSERT INTO insurance_lines (line_code, line_name, description) VALUES
('HOME',    'Homeowners Insurance', 'Coverage for a home, its contents, and personal liability.'),
('FLOOD',   'Flood Insurance',      'Coverage for flood damage, which standard homeowners policies typically exclude.'),
('JEWELRY', 'Jewelry Insurance',    'Coverage for engagement rings, watches, and other valuable jewelry.'),
('AUTO',    'Auto Insurance',       'Coverage for your vehicles, liability on the road, and the people you drive with.');

-- The 5 steps of the customer application form (mockup 1). Must match the
-- step numbers the front end sends to PUT /api/applications/{id}/steps/{step}.
INSERT INTO application_steps (line_id, step_number, step_key, step_name)
SELECT line_id, 1, 'coverage',  'Coverage' FROM insurance_lines UNION ALL
SELECT line_id, 2, 'details',   CASE line_code WHEN 'JEWELRY' THEN 'Jewelry Details' WHEN 'AUTO' THEN 'Vehicle Details' ELSE 'Property Details' END FROM insurance_lines UNION ALL
SELECT line_id, 3, 'applicant', 'Applicant Details' FROM insurance_lines UNION ALL
SELECT line_id, 4, 'quote',     'Quote' FROM insurance_lines UNION ALL
SELECT line_id, 5, 'submit',    'Submit' FROM insurance_lines;

-- Placeholder: mark every line available in every state as MOCK data
-- (is_mock defaults to TRUE) until real eligibility rules are researched.
INSERT INTO line_state_availability (line_id, state_code, is_available, notes)
SELECT l.line_id, s.state_code, TRUE, 'Placeholder - not yet verified'
FROM insurance_lines l CROSS JOIN states s;
