# ExamPortal

An online examination portal built with vanilla HTML/CSS/JavaScript, Node.js, Express, and PostgreSQL.

## Active application layout

- `client/` — browser UI served by the Express application.
- `server/src/` — active Express API, middleware, controllers, and database configuration.
- `server/migrations/` — versioned PostgreSQL migrations.
- `server/scripts/` — migration and account-provisioning commands.
- `server/tests/` — Node.js test suite.

The root `src/`, `public/`, and legacy root-level HTML/JS files are older copies. The active server serves `client/`; make frontend changes there.

## Requirements

- Node.js 18 or newer
- npm
- PostgreSQL 14 or newer

## Local setup (Windows PowerShell)

1. Clone the repository and enter its directory:

   ```powershell
   git clone https://github.com/yatharthrohida/ExamPortal.git
   cd ExamPortal
   ```

2. Install Node.js 18+ and PostgreSQL 14+. Ensure `node`, `npm`, `psql`, and `createdb` are available in PowerShell. If PostgreSQL tools are missing, add the PostgreSQL `bin` directory (usually `C:\Program Files\PostgreSQL\<version>\bin`) to PATH and reopen PowerShell.

3. **Recommended: run the interactive setup script.** It creates the local database if needed, writes `server/.env`, installs dependencies, applies migrations, creates teacher/student accounts, and runs backend tests. It asks for your PostgreSQL connection and account credentials; password input is hidden.

   ```powershell
   .\server\scripts\setup-local.ps1
   ```

   If PowerShell blocks local scripts, run this in the current terminal and then rerun the script:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

   If you prefer manual setup, continue with step 4 instead.

4. Install backend dependencies:

   ```powershell
   npm run install:server
   ```

5. Create the PostgreSQL database (using a PostgreSQL superuser):

   ```powershell
   createdb -U postgres exam_portal_db
   ```

   Alternatively, in `psql` run `CREATE DATABASE exam_portal_db;`.

6. Create and configure the server environment file:

   ```powershell
   Copy-Item server/.env.example server/.env
   ```

   The template leaves `DATABASE_URL` blank, so set `DB_PASSWORD` to your local PostgreSQL password and keep the default `DB_HOST`, `DB_PORT`, `DB_NAME`, and `DB_USER` values. Alternatively, set `DATABASE_URL` to your full PostgreSQL connection string; it takes precedence over the individual `DB_*` settings. Set `CLIENT_ORIGIN=http://localhost:5000` for the bundled frontend.

   Add these account values to `server/.env` (use unique passwords of at least 12 characters):

   ```env
   SEED_TEACHER_NAME=ExamPortal Teacher
   SEED_TEACHER_EMAIL=teacher@example.com
   SEED_TEACHER_PASSWORD=replace_with_a_long_unique_password
   SEED_STUDENT_NAME=ExamPortal Student
   SEED_STUDENT_EMAIL=student@example.com
   SEED_STUDENT_ID=ST-00001
   SEED_STUDENT_PASSWORD=replace_with_another_long_unique_password
   ```

7. Apply the schema and create the accounts:

   ```powershell
   npm run migrate
   npm run seed
   npm test
   ```

8. Start the application:

   ```powershell
   npm run dev
   ```

   Open [http://localhost:5000](http://localhost:5000). Check [http://localhost:5000/api/health](http://localhost:5000/api/health) for API and database status. For a normal start without file watching, use `npm start`.


## Useful commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run install:server` | Install backend dependencies |
| `npm run dev` | Start API and bundled frontend in watch mode |
| `npm start` | Start API normally |
| `npm run migrate` | Apply pending database migrations |
| `npm run migrate:status` | Show applied and pending migrations |
| `npm run migrate:rollback` | Roll back the latest migration batch |
| `npm run seed` | Provision teacher/student accounts from environment variables |
| `npm test` | Run the backend test suite |

## API overview

All protected endpoints use `Authorization: Bearer <token>`.

- `POST /api/auth/login` — authenticate an existing account.
- `GET /api/auth/me` — read the authenticated profile.
- `GET /api/health` — API and PostgreSQL health.
- `GET /api/exams/mine` — list the authenticated teacher's exams.
- `POST /api/exams` — create a teacher exam.
- `POST /api/exams/lookup` — look up a published exam by access code.
- `POST /api/exams/:id/start` — start or resume a student attempt.
- `GET /api/submissions/:id/state` — retrieve attempt state.
- `PUT /api/submissions/:id/answers/:questionId` — save or clear an answer.
- `POST /api/submissions/:id/submit` — submit and score an attempt.
- `POST /api/submissions/:id/integrity-event` — record a proctoring event.

See `server/src/routes/` for the authoritative route definitions.

## Security notes

- Do not commit `.env` files, database passwords, JWT secrets, or real student data.
- Use a unique, high-entropy `JWT_SECRET` in production (at least 32 characters).
- Authentication requires an active database user and a valid password. There is no offline/demo login bypass.
- The client receives sanitized question and option data; correct-answer flags are intended to remain server-side.
- The tab/focus telemetry is a deterrent and audit signal, not a guarantee against cheating.

## Deployment

The Render blueprint is `render.yaml`. Deployments must install dependencies from `server/`, run migrations from `server/`, and start `server/src/server.js`. The health-check path is `/api/health`. Configure `DATABASE_URL`, `JWT_SECRET`, and the production `CLIENT_ORIGIN` in the hosting environment.

## Tests and verification

Run `npm test` after installing dependencies. Tests that require PostgreSQL need a running database and a configured `server/.env`. A passing test suite does not replace a manual end-to-end check using a real teacher account, a published exam, and a student account.
