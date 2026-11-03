# 🎓 ExamPortal — Enterprise Online Examination & Assessment Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.21+-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Render-Zero_Downtime-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)
[![JWT](https://img.shields.io/badge/JWT-Secure_Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **ExamPortal** is an enterprise-grade, high-concurrency online examination platform engineered with **Node.js, Express, and PostgreSQL**. Features automated document ingestion (PDF/DOCX), client session recovery, real-time proctoring telemetry, server-enforced auto-submission, and turnkey deployment for **Render Web Services and Render PostgreSQL**.

---

## 📑 Table of Contents

- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Key Features](#-key-features)
  - [Teacher Portal & Assessment Orchestration](#teacher-portal--assessment-orchestration)
  - [Student Test Engine](#student-test-engine)
  - [Anti-Cheat & Proctoring Telemetry](#anti-cheat--proctoring-telemetry)
- [Project Directory Structure](#-project-directory-structure)
- [Database Schema & Migrations](#-database-schema--migrations)
- [API Reference](#-api-reference)
- [Local Setup & Installation](#-local-setup--installation)
- [Render Deployment Guide (Zero-Downtime)](#-render-deployment-guide-zero-downtime)
- [License](#-license)

---

## 🏛️ System Architecture & Data Flow

```text
+---------------------------------------------------------------------------------------------------------+
|                                           TEACHER WORKFLOW                                              |
|                                                                                                         |
|  [Exam File]                                                                                            |
|   (PDF/DOCX)                                                                                            |
|       |                                                                                                 |
|       v                                                                                                 |
|  +--------------------+      +--------------------+      +--------------------+      +---------------+  |
|  | Multer File Upload | ---> | Parser Pipeline    | ---> | Draft Staging &    | ---> | PostgreSQL    |  |
|  | (/api/exams/parse) |      | (pdf-parse/mammoth)|      | Teacher Review     |      | Database      |  |
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
|  | Candidate Browser  | ================================> | Express API Server |                        |
|  | (Vanilla HTML/CSS) | <================================ | (/api/exams/:code/start)                    |
|  +--------------------+   Sanitized Payload (No Answers)  +--------------------+                        |
|      |          ^                                                   |                                   |
|      |          | Local Cache Fallback                              | Initializes Session               |
|      |          v                                                   v                                   |
|      |    +--------------------+                          +--------------------+                        |
|      |    | LocalStorage State |                          | submissions Table  |                        |
|      |    | (Answers & Timers) |                          | started_at = NOW() |                        |
|      |    +--------------------+                          +--------------------+                        |
|      |                                                              |                                   |
|      |-- Continuous Telemetry (Tab Switch / Blur) ----------------->| Updates integrity_log             |
|      |   (/api/submissions/:id/telemetry)                           | & tab_switch_count                |
|      |                                                              |                                   |
|      +-- Manual Submit OR Auto-Submit at 00:00:00 ----------------->|                                   |
|          (/api/submissions/:id/submit)                              v                                   |
|                                                           +--------------------+                        |
|                                                           | Evaluation Engine  |                        |
|                                                           | - Duration check   |                        |
|                                                           | - Match answer key |                        |
|                                                           | - Negative marking |                        |
|                                                           +--------------------+                        |
|                                                                     |                                   |
|                                                                     v                                   |
|                                                           +--------------------+                        |
|                                                           | Results & Audit Log|                        |
|                                                           | Table (Graded)     |                        |
|                                                           +--------------------+                        |
+---------------------------------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

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

---

## 📂 Project Directory Structure

```text
exam-portal/
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
└── README.md
```

---

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

---

## 📡 API Reference

All protected routes require the HTTP Header:
`Authorization: Bearer <JWT_ACCESS_TOKEN>`

### Authentication Endpoints

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | `Public` | Register candidate or faculty account. |
| `POST` | `/api/auth/login` | `Public` | Authenticate credentials; returns signed JWT. |
| `GET` | `/api/auth/me` | `Authenticated` | Return active authenticated user profile. |

### Teacher Exam Management

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/exams/parse-document` | `Teacher` | Ingest `.pdf` or `.docx` for stream text parsing. |
| `POST` | `/api/exams` | `Teacher` | Create exam and generate unique access code (`EXAM-XXXX`). |
| `GET` | `/api/exams/teacher` | `Teacher` | List all exams created by authenticated teacher. |

### Student Test Engine

| Method | Endpoint | Access Role | Description |
| :--- | :--- | :--- | :--- |
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
