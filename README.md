<<<<<<< HEAD
# 🎓 ExamPortal — Enterprise Online Examination & Assessment System

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.18+-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![React](https://img.shields.io/badge/React-v18+-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![JWT](https://img.shields.io/badge/JWT-Secure_Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **ExamPortal** is a high-concurrency, resilient, and secure online examination platform engineered for academic institutions and enterprise certification programs. Features automated question document ingestion (PDF/DOCX), client session recovery, multi-tier anti-cheat telemetry, and server-enforced deadline evaluation.
=======
# 🎓 ExamPortal — Enterprise Online Examination & Assessment Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.21+-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Render-Zero_Downtime-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)
[![JWT](https://img.shields.io/badge/JWT-Secure_Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **ExamPortal** is an enterprise-grade, high-concurrency online examination platform engineered with **Node.js, Express, and PostgreSQL**. Features automated document ingestion (PDF/DOCX), client session recovery, real-time proctoring telemetry, server-enforced auto-submission, and turnkey deployment for **Render Web Services and Render PostgreSQL**.
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9

---

## 📑 Table of Contents

- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Key Features](#-key-features)
<<<<<<< HEAD
  - [Teacher Portal](#teacher-portal)
  - [Student Test Engine](#student-test-engine)
  - [Anti-Cheat & Security Suite](#anti-cheat--security-suite)
- [Project Directory Structure](#-project-directory-structure)
- [Database Schema & Entity Relationships](#-database-schema--entity-relationships)
- [Local Setup & Installation](#-local-setup--installation)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Step-by-Step Installation](#step-by-step-installation)
- [API Reference](#-api-reference)
- [Roadmap](#-roadmap)
- [Contributing & License](#-contributing--license)
=======
  - [Teacher Portal & Assessment Orchestration](#teacher-portal--assessment-orchestration)
  - [Student Test Engine](#student-test-engine)
  - [Anti-Cheat & Proctoring Telemetry](#anti-cheat--proctoring-telemetry)
- [Project Directory Structure](#-project-directory-structure)
- [Database Schema & Migrations](#-database-schema--migrations)
- [API Reference](#-api-reference)
- [Local Setup & Installation](#-local-setup--installation)
- [Render Deployment Guide (Zero-Downtime)](#-render-deployment-guide-zero-downtime)
- [License](#-license)
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9

---

## 🏛️ System Architecture & Data Flow

<<<<<<< HEAD
The platform separates assessment creation, orchestration, test delivery, and evaluation into decoupled modules:

1. **Document Ingestion & Parsing Engine**: Teachers upload raw assessments in `.pdf` or `.docx` format. The server-side parser extracts plain text using stream processors (`pdf-parse`, `mammoth`), identifies question demarcations and multiple-choice patterns via customizable regex/heuristics, and parses options, marks, and answer keys into structured JSON for teacher validation before database persistence.
2. **Secure Test Delivery**: Questions and non-sensitive metadata are dispatched to the student client on exam start. **Option correct answers and explanations are strictly omitted** from client-side payloads to prevent DOM inspection exploits.
3. **Client-Side Runtime & Session Recovery**: React manages the test-taking state with a synchronized local persistence layer (`localStorage` mirror keyed by `student_id` and `exam_id`). Browser crashes, network drops, or accidental reloads immediately restore the active question index, selected answers, and cached countdown time.
4. **Anti-Cheat & Event Telemetry**: Real-time event hooks monitor browser visibility state, tab switching, and window blurring. Every violation logs an immediate async audit ping to the server, incrementing strike counts and enforcing automated submission upon threshold breaches.
5. **Server-Enforced Evaluation & Auto-Submission**: The backend acts as the single source of truth for test duration. When an exam session begins, `started_at` is permanently recorded in the database. When the student submits—or when the server worker detects an elapsed duration—the submission is locked, answers are compared against stored keys in a single transaction, and final scores are computed server-side.

### Data Flow Diagram

```
=======
```text
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
+---------------------------------------------------------------------------------------------------------+
|                                           TEACHER WORKFLOW                                              |
|                                                                                                         |
|  [Exam File]                                                                                            |
|   (PDF/DOCX)                                                                                            |
|       |                                                                                                 |
|       v                                                                                                 |
|  +--------------------+      +--------------------+      +--------------------+      +---------------+  |
<<<<<<< HEAD
|  | Multer File Upload | ---> | Parsing Pipeline   | ---> | Draft Staging &    | ---> | PostgreSQL /  |  |
|  | (/api/exams/parse) |      | (pdf-parse/mammoth)|      | Teacher Validation |      | MySQL Database|  |
=======
|  | Multer File Upload | ---> | Parser Pipeline    | ---> | Draft Staging &    | ---> | PostgreSQL    |  |
|  | (/api/exams/parse) |      | (pdf-parse/mammoth)|      | Teacher Review     |      | Database      |  |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
|  +--------------------+      +--------------------+      +--------------------+      +---------------+  |
+----------------------------------------------------------------------------------------------|----------+
                                                                                               |
                                                                                    Stores     |
                                                                                    Exams &    |
                                                                                    Questions  |
                                                                                               v
+---------------------------------------------------------------------------------------------------------+
|                                           STUDENT WORKFLOW                                              |
|                                                                                                         |
|  +--------------------+       JWT Auth & Start Req        +--------------------+                        |
<<<<<<< HEAD
|  | Student Browser    | ================================> | Express API Gateway|                        |
|  | (React Client)     | <================================ | (/api/exams/:id/start)                      |
|  +--------------------+   Sanitized Payload (No Answers)  +--------------------+                        |
|      |          ^                                                   |                                   |
|      |          | Session Restore                                   | Initializes Session               |
|      |          v                                                   v                                   |
|      |    +--------------------+                          +--------------------+                        |
|      |    | LocalStorage Cache |                          | submissions Table  |                        |
=======
|  | Candidate Browser  | ================================> | Express API Server |                        |
|  | (Vanilla HTML/CSS) | <================================ | (/api/exams/:code/start)                    |
|  +--------------------+   Sanitized Payload (No Answers)  +--------------------+                        |
|      |          ^                                                   |                                   |
|      |          | Local Cache Fallback                              | Initializes Session               |
|      |          v                                                   v                                   |
|      |    +--------------------+                          +--------------------+                        |
|      |    | LocalStorage State |                          | submissions Table  |                        |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
|      |    | (Answers & Timers) |                          | started_at = NOW() |                        |
|      |    +--------------------+                          +--------------------+                        |
|      |                                                              |                                   |
|      |-- Continuous Telemetry (Tab Switch / Blur) ----------------->| Updates integrity_log             |
<<<<<<< HEAD
|      |                                                              | & tab_switch_count                |
|      |                                                              |                                   |
|      +-- Manual Submit OR Auto-Submit at 00:00:00 ----------------->|                                   |
|                                                                     v                                   |
|                                                           +--------------------+                        |
|                                                           | Evaluation Engine  |                        |
|                                                           | - Deadline check   |                        |
|                                                           | - Match answer key |                        |
|                                                           | - Calc score/grade |                        |
=======
|      |   (/api/submissions/:id/telemetry)                           | & tab_switch_count                |
|      |                                                              |                                   |
|      +-- Manual Submit OR Auto-Submit at 00:00:00 ----------------->|                                   |
|          (/api/submissions/:id/submit)                              v                                   |
|                                                           +--------------------+                        |
|                                                           | Evaluation Engine  |                        |
|                                                           | - Duration check   |                        |
|                                                           | - Match answer key |                        |
|                                                           | - Negative marking |                        |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
|                                                           +--------------------+                        |
|                                                                     |                                   |
|                                                                     v                                   |
|                                                           +--------------------+                        |
<<<<<<< HEAD
|                                                           | Results & Analytics|                        |
=======
|                                                           | Results & Audit Log|                        |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
|                                                           | Table (Graded)     |                        |
|                                                           +--------------------+                        |
+---------------------------------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

<<<<<<< HEAD
### 👨‍🏫 Teacher Portal
- **Automated Document Ingestion & Parsing**:
  - Ingests standard `.pdf` and `.docx` assessment papers without requiring manual question re-entry.
  - Heuristic parser separates question stems, options (`A.`, `B.`, `C.`, `D.`), correct answer markers (e.g., `Answer: C` or bold/bracket indicators), and point weightings.
  - Interactive preview drawer enabling teachers to edit, add, or delete parsed questions before final publication.
- **Configurable Exam Orchestration**:
  - Granular exam parameters: duration (minutes), passing mark threshold, negative marking penalty per question.
  - Dynamic question randomization and option shuffling to mitigate neighbor collaboration.
  - Scheduled availability windows (Start Date/Time to End Date/Time) with access key / password protection.
- **Actionable Gradebook & Analytics**:
  - Real-time student performance dashboard displaying class average, median, score distribution, and standard deviation.
  - Question-level difficulty index reporting identifying questions with high error rates.
  - One-click export of exam rosters and grade sheets to CSV and formatted PDF.

### 🧑‍🎓 Student Test Engine
- **Synchronized Precision Countdown Timer**:
  - Millisecond-precision timer displayed persistently in the header.
  - Synchronized against server epoch timestamps at initialization to prevent local system clock tampering.
  - Distinct visual alerts when time remaining crosses critical intervals (e.g., 5-minute and 1-minute markers).
- **Session Persistence & Fault Recovery**:
  - Auto-saves question responses on every selection change to an encrypted client-side storage cache.
  - Full state restoration upon accidental browser closure, page refreshes, or transient internet disconnection.
  - Fast-jump question navigation palette with status badges (Answered, Unanswered, Marked for Review).
- **Fail-Safe Server-Enforced Auto-Submission**:
  - Triggers an instant automatic payload delivery when the countdown strikes `00:00:00`.
  - Backend fallback cron/worker periodically validates open attempts against `started_at + duration_minutes + grace_period` to guarantee closure even if the client disconnects permanently.

### 🛡️ Anti-Cheat & Security Suite
- **Tab-Switch & Visibility Monitoring**:
  - Implements the HTML5 **Page Visibility API** and `window.onblur` event listeners.
  - Detects window focus changes, desktop workspace swapping, or switching browser tabs.
  - Displays escalating non-blocking warning modals with a persistent strike counter; automatically forces test submission when strike limits are exceeded.
- **Input & Context Menu Lockdown**:
  - Disables right-click context menus (`contextmenu` blocked).
  - Intercepts clipboard operations (`copy`, `cut`, `paste`) to inhibit external source lookups.
  - Disables developer tools shortcuts (`F12`, `Ctrl+Shift+I`, `Cmd+Opt+I`) and browser text selection.
- **Tamper-Proof Server Validation**:
  - Answer keys and explanations are completely stripped from student-facing payloads.
  - Scores are calculated entirely server-side inside an isolated transaction.
  - Client timestamps are ignored; duration enforcement is calculated strictly using the server database clock.
- **Enterprise RBAC & Auth Architecture**:
  - Stateless JSON Web Token (JWT) authorization implementing Role-Based Access Control (`STUDENT`, `TEACHER`, `ADMIN`).
  - Passwords hashed using `bcrypt` (12 salt rounds).
  - Route guards protect both API endpoints and React client view boundaries.
=======
### 👨‍🏫 Teacher Portal & Assessment Orchestration
- **Automated Document Ingestion (PDF / DOCX)**:
  - Stream-based document parsing via `pdf-parse` and `mammoth`.
  - Heuristic detection of question stems, option prefixes (`A.`, `B.`, `(C)`), and answer keys (`Answer: B`).
  - Automatic temporary file cleanup in `uploads/temp` to eliminate storage leakage.
- **Access Code Generation**:
  - Dynamically issues standardized, human-readable exam access codes (e.g., `EXAM-4020`, `EXAM-8921`).
  - One-click access code copy and direct testing shortcuts.
- **Roster & Exam Analytics**:
  - Displays aggregate submission counts, student score distributions, and real-time pass/fail rates.

### 🧑‍🎓 Student Test Engine
- **Synchronized Precision Countdown Timer**:
  - Millisecond client timer backed by server-side `started_at` timestamps.
  - Automatically turns high-contrast red when critical interval is breached (< 5 minutes).
- **Session Persistence & State Recovery**:
  - Continuous local cache syncing prevents data loss during transient network disconnects or browser reloads.
  - Interactive question navigation matrix showing **Answered** (Solid Blue), **Current** (Bold Border), and **Unvisited** (Slate Gray).
- **Fail-Safe Server-Enforced Auto-Submission**:
  - Instant client auto-submit trigger at `00:00:00`.
  - Server-side duration validation cuts off attempts exceeding `started_at + duration + grace_period`.

### 🛡️ Anti-Cheat & Proctoring Telemetry
- **Tab-Switch & Focus Tracking**:
  - Listens to HTML5 `visibilitychange` and `window.onblur` events.
  - Telemetry pushed asynchronously to `/api/submissions/:id/telemetry`.
  - Automated strike counter with instant candidate warning modal; automatic exam termination when 3 strikes are exceeded.
- **Tamper-Proof Evaluation**:
  - Option `is_correct` flags are completely omitted from student delivery payloads.
  - Final scores and negative marks are evaluated server-side inside an isolated PostgreSQL transaction.
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9

---

## 📂 Project Directory Structure

```text
exam-portal/
<<<<<<< HEAD
├── client/                          # React Single Page Application (Vite / CRA)
│   ├── public/                      # Static assets and index.html
│   │   ├── favicon.ico
│   │   └── robots.txt
│   ├── src/
│   │   ├── assets/                  # Images, SVGs, and brand styling
│   │   ├── components/              # Modular, reusable UI components
│   │   │   ├── common/              # Buttons, Modals, Loaders, Navbar
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   ├── exam/                # Test-taking engine components
│   │   │   │   ├── ExamTimer.jsx
│   │   │   │   ├── QuestionCard.jsx
│   │   │   │   ├── QuestionPalette.jsx
│   │   │   │   └── AntiCheatMonitor.jsx
│   │   │   └── teacher/             # Teacher-specific components
│   │   │       ├── DocumentUploader.jsx
│   │   │       ├── ParsedPreviewTable.jsx
│   │   │       └── AnalyticsChart.jsx
│   │   ├── context/                 # Global state providers
│   │   │   ├── AuthContext.jsx      # JWT & user session state
│   │   │   └── ExamContext.jsx      # Active exam answers & timer state
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useAntiCheat.js      # Visibility & key-press lockdown hook
│   │   │   ├── useTimer.js          # Countdown & auto-submit hook
│   │   │   └── useLocalStorage.js   # Resilient state synchronization hook
│   │   ├── pages/                   # Top-level view routes
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── student/
│   │   │   │   ├── StudentDashboard.jsx
│   │   │   │   ├── ExamInstructions.jsx
│   │   │   │   ├── ExamSession.jsx
│   │   │   │   └── ExamResult.jsx
│   │   │   └── teacher/
│   │   │       ├── TeacherDashboard.jsx
│   │   │       ├── CreateExam.jsx
│   │   │       └── ExamAnalytics.jsx
│   │   ├── services/                # Axios HTTP client API layer
│   │   │   ├── api.js               # Central Axios instance with interceptors
│   │   │   ├── authService.js
│   │   │   ├── examService.js
│   │   │   └── submissionService.js
│   │   ├── utils/                   # Formatting, validation, constants
│   │   │   ├── constants.js
│   │   │   └── formatters.js
│   │   ├── App.jsx                  # Main routing definition
│   │   ├── index.css                # Global Tailwind / CSS variables
│   │   └── main.jsx                 # Client entry point
│   ├── package.json
│   └── vite.config.js
│
├── server/                          # Node.js & Express REST Backend
│   ├── src/
│   │   ├── config/                  # DB connection pool & environment loader
│   │   │   ├── database.js          # PostgreSQL (pg pool) / MySQL connection
│   │   │   └── env.js
│   │   ├── controllers/             # Business logic controllers
│   │   │   ├── authController.js
│   │   │   ├── examController.js
│   │   │   ├── parserController.js
│   │   │   └── submissionController.js
│   │   ├── middleware/              # Interceptors & security filters
│   │   │   ├── authMiddleware.js    # JWT verification & RBAC check
│   │   │   ├── errorHandler.js      # Global error processing
│   │   │   ├── uploadMiddleware.js  # Multer setup for PDF/DOCX
│   │   │   └── rateLimiter.js       # Express rate limiter for brute-force defense
│   │   ├── models/                  # Database queries / ORM models
│   │   │   ├── UserModel.js
│   │   │   ├── ExamModel.js
│   │   │   ├── QuestionModel.js
│   │   │   └── SubmissionModel.js
│   │   ├── routes/                  # Express route declarations
│   │   │   ├── authRoutes.js
│   │   │   ├── examRoutes.js
│   │   │   └── submissionRoutes.js
│   │   ├── services/                # Standalone domain services
│   │   │   ├── parserService.js     # Text extraction & regex regex patterns
│   │   │   ├── scoringService.js    # Grade calculator & negative marks handler
│   │   │   └── telemetryService.js  # Anti-cheat strike logger
│   │   ├── utils/                   # Helpers, token generator, constants
│   │   │   ├── tokenHelper.js
│   │   │   └── logger.js
│   │   ├── app.js                   # Express app setup & middleware stack
│   │   └── server.js                # HTTP listener bootstrap
│   ├── migrations/                  # SQL migration scripts
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_exams_and_questions.sql
│   │   └── 003_create_submissions.sql
│   ├── package.json
│   └── .env.example
├── .gitignore
=======
├── src/
│   ├── config/
│   │   ├── db.js                 # PostgreSQL pg pool with SSL enabled for Render
│   │   ├── migrate.js            # Automated DDL schema migration runner
│   │   └── seed.js               # Initial faculty, candidate, and exam seeder
│   ├── middleware/
│   │   ├── auth.js               # JWT verification & RBAC check (TEACHER / STUDENT)
│   │   └── upload.js             # Multer config for temporary disk storage & MIME validation
│   ├── controllers/
│   │   ├── authController.js     # User registration, login, profile endpoints
│   │   ├── examController.js     # Exam creation, code generation, candidate payload delivery
│   │   └── submissionController.js # Test evaluation, telemetry strikes, gradebook receipt
│   ├── routes/
│   │   ├── authRoutes.js         # /api/auth routes
│   │   ├── examRoutes.js         # /api/exams routes
│   │   └── submissionRoutes.js   # /api/submissions routes
│   ├── services/
│   │   ├── parserService.js      # Stream PDF & DOCX extraction and regex heuristics
│   │   └── evaluationService.js  # Atomic transaction grading with negative marking
│   └── app.js                    # Express application setup, security headers & static serving
├── migrations/
│   └── schema.sql                # Production PostgreSQL DDL schema & indexes
├── public/                       # Static frontend assets served by Express
│   ├── index.html                # Unified single-page multi-screen interface
│   ├── teacher.html              # Dedicated Teacher Portal view
│   ├── student.html              # Dedicated Student Runner view
│   ├── styles.css                # Enterprise design system stylesheet
│   └── app.js                    # Decoupled frontend controller
├── server.js                     # HTTP listener binding & graceful shutdown handling
├── render.yaml                   # Infrastructure-as-Code Blueprint for Render deployment
├── .env.example                  # Environment configuration template
├── package.json
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
└── README.md
```

---

<<<<<<< HEAD
## 🗄️ Database Schema & Entity Relationships

The relational architecture guarantees atomic score transactions and strict referential integrity.

```
 +--------------------+              +-------------------------+
 |       users        |              |          exams          |
 +--------------------+              +-------------------------+
 | id (PK, UUID)      |1            *| id (PK, UUID)           |
 | name (VARCHAR)     |--------------| teacher_id (FK -> users)|
 | email (VARCHAR, UQ)|              | title (VARCHAR)         |
 | password (VARCHAR) |              | description (TEXT)      |
 | role (ENUM)        |              | duration_minutes (INT)  |
 | created_at         |              | passing_marks (NUMERIC) |
 +--------------------+              | total_marks (NUMERIC)   |
        | 1                          | shuffle_questions (BOOL)|
        |                            | is_published (BOOL)     |
        |                            | start_time (TIMESTAMP)  |
        |                            | end_time (TIMESTAMP)    |
        |                            +-------------------------+
        |                                        | 1
        |                                        |
        | *                                      | *
 +-------------------------+         +-------------------------+
 |       submissions       |         |        questions        |
 +-------------------------+         +-------------------------+
 | id (PK, UUID)           |         | id (PK, UUID)           |
 | exam_id (FK -> exams)   |*       1| exam_id (FK -> exams)   |
 | student_id (FK -> users)|<--------| question_text (TEXT)    |
 | started_at (TIMESTAMP)  |         | question_type (VARCHAR) |
 | submitted_at (TIMESTAMP)|         | marks (NUMERIC)         |
 | total_score (NUMERIC)   |         | negative_marks (NUMERIC)|
 | status (ENUM)           |         +-------------------------+
 | tab_switch_count (INT)  |                     | 1
 | integrity_log (JSONB)   |                     |
 +-------------------------+                     | *
              | 1                    +-------------------------+
              |                      |         options         |
              | *                    +-------------------------+
 +-----------------------------+     | id (PK, UUID)           |
 |     submission_answers      |     | question_id (FK -> Q)   |
 +-----------------------------+     | option_text (TEXT)      |
 | id (PK, UUID)               |     | is_correct (BOOLEAN)    |
 | submission_id (FK -> sub)   |     +-------------------------+
 | question_id (FK -> quest)   |
 | selected_option_id (FK->opt)|
 | is_correct (BOOLEAN)        |
 | awarded_marks (NUMERIC)     |
 +-----------------------------+
```

### Table Definitions

#### 1. `users`
Stores user identities, credentials, and role privileges.
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('STUDENT', 'TEACHER', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### 2. `exams`
Holds examination parameters, security settings, and duration rules.
```sql
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    passing_marks NUMERIC(5,2) DEFAULT 0.00,
    total_marks NUMERIC(5,2) DEFAULT 0.00,
    shuffle_questions BOOLEAN DEFAULT TRUE,
    max_tab_switches INTEGER DEFAULT 3,
    is_published BOOLEAN DEFAULT FALSE,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. `questions`
Contains question stems belonging to an exam.
```sql
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) DEFAULT 'MULTIPLE_CHOICE',
    marks NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    negative_marks NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### 4. `options`
Represents individual options for a question; `is_correct` is concealed from student APIs.
```sql
CREATE TABLE options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### 5. `submissions`
Tracks student session attempts, server timers, and anti-cheat event counters.
```sql
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'DISQUALIFIED')),
    tab_switch_count INTEGER DEFAULT 0,
    integrity_log JSONB DEFAULT '[]'::jsonb,
    CONSTRAINT unique_student_exam_attempt UNIQUE (exam_id, student_id)
);
```

#### 6. `submission_answers`
Stores per-question selections made by a student for fine-grained auditability.
```sql
CREATE TABLE submission_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES options(id) ON DELETE SET NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    awarded_marks NUMERIC(5,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 💻 Local Setup & Installation

Follow these steps to run the complete environment locally.

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0+ (or `yarn` / `pnpm`)
- **Database**: PostgreSQL 14+ or MySQL 8.0+
- **Git**

---

### Environment Configuration

#### 1. Server Configuration (`server/.env`)
Create `server/.env` based on the following template:

```env
# Server Runtime
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database Connection (PostgreSQL Example)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exam_portal_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
DATABASE_URL=postgresql://postgres:your_secure_password@localhost:5432/exam_portal_db

# Security & Authentication
JWT_SECRET=super_secret_jwt_signing_key_replace_in_prod_64char_min
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=super_secret_refresh_token_key_replace_in_prod
REFRESH_TOKEN_EXPIRES_IN=7d

# File Upload Thresholds
MAX_FILE_SIZE_BYTES=10485760 # 10MB
UPLOAD_TEMP_DIR=uploads/temp

# Anti-Cheat Threshold Defaults
DEFAULT_MAX_TAB_SWITCHES=3
SUBMISSION_GRACE_PERIOD_SECONDS=15
```

#### 2. Client Configuration (`client/.env`)
Create `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_APP_NAME="ExamPortal System"
```

---

### Step-by-Step Installation

#### Step 1: Clone Repository
```bash
git clone https://github.com/your-org/exam-portal.git
cd exam-portal
```

#### Step 2: Configure Database
Create the target database in your local PostgreSQL / MySQL instance:

```bash
# PostgreSQL CLI
psql -U postgres -c "CREATE DATABASE exam_portal_db;"
```

Run migration scripts to construct the schema:
```bash
cd server
npm run migrate
cd ..
```

#### Step 3: Install & Start Server
```bash
cd server
npm install

# Start in development mode with nodemon
npm run dev
```
> The API server boots at `http://localhost:5000`

#### Step 4: Install & Start Client
Open a second terminal window:

```bash
cd client
npm install

# Start Vite React development server
npm run dev
```
> The React interface boots at `http://localhost:5173`

=======
## 🗄️ Database Schema & Migrations

The relational architecture guarantees atomic score transactions and strict referential integrity.

### Tables
1. **`users`**: Candidate and instructor accounts with `bcryptjs` password hashing and RBAC (`TEACHER`, `STUDENT`, `ADMIN`).
2. **`exams`**: Test blueprints, access codes (`EXAM-XXXX`), durations, and passing thresholds.
3. **`questions`**: Question stems, order sequencing, marks, and negative marking penalties.
4. **`options`**: Multiple-choice options linked to questions (`is_correct` concealed from student APIs).
5. **`submissions`**: Attempt tracking, server timestamps, computed score, and JSONB proctoring telemetry audit logs.
6. **`submission_answers`**: Per-question audit trail recording selected choices and awarded marks.

### Executing Migrations & Seeding
```bash
# Run PostgreSQL DDL Schema Migration
npm run migrate

# Seed Initial Sample Faculty, Candidate, and Assessments
npm run seed
```

>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
---

## 📡 API Reference

<<<<<<< HEAD
All protected endpoints require the HTTP Header:
=======
All protected routes require the HTTP Header:
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
`Authorization: Bearer <JWT_ACCESS_TOKEN>`

### Authentication Endpoints

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
<<<<<<< HEAD
| `POST` | `/api/auth/register` | `Public` | Register a new user (`STUDENT` or `TEACHER`). |
| `POST` | `/api/auth/login` | `Public` | Authenticate credentials; returns JWT and user payload. |
| `GET` | `/api/auth/me` | `Authenticated` | Return session information for active token bearer. |
| `POST` | `/api/auth/refresh` | `Public` | Obtain fresh access token using valid refresh token. |
=======
| `POST` | `/api/auth/register` | `Public` | Register candidate or faculty account. |
| `POST` | `/api/auth/login` | `Public` | Authenticate credentials; returns signed JWT. |
| `GET` | `/api/auth/me` | `Authenticated` | Return active authenticated user profile. |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9

### Teacher Exam Management

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
<<<<<<< HEAD
| `POST` | `/api/exams/parse-document` | `Teacher` | Upload `.pdf` or `.docx` for heuristic parsing. |
| `POST` | `/api/exams` | `Teacher` | Persist new exam draft with parsed questions. |
| `GET` | `/api/exams/teacher` | `Teacher` | List all exams created by authenticated teacher. |
| `GET` | `/api/exams/:id/analytics` | `Teacher` | Aggregate student metrics, question stats, and roster. |
| `PUT` | `/api/exams/:id/publish` | `Teacher` | Toggle exam visibility status (`is_published`). |
| `DELETE`| `/api/exams/:id` | `Teacher` | Delete an exam and all dependent questions/records. |
=======
| `POST` | `/api/exams/parse-document` | `Teacher` | Ingest `.pdf` or `.docx` for stream text parsing. |
| `POST` | `/api/exams` | `Teacher` | Create exam and generate unique access code (`EXAM-XXXX`). |
| `GET` | `/api/exams/teacher` | `Teacher` | List all exams created by authenticated teacher. |
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9

### Student Test Engine

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
<<<<<<< HEAD
| `GET` | `/api/exams/available` | `Student` | List active exams available for student participation. |
| `POST` | `/api/exams/:id/start` | `Student` | Start exam attempt; locks `started_at` and returns sanitized questions. |
| `POST` | `/api/submissions/:id/telemetry`| `Student` | Push anti-cheat event log (tab switch, window blur). |
| `POST` | `/api/submissions/:id/save-answer` | `Student` | Asynchronously cache single question response. |
| `POST` | `/api/submissions/:id/submit` | `Student` | Submit all answers for immediate server evaluation. |
| `GET` | `/api/submissions/:id/result` | `Student / Teacher` | Fetch final score, awarded marks, and summary breakdown. |

---

## 🗺️ Roadmap

- [ ] **AI-Powered Intelligent Document Parser**:
  - Integrate Vision-Language Models (Gemini / Claude / GPT-4o) to reliably parse unstructured exam papers containing mathematical LaTeX equations, handwritten questions, and embedded vector diagrams.
- [ ] **Automated WebRTC Proctoring Suite**:
  - Add client-side TensorFlow.js / MediaPipe models for head-pose tracking, multi-person presence detection, and background speech detection via microphone stream.
- [ ] **Live Proctoring Command Center**:
  - Implement bidirectional WebSockets (`Socket.io`) allowing instructors to monitor live candidate screens, send direct warnings, pause exams, or disqualify students in real time.
- [ ] **Code Assessment Engine**:
  - Embed an isolated Docker-based code execution sandbox (supporting Python, JavaScript, Java, and C++) with automated unit-test validation for technical programming assessments.

---

## 📄 Contributing & License

Distributed under the **MIT License**. See `LICENSE` for details.

```text
Copyright (c) 2026 ExamPortal Contributors
Permission is hereby granted, free of charge, to any person obtaining a copy of this software...
```
=======
| `GET` | `/api/exams/code/:code` | `Public / Student`| Retrieve pre-exam verification metadata. |
| `POST` | `/api/exams/:code/start` | `Student` | Initialize session and receive sanitized questions. |
| `POST` | `/api/submissions/:id/telemetry`| `Student` | Push real-time tab switch and focus loss telemetry. |
| `POST` | `/api/submissions/:id/submit` | `Student` | Submit responses for atomic server-side evaluation. |
| `GET` | `/api/submissions/:id/result` | `Student / Teacher`| Retrieve final grade and proctor audit log. |

### Health Check

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | `Public` | Zero-downtime health check for Render monitors. |

---

## 💻 Local Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v14+ running locally (or remote instance)
- **npm** or **yarn**

### 1. Clone & Configure Environment
```bash
git clone https://github.com/your-org/exam-portal.git
cd exam-portal

# Copy environment template
cp .env.example .env
```

Edit `.env` with your PostgreSQL database credentials:
```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/exam_portal_db
JWT_SECRET=your_secure_random_key_64_characters_min
PORT=5000
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Migrations & Seed Data
```bash
# Apply schema tables
npm run migrate

# Seed sample users and exams
npm run seed
```

Default credentials seeded:
- **Teacher**: `alan.vance@university.edu` / `password123`
- **Student**: `ST-94821` / `password123`
- **Preloaded Exam Codes**: `EXAM-4020`, `EXAM-2010`

### 4. Launch Development Server
```bash
npm run dev
# Or for standard execution:
npm start
```

Access the portal in your browser:
- **Web App & Portal**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/health`

---

## 🚀 Render Deployment Guide (Zero-Downtime)

The repository includes a ready-to-use **`render.yaml`** Infrastructure-as-Code Blueprint.

### Option A: Automatic Blueprint Deployment (Recommended)
1. Push your repository to **GitHub** or **GitLab**.
2. Log in to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** ➔ **Blueprint**.
4. Connect your repository. Render automatically reads `render.yaml` and provisions:
   - **`exam-portal-db`**: Render Managed PostgreSQL Database.
   - **`exam-portal-service`**: Node.js Web Service running `npm install && npm run migrate` on build.
5. Render links `DATABASE_URL` and `JWT_SECRET` automatically.
6. Deployment finishes with zero manual environment wiring required!

### Option B: Manual Service Setup
If you prefer configuring services individually on Render:

1. **Create PostgreSQL Database**:
   - In Render, click **New +** ➔ **PostgreSQL**.
   - Name: `exam-portal-db`
   - Region: Select preferred region (e.g., `Oregon`).
   - Copy the **Internal Database URL** once created.

2. **Create Web Service**:
   - In Render, click **New +** ➔ **Web Service**.
   - Build Command: `npm install && npm run migrate`
   - Start Command: `npm start`
   - Health Check Path: `/health`

3. **Configure Environment Variables**:
   | Variable | Value |
   | :--- | :--- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | *(Paste Internal Database URL from step 1)* |
   | `DB_SSL` | `true` |
   | `JWT_SECRET` | *(Generate a 64-char random secret)* |
   | `JWT_EXPIRES_IN`| `24h` |

4. Click **Create Web Service**. Render performs zero-downtime rolling updates on future `git push` events.

---

## 📄 License

Distributed under the **MIT License**.
>>>>>>> f7366c3e31991cec6d61af20cbf4fd91cab0b8e9
