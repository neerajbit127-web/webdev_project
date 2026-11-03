const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const { authenticateToken } = require('../middleware/auth');

router.post('/:id/submit', authenticateToken, submissionController.submitAnswers);
router.post('/:id/telemetry', authenticateToken, submissionController.logTelemetryEvent);
router.get('/:id/result', authenticateToken, submissionController.getSubmissionResult);

module.exports = router;
