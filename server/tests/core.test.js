import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateExamMetadata,
  validateQuestionsForPublishing
} from '../src/services/examService.js';
import {
  sanitizeQuestionsForStudent,
  shuffleArray
} from '../src/controllers/studentExamController.js';

test('exam metadata accepts valid title and duration', () => {
  assert.deepEqual(
    validateExamMetadata({ title: 'Data Structures', durationMinutes: 60, passingMarks: 20 }),
    { isValid: true }
  );
});

test('exam metadata rejects invalid duration and short titles', () => {
  assert.equal(validateExamMetadata({ title: 'DS', durationMinutes: 60 }).isValid, false);
  assert.equal(validateExamMetadata({ title: 'Data Structures', durationMinutes: 0 }).isValid, false);
  assert.equal(validateExamMetadata({ title: 'Data Structures', durationMinutes: 1441 }).isValid, false);
});

test('publishing rejects empty or invalid questions', () => {
  assert.equal(validateQuestionsForPublishing([]).canPublish, false);
  assert.equal(validateQuestionsForPublishing([{ prompt: 'Question?', options: ['A', 'B'] }]).canPublish, false);
  assert.equal(validateQuestionsForPublishing([{
    prompt: 'Question?',
    options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }]
  }]).canPublish, true);
});

test('publishing supports parser correctIndex question format', () => {
  assert.equal(validateQuestionsForPublishing([{
    prompt: 'Question?',
    correctIndex: 1,
    options: ['A', 'B']
  }]).canPublish, true);
});

test('student question payload never exposes answer keys or explanations', () => {
  const questions = [{
    id: 'q1',
    question_text: '2 + 2?',
    question_type: 'SINGLE_CHOICE',
    marks: '2',
    negative_marks: '0.5',
    position: 1,
    explanation: 'The answer is four.',
    is_correct: true
  }];
  const options = {
    q1: [
      { id: 'o1', option_text: '3', position: 1, is_correct: false },
      { id: 'o2', option_text: '4', position: 2, is_correct: true }
    ]
  };

  const [safeQuestion] = sanitizeQuestionsForStudent(questions, options);
  assert.deepEqual(Object.keys(safeQuestion).sort(), [
    'id', 'marks', 'negativeMarks', 'options', 'position', 'prompt', 'questionType'
  ]);
  assert.equal('explanation' in safeQuestion, false);
  assert.equal('is_correct' in safeQuestion.options[1], false);
  assert.deepEqual(safeQuestion.options.map(option => option.text), ['3', '4']);
});

test('question and option ordering is preserved from attempt mapping', () => {
  const questions = [
    { id: 'q1', question_text: 'First', position: 1 },
    { id: 'q2', question_text: 'Second', position: 2 }
  ];
  const options = {
    q1: [
      { id: 'a', option_text: 'A', position: 1 },
      { id: 'b', option_text: 'B', position: 2 }
    ],
    q2: []
  };

  const result = sanitizeQuestionsForStudent(questions, options, {
    questionOrder: ['q2', 'q1'],
    optionOrders: { q1: ['b', 'a'] }
  });

  assert.deepEqual(result.map(question => question.id), ['q2', 'q1']);
  assert.deepEqual(result[1].options.map(option => option.id), ['b', 'a']);
});

test('shuffleArray returns a permutation without mutating its input', () => {
  const input = [1, 2, 3, 4, 5];
  const shuffled = shuffleArray(input);
  assert.deepEqual([...shuffled].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.notEqual(shuffled, input);
});
