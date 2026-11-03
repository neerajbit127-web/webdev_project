const db = require('../config/db');
const { evaluateSubmission } = require('../services/evaluationService');

/**
 * POST /api/submissions/:id/submit
 * Submits all responses and computes server-side grade
 */
async function submitAnswers(req, res) {
  const submissionId = req.params.id;
  const { answers = {}, isAutoSubmit = false, tabSwitchCount = 0 } = req.body;
  const studentId = req.user.id;

  try {
    // Verify ownership of submission
    const checkRes = await db.query(
      `SELECT exam_id, student_id, status FROM submissions WHERE id = $1`,
      [submissionId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission attempt not found.',
      });
    }

    const submission = checkRes.rows[0];

    // Authorize that current student owns this submission
    if (submission.student_id !== studentId && req.user.role !== 'TEACHER' && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You cannot submit an assessment on behalf of another candidate.',
      });
    }

    const evaluationResult = await evaluateSubmission(
      submissionId,
      submission.exam_id,
      answers,
      Boolean(isAutoSubmit),
      parseInt(tabSwitchCount, 10) || 0
    );

    return res.status(200).json({
      success: true,
      message: isAutoSubmit 
        ? 'Time elapsed. Exam was auto-submitted and graded successfully.'
        : 'Exam submitted and graded successfully.',
      data: evaluationResult,
    });
  } catch (err) {
    console.error('[Submit Answers Error]:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'An error occurred during score evaluation.',
    });
  }
}

/**
 * POST /api/submissions/:id/telemetry
 * Real-time anti-cheat event logger (Tab switches, window focus loss)
 */
async function logTelemetryEvent(req, res) {
  const submissionId = req.params.id;
  const { eventType = 'TAB_SWITCH', details = 'Window focus lost' } = req.body;
  const studentId = req.user.id;

  try {
    const subRes = await db.query(
      `SELECT s.id, s.exam_id, s.student_id, s.tab_switch_count, e.max_tab_switches
       FROM submissions s
       JOIN exams e ON e.id = s.exam_id
       WHERE s.id = $1`,
      [submissionId]
    );

    if (subRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission record not found.' });
    }

    const sub = subRes.rows[0];
    if (sub.student_id !== studentId) {
      return res.status(403).json({ success: false, message: 'Unauthorized telemetry logging.' });
    }

    const updatedCount = sub.tab_switch_count + 1;
    const maxAllowed = sub.max_tab_switches || 3;
    const isLimitExceeded = updatedCount >= maxAllowed;

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      event: eventType,
      details,
      strike: updatedCount,
    });

    await db.query(
      `UPDATE submissions
       SET tab_switch_count = $1,
           integrity_log = integrity_log || $2::jsonb
       WHERE id = $3`,
      [updatedCount, logEntry, submissionId]
    );

    return res.status(200).json({
      success: true,
      data: {
        strikes: updatedCount,
        maxAllowed,
        isLimitExceeded,
        warning: isLimitExceeded 
          ? 'Integrity threshold breached. Automated disqualification may be applied.'
          : `Strike ${updatedCount} of ${maxAllowed} logged.`,
      },
    });
  } catch (err) {
    console.error('[Telemetry Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to record telemetry event.',
    });
  }
}

/**
 * GET /api/submissions/:id/result
 * Fetches finalized score receipt
 */
async function getSubmissionResult(req, res) {
  const submissionId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const result = await db.query(
      `SELECT s.id, s.exam_id, s.student_id, s.started_at, s.submitted_at,
              s.total_score, s.max_score, s.correct_answers, s.total_questions,
              s.percentage, s.status, s.tab_switch_count,
              e.title as exam_title, e.code as exam_code, e.passing_percentage,
              u.name as student_name, u.email as student_identifier
       FROM submissions s
       JOIN exams e ON e.id = s.exam_id
       JOIN users u ON u.id = s.student_id
       WHERE s.id = $1`,
      [submissionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission result not found.' });
    }

    const row = result.rows[0];

    // Students may only view their own submissions
    if (userRole === 'STUDENT' && row.student_id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        submissionId: row.id,
        examTitle: row.exam_title,
        examCode: row.exam_code,
        studentName: row.student_name,
        studentId: row.student_identifier,
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        totalScore: parseFloat(row.total_score),
        maxScore: parseFloat(row.max_score),
        correctAnswers: row.correct_answers,
        totalQuestions: row.total_questions,
        percentage: parseFloat(row.percentage),
        isPassed: parseFloat(row.percentage) >= parseFloat(row.passing_percentage),
        status: row.status,
        tabSwitchCount: row.tab_switch_count,
      },
    });
  } catch (err) {
    console.error('[Get Submission Result Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve assessment results.',
    });
  }
}

module.exports = {
  submitAnswers,
  logTelemetryEvent,
  getSubmissionResult,
};
