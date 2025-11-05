const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const assignmentController = require('../controllers/assignmentController');
const { auth, authorize } = require('../middleware/auth');
const checkPermission = require('../middleware/permissionCheck');

// Ensure temp directory exists
const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('✅ Created temp directory for assignments');
}

// Configure multer for assignment file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/temp/'); // Use temp directory
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow documents, images, and other common file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only documents, images, and archives are allowed'));
  }
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

// Apply authentication middleware to all routes
router.use(auth);

// Debug middleware to log user info
router.use((req, res, next) => {
  console.log('[ASSIGNMENTS DEBUG] User role:', req.user?.role);
  console.log('[ASSIGNMENTS DEBUG] User permissions:', req.user?.adminInfo?.permissions || req.user?.teacherInfo?.permissions || []);
  next();
});

// Assignment management routes - require viewAssignments permission
router.get('/', 
  authorize(['admin', 'teacher']),
  checkPermission('viewAssignments'),
  assignmentController.getAssignments
);

router.post('/', upload.array('attachments', 5), 
  authorize(['admin', 'teacher']),
  checkPermission('viewAssignments'),
  (req, res, next) => {
    // Log assignment creation attempt
    console.log('[ASSIGNMENT CREATE] Attempt by user:', {
      userId: req.user?.userId,
      role: req.user?.role,
      schoolCode: req.user?.schoolCode
    });
    console.log('[ASSIGNMENT CREATE] Request body:', {
      title: req.body?.title,
      subject: req.body?.subject,
      class: req.body?.class,
      section: req.body?.section
    });
    next();
  },
  assignmentController.createAssignment
);

// Assignment-specific routes - all require viewAssignments permission
router.get('/:assignmentId', checkPermission('viewAssignments'), assignmentController.getAssignmentById);
router.put('/:assignmentId', 
  (req, res, next) => {
    console.log('[UPDATE ROUTE] User role:', req.user?.role);
    console.log('[UPDATE ROUTE] Assignment ID:', req.params.assignmentId);
    next();
  },
  upload.array('attachments', 5), 
  authorize(['admin', 'teacher']), 
  checkPermission('viewAssignments'), 
  assignmentController.updateAssignment
);
router.patch('/:assignmentId/publish', authorize(['admin', 'teacher']), checkPermission('viewAssignments'), assignmentController.publishAssignment);
router.delete('/:assignmentId', authorize(['admin', 'teacher']), checkPermission('viewAssignments'), assignmentController.deleteAssignment);

// Submission routes - students can submit, teachers can view/grade
router.post('/:assignmentId/submit', upload.array('attachments', 5), authorize(['student']), assignmentController.submitAssignment);
router.get('/:assignmentId/submission', assignmentController.getStudentSubmission);
router.get('/:assignmentId/submissions', authorize(['admin', 'teacher']), checkPermission('viewAssignments'), assignmentController.getAssignmentSubmissions);
router.put('/submissions/:submissionId/grade', authorize(['admin', 'teacher']), checkPermission('viewAssignments'), assignmentController.gradeSubmission);

module.exports = router;
