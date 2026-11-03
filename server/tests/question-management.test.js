import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';
import { generateToken } from '../src/utils/token.js';

test('Question Management Suite for Teacher Exam Drafts', async (t) => {
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
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const fakeExamId = '11111111-1111-4000-a000-000000000001';
  const fakeQuestionId = '22222222-2222-4000-a000-000000000001';

  await t.test('Auth: Reject unauthenticated request to POST /api/exams/:id/questions', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionText: 'Test Question',
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }]
      })
    });

    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  await t.test('Role: Reject student role from creating or modifying questions with 403', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        questionText: 'Student trying to add question',
        options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }]
      })
    });

    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  await t.test('Validation: Reject question with fewer than 2 options', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        questionText: 'Single option question?',
        options: [{ text: 'Only one option', isCorrect: true }]
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'INVALID_OPTIONS_COUNT');
  });

  await t.test('Validation: Reject option with empty text', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        questionText: 'Valid question text?',
        options: [
          { text: 'Option A', isCorrect: true },
          { text: '   ', isCorrect: false }
        ]
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'EMPTY_OPTION_TEXT');
  });

  await t.test('Validation: Reject question with missing correct option (0 correct)', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        questionText: 'Who created Linux?',
        options: [
          { text: 'Linus Torvalds', isCorrect: false },
          { text: 'Bill Gates', isCorrect: false }
        ]
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'MISSING_CORRECT_OPTION');
  });

  await t.test('Validation: Reject question with multiple correct options in SINGLE_CHOICE', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        questionText: 'Which are operating systems?',
        questionType: 'SINGLE_CHOICE',
        options: [
          { text: 'Linux', isCorrect: true },
          { text: 'FreeBSD', isCorrect: true }
        ]
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'MULTIPLE_CORRECT_OPTIONS');
  });

  await t.test('Validation: Reorder rejects empty or non-array questionIds', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${fakeExamId}/questions/reorder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        questionIds: []
      })
    });

    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });
});

