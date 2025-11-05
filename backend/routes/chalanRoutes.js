const express = require('express');
const router = express.Router();
const chalanController = require('../controllers/chalanController');
const { auth, authorize } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(auth);

// Get next chalan number (no role restriction for this)
router.get('/next-chalan-number', chalanController.getNextChalanNumber);

// Development/Admin routes
router.get('/debug/student/:studentId', chalanController.getStudentChalanData);

// Standard routes - restricted to admin, superadmin, accountant
router.post('/generate', authorize('admin', 'superadmin', 'accountant'), chalanController.generateChalans);
router.get('/', chalanController.getChalans);
router.get('/student/:studentId', chalanController.getChalansByStudent);
router.get('/:id', chalanController.getChalanById);
router.post('/:id/pay', authorize('admin', 'superadmin', 'accountant'), chalanController.markAsPaid);

module.exports = router;
