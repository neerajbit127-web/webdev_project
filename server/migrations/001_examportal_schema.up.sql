-- ==============================================================================
-- ExamPortal Migration 001 (UP): Complete Relational Schema
-- PostgreSQL 14+ compatible
-- ==============================================================================

-- 0. Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to automatically maintain updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. USERS TABLE
-- Stores credentials, role boundaries, and student/faculty IDs
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    student_id VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_role CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN')),
    CONSTRAINT chk_user_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id ON users (student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 2. EXAMS TABLE
-- Holds orchestration parameters, access codes, duration rules, and grading policies
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    batch VARCHAR(100),
    access_code VARCHAR(50) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    total_marks NUMERIC(7,2) NOT NULL DEFAULT 0.00,
    passing_marks NUMERIC(7,2) NOT NULL DEFAULT 0.00,
    negative_marking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    negative_marks_per_wrong_answer NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
    shuffle_options BOOLEAN NOT NULL DEFAULT TRUE,
    max_tab_switches INTEGER NOT NULL DEFAULT 3,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_exam_duration CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    CONSTRAINT chk_exam_total_marks CHECK (total_marks >= 0.00),
    CONSTRAINT chk_exam_passing_marks CHECK (passing_marks >= 0.00),
    CONSTRAINT chk_exam_negative_marks CHECK (negative_marks_per_wrong_answer >= 0.00),
    CONSTRAINT chk_exam_max_switches CHECK (max_tab_switches >= 0),
    CONSTRAINT chk_exam_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT chk_exam_schedule CHECK (start_time IS NULL OR end_time IS NULL OR start_time <= end_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_access_code_upper ON exams (UPPER(access_code));
CREATE INDEX IF NOT EXISTS idx_exams_teacher_id ON exams (teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams (status);
CREATE INDEX IF NOT EXISTS idx_exams_schedule ON exams (start_time, end_time);

CREATE TRIGGER trg_exams_updated_at
BEFORE UPDATE ON exams
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 3. QUESTIONS TABLE
-- Represents individual question items belonging to an examination
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT 'SINGLE_CHOICE',
    marks NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    negative_marks NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    position INTEGER NOT NULL DEFAULT 1,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_question_type CHECK (question_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT')),
    CONSTRAINT chk_question_marks CHECK (marks >= 0.00),
    CONSTRAINT chk_question_negative_marks CHECK (negative_marks >= 0.00),
    CONSTRAINT chk_question_position CHECK (position >= 1)
);

CREATE INDEX IF NOT EXISTS idx_questions_exam_position ON questions (exam_id, position);

CREATE TRIGGER trg_questions_updated_at
BEFORE UPDATE ON questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 4. OPTIONS TABLE
-- Options for multiple choice/single choice questions
CREATE TABLE IF NOT EXISTS options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_option_position CHECK (position >= 1),
    CONSTRAINT uq_question_option_position UNIQUE (question_id, position)
);

CREATE INDEX IF NOT EXISTS idx_options_question_id ON options (question_id);

-- 5. SUBMISSIONS TABLE
-- Student assessment attempts, timing authority, and aggregated results
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline_at TIMESTAMP WITH TIME ZONE NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
    total_score NUMERIC(7,2) DEFAULT 0.00,
    percentage NUMERIC(5,2) DEFAULT 0.00,
    passed BOOLEAN DEFAULT FALSE,
    tab_switch_count INTEGER NOT NULL DEFAULT 0,
    order_mapping JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_submission_status CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'FORCE_SUBMITTED')),
    CONSTRAINT chk_submission_score CHECK (total_score >= 0.00),
    CONSTRAINT chk_submission_percentage CHECK (percentage >= 0.00 AND percentage <= 100.00),
    CONSTRAINT chk_submission_tab_switches CHECK (tab_switch_count >= 0),
    CONSTRAINT chk_submission_deadline CHECK (deadline_at >= started_at),
    CONSTRAINT chk_submission_submitted_at CHECK (submitted_at IS NULL OR submitted_at >= started_at),
    CONSTRAINT uq_student_exam_attempt UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_exam_id ON submissions (exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS idx_submissions_started_at ON submissions (started_at);

CREATE TRIGGER trg_submissions_updated_at
BEFORE UPDATE ON submissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

-- 6. SUBMISSION_ANSWERS TABLE
-- Audit log of each student's response per question
CREATE TABLE IF NOT EXISTS submission_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    selected_option_id UUID REFERENCES options(id) ON DELETE SET NULL,
    awarded_marks NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_submission_question UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_answers_submission_id ON submission_answers (submission_id);
CREATE INDEX IF NOT EXISTS idx_sub_answers_question_id ON submission_answers (question_id);

-- 7. INTEGRITY_EVENTS TABLE
-- Granular proctoring telemetry audit stream
CREATE TABLE IF NOT EXISTS integrity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_integrity_events_submission_id ON integrity_events (submission_id);
CREATE INDEX IF NOT EXISTS idx_integrity_events_event_type ON integrity_events (event_type);
CREATE INDEX IF NOT EXISTS idx_integrity_events_occurred_at ON integrity_events (occurred_at);

-- 8. EXAM_UPLOADS TABLE
-- Metadata and parsed staging drafts for document ingestion (PDF/DOCX)
CREATE TABLE IF NOT EXISTS exam_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    parsed_draft JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_upload_status CHECK (status IN ('PENDING', 'PARSED', 'APPLIED', 'FAILED')),
    CONSTRAINT chk_upload_size CHECK (file_size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_exam_uploads_teacher_id ON exam_uploads (teacher_id);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_exam_id ON exam_uploads (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_uploads_status ON exam_uploads (status);

CREATE TRIGGER trg_exam_uploads_updated_at
BEFORE UPDATE ON exam_uploads
FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

