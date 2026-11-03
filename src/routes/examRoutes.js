const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Teacher routes
router.post(
  '/parse-document',
  authenticateToken,
  requireRole('TEACHER', 'ADMIN'),
  upload.single('document'),
  examController.parseDocument
);

router.post(
  '/',
  authenticateToken,
  requireRole('TEACHER', 'ADMIN'),
  examController.createExam
);

router.get(
  '/teacher',
  authenticateToken,
  requireRole('TEACHER', 'ADMIN'),
  examController.getTeacherExams
);

// Student & Verification routes
router.get('/code/:code', examController.findExamByCode);

router.post(
  '/:code/start',
  authenticateToken,
  requireRole('STUDENT', 'ADMIN'),
  examController.startExam
);

module.exports = router;
