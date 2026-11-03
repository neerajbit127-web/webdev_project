import bcrypt from 'bcryptjs';
import { pool, closePool } from '../src/config/database.js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function upsertUser({ fullName, email, studentId = null, password, role }) {
  if (password.length < 12) {
    throw new Error(`${role} password must contain at least 12 characters.`);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (full_name, email, student_id, password_hash, role, is_active)
     VALUES ($1, LOWER($2), $3, $4, $5, TRUE)
     ON CONFLICT (LOWER(email)) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           student_id = EXCLUDED.student_id,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = TRUE,
           updated_at = CURRENT_TIMESTAMP;`,
    [fullName, email, studentId, passwordHash, role]
  );
}

async function main() {
  await upsertUser({
    fullName: process.env.SEED_TEACHER_NAME || 'ExamPortal Teacher',
    email: required('SEED_TEACHER_EMAIL'),
    password: required('SEED_TEACHER_PASSWORD'),
    role: 'TEACHER'
  });

  await upsertUser({
    fullName: process.env.SEED_STUDENT_NAME || 'ExamPortal Student',
    email: required('SEED_STUDENT_EMAIL'),
    studentId: required('SEED_STUDENT_ID'),
    password: required('SEED_STUDENT_PASSWORD'),
    role: 'STUDENT'
  });

  console.log('[SEED] Teacher and student accounts created/updated successfully.');
}

main()
  .catch((error) => {
    console.error('[SEED FAILED]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
