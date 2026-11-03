const db = require('../config/db');
const { parseExamFile } = require('../services/parserService');

/**
 * Generate a unique random exam access code format: EXAM-XXXX
 */
async function generateUniqueExamCode() {
  let isUnique = false;
  let code = '';
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    attempts++;
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    code = `EXAM-${randomNum}`;

    const existing = await db.query('SELECT id FROM exams WHERE code = $1', [code]);
    if (existing.rows.length === 0) {
      isUnique = true;
    }
  }

  return code;
}

/**
 * POST /api/exams/parse-document
 * Uploads PDF/DOCX and extracts structured questions
 */
async function parseDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No document file uploaded. Please attach a valid PDF or DOCX file.',
    });
  }

  try {
    const parseResult = await parseExamFile(req.file);

    return res.status(200).json({
      success: true,
      message: 'Document parsed successfully.',
      data: parseResult,
    });
  } catch (err) {
    console.error('[Document Parse Error]:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to parse assessment document.',
    });
  }
}

/**
 * POST /api/exams
 * Creates and publishes an exam with questions and options
 */
async function createExam(req, res) {
  const {
    title,
    description,
    duration,
    durationMinutes,
    batch = 'General Batch',
    passingPercentage = 50.0,
    maxTabSwitches = 3,
    shuffleQuestions = true,
    questions = [],
  } = req.body;

  const durationVal = parseInt(duration || durationMinutes, 10);

  if (!title || !durationVal || isNaN(durationVal)) {
    return res.status(400).json({
      success: false,
      message: 'Exam title and valid duration (in minutes) are required.',
    });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const examCode = await generateUniqueExamCode();
    const teacherId = req.user.id;

    // Insert Exam Header
    const examRes = await client.query(
      `INSERT INTO exams (
        code, teacher_id, title, description, duration_minutes, batch,
        passing_percentage, max_tab_switches, shuffle_questions, is_published
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, code, title, duration_minutes, batch, created_at`,
      [
        examCode,
        teacherId,
        title.trim(),
        description || null,
        durationVal,
        batch.trim(),
        parseFloat(passingPercentage) || 50.0,
        parseInt(maxTabSwitches, 10) || 3,
        Boolean(shuffleQuestions),
        true,
      ]
    );

    const createdExam = examRes.rows[0];
    const examId = createdExam.id;

    // Insert Questions and Options
    let totalExamMarks = 0;

    // Use default templates if no questions provided
    const questionsToInsert = (Array.isArray(questions) && questions.length > 0)
      ? questions
      : [
          {
            prompt: `Assessment Question 1 for ${title}: Which architectural pattern provides optimal decoupling for asynchronous event pipelines?`,
            options: [
              'Event-Driven Microservices with Distributed Commit Log (e.g. Apache Kafka)',
              'Synchronous Monolithic RPC with hardcoded IP bindings',
              'Point-to-point unbuffered socket streams',
              'Periodic polling via single-threaded timer loops',
            ],
            correctIndex: 0,
            marks: 2.0,
            negativeMarks: 0.5,
          },
          {
            prompt: `Assessment Question 2 for ${title}: When deploying across multi-region cloud infrastructures, how is split-brain scenario prevented during a partition?`,
            options: [
              'Disabling database write logs entirely during the event',
              'Enforcing Quorum-based leader election requiring (N/2 + 1) nodes',
              'Accepting unverified writes blindly from all partitioned nodes',
              'Shutting down all storage clusters permanently',
            ],
            correctIndex: 1,
            marks: 2.0,
            negativeMarks: 0.5,
          },
          {
            prompt: `Assessment Question 3 for ${title}: What is the primary purpose of circuit breaker patterns in distributed network requests?`,
            options: [
              'Preventing cascading system failures by failing fast when dependent services are degraded',
              'Encrypting TLS packets at the kernel level',
              'Accelerating DNS resolution via local caches',
              'Compressing JSON request bodies into binary schemas',
            ],
            correctIndex: 0,
            marks: 2.0,
            negativeMarks: 0.5,
          },
        ];

    for (let i = 0; i < questionsToInsert.length; i++) {
      const q = questionsToInsert[i];
      const marksVal = parseFloat(q.marks) || 2.0;
      const negMarksVal = parseFloat(q.negativeMarks) || 0.5;
      totalExamMarks += marksVal;

      const qRes = await client.query(
        `INSERT INTO questions (exam_id, question_text, question_order, marks, negative_marks)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [examId, q.prompt || q.questionText, i + 1, marksVal, negMarksVal]
      );
      const questionId = qRes.rows[0].id;

      const opts = Array.isArray(q.options) ? q.options : [];
      for (let j = 0; j < opts.length; j++) {
        const optText = typeof opts[j] === 'string' ? opts[j] : (opts[j].text || opts[j].optionText || '');
        const isCorrect = (q.correctIndex !== undefined && q.correctIndex === j) || Boolean(opts[j].isCorrect);

        await client.query(
          `INSERT INTO options (question_id, option_index, option_text, is_correct)
           VALUES ($1, $2, $3, $4)`,
          [questionId, j, optText, isCorrect]
        );
      }
    }

    // Update total marks on exam
    await client.query('UPDATE exams SET total_marks = $1 WHERE id = $2', [totalExamMarks, examId]);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Exam created and published successfully.',
      data: {
        examId: createdExam.id,
        code: createdExam.code,
        title: createdExam.title,
        durationMinutes: createdExam.duration_minutes,
        batch: createdExam.batch,
        questionsCount: questionsToInsert.length,
        totalMarks: totalExamMarks,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Create Exam Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create and publish examination.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  } finally {
    client.release();
  }
}

/**
 * GET /api/exams/teacher
 * Retrieves all exams created by the authenticated teacher with submission metrics
 */
async function getTeacherExams(req, res) {
  try {
    const result = await db.query(
      `SELECT e.id, e.code, e.title, e.duration_minutes, e.batch, e.is_published,
              e.total_marks, e.created_at,
              COUNT(DISTINCT q.id) AS questions_count,
              COUNT(DISTINCT s.id) AS submissions_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.status != 'IN_PROGRESS'
       WHERE e.teacher_id = $1
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [req.user.id]
    );

    const formatted = result.rows.map(r => ({
      id: r.id,
      code: r.code,
      title: r.title,
      duration: r.duration_minutes,
      batch: r.batch,
      totalMarks: parseFloat(r.total_marks),
      questionsCount: parseInt(r.questions_count, 10),
      submissions: parseInt(r.submissions_count, 10),
      isPublished: r.is_published,
      createdAt: r.created_at,
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error('[Get Teacher Exams Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve exams list.',
    });
  }
}

/**
 * GET /api/exams/code/:code
 * Public / Student verification endpoint to inspect pre-exam metadata
 * STRICTLY OMITS questions and option keys
 */
async function findExamByCode(req, res) {
  const code = (req.params.code || '').trim().toUpperCase();

  try {
    const result = await db.query(
      `SELECT e.id, e.code, e.title, e.description, e.duration_minutes, e.batch,
              e.passing_percentage, e.total_marks, e.max_tab_switches,
              COUNT(q.id) as questions_count
       FROM exams e
       LEFT JOIN questions q ON q.exam_id = e.id
       WHERE UPPER(e.code) = $1 AND e.is_published = TRUE
       GROUP BY e.id`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Examination with access code "${code}" was not found or is not currently active.`,
      });
    }

    const exam = result.rows[0];
    return res.status(200).json({
      success: true,
      data: {
        id: exam.id,
        code: exam.code,
        title: exam.title,
        description: exam.description,
        durationMinutes: exam.duration_minutes,
        batch: exam.batch,
        passingPercentage: parseFloat(exam.passing_percentage),
        totalMarks: parseFloat(exam.total_marks),
        maxTabSwitches: exam.max_tab_switches,
        questionsCount: parseInt(exam.questions_count, 10),
      },
    });
  } catch (err) {
    console.error('[Find Exam By Code Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to look up exam details.',
    });
  }
}

/**
 * POST /api/exams/:code/start
 * Initializes student exam attempt, records started_at timestamp,
 * and delivers sanitized question payload (WITHOUT answer keys)
 */
async function startExam(req, res) {
  const code = (req.params.code || '').trim().toUpperCase();
  const studentId = req.user.id;

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch exam
    const examRes = await client.query(
      `SELECT id, code, title, duration_minutes, max_tab_switches, shuffle_questions
       FROM exams
       WHERE UPPER(code) = $1 AND is_published = TRUE`,
      [code]
    );

    if (examRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or inactive.',
      });
    }
    const exam = examRes.rows[0];

    // 2. Check for existing submission attempt
    const existingSub = await client.query(
      `SELECT id, started_at, status FROM submissions WHERE exam_id = $1 AND student_id = $2`,
      [exam.id, studentId]
    );

    let submissionId;
    if (existingSub.rows.length > 0) {
      const sub = existingSub.rows[0];
      if (sub.status === 'SUBMITTED' || sub.status === 'AUTO_SUBMITTED' || sub.status === 'DISQUALIFIED') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          success: false,
          message: 'You have already completed and submitted this examination.',
        });
      }
      submissionId = sub.id;
    } else {
      // Create new session submission
      const newSub = await client.query(
        `INSERT INTO submissions (exam_id, student_id, started_at, status)
         VALUES ($1, $2, CURRENT_TIMESTAMP, 'IN_PROGRESS')
         RETURNING id`,
        [exam.id, studentId]
      );
      submissionId = newSub.rows[0].id;
    }

    // 3. Fetch Questions and Options (STRICTLY EXCLUDING is_correct)
    const questionsRes = await client.query(
      `SELECT q.id as question_id, q.question_text, q.question_order, q.marks, q.negative_marks,
              o.id as option_id, o.option_index, o.option_text
       FROM questions q
       JOIN options o ON o.question_id = q.id
       WHERE q.exam_id = $1
       ORDER BY q.question_order ASC, o.option_index ASC`,
      [exam.id]
    );

    const questionsMap = {};
    for (const row of questionsRes.rows) {
      if (!questionsMap[row.question_id]) {
        questionsMap[row.question_id] = {
          id: row.question_id,
          prompt: row.question_text,
          order: row.question_order,
          marks: parseFloat(row.marks),
          negativeMarks: parseFloat(row.negative_marks),
          options: [],
        };
      }
      // Only option_id, option_index, option_text are sent to candidate
      questionsMap[row.question_id].options.push({
        id: row.option_id,
        index: row.option_index,
        text: row.option_text,
      });
    }

    let questionsArray = Object.values(questionsMap);

    // Optional shuffle if exam parameter enabled
    if (exam.shuffle_questions) {
      questionsArray.sort(() => Math.random() - 0.5);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Exam session initialized.',
      data: {
        submissionId,
        exam: {
          id: exam.id,
          code: exam.code,
          title: exam.title,
          durationMinutes: exam.duration_minutes,
          maxTabSwitches: exam.max_tab_switches,
        },
        questions: questionsArray,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Start Exam Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize exam session.',
    });
  } finally {
    client.release();
  }
}

module.exports = {
  parseDocument,
  createExam,
  getTeacherExams,
  findExamByCode,
  startExam,
};
