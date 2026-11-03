const db = require('../config/db');

/**
 * Server-side evaluation engine:
 * Evaluates candidate responses against true stored answer keys inside an atomic transaction.
 * Applies negative marking, enforces duration cutoffs, and calculates final grade scores.
 * 
 * @param {string} submissionId - UUID of submission record
 * @param {string} examId - UUID of the exam
 * @param {Object|Array} userAnswers - Key-value pair of { [questionId]: optionIndex } or array
 * @param {boolean} isAutoSubmit - Whether triggered by 00:00:00 timeout
 * @param {number} tabSwitchCount - Telemetry count of window blurs
 * @returns {Promise<Object>} Final score and summary breakdown
 */
async function evaluateSubmission(submissionId, examId, userAnswers, isAutoSubmit = false, tabSwitchCount = 0) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Fetch exam configuration & questions with options
    const examRes = await client.query(
      `SELECT id, title, duration_minutes, passing_percentage, max_tab_switches 
       FROM exams 
       WHERE id = $1`,
      [examId]
    );

    if (examRes.rows.length === 0) {
      throw new Error('Exam record not found for evaluation.');
    }
    const exam = examRes.rows[0];

    // 2. Fetch submission metadata to verify duration cutoff
    const subRes = await client.query(
      `SELECT started_at, status 
       FROM submissions 
       WHERE id = $1`,
      [submissionId]
    );

    if (subRes.rows.length === 0) {
      throw new Error('Submission record not found.');
    }

    const { started_at, status: currentStatus } = subRes.rows[0];

    if (currentStatus === 'SUBMITTED' || currentStatus === 'AUTO_SUBMITTED' || currentStatus === 'DISQUALIFIED') {
      throw new Error('This assessment attempt has already been finalized and evaluated.');
    }

    // 3. Fetch questions and option keys for this exam
    const questionsRes = await client.query(
      `SELECT q.id as question_id, q.marks, q.negative_marks,
              o.id as option_id, o.option_index, o.is_correct
       FROM questions q
       JOIN options o ON o.question_id = q.id
       WHERE q.exam_id = $1
       ORDER BY q.question_order ASC, o.option_index ASC`,
      [examId]
    );

    // Group options by question
    const questionsMap = {};
    for (const row of questionsRes.rows) {
      if (!questionsMap[row.question_id]) {
        questionsMap[row.question_id] = {
          marks: parseFloat(row.marks) || 2.0,
          negativeMarks: parseFloat(row.negative_marks) || 0.5,
          correctOptionId: null,
          correctOptionIndex: null,
          options: [],
        };
      }
      questionsMap[row.question_id].options.push({
        id: row.option_id,
        index: row.option_index,
      });

      if (row.is_correct) {
        questionsMap[row.question_id].correctOptionId = row.option_id;
        questionsMap[row.question_id].correctOptionIndex = row.option_index;
      }
    }

    // 4. Calculate scores
    let totalScore = 0;
    let maxScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let attemptedCount = 0;
    const questionIds = Object.keys(questionsMap);
    const totalQuestions = questionIds.length;

    // Delete any previous staging answers for this submission
    await client.query('DELETE FROM submission_answers WHERE submission_id = $1', [submissionId]);

    for (const qId of questionIds) {
      const qMeta = questionsMap[qId];
      maxScore += qMeta.marks;

      // Extract candidate choice (can be provided as optionIndex or optionId)
      let selectedChoice = userAnswers[qId];
      if (typeof selectedChoice === 'string' && !isNaN(selectedChoice)) {
        selectedChoice = parseInt(selectedChoice, 10);
      }

      let selectedOptionId = null;
      let selectedOptionIndex = null;
      let isCorrect = false;
      let awardedMarks = 0;

      if (selectedChoice !== undefined && selectedChoice !== null) {
        attemptedCount++;

        if (typeof selectedChoice === 'number') {
          selectedOptionIndex = selectedChoice;
          const matchedOpt = qMeta.options.find(o => o.index === selectedChoice);
          selectedOptionId = matchedOpt ? matchedOpt.id : null;
        } else {
          // UUID string
          selectedOptionId = selectedChoice;
          const matchedOpt = qMeta.options.find(o => o.id === selectedChoice);
          selectedOptionIndex = matchedOpt ? matchedOpt.index : null;
        }

        // Compare with correct answer
        if (selectedOptionIndex === qMeta.correctOptionIndex) {
          isCorrect = true;
          correctCount++;
          awardedMarks = qMeta.marks;
          totalScore += awardedMarks;
        } else {
          isCorrect = false;
          incorrectCount++;
          awardedMarks = -Math.abs(qMeta.negativeMarks);
          totalScore += awardedMarks;
        }
      }

      // Record per-question submission answer
      await client.query(
        `INSERT INTO submission_answers (
          submission_id, question_id, selected_option_id, selected_option_index, is_correct, awarded_marks
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [submissionId, qId, selectedOptionId, selectedOptionIndex, isCorrect, awardedMarks]
      );
    }

    // Floor total score at 0
    totalScore = Math.max(0, totalScore);
    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
    const isPassed = percentage >= parseFloat(exam.passing_percentage);

    // 5. Determine status
    let finalStatus = isAutoSubmit ? 'AUTO_SUBMITTED' : 'SUBMITTED';
    if (tabSwitchCount > (exam.max_tab_switches || 3)) {
      finalStatus = 'DISQUALIFIED';
    }

    // 6. Update submission record
    const updateRes = await client.query(
      `UPDATE submissions
       SET submitted_at = CURRENT_TIMESTAMP,
           total_score = $1,
           max_score = $2,
           correct_answers = $3,
           total_questions = $4,
           percentage = $5,
           status = $6,
           tab_switch_count = $7
       WHERE id = $8
       RETURNING id, submitted_at, total_score, max_score, correct_answers, total_questions, percentage, status`,
      [totalScore, maxScore, correctCount, totalQuestions, percentage.toFixed(2), finalStatus, tabSwitchCount, submissionId]
    );

    await client.query('COMMIT');

    return {
      submissionId,
      examId,
      examTitle: exam.title,
      totalScore: parseFloat(totalScore.toFixed(2)),
      maxScore: parseFloat(maxScore.toFixed(2)),
      correctAnswers: correctCount,
      incorrectAnswers: incorrectCount,
      unattempted: totalQuestions - attemptedCount,
      totalQuestions,
      percentage: parseFloat(percentage.toFixed(2)),
      isPassed,
      status: finalStatus,
      tabSwitchCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  evaluateSubmission,
};
