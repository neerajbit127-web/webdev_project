import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/database.js';
import { generateToken } from '../src/utils/token.js';
import {
  shuffleArray,
  sanitizeQuestionsForStudent
} from '../src/controllers/studentExamController.js';

test('Student Exam Discovery & Start Workflow Suite', async (t) => {
  const app = createApp();
  let server;
  let baseUrl;

  const studentToken = generateToken({
    id: '00000000-0000-4000-a000-000000000002',
    email: 'elena.rostova@university.edu',
    fullName: 'Elena Rostova',
    role: 'STUDENT',
    studentId: 'ST-94821'
  });

  const teacherToken = generateToken({
    id: '00000000-0000-4000-a000-000000000001',
    email: 'alan.vance@university.edu',
    fullName: 'Dr. Alan Vance',
    role: 'TEACHER'
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

  const sampleExamId = '11111111-1111-4000-a000-000000000001';
  const sampleSubmissionId = '33333333-3333-4000-a000-000000000001';

  await t.test('Unit: sanitizeQuestionsForStudent strictly omits answers and explanations', () => {
    const rawQuestions = [
      {
        id: 'q1',
        question_text: 'What is quorum in Raft?',
        marks: '2.00',
        negative_marks: '0.50',
        position: 1,
        explanation: 'SUPER SECRET EXPLANATION (DO NOT LEAK)'
      },
      {
        id: 'q2',
        question_text: 'What does 2PC stand for?',
        marks: '2.00',
        negative_marks: '0.50',
        position: 2,
        explanation: 'ANOTHER SECRET EXPLANATION'
      }
    ];

    const rawOptions = {
      q1: [
        { id: 'opt1', question_id: 'q1', option_text: 'Strict majority (N/2 + 1)', is_correct: true, position: 1 },
        { id: 'opt2', question_id: 'q1', option_text: 'All nodes unanimity', is_correct: false, position: 2 }
      ],
      q2: [
        { id: 'opt3', question_id: 'q2', option_text: 'Two-Phase Commit', is_correct: true, position: 1 },
        { id: 'opt4', question_id: 'q2', option_text: 'Two-Point Check', is_correct: false, position: 2 }
      ]
    };

    const sanitized = sanitizeQuestionsForStudent(rawQuestions, rawOptions);

    assert.equal(sanitized.length, 2);

    for (const q of sanitized) {
      assert.equal(q.explanation, undefined, 'Explanation MUST be stripped from student payload');
      assert.ok(q.prompt, 'Question text must be present');
      assert.ok(q.marks !== undefined);
      assert.ok(q.options.length === 2);

      for (const opt of q.options) {
        assert.equal(opt.is_correct, undefined, 'is_correct MUST be stripped from option');
        assert.equal(opt.isCorrect, undefined, 'isCorrect MUST be stripped from option');
        assert.ok(opt.id, 'Option id must be present');
        assert.ok(opt.text, 'Option text must be present');
      }
    }
  });

  await t.test('Unit: sanitizeQuestionsForStudent preserves stable orderMapping across recovery', () => {
    const rawQuestions = [
      { id: 'q1', question_text: 'Question 1', position: 1 },
      { id: 'q2', question_text: 'Question 2', position: 2 },
      { id: 'q3', question_text: 'Question 3', position: 3 }
    ];

    const rawOptions = {
      q1: [
        { id: 'opt1_a', option_text: 'A', position: 1 },
        { id: 'opt1_b', option_text: 'B', position: 2 }
      ],
      q2: [
        { id: 'opt2_a', option_text: 'A', position: 1 },
        { id: 'opt2_b', option_text: 'B', position: 2 }
      ],
      q3: [
        { id: 'opt3_a', option_text: 'A', position: 1 },
        { id: 'opt3_b', option_text: 'B', position: 2 }
      ]
    };

    // Shuffled presentation order to persist
    const orderMapping = {
      questionOrder: ['q3', 'q1', 'q2'],
      optionOrders: {
        q1: ['opt1_b', 'opt1_a'],
        q2: ['opt2_a', 'opt2_b'],
        q3: ['opt3_b', 'opt3_a']
      }
    };

    // First call (initial delivery)
    const pass1 = sanitizeQuestionsForStudent(rawQuestions, rawOptions, orderMapping);
    assert.deepEqual(pass1.map(q => q.id), ['q3', 'q1', 'q2']);
    assert.deepEqual(pass1[0].options.map(o => o.id), ['opt3_b', 'opt3_a']);
    assert.deepEqual(pass1[1].options.map(o => o.id), ['opt1_b', 'opt1_a']);

    // Second call (session restore upon reload)
    const pass2 = sanitizeQuestionsForStudent(rawQuestions, rawOptions, orderMapping);
    assert.deepEqual(pass1, pass2, 'Session recovery must produce identical presentation order');
  });

  await t.test('Unit: shuffleArray preserves all elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffleArray(input);
    assert.equal(shuffled.length, input.length);
    assert.deepEqual([...shuffled].sort((a, b) => a - b), input);
  });

  await t.test('Auth Guard: POST /api/exams/lookup rejects unauthenticated with 401', async () => {
    const res = await fetch(`${baseUrl}/api/exams/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessCode: 'EXAM-4020' })
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });

  await t.test('Auth Guard: POST /api/exams/lookup rejects empty accessCode with 400', async () => {
    const res = await fetch(`${baseUrl}/api/exams/lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ accessCode: '' })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.error.code, 'VALIDATION_ERROR');
  });

  await t.test('Role Guard: POST /api/exams/:id/start rejects non-student roles with 403', async () => {
    const res = await fetch(`${baseUrl}/api/exams/${sampleExamId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherToken}`
      }
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.error.code, 'FORBIDDEN');
  });

  await t.test('Auth Guard: GET /api/submissions/:id rejects unauthenticated with 401', async () => {
    const res = await fetch(`${baseUrl}/api/submissions/${sampleSubmissionId}`);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.error.code, 'UNAUTHORIZED');
  });
});

