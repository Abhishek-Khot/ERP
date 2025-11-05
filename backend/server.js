// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const DatabaseManager = require('./utils/databaseManager');
require('dotenv').config();
const path = require('path'); // Import path module
const multer = require('multer'); // <-- Import multer
const fs = require('fs'); // Import fs module for file operations

// Import your controller
const exportImportController = require('./controllers/exportImportController'); // <-- Import exportImportController

// Import middleware
const { auth } = require('./middleware/auth'); // <-- Import auth middleware (adjust path if needed)
const { setMainDbContext } = require('./middleware/schoolContext'); // <-- Import context middleware (adjust path if needed)


const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Added for handling form data potentially from import

// Configure multer for file uploads
// Make sure the 'uploads/' directory exists in your backend folder
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Middleware to attach mainDb to req
app.use((req, res, next) => {
  req.mainDb = mongoose.connection.db;
  console.log('[DEBUG] mainDb middleware executed.'); // Keep debug log concise
  next();
});

// Middleware to verify admin/superadmin access
const requireAdminAccess = (req, res, next) => {
  // Check if req.user exists and has the required role
  if (req.user && ['admin', 'superadmin'].includes(req.user.role)) {
    return next(); // User has access, proceed
  }
  // Access denied
  console.warn(`[AUTH] Access denied for user ${req.user?._id} with role ${req.user?.role} to admin route ${req.originalUrl}`);
  return res.status(403).json({
    success: false,
    message: 'Access denied. Admin privileges required.'
  });
};

// Import other routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const schoolRoutes = require('./routes/schools');
const schoolUserRoutes = require('./routes/schoolUsers');
const admissionRoutes = require('./routes/admissions');
const assignmentRoutes = require('./routes/assignments');
const attendanceRoutes = require('./routes/attendance');
const subjectRoutes = require('./routes/subjects');
const classSubjectsRoutes = require('./routes/classSubjects');
const timetableRoutes = require('./routes/timetables');
const resultRoutes = require('./routes/results');
const configRoutes = require('./routes/config');
const testDetailsRoutes = require('./routes/testDetails');
const superadminAcademicRoutes = require('./routes/superadminAcademic');
const superadminSubjectRoutes = require('./routes/superadminSubject');
const superadminClassRoutes = require('./routes/superadminClasses');
const superadminTestRoutes = require('./routes/superadminTests');
const userManagementRoutes = require('./routes/userManagement');
const adminClassRoutes = require('./routes/adminClasses');
const classesRoutes = require('./routes/classes');
const messagesRoutes = require('./routes/messages');
const feesRoutes = require('./routes/fees');
const reportsRoutes = require('./routes/reports');
const promotionRoutes = require('./routes/promotion');
const academicYearRoutes = require('./routes/academicYear');
const migrationRoutes = require('./routes/migration');
const leaveRoutes = require('./routes/leaveRoutes');
const idCardTemplateRoutes = require('./routes/idCardTemplates');
const chalanRoutes = require('./routes/chalanRoutes');

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve ID card templates statically
app.use('/idcard-templates', express.static(path.join(__dirname, 'idcard-templates')));

// Test endpoint for debugging
app.get('/api/test-endpoint', (req, res) => {
  console.log('[TEST ENDPOINT] Request received');
  console.log('[TEST ENDPOINT] Headers:', req.headers);
  return res.status(200).json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString()
  });
});

// Direct test endpoint for class subjects
app.get('/api/direct-test/class-subjects/:className', async (req, res) => {
  try {
    let schoolCode = req.headers['x-school-code'] || req.query.schoolCode;
    if (req.user && req.user.schoolCode) { schoolCode = req.user.schoolCode; }
    if (!schoolCode) { schoolCode = req.query.schoolCode; }
    if (!schoolCode) { return res.status(400).json({ success: false, message: 'School code is required.' }); }

    console.log('[DIRECT TEST] Request received for class:', req.params.className, 'in school:', schoolCode);
    const className = req.params.className;
    const academicYear = req.query.academicYear || '2024-25';
    const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
    const ClassSubjectsSimple = require('./models/ClassSubjectsSimple');
    const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);

    console.log(`[DIRECT TEST] Looking for class "${className}" in school "${schoolCode}"`);
    const classSubjects = await SchoolClassSubjects.findOne({ schoolCode, className, academicYear, isActive: true });

    if (!classSubjects) {
      console.log(`[DIRECT TEST] Class "${className}" not found in school "${schoolCode}"`);
      return res.status(404).json({ success: false, message: `Class "${className}" not found` });
    }
    console.log(`[DIRECT TEST] Found class "${className}"`);
    return res.status(200).json({
      success: true, message: 'Direct test successful',
      data: {
        classId: classSubjects._id, className: classSubjects.className, grade: classSubjects.grade, section: classSubjects.section,
        academicYear: classSubjects.academicYear, schoolCode: schoolCode,
        subjects: classSubjects.subjects.filter(s => s.isActive).map(s => ({ name: s.name, isActive: s.isActive }))
      }
    });
  } catch (error) {
    console.error('[DIRECT TEST] Error:', error);
    return res.status(500).json({ success: false, message: 'Direct test failed', error: error.message });
  }
});

// Direct test endpoint for assignments
app.get('/api/direct-test/assignments', async (req, res) => {
  try {
    let schoolCode = req.headers['x-school-code'] || req.query.schoolCode;
    if (req.user && req.user.schoolCode) { schoolCode = req.user.schoolCode; }
    if (!schoolCode) { schoolCode = req.query.schoolCode; }
    if (!schoolCode) { return res.status(400).json({ success: false, message: 'School code is required.' }); }

    console.log('[DIRECT TEST ASSIGNMENTS] Request received for school:', schoolCode);
    const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
    const AssignmentMultiTenant = require('./models/AssignmentMultiTenant');
    const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

    console.log(`[DIRECT TEST ASSIGNMENTS] Looking for assignments in school "${schoolCode}"`);
    const assignments = await SchoolAssignment.find({ schoolCode, isPublished: true }).sort({ createdAt: -1 });

    console.log(`[DIRECT TEST ASSIGNMENTS] Found ${assignments.length} assignments`);
    return res.status(200).json({ success: true, message: `Found ${assignments.length} assignments`, assignments, schoolCode });
  } catch (error) {
    console.error('[DIRECT TEST ASSIGNMENTS] Error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Use other routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/school-users', schoolUserRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/class-subjects', classSubjectsRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/config', configRoutes);
app.use('/api/test-details', testDetailsRoutes);
app.use('/api/superadmin/academic', superadminAcademicRoutes);
app.use('/api/superadmin/subjects', superadminSubjectRoutes);
app.use('/api/superadmin/classes', superadminClassRoutes);
app.use('/api/superadmin/tests', superadminTestRoutes);
app.use('/api/user-management', userManagementRoutes);
app.use('/api/admin/classes', adminClassRoutes);
app.use('/api/admin/promotion', promotionRoutes);
app.use('/api/admin/academic-year', academicYearRoutes);
app.use('/api/admin/migration', migrationRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/leave-requests', leaveRoutes);
app.use('/api/id-card-templates', idCardTemplateRoutes);
app.use('/api/chalans', chalanRoutes);


// --- Define Export/Import Routes Directly ---

// Generate Template Route
// GET /api/export-import/:schoolCode/template?role=student
app.get('/api/export-import/:schoolCode/template',
  auth,               // 1. Authenticate the user
  setMainDbContext,   // 2. Set DB context (might not be strictly needed if controller fetches schoolId again)
  requireAdminAccess, // 3. Check if user is admin/superadmin
  exportImportController.generateTemplate // 4. Call the controller function
);

// Import Users Route
// POST /api/export-import/:schoolCode/import
app.post('/api/export-import/:schoolCode/import',
  auth,               // 1. Authenticate
  setMainDbContext,   // 2. Set DB context
  requireAdminAccess, // 3. Check role
  upload.single('file'), // 4. Use multer middleware to handle the 'file' upload
  exportImportController.importUsers // 5. Call the controller function
);

// Export Users Route
// GET /api/export-import/:schoolCode/export?role=student&format=csv
app.get('/api/export-import/:schoolCode/export',
  auth,               // 1. Authenticate
  setMainDbContext,   // 2. Set DB context
  requireAdminAccess, // 3. Check role
  exportImportController.exportUsers // 4. Call the controller function
);

// --- End Export/Import Routes ---


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/institute_erp';

// Ensure JWT_SECRET is set before starting server logic that might use it
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set. Using a default secret for development purposes.');
  process.env.JWT_SECRET = 'default_development_secret';
}

mongoose.connect(MONGODB_URI, {
  maxPoolSize: 50,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false
})
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas with optimizations');
    console.log('📊 Connection pool size: 50');

    // Initialize Database Manager
    await DatabaseManager.initialize();
    console.log('✅ Database Manager initialized');

    console.log('🚀 Server ready for multi-tenant operations');

    // Start server only after successful DB connection and initialization
    app.listen(PORT, () => {
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`🏫 Multi-tenant school ERP system ready`);
      
      // Start temp folder cleanup task (runs every 30 seconds)
      startTempFolderCleanup();
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1); // Exit if DB connection fails
  });


// Temp folder cleanup function
function cleanupTempFolder() {
  const tempDir = path.join(__dirname, 'uploads', 'temp');
  
  // Check if temp directory exists
  if (!fs.existsSync(tempDir)) {
    console.log('ℹ️ Temp directory does not exist, skipping cleanup');
    return;
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    
    if (files.length === 0) {
      // console.log('✅ Temp folder is already clean (0 files)');
      return;
    }
    
    let deletedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000); // 5 minutes in milliseconds
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      
      try {
        const stats = fs.statSync(filePath);
        
        // Only delete files, not directories
        if (stats.isFile()) {
          // Only delete files older than 5 minutes to avoid EPERM errors
          const fileAge = stats.mtimeMs;
          if (fileAge < fiveMinutesAgo) {
            try {
              // Try to release file handle before deletion (Windows compatibility)
              fs.closeSync(fs.openSync(filePath, 'r'));
            } catch (e) {
              // Ignore if file handle release fails
            }
            
            fs.unlinkSync(filePath);
            deletedCount++;
          } else {
            skippedCount++;
          }
        }
      } catch (err) {
        // Only log EPERM errors as warnings, not errors
        if (err.code === 'EPERM') {
          // File is still in use, skip it silently
          skippedCount++;
        } else {
          console.error(`❌ Error deleting ${file}:`, err.message);
          errorCount++;
        }
      }
    });
    
    if (deletedCount > 0 || errorCount > 0) {
      console.log(`🗑️ Temp cleanup: Deleted ${deletedCount} file(s), Skipped ${skippedCount} file(s), ${errorCount} error(s)`);
    }
  } catch (err) {
    console.error('❌ Error reading temp directory:', err.message);
  }
}

// Start periodic temp folder cleanup
function startTempFolderCleanup() {
  console.log('🗑️ Starting temp folder cleanup task (runs every 60 seconds)...');
  
  // Run immediately on startup
  cleanupTempFolder();
  
  //Then run every 60 seconds (less aggressive for Windows)
  setInterval(() => {
    cleanupTempFolder();
  }, 1000); // 60 seconds
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  try {
    await DatabaseManager.closeAllConnections();
    await mongoose.connection.close();
    console.log('✅ All connections closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

// Note: server start moved to after successful DB connect