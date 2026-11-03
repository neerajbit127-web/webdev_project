import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';
import { generateToken } from '../src/utils/token.js';
import {
  generateSecureAccessCode,
  validateExamMetadata,
  validateQuestionsForPublishing
} from '../src/services/examService.js';

test('Teacher Exam Management Backend Suite', async (t) => {
  const app = createApp();
  let server;
  let baseUrl;

  const teacherToken = generateToken({
    id: '00000000-0000-4000-a000-000000000001',
    email: 'alan.vance@university.edu',
    fullName: 'Dr. Alan Vance',
    role: 'TEACHER'
  });

  const studentToken = generateToken({
    id: '00000000-0000-4000-a000-000000000002',
    email: 'elena.rostova@university.edu',
    fullName: 'Elena Rostova',
    role: 'STUDENT',
    studentId: 'ST-94821'
  });

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  await t.test('Unit: validateExamMetadata correctly validates inputs', () => {
    // Valid input
    assert.equal(validateExamMetadata({ title: 'CS101 Final Exam', durationMinutes: 60 }).isValid, true);

    // Too short title
    const shortTitle = validateExamMetadata({ title: 'AB', durationMinutes: 60 });
    assert.equal(shortTitle.isValid, false);
    assert.match(shortTitle.error, /at least 3 characters/);

    // Invalid duration
    const badDuration = validateExamMetadata({ title: 'CS101 Final Exam', durationMinutes: 0 });
    assert.equal(badDuration.isValid, false);
    assert.match(badDuration.error, /between 1 and 1440/);

    // Bad schedule
    const badSchedule = validateExamMetadata({
      title: 'CS101 Final',
      durationMinutes: 60,
      startTime: '2026-11-05T10:00:00Z',
      endTime: '2026-11-04T10:00:00Z'
    });
    assert.equal(badSchedule.isValid, false);
    assert.match(badSchedule.error, /start time must precede end time/);
  });

  await t.test('Unit: validateQuestionsForPublishing rejects empty exams and invalid options', () => {
    // Zero questions
    const zeroQ = validateQuestionsForPublishing([]);
    assert.equal(zeroQ.canPublish, false);
    assert.match(zeroQ.error, /zero questions/);

    // Question with fewer than 2 options
    const singleOpt = validateQuestionsForPublishing([
      { prompt: 'What is Raft?', options: ['Consensus'] }
    ]);
    assert.equal(singleOpt.canPublish, false);
    assert.match(singleOpt.error, /at least 2 options/);

    // Question with no correct answer
    const noCorrect = validateQuestionsForPublishing([
      {
        prompt: 'What is Raft?',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: false }
        ]
      }
    ]);
    assert.equal(noCorrect.canPublish, false);
    assert.match(noCorrect.error, /designated correct answer/);

    // Valid questions
    const valid = validateQuestionsForPublishing([
      {
        prompt: 'What is Raft?',
        options: [
          { text: 'Consensus algorithm', isCorrect: true },
          { text: 'Relational DB', isCorrect: false }
        ]
      }
    ]);
    assert.equal(valid.canPublish, true);
  });

  await t.test('Unit: generateSecureAccessCode generates format EXAM-XXXX', async () => {
    // Mock DB client returning no collision
    const mockClient = {
      query: async () => ({ rowCount: 0 })
    };
    const code = await generateSecureAccessCode(mockClient);
    assert.match(code, /^EXAM-\d{4,6}$/);
  });

  await t.test('Auth Guard: GET /api/exams/mine rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/exams/mine`);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  await t.test('Role Guard: Student role receives 403 Forbidden on teacher endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/exams/mine`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  await t.test('Validation Guard: POST /api/exams rejects invalid metadata with 400', async () => {
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        title: 'X', // too short
        durationMinutes: 45
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  await t.test('Validation Guard: POST /api/exams with publishImmediately=true rejects empty questions', async () => {
    const res = await fetch(`${baseUrl}/api/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        title: 'Distributed Systems Final',
        durationMinutes: 45,
        publishImmediately: true,
        questions: []
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'CANNOT_PUBLISH_EMPTY_EXAM');
  });

  await t.test('Auth: POST /api/auth/login never issues an unprovisioned demo account token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'alan.vance@university.edu',
        password: 'password123',
        role: 'TEACHER'
      })
    });

    assert.ok([401, 503].includes(res.status), `Expected fail-closed response, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.data, undefined);
  });
});

