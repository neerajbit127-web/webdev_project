import { pool } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  generateSecureAccessCode,
  validateExamMetadata,
  validateQuestionsForPublishing
} from '../services/examService.js';

/**
 * Normalizes question and option formats from client payloads.
 */
function normalizeQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions.map((q, qIdx) => {
    const prompt = q.questionText || q.prompt || '';
    const marks = parseFloat(q.marks || 2.00);
    const negativeMarks = 0; // Negative marking is disabled for all questions.
    const questionType = q.questionType || 'SINGLE_CHOICE';
    const explanation = q.explanation || null;
    const position = q.position || (qIdx + 1);

    const rawOptions = q.options || [];
    const options = rawOptions.map((opt, optIdx) => {
      const optionText = typeof opt === 'string' ? opt : (opt.optionText || opt.text || '');
      const isCorrect = typeof opt === 'object' && 'isCorrect' in opt
        ? Boolean(opt.isCorrect)
        : (q.correctIndex === optIdx);

      return {
        optionText,
        isCorrect,
        position: optIdx + 1
      };
    });

    return {
      prompt,
      marks,
      negativeMarks,
      questionType,
      explanation,
      position,
      options
    };
  });
}

/**
 * POST /api/exams
 * Creates a new draft exam (or directly publishes if publishImmediately=true).
 */
export async function createExam(req, res) {
  const teacherId = req.user.id;
  const {
    title,
    description = '',
    batch = 'General',
    durationMinutes = 45,
    passingMarks = 0,
    negativeMarkingEnabled = false,
    negativeMarksPerWrongAnswer = 0.00,
    shuffleQuestions = true,
    shuffleOptions = true,
    maxTabSwitches = 3,
    startTime = null,
    endTime = null,
    publishImmediately = false,
    questions: rawQuestions = []
  } = req.body;

  // 1. Validate Exam Metadata
  const validation = validateExamMetadata({
    title,
    durationMinutes,
    passingMarks,
    startTime,
    endTime
  });

  if (!validation.isValid) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: validation.error
    });
  }

  const questions = normalizeQuestions(rawQuestions);

  // 2. If publishing immediately, validate questions
  if (publishImmediately) {
    const qValidation = validateQuestionsForPublishing(questions);
    if (!qValidation.canPublish) {
      return sendError(res, {
        statusCode: 400,
        code: 'CANNOT_PUBLISH_EMPTY_EXAM',
        message: qValidation.error
      });
    }
  }

  const examStatus = publishImmediately ? 'PUBLISHED' : 'DRAFT';
  const calculatedTotalMarks = questions.reduce((sum, q) => sum + (q.marks || 0), 0);

  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection is unavailable. Please ensure PostgreSQL is running.'
    });
  }

  try {
    // Generate secure access code
    const accessCode = await generateSecureAccessCode(client);

    await client.query('BEGIN');

    // Insert Exam Row
    const examInsertQuery = `
      INSERT INTO exams (
        teacher_id, title, description, batch, access_code, duration_minutes,
        total_marks, passing_marks, negative_marking_enabled, negative_marks_per_wrong_answer,
        shuffle_questions, shuffle_options, max_tab_switches, start_time, end_time, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *;
    `;

    const examValues = [
      teacherId,
      title.trim(),
      description.trim(),
      batch.trim(),
      accessCode,
      parseInt(durationMinutes, 10),
      calculatedTotalMarks,
      parseFloat(passingMarks),
      Boolean(negativeMarkingEnabled),
      parseFloat(negativeMarksPerWrongAnswer),
      Boolean(shuffleQuestions),
      Boolean(shuffleOptions),
      parseInt(maxTabSwitches, 10),
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null,
      examStatus
    ];

    const { rows: examRows } = await client.query(examInsertQuery, examValues);
    const createdExam = examRows[0];

    // Insert Questions and Options Transactionally
    for (const q of questions) {
      const qInsertQuery = `
        INSERT INTO questions (
          exam_id, question_text, question_type, marks, negative_marks, position, explanation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `;
      const qValues = [
        createdExam.id,
        q.prompt,
        q.questionType,
        q.marks,
        q.negativeMarks,
        q.position,
        q.explanation
      ];
      const { rows: qRows } = await client.query(qInsertQuery, qValues);
      const questionId = qRows[0].id;

      for (const opt of q.options) {
        const optInsertQuery = `
          INSERT INTO options (
            question_id, option_text, is_correct, position
          ) VALUES ($1, $2, $3, $4);
        `;
        await client.query(optInsertQuery, [
          questionId,
          opt.optionText,
          opt.isCorrect,
          opt.position
        ]);
      }
    }

    await client.query('COMMIT');

    return sendSuccess(res, {
      statusCode: 201,
      message: publishImmediately ? 'Exam published successfully' : 'Exam draft created successfully',
      data: {
        id: createdExam.id,
        title: createdExam.title,
        batch: createdExam.batch,
        accessCode: createdExam.access_code,
        durationMinutes: createdExam.duration_minutes,
        totalMarks: createdExam.total_marks,
        passingMarks: createdExam.passing_marks,
        status: createdExam.status,
        questionCount: questions.length,
        createdAt: createdExam.created_at
      }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * GET /api/exams/mine
 * Lists all exams owned by the authenticated teacher.
 */
export async function getMyExams(req, res) {
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  try {
    const queryText = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.batch,
        e.access_code,
        e.duration_minutes,
        e.total_marks,
        e.passing_marks,
        e.status,
        e.created_at,
        e.updated_at,
        COUNT(DISTINCT q.id)::int AS question_count,
        COUNT(DISTINCT s.id)::int AS submission_count
      FROM exams e
      LEFT JOIN questions q ON q.exam_id = e.id
      LEFT JOIN submissions s ON s.exam_id = e.id
      WHERE ${isAdmin ? '1=1' : 'e.teacher_id = $1'}
      GROUP BY e.id
      ORDER BY e.created_at DESC;
    `;

    const queryParams = isAdmin ? [] : [teacherId];
    const { rows } = await pool.query(queryText, queryParams);

    return sendSuccess(res, {
      message: 'Teacher exams retrieved',
      data: rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        batch: r.batch,
        code: r.access_code,
        duration: r.duration_minutes,
        totalMarks: r.total_marks,
        passingMarks: r.passing_marks,
        status: r.status,
        questionsCount: r.question_count,
        submissionsCount: r.submission_count,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || !pool) {
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
 * GET /api/exams/:id
 * Fetches single exam with all questions and options for its teacher/admin.
 */
export async function getExamById(req, res) {
  const examId = req.params.id;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  try {
    const { rows: examRows } = await pool.query(
      'SELECT * FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (examRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'The requested exam does not exist.'
      });
    }

    const exam = examRows[0];

    // Ownership check
    if (exam.teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to view or manage this examination.'
      });
    }

    // Load questions and options
    const { rows: questionRows } = await pool.query(
      `SELECT q.id, q.question_text, q.question_type, q.marks, q.negative_marks, q.position, q.explanation
       FROM questions q
       WHERE q.exam_id = $1
       ORDER BY q.position ASC;`,
      [examId]
    );

    const questionIds = questionRows.map(q => q.id);
    let optionsByQuestion = {};

    if (questionIds.length > 0) {
      const { rows: optionRows } = await pool.query(
        `SELECT id, question_id, option_text, is_correct, position
         FROM options
         WHERE question_id = ANY($1::uuid[])
         ORDER BY position ASC;`,
        [questionIds]
      );

      for (const opt of optionRows) {
        if (!optionsByQuestion[opt.question_id]) {
          optionsByQuestion[opt.question_id] = [];
        }
        optionsByQuestion[opt.question_id].push({
          id: opt.id,
          text: opt.option_text,
          isCorrect: opt.is_correct,
          position: opt.position
        });
      }
    }

    const formattedQuestions = questionRows.map(q => ({
      id: q.id,
      prompt: q.question_text,
      questionType: q.question_type,
      marks: q.marks,
      negativeMarks: q.negative_marks,
      position: q.position,
      explanation: q.explanation,
      options: optionsByQuestion[q.id] || []
    }));

    return sendSuccess(res, {
      message: 'Exam retrieved successfully',
      data: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        batch: exam.batch,
        accessCode: exam.access_code,
        durationMinutes: exam.duration_minutes,
        totalMarks: exam.total_marks,
        passingMarks: exam.passing_marks,
        status: exam.status,
        negativeMarkingEnabled: exam.negative_marking_enabled,
        negativeMarksPerWrongAnswer: exam.negative_marks_per_wrong_answer,
        shuffleQuestions: exam.shuffle_questions,
        shuffleOptions: exam.shuffle_options,
        maxTabSwitches: exam.max_tab_switches,
        startTime: exam.start_time,
        endTime: exam.end_time,
        createdAt: exam.created_at,
        questions: formattedQuestions
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
 * PATCH /api/exams/:id
 * Updates an existing draft exam.
 */
export async function updateExam(req, res) {
  const examId = req.params.id;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection unavailable.'
    });
  }

  try {
    const { rows: examRows } = await client.query(
      'SELECT id, teacher_id, status FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (examRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Exam not found.'
      });
    }

    const exam = examRows[0];

    if (exam.teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to modify this exam.'
      });
    }

    if (exam.status !== 'DRAFT') {
      return sendError(res, {
        statusCode: 400,
        code: 'EXAM_NOT_IN_DRAFT',
        message: `Cannot edit exam in "${exam.status}" status. Only DRAFT exams can be updated.`
      });
    }

    const {
      title,
      description,
      batch,
      durationMinutes,
      passingMarks,
      negativeMarkingEnabled,
      negativeMarksPerWrongAnswer,
      shuffleQuestions,
      shuffleOptions,
      maxTabSwitches,
      startTime,
      endTime,
      questions: rawQuestions
    } = req.body;

    await client.query('BEGIN');

    const updateQuery = `
      UPDATE exams SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        batch = COALESCE($3, batch),
        duration_minutes = COALESCE($4, duration_minutes),
        passing_marks = COALESCE($5, passing_marks),
        negative_marking_enabled = COALESCE($6, negative_marking_enabled),
        negative_marks_per_wrong_answer = COALESCE($7, negative_marks_per_wrong_answer),
        shuffle_questions = COALESCE($8, shuffle_questions),
        shuffle_options = COALESCE($9, shuffle_options),
        max_tab_switches = COALESCE($10, max_tab_switches),
        start_time = COALESCE($11, start_time),
        end_time = COALESCE($12, end_time),
        updated_at = NOW()
      WHERE id = $13
      RETURNING *;
    `;

    const updateValues = [
      title ? title.trim() : null,
      description !== undefined ? description.trim() : null,
      batch !== undefined ? batch.trim() : null,
      durationMinutes ? parseInt(durationMinutes, 10) : null,
      passingMarks !== undefined ? parseFloat(passingMarks) : null,
      negativeMarkingEnabled !== undefined ? Boolean(negativeMarkingEnabled) : null,
      negativeMarksPerWrongAnswer !== undefined ? parseFloat(negativeMarksPerWrongAnswer) : null,
      shuffleQuestions !== undefined ? Boolean(shuffleQuestions) : null,
      shuffleOptions !== undefined ? Boolean(shuffleOptions) : null,
      maxTabSwitches !== undefined ? parseInt(maxTabSwitches, 10) : null,
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null,
      examId
    ];

    const { rows: updatedRows } = await client.query(updateQuery, updateValues);

    // If new questions payload provided, replace questions & options
    if (rawQuestions && Array.isArray(rawQuestions)) {
      const questions = normalizeQuestions(rawQuestions);
      await client.query('DELETE FROM questions WHERE exam_id = $1;', [examId]);

      for (const q of questions) {
        const { rows: qRows } = await client.query(
          `INSERT INTO questions (exam_id, question_text, question_type, marks, negative_marks, position, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
          [examId, q.prompt, q.questionType, q.marks, q.negativeMarks, q.position, q.explanation]
        );
        const questionId = qRows[0].id;

        for (const opt of q.options) {
          await client.query(
            `INSERT INTO options (question_id, option_text, is_correct, position)
             VALUES ($1, $2, $3, $4);`,
            [questionId, opt.optionText, opt.isCorrect, opt.position]
          );
        }
      }

      // Re-sum total marks
      const totalMarks = questions.reduce((acc, q) => acc + (q.marks || 0), 0);
      await client.query('UPDATE exams SET total_marks = $1 WHERE id = $2;', [totalMarks, examId]);
    }

    await client.query('COMMIT');

    return sendSuccess(res, {
      message: 'Exam draft updated successfully',
      data: updatedRows[0]
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * POST /api/exams/:id/publish
 * Validates requirements and transitions an exam to PUBLISHED.
 */
export async function publishExam(req, res) {
  const examId = req.params.id;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    return sendError(res, {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database connection unavailable.'
    });
  }

  try {
    const { rows: examRows } = await client.query(
      'SELECT * FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (examRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Exam not found.'
      });
    }

    const exam = examRows[0];

    if (exam.teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to publish this exam.'
      });
    }

    // Retrieve questions and options for validation
    const { rows: questions } = await client.query(
      'SELECT id, question_text, marks FROM questions WHERE exam_id = $1;',
      [examId]
    );

    if (questions.length === 0) {
      return sendError(res, {
        statusCode: 400,
        code: 'CANNOT_PUBLISH_EMPTY_EXAM',
        message: 'Cannot publish an exam with zero questions. Please add questions first.'
      });
    }

    // Verify every question has at least one correct option
    const { rows: optionValidation } = await client.query(
      `SELECT q.id, COUNT(o.id) as option_count, 
              SUM(CASE WHEN o.is_correct THEN 1 ELSE 0 END) as correct_count
       FROM questions q
       LEFT JOIN options o ON o.question_id = q.id
       WHERE q.exam_id = $1
       GROUP BY q.id;`,
      [examId]
    );

    for (const ov of optionValidation) {
      if (parseInt(ov.option_count, 10) < 2) {
        return sendError(res, {
          statusCode: 400,
          code: 'INVALID_OPTIONS_COUNT',
          message: 'All questions must have at least 2 options before publishing.'
        });
      }
      if (parseInt(ov.correct_count, 10) === 0) {
        return sendError(res, {
          statusCode: 400,
          code: 'MISSING_CORRECT_ANSWER',
          message: 'Every question must have at least one marked correct option.'
        });
      }
    }

    // Update status
    await client.query(
      "UPDATE exams SET status = 'PUBLISHED', updated_at = NOW() WHERE id = $1;",
      [examId]
    );

    return sendSuccess(res, {
      message: 'Exam published successfully',
      data: {
        id: exam.id,
        accessCode: exam.access_code,
        status: 'PUBLISHED'
      }
    });
  } finally {
    if (client) client.release();
  }
}

/**
 * POST /api/exams/:id/archive
 * Marks an exam as ARCHIVED.
 */
export async function archiveExam(req, res) {
  const examId = req.params.id;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  try {
    const { rows } = await pool.query(
      'SELECT id, teacher_id FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (rows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Exam not found.'
      });
    }

    if (rows[0].teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Not authorized to archive this exam.'
      });
    }

    await pool.query(
      "UPDATE exams SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1;",
      [examId]
    );

    return sendSuccess(res, {
      message: 'Exam successfully archived'
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
 * GET /api/exams/:id/summary
 * Returns teacher-facing analytics and student submission summary.
 */
export async function getExamSummary(req, res) {
  const examId = req.params.id;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  try {
    const { rows: examRows } = await pool.query(
      'SELECT id, teacher_id, title, access_code, duration_minutes, total_marks, passing_marks, status FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (examRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Exam not found.'
      });
    }

    const exam = examRows[0];
    if (exam.teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Not authorized to view summary for this exam.'
      });
    }

    // Aggregate statistics
    const statsQuery = `
      SELECT 
        COUNT(s.id)::int as total_submissions,
        COALESCE(AVG(s.total_score), 0)::numeric(5,2) as average_score,
        COALESCE(MAX(s.total_score), 0)::numeric(5,2) as highest_score,
        COALESCE(MIN(s.total_score), 0)::numeric(5,2) as lowest_score,
        SUM(CASE WHEN s.passed THEN 1 ELSE 0 END)::int as passed_count,
        SUM(CASE WHEN NOT s.passed AND s.status != 'IN_PROGRESS' THEN 1 ELSE 0 END)::int as failed_count
      FROM submissions s
      WHERE s.exam_id = $1;
    `;
    const { rows: statsRows } = await pool.query(statsQuery, [examId]);

    // Recent submissions
    const recentSubmissionsQuery = `
      SELECT s.id, u.full_name as student_name, u.student_id, s.total_score, s.status, s.submitted_at
      FROM submissions s
      JOIN users u ON u.id = s.student_id
      WHERE s.exam_id = $1
      ORDER BY s.submitted_at DESC NULLS LAST
      LIMIT 20;
    `;
    const { rows: recentSubmissions } = await pool.query(recentSubmissionsQuery, [examId]);

    return sendSuccess(res, {
      message: 'Exam summary retrieved',
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          accessCode: exam.access_code,
          durationMinutes: exam.duration_minutes,
          totalMarks: exam.total_marks,
          passingMarks: exam.passing_marks,
          status: exam.status
        },
        metrics: statsRows[0],
        recentSubmissions
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
 * GET /api/exams/code/:code
 * Public student-facing lookup for active, published examinations.
 */
export async function getExamByAccessCode(req, res) {
  const code = (req.params.code || '').trim().toUpperCase();

  try {
    const { rows } = await pool.query(
      `SELECT 
        e.id, e.title, e.batch, e.duration_minutes, e.total_marks, e.passing_marks,
        e.status, e.start_time, e.end_time,
        COUNT(q.id)::int as question_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       WHERE UPPER(e.access_code) = $1
       GROUP BY e.id
       LIMIT 1;`,
      [code]
    );

    if (rows.length === 0 || rows[0].status !== 'PUBLISHED') {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: `Examination with access code "${code}" was not found or has not been published yet.`
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
        message: `The availability window for this examination expired at ${new Date(exam.end_time).toLocaleString()}.`
      });
    }

    return sendSuccess(res, {
      message: 'Verified active examination',
      data: {
        id: exam.id,
        code,
        title: exam.title,
        batch: exam.batch,
        duration: exam.duration_minutes,
        totalMarks: exam.total_marks,
        passingMarks: exam.passing_marks,
        questionCount: exam.question_count
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
 * GET /api/exams/:id/results
 * Complete result list for every student who attempted a teacher-owned exam.
 */
export async function getExamResults(req, res) {
  try {
    const { rows: exams } = await pool.query(
      'SELECT id, teacher_id, title, total_marks FROM exams WHERE id = $1 LIMIT 1;',
      [req.params.id]
    );
    const exam = exams[0];
    if (!exam) return sendError(res, { statusCode: 404, code: 'EXAM_NOT_FOUND', message: 'Exam not found.' });
    if (exam.teacher_id !== req.user.id && req.user.role !== 'ADMIN') {
      return sendError(res, { statusCode: 403, code: 'FORBIDDEN', message: 'Not authorized to view results for this exam.' });
    }
    const { rows } = await pool.query(
      `SELECT s.id AS submission_id, u.full_name AS student_name,
              u.email AS student_email, u.student_id, s.status,
              s.total_score, s.percentage, s.passed, s.submitted_at,
              s.started_at, s.tab_switch_count,
              (SELECT COUNT(*)::int FROM questions q WHERE q.exam_id = s.exam_id) AS total_questions,
              (SELECT COUNT(*)::int FROM submission_answers sa
                WHERE sa.submission_id = s.id AND sa.selected_option_id IS NOT NULL) AS answered_count
         FROM submissions s JOIN users u ON u.id = s.student_id
        WHERE s.exam_id = $1
        ORDER BY s.submitted_at DESC NULLS LAST, s.started_at DESC;`,
      [req.params.id]
    );
    return sendSuccess(res, {
      message: 'Exam results retrieved.',
      data: { exam: { id: exam.id, title: exam.title, totalMarks: exam.total_marks }, results: rows }
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return sendError(res, { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'Database connection unavailable.' });
    }
    throw error;
  }
}

export default {
  createExam,
  getMyExams,
  getExamById,
  updateExam,
  publishExam,
  archiveExam,
  getExamSummary,
  getExamByAccessCode
};

