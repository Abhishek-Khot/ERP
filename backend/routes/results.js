const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const resultController = require('../controllers/resultController');
const checkPermission = require('../middleware/permissionCheck');

// Apply authentication to all routes
router.use(authMiddleware.auth);

// Create or update student result - requires viewResults permission
router.post('/create',
  authMiddleware.authorize(['admin', 'teacher']),
  checkPermission('viewResults'),
  resultController.createOrUpdateResult
);

// Save results (simple endpoint for Results page) - requires viewResults permission
router.post('/save',
  authMiddleware.authorize(['admin', 'teacher']),
  checkPermission('viewResults'),
  resultController.saveResults
);

// Get existing results for a class and section - requires viewResults permission
router.get('/',
  checkPermission('viewResults'),
  resultController.getResults
);

// Update a single student result - requires viewResults permission
router.put('/:resultId',
  authMiddleware.authorize(['admin', 'teacher']),
  checkPermission('viewResults'),
  resultController.updateResult
);

// Freeze results for a class/section/subject/test - requires viewResults permission
router.post('/freeze',
  authMiddleware.authorize(['admin', 'teacher']),
  checkPermission('viewResults'),
  resultController.freezeResults
);

// Get student result history - requires viewResults permission
router.get('/student/:studentId/history',
  checkPermission('viewResults'),
  resultController.getStudentResultHistory
);

// Generate class performance report - requires viewResults permission
router.get('/class/:grade/:section/report',
  checkPermission('viewResults'),
  resultController.generateClassPerformanceReport
);

// Teacher-specific endpoint to view results
router.get('/teacher/view',
  authMiddleware.auth,
  resultController.getResultsForTeacher
);

// Get class performance statistics for dashboard - requires viewResults permission
router.get('/class-performance-stats',
  checkPermission('viewResults'),
  resultController.getClassPerformanceStats
);

module.exports = router;
