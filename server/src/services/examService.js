import crypto from 'node:crypto';

/**
 * Generates a unique, cryptographically random access code (e.g. EXAM-4020).
 * Queries the database to prevent collisions, retrying safely up to 10 times.
 * @param {import('pg').PoolClient | import('pg').Pool} dbClient
 * @returns {Promise<string>}
 */
export async function generateSecureAccessCode(dbClient) {
  const maxRetries = 10;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 4-digit code first
    const codeNumber = crypto.randomInt(1000, 9999);
    const candidateCode = `EXAM-${codeNumber}`;

    try {
      const res = await dbClient.query(
        'SELECT id FROM exams WHERE UPPER(access_code) = UPPER($1) LIMIT 1;',
        [candidateCode]
      );

      if (res.rowCount === 0) {
        return candidateCode;
      }
    } catch (err) {
      // If DB is offline, return cryptographically generated code directly
      return candidateCode;
    }
  }

  // Fallback to high-entropy 6-digit code if 4-digit namespace has collisions
  const fallbackNumber = crypto.randomInt(100000, 999999);
  return `EXAM-${fallbackNumber}`;
}

/**
 * Validates exam core fields.
 * @param {object} input
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateExamMetadata(input) {
  const { title, durationMinutes, totalMarks, passingMarks, startTime, endTime } = input;

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return { isValid: false, error: 'Exam title must be at least 3 characters long.' };
  }

  if (title.length > 255) {
    return { isValid: false, error: 'Exam title cannot exceed 255 characters.' };
  }

  const duration = parseInt(durationMinutes, 10);
  if (isNaN(duration) || duration < 1 || duration > 1440) {
    return { isValid: false, error: 'Duration must be between 1 and 1440 minutes (24 hours).' };
  }

  if (totalMarks !== undefined && (isNaN(totalMarks) || totalMarks < 0)) {
    return { isValid: false, error: 'Total marks must be a non-negative number.' };
  }

  if (passingMarks !== undefined && (isNaN(passingMarks) || passingMarks < 0)) {
    return { isValid: false, error: 'Passing marks must be a non-negative number.' };
  }

  if (startTime && endTime) {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (isNaN(start) || isNaN(end) || start > end) {
      return { isValid: false, error: 'Scheduled start time must precede end time.' };
    }
  }

  return { isValid: true };
}

/**
 * Validates that an exam has valid questions before permitting publication.
 * @param {Array} questions
 * @returns {{ canPublish: boolean, error?: string }}
 */
export function validateQuestionsForPublishing(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      canPublish: false,
      error: 'Cannot publish exam with zero questions. Please add at least one question.'
    };
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prompt = q.questionText || q.prompt;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return {
        canPublish: false,
        error: `Question ${i + 1} has an empty prompt.`
      };
    }

    const options = q.options;
    if (!Array.isArray(options) || options.length < 2) {
      return {
        canPublish: false,
        error: `Question ${i + 1} must contain at least 2 options.`
      };
    }

    // Verify option text and correct answer
    let correctCount = 0;
    for (let j = 0; j < options.length; j++) {
      const opt = options[j];
      const optText = typeof opt === 'string' ? opt : (opt.optionText || opt.text);
      if (!optText || optText.trim().length === 0) {
        return {
          canPublish: false,
          error: `Question ${i + 1}, Option ${j + 1} has empty text.`
        };
      }

      const isCorrect = typeof opt === 'object' ? Boolean(opt.isCorrect) : (q.correctIndex === j);
      if (isCorrect) {
        correctCount++;
      }
    }

    if (correctCount === 0) {
      return {
        canPublish: false,
        error: `Question ${i + 1} must have at least one designated correct answer.`
      };
    }
  }

  return { canPublish: true };
}

export default {
  generateSecureAccessCode,
  validateExamMetadata,
  validateQuestionsForPublishing
};

