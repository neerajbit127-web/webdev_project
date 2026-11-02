import { pool } from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Validates whether an exam is in a state that permits question modification.
 * Policy:
 *  - ARCHIVED exams can never be modified (400).
 *  - PUBLISHED exams with >= 1 student submissions can never be modified (409).
 *  - PUBLISHED exams with 0 submissions must first be reverted/unpublished to DRAFT (400).
 *  - DRAFT exams are freely modifiable (allowed).
 */
async function checkExamModifiable(examId, teacherId, isAdmin, dbClient) {
  const { rows: examRows } = await dbClient.query(
    'SELECT id, teacher_id, status, title FROM exams WHERE id = $1 LIMIT 1;',
    [examId]
  );

  if (examRows.length === 0) {
    return {
      allowed: false,
      statusCode: 404,
      code: 'EXAM_NOT_FOUND',
      message: 'Examination not found.'
    };
  }

  const exam = examRows[0];

  // Ownership check
  if (exam.teacher_id !== teacherId && !isAdmin) {
    return {
      allowed: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'You are not authorized to modify questions on this examination.'
    };
  }

  if (exam.status === 'ARCHIVED') {
    return {
      allowed: false,
      statusCode: 400,
      code: 'EXAM_ARCHIVED',
      message: 'Cannot modify questions on an archived examination.'
    };
  }

  if (exam.status === 'PUBLISHED') {
    const { rows: subRows } = await dbClient.query(
      'SELECT COUNT(*)::int AS count FROM submissions WHERE exam_id = $1;',
      [examId]
    );
    const submissionCount = parseInt(subRows[0].count, 10);

    if (submissionCount > 0) {
      return {
        allowed: false,
        statusCode: 409,
        code: 'CANNOT_MODIFY_ACTIVE_EXAM',
        message: `Cannot modify questions on an active examination that already has ${submissionCount} student attempt(s).`
      };
    }

    return {
      allowed: false,
      statusCode: 400,
      code: 'EXAM_MUST_BE_DRAFT',
      message: 'This examination is currently PUBLISHED. Please unpublish it to DRAFT status before modifying questions.'
    };
  }

  return { allowed: true, exam };
}

/**
 * Validates options structure for SINGLE_CHOICE questions.
 */
function validateSingleChoiceOptions(options) {
  if (!Array.isArray(options) || options.length < 2) {
    return {
      isValid: false,
      code: 'INVALID_OPTIONS_COUNT',
      message: 'A question must contain at least 2 options.'
    };
  }

  let correctCount = 0;

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const text = typeof opt === 'string' ? opt : (opt.optionText || opt.text || '');

    if (!text || text.trim().length === 0) {
      return {
        isValid: false,
        code: 'EMPTY_OPTION_TEXT',
        message: `Option ${i + 1} has empty text.`
      };
    }

    const isCorrect = typeof opt === 'object' && Boolean(opt.isCorrect);
    if (isCorrect) {
      correctCount++;
    }
  }

  if (correctCount === 0) {
    return {
      isValid: false,
      code: 'MISSING_CORRECT_OPTION',
      message: 'Single choice questions must have exactly one correct option marked.'
    };
  }

  if (correctCount > 1) {
    return {
      isValid: false,
      code: 'MULTIPLE_CORRECT_OPTIONS',
      message: 'Single choice questions cannot have more than one correct option.'
    };
  }

  return { isValid: true };
}

/**
 * GET /api/exams/:examId/questions
 * Returns all questions and options for an exam (Teacher/Admin only; includes is_correct and explanation).
 */
export async function getExamQuestions(req, res) {
  const { examId } = req.params;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  try {
    const { rows: examRows } = await pool.query(
      'SELECT id, teacher_id, title, status FROM exams WHERE id = $1 LIMIT 1;',
      [examId]
    );

    if (examRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'EXAM_NOT_FOUND',
        message: 'Examination not found.'
      });
    }

    const exam = examRows[0];
    if (exam.teacher_id !== teacherId && !isAdmin) {
      return sendError(res, {
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to view questions for this examination.'
      });
    }

    const { rows: questions } = await pool.query(
      `SELECT id, question_text, question_type, marks, negative_marks, position, explanation, created_at, updated_at
       FROM questions
       WHERE exam_id = $1
       ORDER BY position ASC;`,
      [examId]
    );

    const questionIds = questions.map(q => q.id);
    let optionsByQuestion = {};

    if (questionIds.length > 0) {
      const { rows: options } = await pool.query(
        `SELECT id, question_id, option_text, is_correct, position
         FROM options
         WHERE question_id = ANY($1::uuid[])
         ORDER BY position ASC;`,
        [questionIds]
      );

      for (const opt of options) {
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

    const formatted = questions.map(q => ({
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      marks: q.marks,
      negativeMarks: q.negative_marks,
      position: q.position,
      explanation: q.explanation,
      options: optionsByQuestion[q.id] || []
    }));

    return sendSuccess(res, {
      message: 'Questions retrieved successfully',
      data: formatted
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
 * POST /api/exams/:examId/questions
 * Creates a new question with options inside an exam draft.
 */
export async function createQuestion(req, res) {
  const { examId } = req.params;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  const {
    questionText,
    questionType = 'SINGLE_CHOICE',
    marks = 1.00,
    negativeMarks = 0.00,
    position,
    explanation = null,
    options
  } = req.body;

  // Basic validation
  if (!questionText || typeof questionText !== 'string' || questionText.trim().length === 0) {
    return sendError(res, {
      statusCode: 400,
      code: 'EMPTY_QUESTION_TEXT',
      message: 'Question text is required.'
    });
  }

  const numMarks = parseFloat(marks);
  if (isNaN(numMarks) || numMarks < 0) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_MARKS',
      message: 'Marks must be a non-negative number.'
    });
  }

  const numNegMarks = parseFloat(negativeMarks);
  if (isNaN(numNegMarks) || numNegMarks < 0) {
    return sendError(res, {
      statusCode: 400,
      code: 'INVALID_NEGATIVE_MARKS',
      message: 'Negative marks must be a non-negative number.'
    });
  }

  // Validate SINGLE_CHOICE options
  const optValidation = validateSingleChoiceOptions(options);
  if (!optValidation.isValid) {
    return sendError(res, {
      statusCode: 400,
      code: optValidation.code,
      message: optValidation.message
    });
  }

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
    const modifiable = await checkExamModifiable(examId, teacherId, isAdmin, client);
    if (!modifiable.allowed) {
      return sendError(res, {
        statusCode: modifiable.statusCode,
        code: modifiable.code,
        message: modifiable.message
      });
    }

    await client.query('BEGIN');

    // Determine target position
    let targetPos = position ? parseInt(position, 10) : null;
    const { rows: posRows } = await client.query(
      'SELECT COALESCE(MAX(position), 0) AS max_pos FROM questions WHERE exam_id = $1;',
      [examId]
    );
    const maxPos = parseInt(posRows[0].max_pos, 10);

    if (!targetPos || targetPos > maxPos + 1) {
      targetPos = maxPos + 1;
    } else {
      // Shift subsequent questions
      await client.query(
        'UPDATE questions SET position = position + 1 WHERE exam_id = $1 AND position >= $2;',
        [examId, targetPos]
      );
    }

    // Insert Question
    const insertQQuery = `
      INSERT INTO questions (
        exam_id, question_text, question_type, marks, negative_marks, position, explanation
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const { rows: qRows } = await client.query(insertQQuery, [
      examId,
      questionText.trim(),
      questionType,
      numMarks,
      numNegMarks,
      targetPos,
      explanation ? explanation.trim() : null
    ]);
    const createdQuestion = qRows[0];

    // Insert Options
    const createdOptions = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optText = typeof opt === 'string' ? opt : (opt.optionText || opt.text);
      const isCorrect = typeof opt === 'object' && Boolean(opt.isCorrect);
      const optPos = i + 1;

      const { rows: oRows } = await client.query(
        `INSERT INTO options (question_id, option_text, is_correct, position)
         VALUES ($1, $2, $3, $4) RETURNING *;`,
        [createdQuestion.id, optText.trim(), isCorrect, optPos]
      );
      createdOptions.push({
        id: oRows[0].id,
        text: oRows[0].option_text,
        isCorrect: oRows[0].is_correct,
        position: oRows[0].position
      });
    }

    // Update total marks on the exam
    await client.query(
      `UPDATE exams 
       SET total_marks = (SELECT COALESCE(SUM(marks), 0) FROM questions WHERE exam_id = $1),
           updated_at = NOW()
       WHERE id = $1;`,
      [examId]
    );

    await client.query('COMMIT');

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Question created successfully',
      data: {
        id: createdQuestion.id,
        examId: createdQuestion.exam_id,
        questionText: createdQuestion.question_text,
        questionType: createdQuestion.question_type,
        marks: createdQuestion.marks,
        negativeMarks: createdQuestion.negative_marks,
        position: createdQuestion.position,
        explanation: createdQuestion.explanation,
        options: createdOptions
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
 * PATCH /api/exams/:examId/questions/:questionId
 * Updates an existing question and its options.
 */
export async function updateQuestion(req, res) {
  const { examId, questionId } = req.params;
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
    const modifiable = await checkExamModifiable(examId, teacherId, isAdmin, client);
    if (!modifiable.allowed) {
      return sendError(res, {
        statusCode: modifiable.statusCode,
        code: modifiable.code,
        message: modifiable.message
      });
    }

    // Verify question exists
    const { rows: qRows } = await client.query(
      'SELECT id, exam_id, position FROM questions WHERE id = $1 LIMIT 1;',
      [questionId]
    );

    if (qRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.'
      });
    }

    // Cross-exam check: question must belong to the specified exam
    if (qRows[0].exam_id !== examId) {
      return sendError(res, {
        statusCode: 400,
        code: 'CROSS_EXAM_QUESTION_ID',
        message: 'Question does not belong to the specified examination.'
      });
    }

    const {
      questionText,
      marks,
      negativeMarks,
      explanation,
      options
    } = req.body;

    if (questionText !== undefined && (typeof questionText !== 'string' || questionText.trim().length === 0)) {
      return sendError(res, {
        statusCode: 400,
        code: 'EMPTY_QUESTION_TEXT',
        message: 'Question text cannot be empty.'
      });
    }

    if (options !== undefined) {
      const optValidation = validateSingleChoiceOptions(options);
      if (!optValidation.isValid) {
        return sendError(res, {
          statusCode: 400,
          code: optValidation.code,
          message: optValidation.message
        });
      }

      // Check for any passed option IDs: must belong to this question
      const { rows: existingOptions } = await client.query(
        'SELECT id FROM options WHERE question_id = $1;',
        [questionId]
      );
      const validOptionIds = new Set(existingOptions.map(o => o.id));

      for (const opt of options) {
        if (opt.id && !validOptionIds.has(opt.id)) {
          return sendError(res, {
            statusCode: 400,
            code: 'INVALID_OPTION_ID',
            message: `Option ID "${opt.id}" does not belong to this question.`
          });
        }
      }
    }

    await client.query('BEGIN');

    // Update question core fields
    const updateQQuery = `
      UPDATE questions SET
        question_text = COALESCE($1, question_text),
        marks = COALESCE($2, marks),
        negative_marks = COALESCE($3, negative_marks),
        explanation = COALESCE($4, explanation),
        updated_at = NOW()
      WHERE id = $5 AND exam_id = $6
      RETURNING *;
    `;
    const updateValues = [
      questionText !== undefined ? questionText.trim() : null,
      marks !== undefined ? parseFloat(marks) : null,
      negativeMarks !== undefined ? parseFloat(negativeMarks) : null,
      explanation !== undefined ? (explanation ? explanation.trim() : null) : null,
      questionId,
      examId
    ];
    const { rows: updatedQRows } = await client.query(updateQQuery, updateValues);
    const updatedQuestion = updatedQRows[0];

    // If options array provided, replace options
    let updatedOptions = [];
    if (options !== undefined) {
      await client.query('DELETE FROM options WHERE question_id = $1;', [questionId]);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const optText = typeof opt === 'string' ? opt : (opt.optionText || opt.text);
        const isCorrect = typeof opt === 'object' && Boolean(opt.isCorrect);
        const optPos = i + 1;

        const { rows: oRows } = await client.query(
          `INSERT INTO options (question_id, option_text, is_correct, position)
           VALUES ($1, $2, $3, $4) RETURNING *;`,
          [questionId, optText.trim(), isCorrect, optPos]
        );
        updatedOptions.push({
          id: oRows[0].id,
          text: oRows[0].option_text,
          isCorrect: oRows[0].is_correct,
          position: oRows[0].position
        });
      }
    } else {
      const { rows: currentOpts } = await client.query(
        'SELECT id, option_text, is_correct, position FROM options WHERE question_id = $1 ORDER BY position ASC;',
        [questionId]
      );
      updatedOptions = currentOpts.map(o => ({
        id: o.id,
        text: o.option_text,
        isCorrect: o.is_correct,
        position: o.position
      }));
    }

    // Recalculate total marks
    if (marks !== undefined) {
      await client.query(
        `UPDATE exams 
         SET total_marks = (SELECT COALESCE(SUM(marks), 0) FROM questions WHERE exam_id = $1),
             updated_at = NOW()
         WHERE id = $1;`,
        [examId]
      );
    }

    await client.query('COMMIT');

    return sendSuccess(res, {
      message: 'Question updated successfully',
      data: {
        id: updatedQuestion.id,
        examId: updatedQuestion.exam_id,
        questionText: updatedQuestion.question_text,
        questionType: updatedQuestion.question_type,
        marks: updatedQuestion.marks,
        negativeMarks: updatedQuestion.negative_marks,
        position: updatedQuestion.position,
        explanation: updatedQuestion.explanation,
        options: updatedOptions
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
 * DELETE /api/exams/:examId/questions/:questionId
 * Deletes a question and re-compacts positions.
 */
export async function deleteQuestion(req, res) {
  const { examId, questionId } = req.params;
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
    const modifiable = await checkExamModifiable(examId, teacherId, isAdmin, client);
    if (!modifiable.allowed) {
      return sendError(res, {
        statusCode: modifiable.statusCode,
        code: modifiable.code,
        message: modifiable.message
      });
    }

    const { rows: qRows } = await client.query(
      'SELECT id, exam_id, position FROM questions WHERE id = $1 LIMIT 1;',
      [questionId]
    );

    if (qRows.length === 0) {
      return sendError(res, {
        statusCode: 404,
        code: 'QUESTION_NOT_FOUND',
        message: 'Question not found.'
      });
    }

    // Cross-exam check
    if (qRows[0].exam_id !== examId) {
      return sendError(res, {
        statusCode: 400,
        code: 'CROSS_EXAM_QUESTION_ID',
        message: 'Question does not belong to the specified examination.'
      });
    }

    const deletedPos = qRows[0].position;

    await client.query('BEGIN');

    // Delete question (options cascade delete)
    await client.query('DELETE FROM questions WHERE id = $1 AND exam_id = $2;', [questionId, examId]);

    // Re-compact subsequent question positions
    await client.query(
      'UPDATE questions SET position = position - 1 WHERE exam_id = $1 AND position > $2;',
      [examId, deletedPos]
    );

    // Recalculate total marks
    await client.query(
      `UPDATE exams 
       SET total_marks = (SELECT COALESCE(SUM(marks), 0) FROM questions WHERE exam_id = $1),
           updated_at = NOW()
       WHERE id = $1;`,
      [examId]
    );

    await client.query('COMMIT');

    return sendSuccess(res, {
      message: 'Question successfully deleted.'
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * PUT /api/exams/:examId/questions/reorder
 * Reorders questions within an examination draft.
 * Body: { questionIds: ["uuid-1", "uuid-2", ...] }
 */
export async function reorderQuestions(req, res) {
  const { examId } = req.params;
  const teacherId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';
  const { questionIds } = req.body;

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return sendError(res, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'questionIds must be a non-empty array of question UUIDs.'
    });
  }

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
    const modifiable = await checkExamModifiable(examId, teacherId, isAdmin, client);
    if (!modifiable.allowed) {
      return sendError(res, {
        statusCode: modifiable.statusCode,
        code: modifiable.code,
        message: modifiable.message
      });
    }

    // Verify all question IDs belong to this exam
    const { rows: existingQuestions } = await client.query(
      'SELECT id FROM questions WHERE exam_id = $1;',
      [examId]
    );

    if (existingQuestions.length !== questionIds.length) {
      return sendError(res, {
        statusCode: 400,
        code: 'QUESTION_COUNT_MISMATCH',
        message: `Expected ${existingQuestions.length} question IDs for reordering, but received ${questionIds.length}.`
      });
    }

    const existingIdSet = new Set(existingQuestions.map(q => q.id));
    for (const qId of questionIds) {
      if (!existingIdSet.has(qId)) {
        return sendError(res, {
          statusCode: 400,
          code: 'CROSS_EXAM_QUESTION_ID',
          message: `Question ID "${qId}" does not belong to this examination.`
        });
      }
    }

    await client.query('BEGIN');

    // Update positions sequentially
    for (let i = 0; i < questionIds.length; i++) {
      await client.query(
        'UPDATE questions SET position = $1, updated_at = NOW() WHERE id = $2 AND exam_id = $3;',
        [i + 1, questionIds[i], examId]
      );
    }

    await client.query('COMMIT');

    return sendSuccess(res, {
      message: 'Questions reordered successfully',
      data: {
        examId,
        questionOrder: questionIds.map((id, index) => ({ id, position: index + 1 }))
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
 * POST /api/exams/:id/unpublish
 * Reverts a PUBLISHED exam to DRAFT if there are no student attempts.
 */
export async function unpublishExam(req, res) {
  const { id: examId } = req.params;
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
        message: 'You are not authorized to unpublish this exam.'
      });
    }

    if (exam.status !== 'PUBLISHED') {
      return sendError(res, {
        statusCode: 400,
        code: 'EXAM_NOT_PUBLISHED',
        message: `Exam is currently in "${exam.status}" status and cannot be unpublished.`
      });
    }

    // Check submissions
    const { rows: subRows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM submissions WHERE exam_id = $1;',
      [examId]
    );

    if (parseInt(subRows[0].count, 10) > 0) {
      return sendError(res, {
        statusCode: 409,
        code: 'CANNOT_UNPUBLISH_ACTIVE_EXAM',
        message: 'Cannot unpublish an exam that already has student attempts.'
      });
    }

    await client.query(
      "UPDATE exams SET status = 'DRAFT', updated_at = NOW() WHERE id = $1;",
      [examId]
    );

    return sendSuccess(res, {
      message: 'Exam successfully unpublished to DRAFT mode.',
      data: { id: examId, status: 'DRAFT' }
    });
  } finally {
    if (client) client.release();
  }
}

export default {
  getExamQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  unpublishExam
};

