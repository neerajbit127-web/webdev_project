import { pool } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { sanitizeQuestionsForStudent } from './studentExamController.js';

/* ─────────────────────────────────────────────────────────────────────────────
   Internal helpers
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Acquires a PostgreSQL client and converts connection failures into a stable
 * API response instead of an unhandled async rejection (Express 4).
 */
async function connectOrRespond(res) {
  try {
    return await pool.connect();
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      sendError(res, {
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection unavailable.'
      });
      return null;
    }
    throw error;
  }
}

/** Verify ownership and return the submission row, or send an error. */
async function fetchOwnedSubmission(client, submissionId, currentUserId, isAdmin) {
  const { rows } = await client.query(
    `SELECT s.*, e.title AS exam_title, e.batch, e.duration_minutes,
            e.total_marks, e.passing_marks,
            e.negative_marking_enabled, e.negative_marks_per_wrong_answer,
            CURRENT_TIMESTAMP AS server_time,
            EXTRACT(EPOCH FROM (s.deadline_at - CURRENT_TIMESTAMP))::int AS remaining_seconds
       FROM submissions s
       JOIN exams e ON e.id = s.exam_id
      WHERE s.id = $1
      LIMIT 1;`,
    [submissionId]
  );
  return rows[0] || null;
}

/** Trigger auto-submission in place (without re-opening its own transaction). */
async function autoSubmitIfExpired(client, sub) {
  if (sub.status !== 'IN_PROGRESS') return sub.status;
  const remaining = Math.max(0, parseInt(sub.remaining_seconds ?? 0, 10));
  if (remaining > 0) return sub.status;

  // Score and mark AUTO_SUBMITTED inside the same transaction the caller opened
  await scoreAndFinalise(client, sub, 'AUTO_SUBMITTED');
  return 'AUTO_SUBMITTED';
}

/**
 * Server-side scoring routine.
 * Reads questions + options (is_correct) for the exam, then upserts
 * is_correct / awarded_marks in submission_answers, and writes the
 * aggregate back to submissions.
 *
 * MUST be called inside an open transaction; the caller must COMMIT.
 */
async function scoreAndFinalise(client, sub, finalStatus) {
  // Fetch all questions for this exam
  const { rows: questions } = await client.query(
    `SELECT id, marks, negative_marks FROM questions WHERE exam_id = $1;`,
    [sub.exam_id]
  );

  // Fetch correct options per question
  const qIds = questions.map(q => q.id);
  const { rows: correctOpts } = await client.query(
    `SELECT question_id, id AS option_id FROM options WHERE question_id = ANY($1::uuid[]) AND is_correct = true;`,
    [qIds]
  );
  const correctByQuestion = {};
  for (const row of correctOpts) {
    correctByQuestion[row.question_id] = row.option_id;
  }

  // Fetch student's saved answers
  const { rows: savedAnswers } = await client.query(
    `SELECT question_id, selected_option_id FROM submission_answers WHERE submission_id = $1;`,
    [sub.id]
  );
  const answerByQuestion = {};
  for (const row of savedAnswers) {
    answerByQuestion[row.question_id] = row.selected_option_id;
  }

  // Score each question
  let totalScore = 0;

  for (const q of questions) {
    const selected = answerByQuestion[q.id] ?? null;
    const correct = correctByQuestion[q.id] ?? null;
    let awardedMarks = 0;
    let isCorrect = false;

    if (selected !== null) {
      if (selected === correct) {
        awardedMarks = parseFloat(q.marks);
        isCorrect = true;
      } else {
        // Wrong answers receive zero marks; no negative marking is applied.
        awardedMarks = 0;
        isCorrect = false;
      }
    }

    totalScore += awardedMarks;

    // Upsert submission_answer marks
    await client.query(
      `INSERT INTO submission_answers (submission_id, question_id, selected_option_id, is_correct, awarded_marks, answered_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (submission_id, question_id) DO UPDATE
           SET is_correct = EXCLUDED.is_correct,
               awarded_marks = EXCLUDED.awarded_marks,
               answered_at = EXCLUDED.answered_at;`,
      [sub.id, q.id, answerByQuestion[q.id] ?? null, isCorrect, awardedMarks]
    );
  }

  // Floor total score at 0
  totalScore = Math.max(0, totalScore);
  const totalMarks = parseFloat(sub.total_marks ?? 1);
  const percentage = totalMarks > 0 ? Math.min(100, (totalScore / totalMarks) * 100) : 0;
  const passed = totalScore >= parseFloat(sub.passing_marks ?? totalMarks);

  await client.query(
    `UPDATE submissions
        SET status = $2, submitted_at = NOW(), total_score = $3, percentage = $4, passed = $5
      WHERE id = $1;`,
    [sub.id, finalStatus, totalScore.toFixed(2), percentage.toFixed(2), passed]
  );

  return { totalScore: totalScore.toFixed(2), percentage: percentage.toFixed(2), passed };
}

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/submissions/:id
   GET /api/submissions/:id/state   (same handler, registered at both paths)
   ───────────────────────────────────────────────────────────────────────────── */
export async function getSubmissionState(req, res) {
  const submissionId = req.params.id;
  const currentUserId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  const client = await connectOrRespond(res);
  if (!client) return;
  try {
    const sub = await fetchOwnedSubmission(client, submissionId, currentUserId, isAdmin);

    if (!sub) {
      return sendError(res, {
        statusCode: 404,
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Examination submission attempt not found.'
      });
    }

    if (sub.student_id !== currentUserId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to access this examination session.'
      });
    }

    // Auto-update status if time expired while IN_PROGRESS
    let currentStatus = sub.status;
    let remainingSecs = Math.max(0, parseInt(sub.remaining_seconds ?? 0, 10));

    if (currentStatus === 'IN_PROGRESS' && remainingSecs <= 0) {
      try {
        await client.query('BEGIN');
        await autoSubmitIfExpired(client, sub);
        await client.query('COMMIT');
        currentStatus = 'AUTO_SUBMITTED';
      } catch (e) {
        await client.query('ROLLBACK');
      }
    }

    // Load questions and options (stable via order_mapping)
    const { rows: questions } = await client.query(
      `SELECT id, question_text, question_type, marks, negative_marks, position
         FROM questions WHERE exam_id = $1 ORDER BY position ASC;`,
      [sub.exam_id]
    );

    const questionIds = questions.map(q => q.id);
    const { rows: options } = (questionIds.length > 0)
      ? await client.query(
          `SELECT id, question_id, option_text, position
             FROM options WHERE question_id = ANY($1::uuid[]) ORDER BY position ASC;`,
          [questionIds]
        )
      : { rows: [] };

    const optionsByQuestion = {};
    for (const opt of options) {
      if (!optionsByQuestion[opt.question_id]) optionsByQuestion[opt.question_id] = [];
      optionsByQuestion[opt.question_id].push(opt);
    }

    const sanitizedQuestions = sanitizeQuestionsForStudent(
      questions,
      optionsByQuestion,
      sub.order_mapping || {}
    );

    // Saved answers { questionId -> selectedOptionId }
    const { rows: savedAnswersRows } = await client.query(
      'SELECT question_id, selected_option_id FROM submission_answers WHERE submission_id = $1;',
      [sub.id]
    );
    const savedAnswers = {};
    for (const row of savedAnswersRows) {
      savedAnswers[row.question_id] = row.selected_option_id;
    }

    return sendSuccess(res, {
      message: 'Attempt state retrieved.',
      data: {
        submissionId: sub.id,
        examId: sub.exam_id,
        examTitle: sub.exam_title,
        batch: sub.batch,
        status: currentStatus,
        startedAt: sub.started_at,
        deadlineAt: sub.deadline_at,
        submittedAt: sub.submitted_at,
        serverTime: sub.server_time,
        remainingSeconds: remainingSecs,
        tabSwitchCount: sub.tab_switch_count,
        totalScore: sub.total_score,
        percentage: sub.percentage,
        passed: sub.passed,
        questions: sanitizedQuestions,
        savedAnswers
      }
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw err;
  } finally {
    client.release();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   PUT /api/submissions/:id/answers/:questionId
   ───────────────────────────────────────────────────────────────────────────── */
export async function putAnswer(req, res) {
  const { id: submissionId, questionId } = req.params;
  const currentUserId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  // Only accept selectedOptionId — ignore any other client-sent fields
  const { selectedOptionId = null } = req.body;

  const client = await connectOrRespond(res);
  if (!client) return;
  try {
    // Fetch submission with ownership check
    const sub = await fetchOwnedSubmission(client, submissionId, currentUserId, isAdmin);

    if (!sub) {
      return sendError(res, { statusCode: 404, code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found.' });
    }
    if (sub.student_id !== currentUserId && !isAdmin) {
      return sendError(res, { statusCode: 403, code: 'FORBIDDEN', message: 'Access denied.' });
    }

    // Must be in progress
    if (sub.status !== 'IN_PROGRESS') {
      // If it was already submitted, return that status
      return sendError(res, {
        statusCode: 409,
        code: 'SUBMISSION_CLOSED',
        message: `This submission is already in status: ${sub.status}.`
      });
    }

    // Check server deadline
    const remainingSecs = parseInt(sub.remaining_seconds ?? 0, 10);
    if (remainingSecs <= 0) {
      // Auto-submit and reject new answers
      try {
        await client.query('BEGIN');
        await scoreAndFinalise(client, sub, 'AUTO_SUBMITTED');
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
      }
      return sendError(res, {
        statusCode: 409,
        code: 'EXAM_TIME_EXPIRED',
        message: 'Exam time has expired. Your submission has been recorded.'
      });
    }

    // Validate questionId belongs to this exam
    const { rows: qRows } = await client.query(
      'SELECT id FROM questions WHERE id = $1 AND exam_id = $2 LIMIT 1;',
      [questionId, sub.exam_id]
    );
    if (qRows.length === 0) {
      return sendError(res, { statusCode: 400, code: 'INVALID_QUESTION', message: 'Question does not belong to this exam.' });
    }

    // Validate selectedOptionId belongs to this question (if provided)
    if (selectedOptionId !== null && selectedOptionId !== undefined) {
      const { rows: optRows } = await client.query(
        'SELECT id FROM options WHERE id = $1 AND question_id = $2 LIMIT 1;',
        [selectedOptionId, questionId]
      );
      if (optRows.length === 0) {
        return sendError(res, { statusCode: 400, code: 'INVALID_OPTION', message: 'Option does not belong to this question.' });
      }
    }

    // Upsert the answer (idempotent)
    const savedOptionId = (selectedOptionId === null || selectedOptionId === undefined) ? null : selectedOptionId;
    await client.query(
      `INSERT INTO submission_answers (submission_id, question_id, selected_option_id, answered_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (submission_id, question_id) DO UPDATE
           SET selected_option_id = EXCLUDED.selected_option_id,
               answered_at = EXCLUDED.answered_at;`,
      [submissionId, questionId, savedOptionId]
    );

    return sendSuccess(res, {
      message: 'Answer saved.',
      data: {
        submissionId,
        questionId,
        selectedOptionId: savedOptionId,
        savedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw err;
  } finally {
    client.release();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/submissions/:id/submit
   ───────────────────────────────────────────────────────────────────────────── */
export async function submitExamHandler(req, res) {
  const submissionId = req.params.id;
  const currentUserId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  // Optional: 'FORCE_SUBMITTED' reason from anti-cheat
  const { reason } = req.body || {};
  const forceStatus = reason === 'FORCE_SUBMITTED' ? 'FORCE_SUBMITTED' : null;

  const client = await connectOrRespond(res);
  if (!client) return;
  try {
    await client.query('BEGIN');

    // Lock row to prevent race conditions on double-submit
    const { rows } = await client.query(
      `SELECT s.*, e.title AS exam_title, e.batch, e.duration_minutes,
              e.total_marks, e.passing_marks,
              e.negative_marking_enabled, e.negative_marks_per_wrong_answer,
              CURRENT_TIMESTAMP AS server_time,
              EXTRACT(EPOCH FROM (s.deadline_at - CURRENT_TIMESTAMP))::int AS remaining_seconds
         FROM submissions s
         JOIN exams e ON e.id = s.exam_id
        WHERE s.id = $1
        LIMIT 1 FOR UPDATE;`,
      [submissionId]
    );

    const sub = rows[0];
    if (!sub) {
      await client.query('ROLLBACK');
      return sendError(res, { statusCode: 404, code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found.' });
    }

    // Ownership check
    if (sub.student_id !== currentUserId && !isAdmin) {
      await client.query('ROLLBACK');
      return sendError(res, { statusCode: 403, code: 'FORBIDDEN', message: 'Access denied.' });
    }

    // Idempotency: if already finalized, return existing result
    if (sub.status !== 'IN_PROGRESS') {
      await client.query('ROLLBACK');

      // Count answers for response
      const { rows: ansRows } = await client.query(
        `SELECT COUNT(*) AS answered_count
           FROM submission_answers
          WHERE submission_id = $1 AND selected_option_id IS NOT NULL;`,
        [sub.id]
      );
      const { rows: totalQRows } = await client.query(
        'SELECT COUNT(*) AS total FROM questions WHERE exam_id = $1;',
        [sub.exam_id]
      );

      return sendSuccess(res, {
        message: 'Submission already finalized.',
        data: {
          submissionId: sub.id,
          status: sub.status,
          totalScore: sub.total_score,
          percentage: sub.percentage,
          passed: sub.passed,
          answeredCount: parseInt(ansRows[0].answered_count, 10),
          totalQuestions: parseInt(totalQRows[0].total, 10),
          submittedAt: sub.submitted_at
        }
      });
    }

    // The database deadline is authoritative even if the client submits late.
    const isPastDeadline = Number(sub.remaining_seconds ?? 0) <= 0;
    const finalStatus = isPastDeadline ? 'AUTO_SUBMITTED' : (forceStatus || 'SUBMITTED');
    const scores = await scoreAndFinalise(client, sub, finalStatus);
    await client.query('COMMIT');

    // Count for response (after commit)
    const { rows: ansRows } = await client.query(
      `SELECT COUNT(*) AS answered_count
         FROM submission_answers
        WHERE submission_id = $1 AND selected_option_id IS NOT NULL;`,
      [sub.id]
    );
    const { rows: totalQRows } = await client.query(
      'SELECT COUNT(*) AS total FROM questions WHERE exam_id = $1;',
      [sub.exam_id]
    );

    return sendSuccess(res, {
      message: 'Examination submitted successfully.',
      data: {
        submissionId: sub.id,
        status: finalStatus,
        totalScore: scores.totalScore,
        percentage: scores.percentage,
        passed: scores.passed,
        answeredCount: parseInt(ansRows[0]?.answered_count ?? 0, 10),
        totalQuestions: parseInt(totalQRows[0]?.total ?? 0, 10),
        submittedAt: new Date().toISOString()
        // NOTE: correct answers are NOT included — no post-exam review enabled yet
      }
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw err;
  } finally {
    client.release();
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   POST /api/submissions/:id/integrity-event
   Records an anti-cheat event from the exam runner.
   ───────────────────────────────────────────────────────────────────────────── */
export async function recordIntegrityEvent(req, res) {
  const submissionId = req.params.id;
  const currentUserId = req.user.id;
  const { eventType, eventData } = req.body || {};

  if (!eventType) {
    return sendError(res, { statusCode: 400, code: 'MISSING_EVENT_TYPE', message: 'eventType is required.' });
  }

  const client = await connectOrRespond(res);
  if (!client) return;
  try {
    // Verify ownership without locking
    const { rows } = await client.query(
      'SELECT student_id, status FROM submissions WHERE id = $1 LIMIT 1;',
      [submissionId]
    );
    const sub = rows[0];
    if (!sub) return sendError(res, { statusCode: 404, code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found.' });
    if (sub.student_id !== currentUserId && req.user.role !== 'ADMIN') {
      return sendError(res, { statusCode: 403, code: 'FORBIDDEN', message: 'Access denied.' });
    }

    await client.query(
      `INSERT INTO integrity_events (submission_id, event_type, event_data, occurred_at)
         VALUES ($1, $2, $3, NOW());`,
      [submissionId, eventType, JSON.stringify(eventData || {})]
    );

    // Increment tab_switch_count for TAB_SWITCH events
    if (eventType === 'TAB_SWITCH') {
      await client.query(
        'UPDATE submissions SET tab_switch_count = tab_switch_count + 1 WHERE id = $1;',
        [submissionId]
      );
    }

    return sendSuccess(res, { message: 'Integrity event recorded.', data: { submissionId, eventType } });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw err;
  } finally {
    client.release();
  }
}


/**
 * GET /api/submissions/mine
 * Completed test history for the signed-in student.
 */
export async function getMySubmissionHistory(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS submission_id, s.exam_id, e.title AS exam_title,
              e.batch, s.status, s.total_score, s.percentage, s.passed,
              s.submitted_at, e.total_marks,
              (SELECT COUNT(*)::int FROM questions q WHERE q.exam_id = s.exam_id) AS total_questions,
              (SELECT COUNT(*)::int FROM submission_answers sa
                WHERE sa.submission_id = s.id AND sa.selected_option_id IS NOT NULL) AS answered_count
         FROM submissions s
         JOIN exams e ON e.id = s.exam_id
        WHERE s.student_id = $1 AND s.status <> 'IN_PROGRESS'
        ORDER BY s.submitted_at DESC NULLS LAST, s.started_at DESC;`,
      [req.user.id]
    );
    return sendSuccess(res, { message: 'Completed test history retrieved.', data: rows });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw error;
  }
}

/**
 * GET /api/submissions/:id/review
 * Post-submission answer review for the owning student only.
 */
export async function getSubmissionReview(req, res) {
  const client = await connectOrRespond(res);
  if (!client) return;
  try {
    const { rows: attempts } = await client.query(
      `SELECT s.id, s.exam_id, s.student_id, s.status, s.total_score,
              s.percentage, s.passed, s.submitted_at, e.title AS exam_title,
              e.total_marks
         FROM submissions s JOIN exams e ON e.id = s.exam_id
        WHERE s.id = $1 LIMIT 1;`,
      [req.params.id]
    );
    const attempt = attempts[0];
    if (!attempt) return sendError(res, { statusCode: 404, code: 'SUBMISSION_NOT_FOUND', message: 'Test attempt not found.' });
    if (attempt.student_id !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, { statusCode: 403, code: 'FORBIDDEN', message: 'You cannot review another student\'s attempt.' });
    }
    if (attempt.status === 'IN_PROGRESS') {
      return sendError(res, { statusCode: 409, code: 'REVIEW_NOT_AVAILABLE', message: 'Review is available after the test is submitted.' });
    }

    const { rows: questions } = await client.query(
      `SELECT q.id, q.question_text, q.question_type, q.marks, q.negative_marks,
              q.position, sa.selected_option_id, sa.is_correct,
              sa.awarded_marks
         FROM questions q
         LEFT JOIN submission_answers sa
           ON sa.question_id = q.id AND sa.submission_id = $1
        WHERE q.exam_id = $2 ORDER BY q.position ASC;`,
      [attempt.id, attempt.exam_id]
    );
    const questionIds = questions.map(q => q.id);
    const { rows: options } = questionIds.length ? await client.query(
      `SELECT id, question_id, option_text, is_correct, position
         FROM options WHERE question_id = ANY($1::uuid[]) ORDER BY position ASC;`,
      [questionIds]
    ) : { rows: [] };

    const optionsByQuestion = {};
    for (const option of options) {
      (optionsByQuestion[option.question_id] ||= []).push({
        id: option.id,
        text: option.option_text,
        isCorrect: option.is_correct
      });
    }
    return sendSuccess(res, {
      message: 'Test review retrieved.',
      data: {
        submissionId: attempt.id,
        examTitle: attempt.exam_title,
        status: attempt.status,
        totalScore: attempt.total_score,
        totalMarks: attempt.total_marks,
        percentage: attempt.percentage,
        passed: attempt.passed,
        submittedAt: attempt.submitted_at,
        questions: questions.map((q, index) => ({
          number: index + 1,
          prompt: q.question_text,
          marks: q.marks,
          awardedMarks: q.awarded_marks,
          isCorrect: q.is_correct === true,
          explanation: null,
          selectedOptionId: q.selected_option_id,
          options: optionsByQuestion[q.id] || []
        }))
      }
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw error;
  } finally {
    client.release();
  }
}

export default { getSubmissionState, putAnswer, submitExamHandler, recordIntegrityEvent, getMySubmissionHistory, getSubmissionReview };

