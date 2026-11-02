import { Router } from 'express';
import {
  createExam,
  getMyExams,
  getExamById,
  updateExam,
  publishExam,
  archiveExam,
  getExamSummary,
  getExamByAccessCode
} from '../controllers/examController.js';
import {
  getExamQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  unpublishExam
} from '../controllers/questionController.js';
import { verifyAuth, requireRole } from '../middleware/auth.js';

export const examRouter = Router();

// Public / Student Lookup Endpoint
examRouter.get('/code/:code', getExamByAccessCode);

// Teacher Exam Management Endpoints (Require TEACHER or ADMIN)
const teacherOnly = [verifyAuth, requireRole('TEACHER', 'ADMIN')];

// --- Core Exam Endpoints ---
// GET /api/exams/mine - list teacher's exams
examRouter.get('/mine', ...teacherOnly, getMyExams);

// POST /api/exams - create a draft exam
examRouter.post('/', ...teacherOnly, createExam);

// GET /api/exams/:id - get single exam details
examRouter.get('/:id', ...teacherOnly, getExamById);

// PATCH /api/exams/:id - update a draft
examRouter.patch('/:id', ...teacherOnly, updateExam);

// POST /api/exams/:id/publish - validate and publish
examRouter.post('/:id/publish', ...teacherOnly, publishExam);

// POST /api/exams/:id/unpublish - revert to DRAFT if 0 attempts
examRouter.post('/:id/unpublish', ...teacherOnly, unpublishExam);

// POST /api/exams/:id/archive - archive an exam
examRouter.post('/:id/archive', ...teacherOnly, archiveExam);

// GET /api/exams/:id/summary - teacher-facing analytics & submission summary
examRouter.get('/:id/summary', ...teacherOnly, getExamSummary);

// --- Question Management Endpoints (Teacher Drafts) ---
// GET /api/exams/:examId/questions - list questions including correct answer & explanation
examRouter.get('/:examId/questions', ...teacherOnly, getExamQuestions);

// POST /api/exams/:examId/questions - create question in exam draft
examRouter.post('/:examId/questions', ...teacherOnly, createQuestion);

// PUT /api/exams/:examId/questions/reorder - reorder questions (placed before :questionId to avoid route collision)
examRouter.put('/:examId/questions/reorder', ...teacherOnly, reorderQuestions);

// PATCH /api/exams/:examId/questions/:questionId - update single question and options
examRouter.patch('/:examId/questions/:questionId', ...teacherOnly, updateQuestion);

// DELETE /api/exams/:examId/questions/:questionId - delete single question
examRouter.delete('/:examId/questions/:questionId', ...teacherOnly, deleteQuestion);

export default examRouter;
