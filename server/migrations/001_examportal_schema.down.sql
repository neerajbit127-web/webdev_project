-- ==============================================================================
-- ExamPortal Migration 001 (DOWN): Rollback Relational Schema
-- Drops all tables, triggers, and indices in reverse dependency order
-- ==============================================================================

-- 1. Drop tables in reverse foreign key order
DROP TABLE IF EXISTS exam_uploads CASCADE;
DROP TABLE IF EXISTS integrity_events CASCADE;
DROP TABLE IF EXISTS submission_answers CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Drop triggers function
DROP FUNCTION IF EXISTS set_updated_at_timestamp() CASCADE;

