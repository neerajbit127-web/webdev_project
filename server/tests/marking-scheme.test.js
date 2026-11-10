/**
 * marking-scheme.test.js
 *
 * Test suite for:
 *   - Teacher-configurable marks per correct answer
 *   - Negative marking toggle (Yes/No)
 *   - Configurable penalty per wrong answer
 *   - Correct backend scoring calculation:
 *       Final Score = Correct Answer Marks - Wrong Answer Penalties
 *       Unanswered questions = 0
 *       Wrong answers (when disabled) = 0
 *       Floor at 0.00 (cannot be negative)
 *   - Complete breakdown in submission response:
 *       correctCount, wrongCount, unansweredCount, positiveMarksEarned, negativeMarksDeducted
 *   - Decimal penalties and old exams compatibility
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { pool, closePool } from '../src/config/database.js';
import { generateToken } from '../src/utils/token.js';

test('Marking Scheme & Negative Scoring Test Suite', async (t) => {
  const app = createApp();
  let server;
  let baseUrl;

  let hasDb = false;
  let teacherUser;
  let studentUser;

  try {
    const ping = await pool.query('SELECT 1;');
    hasDb = ping.rowCount === 1;

    if (hasDb) {
      // Fetch or ensure test fixture users in users table
      const tRes = await pool.query("SELECT id, email, full_name, role FROM users WHERE role = 'TEACHER' LIMIT 1;");
      if (tRes.rowCount > 0) {
        teacherUser = tRes.rows[0];
      } else {
        const ins = await pool.query(`
          INSERT INTO users (id, full_name, email, password_hash, role)
          VALUES ('00000000-0000-4000-a000-000000000001', 'Test Teacher', 'test.teacher@test.edu', 'hash', 'TEACHER')
          RETURNING id, email, full_name, role;
        `);
        teacherUser = ins.rows[0];
      }

      const sRes = await pool.query("SELECT id, email, full_name, role, student_id FROM users WHERE role = 'STUDENT' LIMIT 1;");
      if (sRes.rowCount > 0) {
        studentUser = sRes.rows[0];
      } else {
        const ins = await pool.query(`
          INSERT INTO users (id, full_name, email, student_id, password_hash, role)
          VALUES ('00000000-0000-4000-a000-000000000002', 'Test Student', 'test.student@test.edu', 'ST-TEST1', 'hash', 'STUDENT')
          RETURNING id, email, full_name, role, student_id;
        `);
        studentUser = ins.rows[0];
      }
    }
  } catch (_) {
    hasDb = false;
  }

  const teacherToken = generateToken({
    id: teacherUser?.id || '00000000-0000-4000-a000-000000000001',
    email: teacherUser?.email || 'alan.vance@university.edu',
    fullName: teacherUser?.full_name || 'Dr. Alan Vance',
    role: 'TEACHER'
  });

  const studentToken = generateToken({
    id: studentUser?.id || '00000000-0000-4000-a000-000000000002',
    email: studentUser?.email || 'elena.rostova@university.edu',
    fullName: studentUser?.full_name || 'Elena Rostova',
    role: 'STUDENT',
    studentId: studentUser?.student_id || 'ST-94821'
  });

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  async function api(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  /* ──────────────────────────────────────────────────────────────────────────
     1. Unit & Endpoint: Teacher Exam Creation with Configurable Marking Scheme
     ────────────────────────────────────────────────────────────────────────── */

  await t.test('POST /api/exams creates draft with negative marking enabled & custom penalty', async () => {
    if (!hasDb) return;

    const res = await api('POST', '/api/exams', {
      token: teacherToken,
      body: {
        title: 'Algorithms Midterm with Penalty',
        durationMinutes: 45,
        marksPerQuestion: 4.0,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 1.0,
        publishImmediately: true,
        questions: [
          {
            prompt: 'What is O(1)?',
            options: [
              { text: 'Constant time', isCorrect: true },
              { text: 'Linear time', isCorrect: false }
            ]
          },
          {
            prompt: 'What is O(N)?',
            options: [
              { text: 'Quadratic time', isCorrect: false },
              { text: 'Linear time', isCorrect: true }
            ]
          }
        ]
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(parseFloat(res.body.data.totalMarks), 8.0); // 2 questions * 4 marks

    const examId = res.body.data.id;
    const { rows: examRows } = await pool.query(
      'SELECT negative_marking_enabled, negative_marks_per_wrong_answer FROM exams WHERE id = $1;',
      [examId]
    );
    assert.equal(examRows[0].negative_marking_enabled, true);
    assert.equal(parseFloat(examRows[0].negative_marks_per_wrong_answer), 1.0);

    const { rows: qRows } = await pool.query(
      'SELECT marks, negative_marks FROM questions WHERE exam_id = $1;',
      [examId]
    );
    assert.equal(qRows.length, 2);
    for (const q of qRows) {
      assert.equal(parseFloat(q.marks), 4.0);
      assert.equal(parseFloat(q.negative_marks), 1.0);
    }
  });

  /* ──────────────────────────────────────────────────────────────────────────
     2. Student Pre-Exam Lookup: Exposes marking scheme without revealing answers
     ────────────────────────────────────────────────────────────────────────── */

  await t.test('POST /api/exams/lookup returns negative marking info without answers', async () => {
    if (!hasDb) return;

    const createRes = await api('POST', '/api/exams', {
      token: teacherToken,
      body: {
        title: 'Physics Test - Lookup Check',
        durationMinutes: 30,
        marksPerQuestion: 2.5,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 0.5,
        publishImmediately: true,
        questions: [
          {
            prompt: 'Unit of force?',
            options: [
              { text: 'Newton', isCorrect: true },
              { text: 'Joule', isCorrect: false }
            ]
          }
        ]
      }
    });

    const accessCode = createRes.body.data.accessCode;

    const lookupRes = await api('POST', '/api/exams/lookup', {
      token: studentToken,
      body: { accessCode }
    });

    assert.equal(lookupRes.status, 200);
    assert.equal(lookupRes.body.success, true);
    assert.equal(lookupRes.body.data.negativeMarkingEnabled, true);
    assert.equal(parseFloat(lookupRes.body.data.negativeMarksPerWrongAnswer), 0.5);
    // Answers must not be present
    assert.equal(lookupRes.body.data.questions, undefined);
  });

  /* ──────────────────────────────────────────────────────────────────────────
     3. Backend Scoring: Negative Marking ENABLED with Decimal Penalty
     ────────────────────────────────────────────────────────────────────────── */

  await t.test('Scoring: Correct deduction when negative marking is enabled', async () => {
    if (!hasDb) return;

    // Create a new dedicated student for this test attempt
    const rand = Math.random().toString(36).substring(2, 9);
    const newStudent = await pool.query(`
      INSERT INTO users (id, full_name, email, student_id, password_hash, role)
      VALUES (gen_random_uuid(), 'Student Scoring 1', $1, $2, 'hash', 'STUDENT')
      RETURNING id, email, full_name, role, student_id;
    `, [`student_${rand}@test.edu`, `ST-${rand}`]);
    const dedicatedStudentToken = generateToken(newStudent.rows[0]);

    // Create Exam: 3 questions, 2.0 marks each, 0.5 penalty per wrong answer
    // Student: 1 correct, 1 wrong, 1 unanswered
    // Expected:
    //   Positive marks: +2.0
    //   Penalty deducted: -0.5
    //   Unanswered: 0
    //   Final score: 2.0 - 0.5 = 1.50
    const examRes = await api('POST', '/api/exams', {
      token: teacherToken,
      body: {
        title: 'Negative Marking Math Test',
        durationMinutes: 30,
        marksPerQuestion: 2.0,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 0.5,
        publishImmediately: true,
        questions: [
          {
            prompt: 'Q1: 2 + 2 = ?',
            options: [
              { text: '4', isCorrect: true },
              { text: '5', isCorrect: false }
            ]
          },
          {
            prompt: 'Q2: 3 * 3 = ?',
            options: [
              { text: '9', isCorrect: true },
              { text: '8', isCorrect: false }
            ]
          },
          {
            prompt: 'Q3: 10 / 2 = ?',
            options: [
              { text: '5', isCorrect: true },
              { text: '6', isCorrect: false }
            ]
          }
        ]
      }
    });

    const examId = examRes.body.data.id;

    // Start student attempt
    const startRes = await api('POST', `/api/exams/${examId}/start`, {
      token: dedicatedStudentToken
    });

    assert.ok([200, 201].includes(startRes.status));
    const subId = startRes.body.data.submissionId;
    const questions = startRes.body.data.questions;

    // Q1: Correct answer (option '4')
    const q1 = questions[0];
    const q1Options = await pool.query('SELECT id, is_correct FROM options WHERE question_id = $1;', [q1.id]);
    const q1Correct = q1Options.rows.find(o => o.is_correct).id;
    await api('PUT', `/api/submissions/${subId}/answers/${q1.id}`, {
      token: dedicatedStudentToken,
      body: { selectedOptionId: q1Correct }
    });

    // Q2: Wrong answer (option '8')
    const q2 = questions[1];
    const q2Options = await pool.query('SELECT id, is_correct FROM options WHERE question_id = $1;', [q2.id]);
    const q2Wrong = q2Options.rows.find(o => !o.is_correct).id;
    await api('PUT', `/api/submissions/${subId}/answers/${q2.id}`, {
      token: dedicatedStudentToken,
      body: { selectedOptionId: q2Wrong }
    });

    // Q3: Unanswered (no PUT)

    // Submit exam
    const submitRes = await api('POST', `/api/submissions/${subId}/submit`, {
      token: dedicatedStudentToken,
      body: { reason: 'MANUAL' }
    });

    assert.equal(submitRes.status, 200);
    const data = submitRes.body.data;

    assert.equal(data.correctCount, 1);
    assert.equal(data.wrongCount, 1);
    assert.equal(data.unansweredCount, 1);
    assert.equal(data.totalQuestions, 3);
    assert.equal(parseFloat(data.positiveMarksEarned), 2.0);
    assert.equal(parseFloat(data.negativeMarksDeducted), 0.5);
    assert.equal(parseFloat(data.totalScore), 1.5); // 2.0 - 0.5 = 1.50
    assert.equal(parseFloat(data.percentage), 25.0); // 1.5 / 6.0 = 25%
  });

  /* ──────────────────────────────────────────────────────────────────────────
     4. Backend Scoring: Negative Marking DISABLED (wrong = 0)
     ────────────────────────────────────────────────────────────────────────── */

  await t.test('Scoring: Wrong answers receive 0 penalty when negative marking is disabled', async () => {
    if (!hasDb) return;

    const rand2 = Math.random().toString(36).substring(2, 9);
    const newStudent = await pool.query(`
      INSERT INTO users (id, full_name, email, student_id, password_hash, role)
      VALUES (gen_random_uuid(), 'Student Scoring 2', $1, $2, 'hash', 'STUDENT')
      RETURNING id, email, full_name, role, student_id;
    `, [`student_${rand2}@test.edu`, `ST-${rand2}`]);
    const dedicatedStudentToken = generateToken(newStudent.rows[0]);

    // Create Exam: Negative marking DISABLED
    const examRes = await api('POST', '/api/exams', {
      token: teacherToken,
      body: {
        title: 'Standard Test - No Negative Marking',
        durationMinutes: 30,
        marksPerQuestion: 3.0,
        negativeMarkingEnabled: false,
        negativeMarksPerWrongAnswer: 0.0,
        publishImmediately: true,
        questions: [
          {
            prompt: 'Q1?',
            options: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
          },
          {
            prompt: 'Q2?',
            options: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
          }
        ]
      }
    });

    const examId = examRes.body.data.id;

    const startRes = await api('POST', `/api/exams/${examId}/start`, { token: dedicatedStudentToken });
    assert.ok([200, 201].includes(startRes.status));
    const subId = startRes.body.data.submissionId;
    const questions = startRes.body.data.questions;

    // Q1: Right
    const q1Opts = await pool.query('SELECT id, is_correct FROM options WHERE question_id = $1;', [questions[0].id]);
    await api('PUT', `/api/submissions/${subId}/answers/${questions[0].id}`, {
      token: dedicatedStudentToken,
      body: { selectedOptionId: q1Opts.rows.find(o => o.is_correct).id }
    });

    // Q2: Wrong
    const q2Opts = await pool.query('SELECT id, is_correct FROM options WHERE question_id = $1;', [questions[1].id]);
    await api('PUT', `/api/submissions/${subId}/answers/${questions[1].id}`, {
      token: dedicatedStudentToken,
      body: { selectedOptionId: q2Opts.rows.find(o => !o.is_correct).id }
    });

    const submitRes = await api('POST', `/api/submissions/${subId}/submit`, { token: dedicatedStudentToken });
    assert.equal(submitRes.status, 200);
    const d = submitRes.body.data;

    assert.equal(d.correctCount, 1);
    assert.equal(d.wrongCount, 1);
    assert.equal(d.unansweredCount, 0);
    assert.equal(parseFloat(d.positiveMarksEarned), 3.0);
    assert.equal(parseFloat(d.negativeMarksDeducted), 0.0);
    assert.equal(parseFloat(d.totalScore), 3.0); // 3.0 - 0 = 3.0
  });

  /* ──────────────────────────────────────────────────────────────────────────
     5. Backend Scoring: Floor at 0.00 (Penalties Exceeding Positive Marks)
     ────────────────────────────────────────────────────────────────────────── */

  await t.test('Scoring: Score is floored at 0.00 when penalties exceed positive marks', async () => {
    if (!hasDb) return;

    const rand3 = Math.random().toString(36).substring(2, 9);
    const newStudent = await pool.query(`
      INSERT INTO users (id, full_name, email, student_id, password_hash, role)
      VALUES (gen_random_uuid(), 'Student Scoring 3', $1, $2, 'hash', 'STUDENT')
      RETURNING id, email, full_name, role, student_id;
    `, [`student_${rand3}@test.edu`, `ST-${rand3}`]);
    const dedicatedStudentToken = generateToken(newStudent.rows[0]);

    // Exam with 2 questions, 1 mark each, 1.0 penalty
    // Student answers BOTH wrong: positive = 0, penalty = 2.0 => score = max(0, -2.0) = 0.00
    const examRes = await api('POST', '/api/exams', {
      token: teacherToken,
      body: {
        title: 'Floor Zero Test',
        durationMinutes: 30,
        marksPerQuestion: 1.0,
        negativeMarkingEnabled: true,
        negativeMarksPerWrongAnswer: 1.0,
        publishImmediately: true,
        questions: [
          {
            prompt: 'Q1?',
            options: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
          },
          {
            prompt: 'Q2?',
            options: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }]
          }
        ]
      }
    });

    const examId = examRes.body.data.id;
    const startRes = await api('POST', `/api/exams/${examId}/start`, { token: dedicatedStudentToken });
    assert.ok([200, 201].includes(startRes.status));
    const subId = startRes.body.data.submissionId;
    const questions = startRes.body.data.questions;

    // Answer both wrong
    for (const q of questions) {
      const opts = await pool.query('SELECT id, is_correct FROM options WHERE question_id = $1;', [q.id]);
      await api('PUT', `/api/submissions/${subId}/answers/${q.id}`, {
        token: dedicatedStudentToken,
        body: { selectedOptionId: opts.rows.find(o => !o.is_correct).id }
      });
    }

    const submitRes = await api('POST', `/api/submissions/${subId}/submit`, { token: dedicatedStudentToken });
    assert.equal(submitRes.status, 200);
    const d = submitRes.body.data;

    assert.equal(d.correctCount, 0);
    assert.equal(d.wrongCount, 2);
    assert.equal(parseFloat(d.positiveMarksEarned), 0.0);
    assert.equal(parseFloat(d.negativeMarksDeducted), 2.0);
    assert.equal(parseFloat(d.totalScore), 0.0); // Floored at 0, cannot violate CHECK (total_score >= 0.00)
    assert.equal(parseFloat(d.percentage), 0.0);
  });
});
