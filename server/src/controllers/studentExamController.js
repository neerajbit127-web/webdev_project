import { pool } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Utility Fisher-Yates array shuffling.
 */
export function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Safely sanitizes questions for students, stripping all answers and private metadata.
 * @param {Array} questions - Questions list
 * @param {object} optionsByQuestion - Options grouped by questionId
 * @param {object} [orderMapping] - Preserved ordering
 * @returns {Array} Sanitized question payloads
 */
export function sanitizeQuestionsForStudent(questions, optionsByQuestion, orderMapping = {}) {
  const { questionOrder = [], optionOrders = {} } = orderMapping;

  // Build question map
  const questionMap = new Map(questions.map(q => [q.id, q]));

  // Determine question ordering
  let orderedQuestions = [];
  if (Array.isArray(questionOrder) && questionOrder.length > 0) {
    for (const qId of questionOrder) {
      if (questionMap.has(qId)) {
        orderedQuestions.push(questionMap.get(qId));
      }
    }
    // Append any questions not in order map
    for (const q of questions) {
      if (!questionOrder.includes(q.id)) {
        orderedQuestions.push(q);
      }
    }
  } else {
    orderedQuestions = [...questions].sort((a, b) => a.position - b.position);
  }

  return orderedQuestions.map((q, idx) => {
    const rawOptions = optionsByQuestion[q.id] || [];
    const optionMap = new Map(rawOptions.map(o => [o.id, o]));
    const optOrder = optionOrders[q.id] || [];

    let orderedOptions = [];
    if (Array.isArray(optOrder) && optOrder.length > 0) {
      for (const optId of optOrder) {
        if (optionMap.has(optId)) {
          orderedOptions.push(optionMap.get(optId));
        }
      }
      for (const opt of rawOptions) {
        if (!optOrder.includes(opt.id)) {
          orderedOptions.push(opt);
        }
      }
    } else {
      orderedOptions = [...rawOptions].sort((a, b) => a.position - b.position);
    }

    // STRICT SANITIZATION:
    // Omit is_correct, correctIndex, explanation, answer keys, or internal metadata.
    return {
      id: q.id,
      prompt: q.question_text,
      questionType: q.question_type || 'SINGLE_CHOICE',
      marks: parseFloat(q.marks || 1.00),
      negativeMarks: parseFloat(q.negative_marks || 0.00),
      position: idx + 1,
      options: orderedOptions.map((opt, optIdx) => ({
        id: opt.id,
        text: opt.option_text,
        position: optIdx + 1
      }))
    };
  });
}

/**
 * POST /api/exams/lookup
 * Accepts an access code and returns safe pre-exam summary for active, published examinations.
 */
export async function lookupExam(req, res) {
  const accessCode = (req.body.accessCode || req.body.code || '').trim().toUpperCase();

  if (!accessCode) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Access code is required.'
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT 
        e.id, e.title, e.description, e.batch, e.access_code,
        e.duration_minutes, e.total_marks, e.passing_marks,
        e.start_time, e.end_time, e.status,
        COUNT(q.id)::int AS question_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       WHERE UPPER(e.access_code) = $1
       GROUP BY e.id
       LIMIT 1;`,
      [accessCode]
    );

    if (rows.length === 0 || rows[0].status !== 'PUBLISHED') {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: `Examination with code "${accessCode}" was not found or is not currently published.`
      });
    }

    const exam = rows[0];
    const now = new Date();

    if (exam.start_time && now < new Date(exam.start_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_NOT_YET_ACTIVE',
        message: `This examination is scheduled to begin at ${new Date(exam.start_time).toLocaleString()}.`
      });
    }

    if (exam.end_time && now > new Date(exam.end_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_EXPIRED',
        message: `The availability window for this examination closed at ${new Date(exam.end_time).toLocaleString()}.`
      });
    }

    return sendSuccess(res, {
      message: 'Examination verified',
      data: {
        id: exam.id,
        code: exam.access_code,
        title: exam.title,
        description: exam.description,
        batch: exam.batch,
        duration: exam.duration_minutes,
        durationMinutes: exam.duration_minutes,
        totalMarks: exam.total_marks,
        passingMarks: exam.passing_marks,
        questionCount: exam.question_count,
        startTime: exam.start_time,
        endTime: exam.end_time
      }
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, {
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection unavailable.'
      });
    }
    throw err;
  }
}

/**
 * GET /api/exams/:id/student-info
 * Returns safe pre-exam details by exam ID.
 */
export async function getStudentExamInfo(req, res) {
  const examId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT 
        e.id, e.title, e.description, e.batch, e.access_code,
        e.duration_minutes, e.total_marks, e.passing_marks,
        e.start_time, e.end_time, e.status,
        COUNT(q.id)::int AS question_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       WHERE e.id = $1
       GROUP BY e.id
       LIMIT 1;`,
      [examId]
    );

    if (rows.length === 0 || rows[0].status !== 'PUBLISHED') {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Examination not found or not published.'
      });
    }

    const exam = rows[0];
    const now = new Date();

    if (exam.start_time && now < new Date(exam.start_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_NOT_YET_ACTIVE',
        message: `This examination is scheduled to begin at ${new Date(exam.start_time).toLocaleString()}.`
      });
    }

    if (exam.end_time && now > new Date(exam.end_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_EXPIRED',
        message: `The availability window for this examination closed at ${new Date(exam.end_time).toLocaleString()}.`
      });
    }

    return sendSuccess(res, {
      message: 'Student pre-exam information',
      data: {
        id: exam.id,
        code: exam.access_code,
        title: exam.title,
        description: exam.description,
        batch: exam.batch,
        duration: exam.duration_minutes,
        durationMinutes: exam.duration_minutes,
        totalMarks: exam.total_marks,
        passingMarks: exam.passing_marks,
        questionCount: exam.question_count,
        startTime: exam.start_time,
        endTime: exam.end_time
      }
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      return sendError(res, {
        statusCode: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection unavailable.'
      });
    }
    throw err;
  }
}

/**
 * POST /api/exams/:id/start
 * Initializes a new examination attempt or resumes an in-progress session.
 */
export async function startExam(req, res) {
  const examId = req.params.id;
  const studentId = req.user.id;

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection unavailable. Please ensure PostgreSQL is running.'
    });
  }

  try {
    // 1. Fetch Exam Settings and check availability
    const { rows: examRows } = await client.query(
      `SELECT 
        id, title, batch, duration_minutes, shuffle_questions, shuffle_options,
        status, start_time, end_time
       FROM exams 
       WHERE id = $1 LIMIT 1;`,
      [examId]
    );

    if (examRows.length === 0 || examRows[0].status !== 'PUBLISHED') {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Examination not found or not published.'
      });
    }

    const exam = examRows[0];

    // Check scheduled time window against database clock
    const { rows: clockRows } = await client.query('SELECT CURRENT_TIMESTAMP as now;');
    const dbNow = new Date(clockRows[0].now);

    if (exam.start_time && dbNow < new Date(exam.start_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_NOT_YET_ACTIVE',
        message: `This examination is scheduled to begin at ${new Date(exam.start_time).toLocaleString()}.`
      });
    }

    if (exam.end_time && dbNow > new Date(exam.end_time)) {
      return sendError(res, {
        statusCode: 403,
        code: 'EXAM_EXPIRED',
        message: `The availability window for this examination closed at ${new Date(exam.end_time).toLocaleString()}.`
      });
    }

    // 2. Check for existing submission attempt
    const { rows: existingSubmissions } = await client.query(
      `SELECT 
        s.id, s.exam_id, s.student_id, s.started_at, s.deadline_at, s.submitted_at,
        s.status, s.tab_switch_count, s.order_mapping,
        CURRENT_TIMESTAMP AS server_time,
        EXTRACT(EPOCH FROM (s.deadline_at - CURRENT_TIMESTAMP))::int AS remaining_seconds
       FROM submissions s
       WHERE s.exam_id = $1 AND s.student_id = $2
       LIMIT 1;`,
      [examId, studentId]
    );

    // Load questions and options
    const { rows: questions } = await client.query(
      `SELECT id, question_text, question_type, marks, negative_marks, position
       FROM questions
       WHERE exam_id = $1
       ORDER BY position ASC;`,
      [examId]
    );

    if (questions.length === 0) {
      return sendError(res, {
        statusCode: 400,
        code: 'EXAM_EMPTY',
        message: 'This examination does not contain any questions.'
      });
    }

    const questionIds = questions.map(q => q.id);
    const { rows: options } = await client.query(
      `SELECT id, question_id, option_text, position
       FROM options
       WHERE question_id = ANY($1::uuid[])
       ORDER BY position ASC;`,
      [questionIds]
    );

    const optionsByQuestion = {};
    for (const opt of options) {
      if (!optionsByQuestion[opt.question_id]) {
        optionsByQuestion[opt.question_id] = [];
      }
      optionsByQuestion[opt.question_id].push(opt);
    }

    // 3. CASE A: Student already has a submission record
    if (existingSubmissions.length > 0) {
      const sub = existingSubmissions[0];

      if (sub.status !== 'IN_PROGRESS') {
        return sendError(res, {
          statusCode: 409,
          code: 'EXAM_ALREADY_COMPLETED',
          message: 'You have already submitted this examination.'
        });
      }

      // Check if time expired according to database clock
      if (sub.remaining_seconds <= 0) {
        await client.query(
          "UPDATE submissions SET status = 'AUTO_SUBMITTED', submitted_at = deadline_at WHERE id = $1;",
          [sub.id]
        );
        return sendError(res, {
          statusCode: 409,
          code: 'EXAM_TIME_EXPIRED',
          message: 'The examination time limit has expired.'
        });
      }

      // RESUME IN-PROGRESS ATTEMPT: Restore saved order and answers
      const sanitizedQuestions = sanitizeQuestionsForStudent(
        questions,
        optionsByQuestion,
        sub.order_mapping || {}
      );

      // Fetch saved answers
      const { rows: savedAnswersRows } = await client.query(
        'SELECT question_id, selected_option_id FROM submission_answers WHERE submission_id = $1;',
        [sub.id]
      );
      const savedAnswers = {};
      for (const row of savedAnswersRows) {
        savedAnswers[row.question_id] = row.selected_option_id;
      }

      return sendSuccess(res, {
        message: 'Resumed active examination session',
        data: {
          submissionId: sub.id,
          examId: exam.id,
          examTitle: exam.title,
          batch: exam.batch,
          status: sub.status,
          startedAt: sub.started_at,
          deadlineAt: sub.deadline_at,
          serverTime: sub.server_time,
          remainingSeconds: Math.max(0, sub.remaining_seconds),
          tabSwitchCount: sub.tab_switch_count,
          questions: sanitizedQuestions,
          savedAnswers
        }
      });
    }

    // 4. CASE B: NEW ATTEMPT (Transaction & Shuffling)
    await client.query('BEGIN');

    // Build deterministic order mapping
    let orderedQList = [...questions];
    if (exam.shuffle_questions) {
      orderedQList = shuffleArray(orderedQList);
    }
    const questionOrder = orderedQList.map(q => q.id);

    const optionOrders = {};
    for (const q of questions) {
      let opts = optionsByQuestion[q.id] || [];
      if (exam.shuffle_options) {
        opts = shuffleArray(opts);
      }
      optionOrders[q.id] = opts.map(o => o.id);
    }

    const orderMapping = {
      questionOrder,
      optionOrders
    };

    // Insert submission locking started_at and calculating deadline_at from DB time
    const durationMins = parseInt(exam.duration_minutes, 10);
    const insertSubQuery = `
      INSERT INTO submissions (
        exam_id, student_id, started_at, deadline_at, status, order_mapping
      ) VALUES (
        $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($3 * interval '1 minute'), 'IN_PROGRESS', $4
      )
      ON CONFLICT (exam_id, student_id) DO NOTHING
      RETURNING 
        id, exam_id, student_id, started_at, deadline_at, status, tab_switch_count,
        CURRENT_TIMESTAMP AS server_time,
        EXTRACT(EPOCH FROM (deadline_at - CURRENT_TIMESTAMP))::int AS remaining_seconds;
    `;

    const { rows: insertedSubRows } = await client.query(insertSubQuery, [
      examId,
      studentId,
      durationMins,
      JSON.stringify(orderMapping)
    ]);

    // Handle race condition: if concurrent request created submission first
    let newSub;
    if (insertedSubRows.length === 0) {
      const { rows: raceRows } = await client.query(
        `SELECT id, exam_id, student_id, started_at, deadline_at, status, tab_switch_count, order_mapping,
                CURRENT_TIMESTAMP AS server_time,
                EXTRACT(EPOCH FROM (deadline_at - CURRENT_TIMESTAMP))::int AS remaining_seconds
         FROM submissions WHERE exam_id = $1 AND student_id = $2;`,
        [examId, studentId]
      );
      newSub = raceRows[0];
    } else {
      newSub = insertedSubRows[0];
    }

    await client.query('COMMIT');

    const sanitizedQuestions = sanitizeQuestionsForStudent(
      questions,
      optionsByQuestion,
      orderMapping
    );

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Examination session initialized',
      data: {
        submissionId: newSub.id,
        examId: exam.id,
        examTitle: exam.title,
        batch: exam.batch,
        status: newSub.status,
        startedAt: newSub.started_at,
        deadlineAt: newSub.deadline_at,
        serverTime: newSub.server_time,
        remainingSeconds: Math.max(0, newSub.remaining_seconds),
        tabSwitchCount: newSub.tab_switch_count,
        questions: sanitizedQuestions,
        savedAnswers: {}
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }
}

export default {
  shuffleArray,
  sanitizeQuestionsForStudent,
  lookupExam,
  getStudentExamInfo,
  startExam
};

