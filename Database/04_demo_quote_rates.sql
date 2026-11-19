-- =====================================================================
-- DEMO quote factors - used by the API to show customers a rough price
-- RANGE on the Quote step. Run after 01_schema.sql. Safe to re-run
-- (it recreates the table), and it doesn't touch any other data.
--
-- These are NOT Valent Partners or carrier rates. They're public national
-- averages (with sources) plus placeholder adjustments, so the prototype can
-- show a ballpark. Every quote built from them is labeled "DEMO ESTIMATE"
-- (status DEMO_ESTIMATE in the research doc, section 10). Replace this
-- table with the client's approved rating rules or carrier quote API later.
--
-- STATE ADJUSTMENT (demo-2026-11): each line's price is multiplied by a
-- state factor = the state's average premium / the national average, both
-- from the SAME published table and year, so the ratio is like-for-like.
-- A state with no factor here uses 1.00 (the national average).
--
-- To change a number: edit factor_value here (or in Workbench), re-run.
-- The API reads the table on every quote, so no restart is needed.
-- =====================================================================

USE valent_insurance;

DROP TABLE IF EXISTS demo_quote_factors;

CREATE TABLE demo_quote_factors (
  factor_id    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_version VARCHAR(50)   NOT NULL,             -- saved on every quote, so we know which numbers made it
  line_code    VARCHAR(20)   NOT NULL,             -- 'HOME', 'FLOOD', 'JEWELRY', 'AUTO'
  factor_key   VARCHAR(50)   NOT NULL,             -- name the API looks up
  factor_value DECIMAL(12,4) NOT NULL,
  description  VARCHAR(255)  NOT NULL,
  source       VARCHAR(255)  NULL,                 -- where the number came from; NULL = team placeholder
  is_mock      BOOLEAN       NOT NULL DEFAULT TRUE,
  UNIQUE (rule_version, line_code, factor_key)
);

-- Only one version is active at a time; the API uses this one
SET @v = 'demo-2026-11';  -- -10 was national averages only; -11 adds the state factors

INSERT INTO demo_quote_factors (rule_version, line_code, factor_key, factor_value, description, source) VALUES

-- ---- Homeowners ----------------------------------------------------
-- $2,424/yr national average for $300,000 dwelling coverage = $8.08 per $1,000
(@v, 'HOME', 'annual_per_1000_dwelling', 8.08,
 'Average yearly premium per $1,000 of dwelling (rebuild) coverage',
 'Bankrate national average, Nov 2025: $2,424/yr for $300k dwelling'),
-- State averages range from far below to well above the national figure, so the range is wide
(@v, 'HOME', 'range_low_mult',  0.60, 'Low end of range = average x this', NULL),
(@v, 'HOME', 'range_high_mult', 1.60, 'High end of range = average x this', NULL),

-- ---- Flood (NFIP-style) --------------------------------------------
(@v, 'FLOOD', 'annual_avg_policy', 888,
 'Average yearly flood policy premium',
 'Kiplinger citing FEMA/NFIP data: about $888/yr average'),
-- Moderate/low-risk zone X: low-risk policies "start at a little more than $100"
(@v, 'FLOOD', 'zone_x_low_mult',  0.15, 'Zone X low end = average x this', 'Kiplinger: low-risk policies start a little over $100/yr'),
(@v, 'FLOOD', 'zone_x_high_mult', 1.00, 'Zone X high end = average x this', NULL),
-- High-risk zone A/AE, or zone unknown
(@v, 'FLOOD', 'zone_a_low_mult',  0.50, 'Zone A or unknown, low end = average x this', NULL),
(@v, 'FLOOD', 'zone_a_high_mult', 2.50, 'Zone A or unknown, high end = average x this', NULL),
-- Zone V/VE is not estimated at all: always sent to a flood specialist

-- ---- Jewelry -------------------------------------------------------
(@v, 'JEWELRY', 'rate_low_pct',  1.0, 'Low end: % of total item value per year',
 'Industry articles (BriteCo, Worthy, InsuranceNewsNet): 1%-2% of appraised value per year'),
(@v, 'JEWELRY', 'rate_high_pct', 2.0, 'High end: % of total item value per year',
 'Industry articles (BriteCo, Worthy, InsuranceNewsNet): 1%-2% of appraised value per year'),

-- ---- Auto (per vehicle) --------------------------------------------
(@v, 'AUTO', 'liability_low',  623, 'Liability-only average, low published figure, per vehicle per year', 'NerdWallet 2025 minimum-coverage average'),
(@v, 'AUTO', 'liability_high', 820, 'Liability-only average, high published figure, per vehicle per year', 'Bankrate 2025 minimum-coverage average'),
(@v, 'AUTO', 'full_low',  2285, 'Liability + collision & comprehensive, low published figure, per vehicle per year', 'NerdWallet 2025 full-coverage average'),
(@v, 'AUTO', 'full_high', 2697, 'Liability + collision & comprehensive, high published figure, per vehicle per year', 'Bankrate 2025 full-coverage average'),
-- Bankrate: full coverage ranges from ~$1,056 (VT) to ~$4,252 (MD) by state; these widen the national range to roughly match
(@v, 'AUTO', 'range_low_mult',  0.60, 'Low end = low average x this (state variation)', NULL),
(@v, 'AUTO', 'range_high_mult', 1.50, 'High end = high average x this (state variation)', NULL),
-- Placeholders: raise the HIGH end only, since we can't know the real effect
(@v, 'AUTO', 'incident_high_mult',  1.50, 'Recent accidents/claims/violations: high end x this', NULL),
(@v, 'AUTO', 'new_driver_years',    3,    'A driver licensed fewer years than this counts as a new driver', NULL),
(@v, 'AUTO', 'new_driver_high_mult', 1.50, 'Any new driver on the policy: high end x this', NULL),

-- ---- State factors: state average / national average ------------------
-- Homeowners: NAIC 2023 average HO-3 homeowners premium (via Insurance Information Institute).
--   US $1,737 | AL $1,906 | TX $2,864 (TX data from the Texas Dept. of Insurance) | NY $1,801
(@v, 'HOME', 'state_mult_AL', 1.10, 'Alabama: $1,906 / US $1,737 average HO-3 premium, 2023', 'NAIC 2023 HO-3 average premium by state, via III Facts + Statistics: Homeowners and renters insurance'),
(@v, 'HOME', 'state_mult_TX', 1.65, 'Texas: $2,864 / US $1,737 average HO-3 premium, 2023', 'NAIC 2023 HO-3 average premium by state (TX from Texas Dept. of Insurance), via III'),
(@v, 'HOME', 'state_mult_NY', 1.04, 'New York: $1,801 / US $1,737 average HO-3 premium, 2023', 'NAIC 2023 HO-3 average premium by state, via III Facts + Statistics: Homeowners and renters insurance'),

-- Flood: average NFIP premium, policies written or renewed Aug 31 2025 - Aug 31 2026
--   (OpenFEMA NFIP Policies data, FEMA snapshot Aug 3 2026, compiled by FludZone).
--   US $955 | AL $917 | TX $958 | NY $1,194
(@v, 'FLOOD', 'state_mult_AL', 0.96, 'Alabama: $917 / US $955 average NFIP premium, 12 months to Aug 2026', 'OpenFEMA NFIP policies (FEMA snapshot Aug 3, 2026), via fludzone.com/guides/nfip-policies-data'),
(@v, 'FLOOD', 'state_mult_TX', 1.00, 'Texas: $958 / US $955 average NFIP premium, 12 months to Aug 2026', 'OpenFEMA NFIP policies (FEMA snapshot Aug 3, 2026), via fludzone.com/guides/nfip-policies-data'),
(@v, 'FLOOD', 'state_mult_NY', 1.25, 'New York: $1,194 / US $955 average NFIP premium, 12 months to Aug 2026', 'OpenFEMA NFIP policies (FEMA snapshot Aug 3, 2026), via fludzone.com/guides/nfip-policies-data'),

-- Jewelry: priced as a % of item value; no state-level data was found, so every state is 1.00
(@v, 'JEWELRY', 'state_mult_AL', 1.00, 'Alabama: no state jewelry premium data found; national rate used', NULL),
(@v, 'JEWELRY', 'state_mult_TX', 1.00, 'Texas: no state jewelry premium data found; national rate used', NULL),
(@v, 'JEWELRY', 'state_mult_NY', 1.00, 'New York: no state jewelry premium data found; national rate used', NULL),

-- Auto: NAIC 2022/2023 Auto Insurance Database Report (adopted Dec 2025), 2023 data.
--   Liability only = Table 1C liability average premium: US $736.65 | AL $575.51 | TX $797.86 | NY $1,115.97
--   Full coverage  = Table 5 combined average premium (liability + collision + comprehensive):
--                    US $1,438.60 | AL $1,268.71 | TX $1,726.91 | NY $1,895.99
(@v, 'AUTO', 'state_mult_liability_AL', 0.78, 'Alabama: $575.51 / US $736.65 liability average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 1C (2023)'),
(@v, 'AUTO', 'state_mult_liability_TX', 1.08, 'Texas: $797.86 / US $736.65 liability average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 1C (2023)'),
(@v, 'AUTO', 'state_mult_liability_NY', 1.51, 'New York: $1,115.97 / US $736.65 liability average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 1C (2023)'),
(@v, 'AUTO', 'state_mult_full_AL', 0.88, 'Alabama: $1,268.71 / US $1,438.60 combined average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 5 (2023)'),
(@v, 'AUTO', 'state_mult_full_TX', 1.20, 'Texas: $1,726.91 / US $1,438.60 combined average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 5 (2023)'),
(@v, 'AUTO', 'state_mult_full_NY', 1.32, 'New York: $1,895.99 / US $1,438.60 combined average premium, 2023', 'NAIC 2022/2023 Auto Insurance Database Report, Table 5 (2023)');

SELECT line_code, factor_key, factor_value, COALESCE(source, '(placeholder)') AS source
FROM demo_quote_factors ORDER BY line_code, factor_id;
