import bcrypt from 'bcryptjs';
import { pool, closePool } from '../src/config/database.js';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

async function readHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal.');
  }

  stdout.write('Enter administrator password (minimum 12 characters): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let password = '';
    const onData = (key) => {
      if (key === '\\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (key === '\\r' || key === '\\n') {
        cleanup();
        stdout.write('\\n');
        resolve(password);
      } else if (key === '\\u007f' || key === '\\b') {
        password = password.slice(0, -1);
      } else {
        password += key;
      }
    };
    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('data', onData);
  });
}

try {
  const password = await readHiddenPassword();
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters.');
  }

  const existing = await pool.query(
    'SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
    ['admin@gmail.com']
  );

  if (existing.rowCount) {
    throw new Error(`An account already exists for admin@gmail.com (role: ${existing.rows[0].role}). No changes were made.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    `INSERT INTO users
      (full_name, email, student_id, password_hash, role, is_active)
     VALUES ($1, $2, NULL, $3, 'ADMIN', TRUE)
     RETURNING id, email, role`,
    ['Administrator', 'admin@gmail.com', passwordHash]
  );

  console.log('Administrator account created:', result.rows[0]);
} catch (error) {
  console.error('Admin creation failed:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
