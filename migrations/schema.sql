-- =============================================================================
-- EXAMPORTAL DATABASE SCHEMA (PostgreSQL)
-- Optimized for high-concurrency examination orchestration on Render PostgreSQL
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Roles: 'TEACHER', 'STUDENT', 'ADMIN'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL, -- Used as login identifier (or student ID)
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')),
    department VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- -----------------------------------------------------------------------------
-- 2. EXAMS TABLE
-- Unique access code (e.g. EXAM-4020, EXAM-8921) generated per exam
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    batch VARCHAR(100) DEFAULT 'General',
    passing_percentage NUMERIC(5,2) DEFAULT 50.00,
    total_marks NUMERIC(6,2) DEFAULT 0.00,
    shuffle_questions BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT TRUE,
    max_tab_switches INTEGER DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exams_code ON exams(code);
CREATE INDEX IF NOT EXISTS idx_exams_teacher ON exams(teacher_id);

-- -----------------------------------------------------------------------------
-- 3. QUESTIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_order INTEGER DEFAULT 1,
    marks NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    negative_marks NUMERIC(5,2) NOT NULL DEFAULT 0.50,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);

-- -----------------------------------------------------------------------------
-- 4. OPTIONS TABLE
-- Option index: 0=A, 1=B, 2=C, 3=D
-- is_correct is stripped from candidate payloads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_options_question ON options(question_id);

-- -----------------------------------------------------------------------------
-- 5. SUBMISSIONS TABLE
-- Tracks candidate session, server timers, anti-cheat strikes, and final evaluation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(6,2) DEFAULT 0.00,
    max_score NUMERIC(6,2) DEFAULT 0.00,
    correct_answers INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    percentage NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'DISQUALIFIED')),
    tab_switch_count INTEGER DEFAULT 0,
    integrity_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_exam_attempt UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_exam_student ON submissions(exam_id, student_id);

-- -----------------------------------------------------------------------------
-- 6. SUBMISSION ANSWERS TABLE
-- Records each student's response for detailed gradebook audits
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES options(id) ON DELETE SET NULL,
    selected_option_index INTEGER,
    is_correct BOOLEAN DEFAULT FALSE,
    awarded_marks NUMERIC(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submission_answers_sub ON submission_answers(submission_id);
