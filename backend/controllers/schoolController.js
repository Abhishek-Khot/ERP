const mongoose = require('mongoose');
const { gradeSystem, gradeUtils } = require('../utils/gradeSystem');
const DatabaseManager = require('../utils/databaseManager');
const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');
const School = require('../models/School');
const User = require('../models/User');
const TestDetails = require('../models/TestDetails');
const sharp = require('sharp');
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId, deleteLocalFile } = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');

// Helper to normalize a provided name into schema-compliant fields
function normalizeName(inputName, fallbackLast = 'User') {
  const nameStr = typeof inputName === 'string'
    ? inputName.trim()
    : `${inputName?.firstName || ''} ${inputName?.lastName || ''}`.trim();
  const parts = nameStr.split(/\s+/).filter(Boolean);
  let firstName = parts[0] || 'User';
  let lastName = parts.length > 1 ? parts.slice(1).join(' ') : fallbackLast;

  // Ensure minlength constraints (>= 2)
  if (firstName.length < 2) firstName = 'User';
  if (!lastName || lastName.length < 2) lastName = fallbackLast.length >= 2 ? fallbackLast : 'Member';

  const displayName = `${firstName} ${lastName}`.trim();
  return { firstName, lastName, displayName };
}

// Add a new admin to a school
exports.addAdminToSchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    // Accept either a Mongo ObjectId (school _id) or a school code (like 'p').
    // Try lookup by _id first; if that fails (CastError) or returns null,
    // fall back to lookup by code (case-insensitive).
    let school = null;
    try {
      if (schoolId) school = await School.findById(schoolId);
    } catch (err) {
      // ignore cast error and continue to try by code
      school = null;
    }

    if (!school) {
      // try by code (case-insensitive)
      school = await School.findOne({ code: new RegExp(`^${schoolId}$`, 'i') });
    }

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }
    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
  // Normalize name into structured fields
  const { firstName, lastName, displayName } = normalizeName(name, 'Admin');

    // Generate userId using the DatabaseManager
    const DatabaseManager = require('../utils/databaseManager');
    const userId = await DatabaseManager.generateUserId(school.code, 'admin');

    user = new User({
      userId,
  name: { firstName, lastName, displayName },
      email,
      password: hashedPassword,
      role: 'admin',
      contact: { primaryPhone: (phone && String(phone)) || '9999999999' },
      address: {
        permanent: {
          street: 'Address not provided',
          city: 'NA',
          state: 'NA',
          country: 'India',
          pincode: '560001'
        }
      },
      schoolId: school._id,
      schoolCode: school.code,
      schoolAccess: {
        joinedDate: new Date(),
        assignedBy: req.user._id,
        status: 'active',
        accessLevel: 'full'
      },
      adminDetails: {
        permissions: ['manage_teachers', 'manage_students', 'manage_parents', 'view_reports'],
        assignedBy: req.user._id,
        assignedAt: new Date()
      }
    });
    await user.save();
    // Add to school's admins array
    school.admins = school.admins || [];
    school.admins.push(user._id);
    await school.save();
    console.log(`[ADMIN ADDED] ${user.email} added as admin to school ${school.name} (${school._id}) by ${req.user.email}`);
    res.status(201).json({ 
      message: 'Admin added successfully', 
  admin: { id: user._id, name: user.name.displayName || displayName, email: user.email, phone: user.contact?.primaryPhone }
    });
  } catch (error) {
    console.error('Error adding admin to school:', error);
    res.status(500).json({ message: 'Error adding admin to school', error: error.message });
  }
};

// Get grade system information
exports.getGradeSystem = async (req, res) => {
  try {
    res.json({
      success: true,
      gradeSystem: {
        schoolLevels: gradeSystem.schoolLevels,
        gradeStructure: gradeSystem.gradeStructure,
        gradingSystems: gradeSystem.gradingSystems,
        assessmentPatterns: gradeSystem.assessmentPatterns
      }
    });
  } catch (error) {
    console.error('Error fetching grade system:', error);
    res.status(500).json({ message: 'Error fetching grade system' });
  }
};

// Get subjects for a specific grade
exports.getSubjectsForGrade = async (req, res) => {
  try {
    const { grade, stream } = req.query;
    
    if (!grade) {
      return res.status(400).json({ message: 'Grade is required' });
    }

    const subjects = gradeUtils.getSubjectsForGrade(grade, stream);
    const gradeInfo = gradeSystem.gradeStructure[grade];
    const level = gradeUtils.getGradeLevel(grade);

    res.json({
      success: true,
      grade,
      stream: stream || null,
      level,
      subjects,
      gradeInfo: {
        displayName: gradeInfo?.displayName,
        ageGroup: gradeInfo?.ageGroup,
        maxStudentsPerSection: gradeInfo?.maxStudentsPerSection,
        assessmentType: gradeInfo?.assessmentType,
        features: gradeInfo?.features
      }
    });
  } catch (error) {
    console.error('Error fetching subjects for grade:', error);
    res.status(500).json({ message: 'Error fetching subjects for grade' });
  }
};

// Get school statistics by grade levels
exports.getSchoolStatsByLevel = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { academicYear } = req.query;

    const Class = require('../models/Class');
    const User = require('../models/User');

    // Get class statistics by level
    const classStats = await Class.aggregate([
      {
        $match: {
          schoolId: schoolId,
          academicYear: academicYear || '2024-25',
          'settings.isActive': true
        }
      },
      {
        $group: {
          _id: '$level',
          totalClasses: { $sum: 1 },
          totalStudents: { $sum: '$capacity.currentStrength' },
          averageClassSize: { $avg: '$capacity.currentStrength' },
          grades: { $addToSet: '$grade' },
          streams: { $addToSet: '$stream' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get student distribution by grade
    const studentStats = await User.aggregate([
      {
        $match: {
          schoolId: schoolId,
          role: 'student',
          isActive: true
        }
      },
      {
        $group: {
          _id: '$studentDetails.currentClass',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Organize data by school levels
    const levelStats = {};
    Object.keys(gradeSystem.schoolLevels).forEach(level => {
      levelStats[level] = {
        levelInfo: gradeSystem.schoolLevels[level],
        classes: 0,
        students: 0,
        averageClassSize: 0,
        grades: []
      };
    });

    classStats.forEach(stat => {
      if (levelStats[stat._id]) {
        levelStats[stat._id].classes = stat.totalClasses;
        levelStats[stat._id].students = stat.totalStudents;
        levelStats[stat._id].averageClassSize = Math.round(stat.averageClassSize);
        levelStats[stat._id].grades = stat.grades.sort();
        levelStats[stat._id].streams = stat.streams.filter(s => s);
      }
    });

    res.json({
      success: true,
      schoolId,
      academicYear: academicYear || '2024-25',
      levelStatistics: levelStats,
      totalClasses: classStats.reduce((sum, stat) => sum + stat.totalClasses, 0),
      totalStudents: classStats.reduce((sum, stat) => sum + stat.totalStudents, 0),
      studentsByGrade: studentStats
    });

  } catch (error) {
    console.error('Error fetching school statistics by level:', error);
    res.status(500).json({ message: 'Error fetching school statistics by level' });
  }
};

// Create classes based on grade system
exports.createClassesForGrade = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { 
      grade, 
      sections, 
      academicYear, 
      stream, 
      classTeacherId 
    } = req.body;

    if (!grade || !sections || !Array.isArray(sections)) {
      return res.status(400).json({ 
        message: 'Grade and sections array are required' 
      });
    }

    const Class = require('../models/Class');

    // Validate grade
    const gradeInfo = gradeSystem.gradeStructure[grade];
    if (!gradeInfo) {
      return res.status(400).json({ message: 'Invalid grade specified' });
    }

    // Check if stream is required for higher secondary
    if (['11', '12'].includes(grade) && !stream) {
      return res.status(400).json({ 
        message: 'Stream is required for grades 11 and 12' 
      });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    const createdClasses = [];
    const errors = [];

    // Get subjects for the grade
    const subjects = gradeUtils.getSubjectsForGrade(grade, stream);

    for (const section of sections) {
      try {
        // Check if class already exists
        const existingClass = await Class.findOne({
          schoolId,
          grade,
          section,
          academicYear: academicYear || '2024-25'
        });

        if (existingClass) {
          errors.push({
            section,
            error: `Class ${grade}${section} already exists for academic year ${academicYear || '2024-25'}`
          });
          continue;
        }

        const classData = {
          classId: `${school.code}_${grade}${section}_${academicYear || '2024-25'}`,
          grade,
          section,
          schoolId,
          schoolCode: school.code,
          academicYear: academicYear || '2024-25',
          stream,
          subjects: subjects.map(subject => ({
            subjectName: subject,
            subjectCode: subject.replace(/\s+/g, '').toUpperCase().substring(0, 5),
            periodsPerWeek: 4, // Default
            isCore: true,
            maxMarks: 100,
            passingMarks: gradeInfo.level === 'elementary' ? 35 : 33
          })),
          createdBy: req.user._id
        };

        // Add class teacher if provided
        if (classTeacherId) {
          const User = require('../models/User');
          const teacher = await User.findOne({
            _id: classTeacherId,
            role: 'teacher',
            schoolId
          });

          if (teacher) {
            classData.classTeacher = {
              teacherId: teacher._id,
              teacherName: `${teacher.name.firstName} ${teacher.name.lastName}`,
              employeeId: teacher.teacherDetails?.employeeId
            };
          }
        }

        const newClass = await Class.createClassWithGradeInfo(classData);
        createdClasses.push(newClass);

      } catch (error) {
        errors.push({
          section,
          error: error.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdClasses.length} classes for grade ${grade}`,
      createdClasses: createdClasses.map(c => ({
        classId: c.classId,
        className: c.className,
        grade: c.grade,
        section: c.section,
        level: c.level,
        stream: c.stream,
        subjects: c.subjects.length,
        maxStudents: c.capacity.maxStudents
      })),
      errors
    });

  } catch (error) {
    console.error('Error creating classes for grade:', error);
    res.status(500).json({ message: 'Error creating classes for grade' });
  }
};
// Get all users for a school with filtering
exports.getSchoolUsers = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { search, role, status } = req.query;

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // Get school-specific database
    const schoolDbManager = new SchoolDatabaseManager(school.code);
    const schoolDb = schoolDbManager.getDatabase();

    // Build the query
    let query = {};

    // Add role filter if specified
    if (role && role !== 'all') {
      query.role = role;
    }

    // Add status filter if specified
    if (status && status !== 'all') {
      query.status = status;
    }

    // Add search filter if specified
    if (search) {
      query.$or = [
        { 'name.displayName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch users from school-specific collections
    const adminsCollection = schoolDb.collection('admins');
    const studentsCollection = schoolDb.collection('students');
    const parentsCollection = schoolDb.collection('parents');
    const teachersCollection = schoolDb.collection('teachers');

    // Query each collection
    const admins = await adminsCollection.find(query).project({ password: 0 }).toArray();
    const students = await studentsCollection.find(query).project({ password: 0 }).toArray();
    const parents = await parentsCollection.find(query).project({ password: 0 }).toArray();
    const teachers = await teachersCollection.find(query).project({ password: 0 }).toArray();

    // Combine results and add role information if missing
    const users = [
      ...admins.map(user => ({ ...user, role: user.role || 'admin' })),
      ...students.map(user => ({ ...user, role: user.role || 'student' })),
      ...parents.map(user => ({ ...user, role: user.role || 'parent' })),
      ...teachers.map(user => ({ ...user, role: user.role || 'teacher' }))
    ];

    res.json(users);
  } catch (error) {
    console.error('Error getting school users:', error);
    res.status(500).json({ message: 'Error getting school users', error: error.message });
  }
};

// Import users from CSV
exports.importUsers = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const csv = require('csv-parse');
    const fs = require('fs');
    const parser = csv.parse({ columns: true, trim: true });
    
    const users = [];
    const errors = [];
    
    await new Promise((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(parser)
        .on('data', async (row) => {
          try {
            // Validate required fields
            if (!row.name || !row.email || !row.role) {
              errors.push({ row, error: 'Missing required fields' });
              return;
            }

            // Check if user already exists
            const existingUser = await User.findOne({ email: row.email });
            if (existingUser) {
              errors.push({ row, error: 'User already exists' });
              return;
            }

            // Generate random password
            const crypto = require('crypto');
            const password = crypto.randomBytes(8).toString('hex');
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash(password, 10);

            users.push({
              name: row.name,
              email: row.email,
              role: row.role.toLowerCase(),
              phone: row.phone || '',
              schoolId,
              password: hashedPassword,
              status: 'active'
            });
          } catch (error) {
            errors.push({ row, error: error.message });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Delete the uploaded file
    fs.unlinkSync(file.path);

    if (users.length === 0) {
      return res.status(400).json({ 
        message: 'No valid users to import', 
        errors 
      });
    }

    // Insert users in bulk
    await User.insertMany(users);

    res.json({ 
      message: `Successfully imported ${users.length} users`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing users:', error);
    res.status(500).json({ message: 'Error importing users', error: error.message });
  }
};

// Export users to CSV
exports.exportUsers = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { role } = req.query;

    const query = { schoolId };
    if (role && role !== 'all') {
      query.role = role;
    }

    const users = await User.find(query)
      .select('name email role phone status')
      .lean();

    const csv = require('fast-csv');
    const filename = `school-${schoolId}-users.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    csv.write(users, { headers: true })
      .pipe(res);

  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({ message: 'Error exporting users', error: error.message });
  }
};

// Bulk toggle user status
exports.bulkToggleUserStatus = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { userIds, status } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'No users specified' });
    }

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    await User.updateMany(
      { _id: { $in: userIds }, schoolId },
      { $set: { status } }
    );

    res.json({ message: `Successfully updated status for ${userIds.length} users` });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status', error: error.message });
  }
};

// Bulk delete users
exports.bulkDeleteUsers = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'No users specified' });
    }

    await User.deleteMany({ _id: { $in: userIds }, schoolId });

    res.json({ message: `Successfully deleted ${userIds.length} users` });
  } catch (error) {
    console.error('Error deleting users:', error);
    res.status(500).json({ message: 'Error deleting users', error: error.message });
  }
};

// Add a new user to a school
exports.addUser = async (req, res) => {
  try {
    const { schoolId } = req.params;
  const { name, email, role, phone, password } = req.body;

    // Validate required fields
    if (!name || !email || !role || !password) {
      return res.status(400).json({ message: 'Name, email, role, and password are required' });
    }

    // Validate role
    const validRoles = ['admin', 'teacher', 'student', 'parent'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Find school
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    // Check if user already exists
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

  // Normalize name into structured fields
  const { firstName, lastName, displayName } = normalizeName(name, role.charAt(0).toUpperCase() + role.slice(1));

    // Validate phone number
    const phoneRegex = /^\d{7,10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone number format. It should be 7 to 10 digits long.' });
    }

    // Create user with required nested fields
    const user = new User({
  name: { firstName, lastName, displayName },
      email,
      password: hashedPassword,
      role,
      contact: { primaryPhone: (phone && String(phone)) || '9999999999' },
      address: {
        permanent: {
          street: 'Address not provided',
          city: 'NA',
          state: 'NA',
          country: 'India',
          pincode: '560001'
        }
      },
      schoolId: school._id,
      schoolCode: school.code,
      schoolAccess: {
        joinedDate: new Date(),
        assignedBy: req.user._id,
        status: 'active',
        accessLevel: 'full'
      }
    });

    await user.save();

    // Update school stats
    if (role === 'teacher') {
      school.stats.totalTeachers = (school.stats.totalTeachers || 0) + 1;
    } else if (role === 'student') {
      school.stats.totalStudents = (school.stats.totalStudents || 0) + 1;
    } else if (role === 'parent') {
      school.stats.totalParents = (school.stats.totalParents || 0) + 1;
    }
    await school.save();

    console.log(`[USER ADDED] ${user.email} added as ${role} to school ${school.name} (${school._id}) by ${req.user.email}`);
    res.status(201).json({
      message: 'User added successfully',
      user: {
        id: user._id,
        name: user.name.displayName || displayName,
        email: user.email,
        role: user.role,
        phone: user.contact?.primaryPhone
      }
    });
  } catch (error) {
    console.error('Error adding user to school:', error);
    res.status(500).json({ message: 'Error adding user to school', error: error.message });
  }
};

// Update bank details for a school
exports.updateBankDetails = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { bankDetails } = req.body;
    if (!bankDetails) {
      return res.status(400).json({ message: 'Missing bank details' });
    }
    const school = await School.findByIdAndUpdate(
      schoolId,
      { $set: { bankDetails } },
      { new: true, runValidators: true }
    );
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }
    console.log(`[BANK DETAILS UPDATED] School: ${school.name} (${school._id}) by user ${req.user.email}`);
    res.json({ message: 'Bank details updated successfully', bankDetails: school.bankDetails });
  } catch (error) {
    console.error('Error updating bank details:', error);
    res.status(500).json({ message: 'Error updating bank details', error: error.message });
  }
};
// const path = require('path');
// const fs = require('fs');
const { generateTeacherId, generateParentId } = require('../utils/idGenerator');
const { generateTeacherPassword, generateParentPassword, hashPassword } = require('../utils/passwordGenerator');

// Create a new school
exports.createSchool = async (req, res) => {
  try {
    console.log('🏫 CREATE SCHOOL REQUEST RECEIVED');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request file:', req.file);
    console.log('Request headers:', req.headers);
    console.log('Request user:', req.user);

    const { 
      name, 
      code,
      mobile, 
      principalName, 
      principalEmail, 
      area, 
      district, 
      pinCode, 
      bankDetails, 
      accessMatrix, 
      schoolType, 
      establishedYear, 
      affiliationBoard, 
      website, 
      secondaryContact,
      settings,
      features,
      // New nested fields
      address,
      contact
    } = req.body;

    console.log('📋 PARSED FIELDS:', {
      name, code, mobile, principalName, principalEmail,
      area, district, pinCode, address, contact,
      bankDetails: typeof bankDetails, accessMatrix: typeof accessMatrix
    });

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'School name is required'
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'School code is required'
      });
    }

    // Use provided code, clean and validate it
    const cleanCode = code.toUpperCase().trim();

    // Validate code format (allow 1-10 characters to support single-letter codes)
    if (!/^[A-Z0-9]{1,10}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        message: 'School code must be 1-10 characters long and contain only letters and numbers'
      });
    }

    // Check if code already exists
    const existingSchool = await School.findOne({ code: cleanCode });
    if (existingSchool) {
      return res.status(400).json({
        success: false,
        message: `School code '${cleanCode}' already exists. Please choose a different code.`
      });
    }

    // Generate database name before creating school
    const dbName = SchoolDatabaseManager.getDatabaseName(cleanCode);

    // Structure the data properly for the School model
    const schoolData = {
      name: name?.trim() || '',
      code: cleanCode,
      principalName: principalName?.trim() || '',
      principalEmail: principalEmail?.trim() || '',
      mobile: mobile?.trim() || '', // Direct mobile field for dashboard display
      
      // Parse and structure contact information
      contact: (() => {
        try {
          const parsedContact = typeof contact === 'string' ? JSON.parse(contact) : contact;
          return {
            phone: (parsedContact?.phone || mobile || '').trim(),
            email: (parsedContact?.email || principalEmail || '').trim(),
            website: (parsedContact?.website || website || '').trim()
          };
        } catch (error) {
          console.error('Error parsing contact:', error, 'Raw contact:', contact);
          return {
            phone: (mobile || '').trim(),
            email: (principalEmail || '').trim(),
            website: (website || '').trim()
          };
        }
      })(),
      
      // Parse and structure address information
      address: (() => {
        try {
          const parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
          return {
            street: (parsedAddress?.street || area || '').trim(),
            area: (parsedAddress?.area || area || '').trim(),
            city: (parsedAddress?.city || district || '').trim(),
            district: (parsedAddress?.district || district || '').trim(),
            taluka: (parsedAddress?.taluka || '').trim(),
            state: (parsedAddress?.state || '').trim(),
            stateId: parsedAddress?.stateId || null,
            districtId: parsedAddress?.districtId || null,
            talukaId: parsedAddress?.talukaId || null,
            country: (parsedAddress?.country || 'India').trim(),
            zipCode: (parsedAddress?.pinCode || parsedAddress?.zipCode || pinCode || '').trim(),
            pinCode: (parsedAddress?.pinCode || pinCode || '').trim()
          };
        } catch (error) {
          console.error('Error parsing address:', error, 'Raw address:', address);
          return {
            street: (area || '').trim(),
            area: (area || '').trim(),
            city: (district || '').trim(),
            district: (district || '').trim(),
            taluka: '',
            state: '',
            stateId: null,
            districtId: null,
            talukaId: null,
            country: 'India',
            zipCode: (pinCode || '').trim(),
            pinCode: (pinCode || '').trim()
          };
        }
      })(),
      
      // Parse bank details if it's a string, otherwise use directly
      bankDetails: (() => {
        try {
          return typeof bankDetails === 'string' ? JSON.parse(bankDetails) : bankDetails;
        } catch (error) {
          console.error('Error parsing bankDetails:', error, 'Raw bankDetails:', bankDetails);
          return {};
        }
      })(),
      
      // Parse access matrix if it's a string, otherwise use directly
      accessMatrix: (() => {
        try {
          return typeof accessMatrix === 'string' ? JSON.parse(accessMatrix) : accessMatrix;
        } catch (error) {
          console.error('Error parsing accessMatrix:', error, 'Raw accessMatrix:', accessMatrix);
          return {};
        }
      })(),
      
      // Parse settings if it's a string, otherwise use directly
      settings: (() => {
        try {
          return typeof settings === 'string' ? JSON.parse(settings) : settings;
        } catch (error) {
          console.error('Error parsing settings:', error, 'Raw settings:', settings);
          return {};
        }
      })(),
      
      // Parse features if it's a string, otherwise use directly
      features: (() => {
        try {
          return typeof features === 'string' ? JSON.parse(features) : features;
        } catch (error) {
          console.error('Error parsing features:', error, 'Raw features:', features);
          return {};
        }
      })(),
      
      // Additional school information
      schoolType: schoolType?.trim() || 'Public',
      establishedYear: parseInt(establishedYear) || new Date().getFullYear(),
      affiliationBoard: affiliationBoard?.trim() || 'CBSE',
      website: (website || '').trim(),
      secondaryContact: (secondaryContact || '').trim(),
      
      // Default settings and features
      settings: {
        academicYear: {
          currentYear: new Date().getFullYear().toString(),
          startDate: new Date(`${new Date().getFullYear()}-04-01`),
          endDate: new Date(`${new Date().getFullYear() + 1}-03-31`)
        },
        classes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        sections: ['A', 'B', 'C', 'D'],
        subjects: ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi'],
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        workingHours: {
          start: '08:00',
          end: '15:00'
        },
        holidays: []
      },
      
      features: {
        hasTransport: false,
        hasCanteen: false,
        hasLibrary: true,
        hasSports: true,
        hasComputerLab: false
      },
      
      // File upload handling with compression
      logoUrl: undefined, // Will be set after compression
      
      // Database management
      databaseName: dbName,
      databaseCreated: false,
      establishedDate: new Date(),
      isActive: true
    };

    // Handle logo upload with Cloudinary BEFORE creating school
    console.log('🔍 Checking for logo file upload...');
    console.log('req.file:', req.file ? `Yes - ${req.file.originalname}` : 'No file uploaded');
    
    if (req.file) {
      let tempCompressedPath = null;
      
      try {
        console.log(`📸 Original logo: ${req.file.originalname}, Size: ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Create temp directory for compression
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate unique filename with .jpg extension (Sharp will convert to JPEG)
        const timestamp = Date.now();
        const filename = `${schoolData.code}_${timestamp}.jpg`;
        tempCompressedPath = path.join(tempDir, filename);

        // Compress logo using Sharp to ~30KB
        console.log('🔄 Compressing logo with Sharp...');
        const sharpInstance = sharp(req.file.path);
        await sharpInstance
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toFile(tempCompressedPath);
        
        // Release Sharp resources
        sharpInstance.destroy();
        
        // Check file size and re-compress if needed
        let stats = fs.statSync(tempCompressedPath);
        let quality = 60;
        
        while (stats.size > 30 * 1024 && quality > 20) {
          quality -= 10;
          console.log(`🔄 Re-compressing with quality ${quality}...`);
          const recompressInstance = sharp(req.file.path);
          await recompressInstance
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toFile(tempCompressedPath);
          recompressInstance.destroy();
          stats = fs.statSync(tempCompressedPath);
        }
        
        console.log(`✅ Compressed logo: ${(stats.size / 1024).toFixed(2)}KB (quality: ${quality})`);
        
        // Upload to Cloudinary
        const cloudinaryFolder = `logos`;
        const publicId = `${schoolData.code}_${timestamp}`;
        const uploadResult = await uploadToCloudinary(tempCompressedPath, cloudinaryFolder, publicId);
        
        schoolData.logoUrl = uploadResult.secure_url;
        console.log('✅ Logo uploaded to Cloudinary:', uploadResult.secure_url);
        
        // Delete temp files
        deleteLocalFile(req.file.path);
        deleteLocalFile(tempCompressedPath);
        
      } catch (error) {
        console.error('❌ Error handling logo upload:', error);
        console.error('Error stack:', error.stack);
        // Clean up temp files on error
        deleteLocalFile(req.file.path);
        if (tempCompressedPath) {
          deleteLocalFile(tempCompressedPath);
        }
      }
    } else {
      console.log('ℹ️ No logo file uploaded, skipping logo processing');
    }

    console.log('📊 Final schoolData.logoUrl:', schoolData.logoUrl);
    const school = new School(schoolData);
    await school.save();
    console.log('💾 School saved with logoUrl:', school.logoUrl);
    
    // Create dedicated database for the school
    await createSchoolDatabase(school);
    
    // Create default test details for the school
    try {
      await TestDetails.createDefaultTestTypes(
        school._id, 
        school.code, 
        req.user ? req.user._id : null
      );
      console.log(`[TEST DETAILS CREATED] Default test types created for school ${school.code}`);
    } catch (testError) {
      console.error(`[TEST DETAILS ERROR] Failed to create test details for school ${school.code}:`, testError);
      // Don't fail school creation if test details creation fails
    }
    
    console.log(`[SCHOOL CREATED] ${school.name} (${school.code}) - Database: ${school.databaseName}`);
    
    res.status(201).json({
      success: true,
      message: 'School created successfully',
      school: {
        _id: school._id,
        name: school.name,
        code: school.code,
        logoUrl: school.logoUrl,
        principalName: school.principalName,
        principalEmail: school.principalEmail,
        schoolType: school.schoolType,
        establishedYear: school.establishedYear,
        affiliationBoard: school.affiliationBoard,
        website: school.website,
        isActive: school.isActive,
        databaseCreated: school.databaseCreated
      }
    });
  } catch (error) {
    console.error('❌ ERROR CREATING SCHOOL:', error);
    console.error('❌ ERROR STACK:', error.stack);
    console.error('❌ ERROR DETAILS:', {
      name: error.name,
      message: error.message,
      code: error.code,
      validation: error.errors
    });
    
    // Handle MongoDB validation errors specifically
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err) => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
        duplicateField: field,
        duplicateValue: error.keyValue[field]
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Function to create dedicated database and collections for a school
async function createSchoolDatabase(school) {
  try {
    console.log(`🏗️ Creating dedicated database for school: ${school.name} (${school.code})`);
    
    // Generate database name from school code (sanitized)
    const dbName = SchoolDatabaseManager.getDatabaseName(school.code);
    
    // Get connection to the school's dedicated database
    const schoolConnection = await SchoolDatabaseManager.getSchoolConnection(school.code);
    
    console.log(`✅ Connected to school database: ${dbName}`);
    
    // Create all necessary collections for the school
    const collections = [
      'school_info',     // School's own information (replica from institute_erp)
      'admins',          // School administrators
      'teachers',        // School teachers
      'students',        // School students
      'parents',         // Student parents
  'testdetails',     // Academic test configuration per class
      'access_matrix',   // Role-based permissions
      'classes',         // Class information
      'subjects',        // Subject information
      'attendances',     // Student attendance records
      'assignments',     // Assignments and homework
      'results',         // Exam results and grades
      'timetables',      // Class schedules
      'admissions',      // Admission applications
      'messages',        // Internal messaging
      'audit_logs',      // Activity logs
      'id_sequences'     // ID generation sequences
    ];
    
    // Create collections and initial documents
    for (const collectionName of collections) {
      const collection = schoolConnection.collection(collectionName);
      
      if (collectionName === 'school_info') {
        // Store the school's own information in its dedicated database
        const schoolInfo = {
          _id: school._id,
          name: school.name,
          code: school.code,
          principalName: school.principalName,
          principalEmail: school.principalEmail,
          address: school.address,
          contact: school.contact,
          accessMatrix: school.accessMatrix,
          bankDetails: school.bankDetails,
          settings: school.settings,
          features: school.features,
          schoolType: school.schoolType,
          establishedYear: school.establishedYear,
          affiliationBoard: school.affiliationBoard,
          website: school.website,
          secondaryContact: school.secondaryContact,
          logoUrl: school.logoUrl,
          databaseName: school.databaseName,
          databaseCreated: school.databaseCreated,
          databaseCreatedAt: school.databaseCreatedAt,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
          isActive: school.isActive,
          admins: school.admins || [],
          stats: school.stats || {
            totalStudents: 0,
            totalTeachers: 0,
            totalParents: 0,
            totalClasses: 0
          },
          lastSyncedAt: new Date(),
          note: 'School information replicated from institute_erp database'
        };
        
        await collection.insertOne(schoolInfo);
        console.log(`🏫 Stored school information in dedicated database`);
        
      } else if (collectionName === 'access_matrix') {
        // Store the access matrix as a separate collection for easy querying
        const accessMatrixDoc = {
          _id: 'school_permissions',
          schoolId: school._id,
          schoolCode: school.code,
          matrix: school.accessMatrix,
          createdAt: new Date(),
          updatedAt: new Date(),
          note: 'Access permissions matrix for role-based access control'
        };
        
        await collection.insertOne(accessMatrixDoc);
        console.log(`🔐 Stored access matrix in dedicated database`);
        
      } else if (collectionName === 'id_sequences') {
        // Initialize ID sequences for user ID generation
        const sequences = [
          { _id: 'admin_sequence', sequence_value: 1, schoolCode: school.code },
          { _id: 'teacher_sequence', sequence_value: 1, schoolCode: school.code },
          { _id: 'student_sequence', sequence_value: 1, schoolCode: school.code },
          { _id: 'parent_sequence', sequence_value: 1, schoolCode: school.code }
        ];
        
        await collection.insertMany(sequences);
        console.log(`📊 Initialized ID sequences for ${school.code}`);
      } else if (collectionName === 'testdetails') {
        // Initialize test details placeholder for academic test configuration
        const testDetailsDoc = {
          _placeholder: true,
          schoolId: school._id,
          schoolCode: school.code,
          academicYear: school.settings?.academicYear?.currentYear || new Date().getFullYear().toString(),
          classTestTypes: {}, // map of class -> array of test type names
          createdAt: new Date(),
          note: 'Placeholder for per-class test type configuration; editable via superadmin Academic Test Configuration'
        };
        await collection.insertOne(testDetailsDoc);
        console.log(`🧾 Initialized testdetails collection for ${school.code}`);
      } else {
        // Create collection with a placeholder document for user collections
        if (['admins', 'teachers', 'students', 'parents'].includes(collectionName)) {
          await collection.insertOne({
            _placeholder: true,
            schoolId: school._id,
            schoolCode: school.code,
            userType: collectionName.slice(0, -1), // Remove 's' from plural
            createdAt: new Date(),
            note: `Placeholder for ${collectionName} collection - will be replaced with real user data`
          });
        } else {
          // Create collection with a placeholder document for other collections
          await collection.insertOne({
            _placeholder: true,
            schoolId: school._id,
            schoolCode: school.code,
            createdAt: new Date(),
            note: `Placeholder for ${collectionName} collection - will be replaced with real data`
          });
        }
        console.log(`📁 Created collection: ${collectionName}`);
      }
    }
    
    // Update the school document to mark database as created
    school.databaseCreated = true;
    school.databaseCreatedAt = new Date();
    await school.save();
    
    console.log(`🎉 School database setup completed for: ${school.name} (${dbName})`);
    console.log(`📋 Database structure:`);
    console.log(`├── ${dbName}`);
    collections.forEach(col => {
      console.log(`│   ├── ${col}`);
    });
    
  } catch (error) {
    console.error('Error creating school database:', error);
    throw error;
  }
}

// Helper function to update access matrix collection in school database
async function updateAccessMatrixCollection(school, schoolConnection) {
  try {
    console.log(`🔐 Updating access matrix collection for school: ${school.code}`);
    
    const accessMatrixCollection = schoolConnection.collection('access_matrix');
    
    // Prepare the access matrix document
    const accessMatrixDoc = {
      schoolId: school._id,
      schoolCode: school.code,
      schoolName: school.name,
      matrix: school.accessMatrix,
      lastUpdated: new Date(),
      updatedBy: 'system',
      note: 'Access permissions matrix for role-based access control'
    };
    
    // Replace the existing access matrix document
    await accessMatrixCollection.replaceOne(
      { schoolId: school._id },
      accessMatrixDoc,
      { upsert: true }
    );
    
    console.log(`✅ Access matrix collection updated for school: ${school.code}`);
    
    // Log the updated permissions for debugging
    console.log(`📋 Current access matrix for ${school.code}:`, JSON.stringify(school.accessMatrix, null, 2));
    
  } catch (error) {
    console.error('Error updating access matrix collection:', error);
    throw error;
  }
}

async function syncSchoolInfoToDatabase(school) {
  try {
    console.log(`🔄 Syncing school information for: ${school.name} (${school.code})`);
    
    // Get connection to the school's dedicated database
    const schoolConnection = await SchoolDatabaseManager.getSchoolConnection(school.code);
    const schoolInfoCollection = schoolConnection.collection('school_info');
    
    // Prepare updated school information
    const schoolInfo = {
      _id: school._id,
      name: school.name,
      code: school.code,
      principalName: school.principalName,
      principalEmail: school.principalEmail,
      address: school.address,
      contact: school.contact,
      accessMatrix: school.accessMatrix,
      bankDetails: school.bankDetails,
      settings: school.settings,
      features: school.features,
      schoolType: school.schoolType,
      establishedYear: school.establishedYear,
      affiliationBoard: school.affiliationBoard,
      website: school.website,
      secondaryContact: school.secondaryContact,
      logoUrl: school.logoUrl,
      databaseName: school.databaseName,
      databaseCreated: school.databaseCreated,
      databaseCreatedAt: school.databaseCreatedAt,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      isActive: school.isActive,
      admins: school.admins || [],
      stats: school.stats || {
        totalStudents: 0,
        totalTeachers: 0,
        totalParents: 0,
        totalClasses: 0
      },
      lastSyncedAt: new Date(),
      note: 'School information synced from institute_erp database'
    };
    
    // Update or insert the school information
    await schoolInfoCollection.replaceOne(
      { _id: school._id },
      schoolInfo,
      { upsert: true }
    );
    
    console.log(`✅ School information synced to dedicated database: ${school.databaseName}`);
    
    // Also update the access_matrix collection with the latest permissions
    await updateAccessMatrixCollection(school, schoolConnection);
    
  } catch (error) {
    console.error('Error syncing school information:', error);
    throw error;
  }
}

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { schoolId, userId } = req.params;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updates.password;
    delete updates.schoolId;
    delete updates._id;

    const user = await User.findOne({ _id: userId, schoolId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If updating email, check it's not already taken
    if (updates.email && updates.email !== user.email) {
      const existingUser = await User.findOne({ email: updates.email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    Object.assign(user, updates);
    await user.save();

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// Toggle user status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { schoolId, userId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findOne({ _id: userId, schoolId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = status;
    await user.save();

    res.json({ message: 'User status updated successfully', user });
  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({ message: 'Error toggling user status', error: error.message });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { schoolId, userId } = req.params;

    const user = await User.findOne({ _id: userId, schoolId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.remove();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
};

// Update user password
exports.updateUserPassword = async (req, res) => {
  try {
    const { schoolId, userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }

    const user = await User.findOne({ _id: userId, schoolId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash the new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    user.password = hashedPassword;
    await user.save();

    console.log(`[PASSWORD UPDATED] User: ${user.email} in school ${schoolId} by ${req.user.email}`);
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating user password:', error);
    res.status(500).json({ message: 'Error updating user password', error: error.message });
  }
};

// Get all schools (for super admin)
exports.getAllSchools = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const schools = await School.find({})
      .select('-__v');

    // Map all fields needed for frontend
    const mappedSchools = schools.map(school => ({
      _id: school._id,
      id: school._id,
      name: school.name,
      code: school.code,
      logoUrl: school.logoUrl,
      address: school.address,
      contact: school.contact,
      area: school.address?.area || school.address?.street || '',
      district: school.address?.district || school.address?.city || '',
      pinCode: school.address?.pinCode || school.address?.zipCode || '',
      mobile: school.mobile || school.contact?.phone || '',
      principalName: school.principalName || '',
      principalEmail: school.principalEmail || school.contact?.email || '',
      bankDetails: school.bankDetails || {},
      accessMatrix: school.accessMatrix || {},
      features: school.features || {},
      settings: school.settings || {},
      stats: school.stats || {},
      isActive: school.isActive,
      establishedDate: school.establishedDate,
      createdAt: school.createdAt,
      updatedAt: school.updatedAt,
      schoolType: school.schoolType,
      establishedYear: school.establishedYear,
      affiliationBoard: school.affiliationBoard,
      website: school.website,
      secondaryContact: school.secondaryContact
    }));

    console.log(`Successfully fetched ${mappedSchools.length} schools for superadmin`);
    res.json(mappedSchools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ message: 'Error fetching schools', error: error.message });
  }
};

// Get school by ID
exports.getSchoolById = async (req, res) => {
  try {
    const { schoolId } = req.params;
    console.log(`[getSchoolById] Request for school: ${schoolId} from user: ${req.user?._id || 'unknown'}`);

    // Input validation
    if (!schoolId) {
      console.log('[getSchoolById] No school ID provided');
      return res.status(400).json({
        success: false,
        message: 'School ID is required',
        code: 'MISSING_SCHOOL_ID'
      });
    }

    // Check if user has access to this school
    if (req.user.role !== 'superadmin' && req.user.schoolId?.toString() !== schoolId) {
      console.log(`[getSchoolById] Access denied for user ${req.user?._id} to school ${schoolId}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access this school',
        code: 'ACCESS_DENIED'
      });
    }
    
    try {
      let school = null;
      const mongoose = require('mongoose');
      
      // Try to find by ID first if it's a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(schoolId)) {
        console.log(`[getSchoolById] Looking up by ID: ${schoolId}`);
        school = await School.findById(schoolId);
      }

      // If not found by ID, try by code (case-insensitive)
      if (!school) {
        console.log(`[getSchoolById] Looking up by code: ${schoolId}`);
        school = await School.findOne({ code: new RegExp(`^${schoolId}$`, 'i') });
      }

      // If still not found, return 404
      if (!school) {
        console.log(`[getSchoolById] School not found: ${schoolId}`);
        return res.status(404).json({
          success: false,
          message: 'School not found',
          details: `No school found with ID or code: ${schoolId}`,
          code: 'SCHOOL_NOT_FOUND'
        });
      }

      console.log(`[getSchoolById] Found school: ${school.name} (${school.code})`);
      
      // Return the school data from main database
      return res.json({
        success: true,
        data: school
      });
      
    } catch (dbError) {
      console.error('[getSchoolById] Database error:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while fetching school',
        error: dbError.message,
        code: 'DATABASE_ERROR'
      });
    }
    
  } catch (error) {
    console.error('[getSchoolById] Unexpected error:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Get school info directly from main database (no school-specific database lookup)
exports.getSchoolInfo = async (req, res) => {
  try {
    const { schoolId } = req.params;
    console.log(`[getSchoolInfo] Fetching school info for: ${schoolId}`);

    let school = null;
    
    // Check if schoolId is a valid ObjectId before attempting findById 
    const mongoose = require('mongoose'); 
    if (mongoose.Types.ObjectId.isValid(schoolId)) {
      console.log(`[getSchoolInfo] Attempting find by ID: ${schoolId}`);
      school = await School.findById(schoolId);
    }

    // Fallback: Try to find by school code (case-insensitive) if not found by ID or if ID format was invalid
    if (!school) {
      console.log(`[getSchoolInfo] Attempting find by code: ${schoolId}`);
      school = await School.findOne({ code: new RegExp(`^${schoolId}$`, 'i') });
    }

    if (!school) {
      return res.status(404).json({ 
        success: false,
        message: 'School not found' 
      });
    }

    console.log(`[getSchoolInfo] Found school: ${school.name} (${school.code})`);
    
    // Return school info directly from main database
    res.json({
      success: true,
      data: {
        _id: school._id,
        name: school.name,
        code: school.code,
        address: school.address,
        contact: school.contact,
        principalName: school.principalName,
        principalEmail: school.principalEmail,
        mobile: school.mobile,
        bankDetails: school.bankDetails,
        accessMatrix: school.accessMatrix,
        settings: school.settings,
        features: school.features,
        stats: school.stats,
        schoolType: school.schoolType,
        establishedYear: school.establishedYear,
        affiliationBoard: school.affiliationBoard,
        website: school.website,
        secondaryContact: school.secondaryContact,
        logoUrl: school.logoUrl,
        isActive: school.isActive,
        createdAt: school.createdAt,
        updatedAt: school.updatedAt
      }
    });

  } catch (error) {
    console.error('Error fetching school info:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching school info', 
      error: error.message 
    });
  }
};

// Get school info from school_info collection in school's database
exports.getSchoolInfoFromDatabase = async (req, res) => {
  try {
    const schoolCode = req.user?.schoolCode || req.params.schoolCode;
    
    if (!schoolCode) {
      return res.status(400).json({ 
        success: false,
        message: 'School code is required' 
      });
    }

    console.log(`[getSchoolInfoFromDatabase] Fetching school_info for: ${schoolCode}`);

    // Get connection to the school's dedicated database
    const schoolConnection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const schoolInfoCollection = schoolConnection.collection('school_info');
    
    // Fetch school info document
    let schoolInfo = await schoolInfoCollection.findOne({});
    
    // If school_info doesn't exist or doesn't have bank details, try to sync from main database
    if (!schoolInfo || !schoolInfo.bankDetails) {
      console.log(`[getSchoolInfoFromDatabase] School info missing or no bank details, syncing from main database...`);
      
      // Get school from main database
      const School = require('../models/School');
      const mainSchool = await School.findOne({ code: schoolCode });
      
      if (mainSchool) {
        console.log(`[getSchoolInfoFromDatabase] Found school in main DB, syncing...`);
        console.log(`[getSchoolInfoFromDatabase] Main school bank details:`, JSON.stringify(mainSchool.bankDetails, null, 2));
        
        // Sync to dedicated database
        await syncSchoolInfoToDatabase(mainSchool);
        
        // Fetch again after sync
        schoolInfo = await schoolInfoCollection.findOne({});
        console.log(`[getSchoolInfoFromDatabase] After sync, bank details:`, JSON.stringify(schoolInfo?.bankDetails, null, 2));
      } else {
        console.warn(`[getSchoolInfoFromDatabase] School not found in main database: ${schoolCode}`);
      }
    }
    
    if (!schoolInfo) {
      return res.status(404).json({ 
        success: false,
        message: 'School information not found in school database' 
      });
    }

    console.log(`[getSchoolInfoFromDatabase] Found school: ${schoolInfo.name} (${schoolInfo.code})`);
    console.log(`[getSchoolInfoFromDatabase] Bank details present:`, !!schoolInfo.bankDetails);
    
    // Return school info from school's database
    res.json({
      success: true,
      data: {
        _id: schoolInfo._id,
        name: schoolInfo.name,
        code: schoolInfo.code,
        address: schoolInfo.address,
        contact: schoolInfo.contact,
        principalName: schoolInfo.principalName,
        principalEmail: schoolInfo.principalEmail,
        mobile: schoolInfo.mobile,
        bankDetails: schoolInfo.bankDetails,
        settings: schoolInfo.settings,
        features: schoolInfo.features,
        stats: schoolInfo.stats,
        schoolType: schoolInfo.schoolType,
        establishedYear: schoolInfo.establishedYear,
        affiliationBoard: schoolInfo.affiliationBoard,
        website: schoolInfo.website,
        secondaryContact: schoolInfo.secondaryContact,
        logoUrl: schoolInfo.logoUrl,
        isActive: schoolInfo.isActive,
        createdAt: schoolInfo.createdAt,
        updatedAt: schoolInfo.updatedAt
      }
    });

  } catch (error) {
    console.error('Error fetching school info from database:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching school info from database', 
      error: error.message 
    });
  }
};

// Update school
exports.updateSchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    let updateData = { ...req.body };

    console.log('🔄 UPDATE SCHOOL REQUEST RECEIVED');
    console.log('School ID:', schoolId);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request file:', req.file);

    // Check if user has permission to update
    if (req.user.role !== 'superadmin' && req.user.schoolId?.toString() !== schoolId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Parse JSON fields if they come as strings (from FormData)
    if (typeof updateData.address === 'string') {
      try {
        updateData.address = JSON.parse(updateData.address);
      } catch (e) {
        console.error('Error parsing address:', e);
      }
    }
    
    if (typeof updateData.contact === 'string') {
      try {
        updateData.contact = JSON.parse(updateData.contact);
      } catch (e) {
        console.error('Error parsing contact:', e);
      }
    }
    
    if (typeof updateData.bankDetails === 'string') {
      try {
        updateData.bankDetails = JSON.parse(updateData.bankDetails);
      } catch (e) {
        console.error('Error parsing bankDetails:', e);
      }
    }
    
    if (typeof updateData.accessMatrix === 'string') {
      try {
        updateData.accessMatrix = JSON.parse(updateData.accessMatrix);
      } catch (e) {
        console.error('Error parsing accessMatrix:', e);
      }
    }

    // Handle logo upload with Sharp compression if file is present
    if (req.file) {
      let tempCompressedPath = null;
      
      try {
        console.log(`Updating logo: ${req.file.originalname}, Size: ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Get existing school to get code for filename
        const existingSchool = await School.findById(schoolId);

        // Create temp directory for compression
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate unique filename with .jpg extension
        const timestamp = Date.now();
        const filename = `${existingSchool.code}_${timestamp}.jpg`;
        tempCompressedPath = path.join(tempDir, filename);

        // Compress logo using Sharp to ~30KB
        console.log('Compressing logo with Sharp...');
        const sharpInstance = sharp(req.file.path);
        await sharpInstance
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toFile(tempCompressedPath);
        
        // Release Sharp resources
        sharpInstance.destroy();
        
        // Check file size and re-compress if needed
        let stats = fs.statSync(tempCompressedPath);
        let quality = 60;
        
        while (stats.size > 30 * 1024 && quality > 20) {
          quality -= 10;
          console.log(`Re-compressing with quality ${quality}...`);
          const recompressInstance = sharp(req.file.path);
          await recompressInstance
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toFile(tempCompressedPath);
          recompressInstance.destroy();
          stats = fs.statSync(tempCompressedPath);
        }
        
        console.log(`Compressed logo: ${(stats.size / 1024).toFixed(2)}KB (quality: ${quality})`);
        
        // Upload to Cloudinary
        const cloudinaryFolder = `logos`;
        const publicId = `${existingSchool.code}_${timestamp}`;
        const uploadResult = await uploadToCloudinary(tempCompressedPath, cloudinaryFolder, publicId);
        
        updateData.logoUrl = uploadResult.secure_url;
        console.log('Logo uploaded to Cloudinary:', uploadResult.secure_url);
        
        // Extract old logo public ID for deletion
        const oldLogoPublicId = existingSchool.logoUrl ? extractPublicId(existingSchool.logoUrl) : null;
        
        // Delete temp files
        deleteLocalFile(req.file.path);
        deleteLocalFile(tempCompressedPath);
        
        // Delete old logo from Cloudinary after successful upload
        if (oldLogoPublicId) {
          try {
            await deleteFromCloudinary(oldLogoPublicId);
            console.log(`Deleted old logo from Cloudinary: ${oldLogoPublicId}`);
          } catch (err) {
            console.warn(`Could not delete old logo from Cloudinary: ${err.message}`);
          }
        }
        
      } catch (error) {
        console.error('Error handling logo upload:', error);
        // Clean up temp files on error
        deleteLocalFile(req.file.path);
        if (tempCompressedPath) {
          deleteLocalFile(tempCompressedPath);
        }
      }
    }

    const school = await School.findByIdAndUpdate(
      schoolId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    console.log('💾 School updated with logoUrl:', school.logoUrl);

    // Sync updated school information to its dedicated database
    if (school.databaseCreated) {
      try {
        await syncSchoolInfoToDatabase(school);
        console.log(`📄 School information synced after update for: ${school.name}`);
      } catch (syncError) {
        console.error('Error syncing school info after update:', syncError);
        // Don't fail the update if sync fails, just log the error
      }
    }

    res.json({ message: 'School updated successfully', school });
  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({ message: 'Error updating school', error: error.message });
  }
};

// Update access matrix for a school
exports.updateAccessMatrix = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { accessMatrix } = req.body;

    console.log(`🔐 [UPDATE ACCESS MATRIX] School ID: ${schoolId}`);
    console.log(`🔐 [UPDATE ACCESS MATRIX] Received access matrix:`, JSON.stringify(accessMatrix, null, 2));

    // Validate access matrix structure
    if (!accessMatrix || typeof accessMatrix !== 'object') {
      console.error(`❌ [UPDATE ACCESS MATRIX] Invalid access matrix structure`);
      return res.status(400).json({ message: 'Valid access matrix is required' });
    }

    // Find and update the school's access matrix
    const school = await School.findByIdAndUpdate(
      schoolId,
      { $set: { accessMatrix: accessMatrix } },
      { new: true, runValidators: true }
    );

    if (!school) {
      console.error(`❌ [UPDATE ACCESS MATRIX] School not found: ${schoolId}`);
      return res.status(404).json({ message: 'School not found' });
    }

    console.log(`✅ [UPDATE ACCESS MATRIX] Successfully updated in main database for school: ${school.name}`);
    console.log(`📋 [UPDATE ACCESS MATRIX] Saved access matrix:`, JSON.stringify(school.accessMatrix, null, 2));

    // Sync the updated access matrix to the school's dedicated database
    if (school.databaseCreated) {
      try {
        const schoolConnection = await SchoolDatabaseManager.getSchoolConnection(school.code);
        await updateAccessMatrixCollection(school, schoolConnection);
        console.log(`🔐 Access matrix updated and synced for school: ${school.name}`);
      } catch (syncError) {
        console.error('Error syncing access matrix after update:', syncError);
        // Don't fail the update if sync fails, just log the error
      }
    }

    res.json({ 
      message: 'Access matrix updated successfully', 
      school: {
        _id: school._id,
        name: school.name,
        code: school.code,
        accessMatrix: school.accessMatrix
      }
    });
  } catch (error) {
    console.error('Error updating access matrix:', error);
    res.status(500).json({ message: 'Error updating access matrix', error: error.message });
  }
};

// Get school statistics
exports.getSchoolStats = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    // Check if user has access to this school
    if (req.user.role === 'superadmin' || req.user.schoolId?.toString() === schoolId) {
      const stats = await User.aggregate([
  { $match: { schoolId: new (require('mongoose')).Types.ObjectId(schoolId) } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      const statsObj = {};
      stats.forEach(stat => {
        statsObj[stat._id] = stat.count;
      });

      res.json({
        totalStudents: statsObj.student || 0,
        totalTeachers: statsObj.teacher || 0,
        totalParents: statsObj.parent || 0,
        totalAdmins: statsObj.admin || 0
      });
    } else {
      res.status(403).json({ message: 'Access denied' });
    }
  } catch (error) {
    console.error('Error fetching school stats:', error);
    res.status(500).json({ message: 'Error fetching school stats', error: error.message });
  }
};

// Get total users across all schools (Super Admin only)
exports.getAllSchoolsStats = async (req, res) => {
  try {
    console.log('📊 Fetching total users across all schools...');
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ 
        success: false,
        message: 'Only super admin can access this endpoint' 
      });
    }

    const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');
    const School = require('../models/School');
    
    // Get all schools
    const schools = await School.find({ isActive: true }, 'code name');
    console.log(`📋 Found ${schools.length} active schools`);
    
    let totalUsers = 0;
    let totalStudents = 0;
    let totalTeachers = 0;
    let totalParents = 0;
    let totalAdmins = 0;
    let schoolBreakdown = [];
    
    // Iterate through each school and count users
    for (const school of schools) {
      try {
        const connection = await SchoolDatabaseManager.getSchoolConnection(school.code);
        const db = connection.db;
        
        let schoolUserCount = 0;
        let schoolStats = {
          schoolCode: school.code,
          schoolName: school.name,
          students: 0,
          teachers: 0,
          parents: 0,
          admins: 0,
          total: 0
        };
        
        // Count users in each role collection
        const collections = ['students', 'teachers', 'parents', 'admins'];
        for (const collectionName of collections) {
          try {
            const collection = db.collection(collectionName);
            // Count real users (excluding placeholder documents)
            const count = await collection.countDocuments({ 
              _placeholder: { $ne: true } 
            });
            
            schoolUserCount += count;
            const role = collectionName.slice(0, -1); // Remove 's' from plural
            schoolStats[role] = count;
            
            // Add to totals
            switch (role) {
              case 'student':
                totalStudents += count;
                break;
              case 'teacher':
                totalTeachers += count;
                break;
              case 'parent':
                totalParents += count;
                break;
              case 'admin':
                totalAdmins += count;
                break;
            }
          } catch (collectionError) {
            console.warn(`⚠️ Error counting ${collectionName} in school ${school.code}:`, collectionError.message);
          }
        }
        
        schoolStats.total = schoolUserCount;
        totalUsers += schoolUserCount;
        schoolBreakdown.push(schoolStats);
        
        console.log(`✅ School ${school.code}: ${schoolUserCount} users`);
        
      } catch (schoolError) {
        console.error(`❌ Error connecting to school ${school.code}:`, schoolError.message);
        schoolBreakdown.push({
          schoolCode: school.code,
          schoolName: school.name,
          students: 0,
          teachers: 0,
          parents: 0,
          admins: 0,
          total: 0,
          error: schoolError.message
        });
      }
    }
    
    console.log(`📊 Total users across all schools: ${totalUsers}`);
    
    res.json({
      success: true,
      totalUsers,
      breakdown: {
        totalStudents,
        totalTeachers,
        totalParents,
        totalAdmins
      },
      schoolBreakdown,
      totalSchools: schools.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching all schools stats:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching all schools stats', 
      error: error.message 
    });
  }
};

// Deactivate/Activate school
exports.toggleSchoolStatus = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only super admin can toggle school status' });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    school.isActive = !school.isActive;
    await school.save();

    res.json({ 
      message: `School ${school.isActive ? 'activated' : 'deactivated'} successfully`,
      school: { id: school._id, name: school.name, isActive: school.isActive }
    });
  } catch (error) {
    console.error('Error toggling school status:', error);
    res.status(500).json({ message: 'Error toggling school status', error: error.message });
  }
};

// Delete school (Super Admin only)
exports.deleteSchool = async (req, res) => {
  try {
    console.log('🚨 DELETE SCHOOL FUNCTION CALLED 🚨');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    console.log('Request user:', req.user);
    
    const { schoolId } = req.params;
    
    console.log(`[DELETE REQUEST] School ID: ${schoolId}, User: ${req.user?.email || 'UNKNOWN'}, Role: ${req.user?.role || 'UNKNOWN'}`);
    console.log(`[DELETE REQUEST] Headers:`, req.headers);
    console.log(`[DELETE REQUEST] Method: ${req.method}, URL: ${req.originalUrl}`);
    
    if (!req.user) {
      console.log('[DELETE DENIED] No user found in request');
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    if (req.user.role !== 'superadmin') {
      console.log('[DELETE DENIED] User is not superadmin');
      return res.status(403).json({ success: false, message: 'Only super admin can delete schools' });
    }

    const school = await School.findById(schoolId);
    console.log('[DELETE DEBUG] School found:', school);
    if (!school) {
      console.log('[DELETE ERROR] School not found');
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    console.log(`[DELETE START] Deleting school: ${school.name} (${school.code})`);

    // Also delete all users associated with this school
    const User = require('../models/User');
    const deletedUsers = await User.deleteMany({ schoolId });
    console.log(`[DELETE USERS] Deleted ${deletedUsers.deletedCount} users associated with school`);

    // Delete any test details associated with this school
    const TestDetails = require('../models/TestDetails');
    const deletedTestDetails = await TestDetails.deleteMany({ schoolId });
    console.log(`[DELETE TEST DETAILS] Deleted ${deletedTestDetails.deletedCount} test details`);

    // Delete the school
    // Drop the dedicated database if present (add verbose diagnostics)
    let dbDropInfo = { attempted: false, mongoUri: null, error: null, dropped: false, dbListBefore: [], dbListAfter: [] };
    // Determine db name via SchoolDatabaseManager to ensure consistent naming
    const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');
    const derivedDbName = SchoolDatabaseManager.getDatabaseName(school.code);
    const dbNameToDrop = school.databaseName || derivedDbName;

    if (dbNameToDrop) {
      dbDropInfo.attempted = true;
      dbDropInfo.derivedDbName = derivedDbName;
      dbDropInfo.dbNameToDrop = dbNameToDrop;
      
      // First, close any existing connection to the school database
      try {
        await SchoolDatabaseManager.closeSchoolConnection(school.code);
        console.log(`[DB DROP] Closed existing connection to school database: ${dbNameToDrop}`);
      } catch (closeErr) {
        console.warn(`[DB DROP] Warning: Could not close school connection: ${closeErr.message}`);
      }
      
      try {
        const { MongoClient } = require('mongodb');
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
        dbDropInfo.mongoUri = mongoUri;

        const adminClient = new MongoClient(mongoUri, { useUnifiedTopology: true });
        await adminClient.connect();

        // List databases before drop for diagnostics
        try {
          const admin = adminClient.db().admin();
          const { databases } = await admin.listDatabases();
          dbDropInfo.dbListBefore = databases.map(d => d.name);
          console.log(`[DB DROP DEBUG] Databases before drop: ${dbDropInfo.dbListBefore.join(', ')}`);
        } catch (listErr) {
          console.warn('[DB DROP DEBUG] Could not list databases before drop:', listErr.message || listErr);
        }

        const adminDb = adminClient.db(dbNameToDrop);
        // Attempt to drop the database and capture the result
        try {
          const dropResult = await adminDb.dropDatabase();
          dbDropInfo.dropped = !!dropResult;
          console.log(`[DB DROP RESULT] dropDatabase(${dbNameToDrop}) returned:`, dropResult);
        } catch (dropErr) {
          dbDropInfo.error = dropErr.message || String(dropErr);
          console.error(`[DB DROP ERROR] Failed to drop database ${dbNameToDrop}:`, dbDropInfo.error);
        }

        // List databases after drop for diagnostics
        try {
          const admin = adminClient.db().admin();
          const { databases } = await admin.listDatabases();
          dbDropInfo.dbListAfter = databases.map(d => d.name);
          console.log(`[DB DROP DEBUG] Databases after drop: ${dbDropInfo.dbListAfter.join(', ')}`);
        } catch (listErr) {
          console.warn('[DB DROP DEBUG] Could not list databases after drop:', listErr.message || listErr);
        }

        await adminClient.close();
        if (dbDropInfo.dropped) {
          console.log(`[DB DROPPED] Dropped database ${dbNameToDrop} for school ${school.code}`);
        } else {
          console.warn(`[DB DROP] Database ${dbNameToDrop} was not dropped. See dbDropInfo for details.`);
        }
      } catch (dbErr) {
        dbDropInfo.error = dbErr.message || String(dbErr);
        console.error(`[DB DROP ERROR] Failed to drop database ${dbNameToDrop}:`, dbDropInfo.error);
        // Continue — don't block deletion if DB drop fails
      }
    }

    console.log('[DELETE DEBUG] About to delete school from database...');
    console.log('[DELETE DEBUG] School ID to delete:', schoolId);
    console.log('[DELETE DEBUG] School object found:', { id: school._id, name: school.name, code: school.code });
    
    // Verify the School model is properly connected
    console.log('[DELETE DEBUG] School model info:', {
      modelName: School.modelName,
      collection: School.collection.name,
      db: School.db.name
    });

    const deletedSchool = await School.findByIdAndDelete(schoolId);
    console.log('[DELETE DEBUG] School deletion result:', deletedSchool);
    console.log('[DELETE DEBUG] Was deletion successful?', !!deletedSchool);
    
    // Verify deletion by trying to find the school again
    const verifyDeletion = await School.findById(schoolId);
    console.log('[DELETE VERIFICATION] School still exists after deletion?', !!verifyDeletion);
    if (verifyDeletion) {
      console.error('[DELETE VERIFICATION ERROR] School still exists in database after deletion!');
      return res.status(500).json({ success: false, message: 'School deletion failed - school still exists in database' });
    }
    
    if (!deletedSchool) {
      console.log('[DELETE ERROR] Failed to delete school from database');
      return res.status(500).json({ success: false, message: 'Failed to delete school from database' });
    }

    console.log(`[SCHOOL DELETED] ${school.name} (${school._id}) successfully deleted by ${req.user.email}`);
    
    res.json({ 
      success: true,
      message: 'School and all associated data deleted successfully',
      deletedSchool: { 
        id: school._id, 
        name: school.name,
        code: school.code 
      },
      deletedUsers: deletedUsers.deletedCount,
      deletedTestDetails: deletedTestDetails.deletedCount,
      dbDropInfo
    });
  } catch (error) {
    console.error('[DELETE ERROR] Error deleting school:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting school', 
      error: error.message 
    });
  }
};

// Add a new school
exports.addSchool = async (req, res) => {
  try {
    const {
      name,
      mobile,
      principalName,
      principalEmail,
      area,
      district,
      pinCode,
      bankDetails,
      accessMatrix,
      schoolType,
      establishedYear,
      affiliationBoard,
      website,
      secondaryContact
    } = req.body;

    if (!name || !mobile || !principalName || !principalEmail) {
      return res.status(400).json({ message: 'Name, mobile, principal name, and principal email are required' });
    }

    const newSchool = new School({
      name,
      mobile,
      principalName,
      principalEmail,
      area,
      district,
      pinCode,
      bankDetails,
      accessMatrix,
      schoolType,
      establishedYear,
      affiliationBoard,
      website,
      secondaryContact,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newSchool.save();
    
    // Create default test details for the school
    try {
      await TestDetails.createDefaultTestTypes(
        newSchool._id, 
        newSchool.code, 
        req.user ? req.user._id : null
      );
      console.log(`[TEST DETAILS CREATED] Default test types created for school ${newSchool.code}`);
    } catch (testError) {
      console.error(`[TEST DETAILS ERROR] Failed to create test details for school ${newSchool.code}:`, testError);
      // Don't fail school creation if test details creation fails
    }
    
    res.status(201).json({ message: 'School added successfully', school: newSchool });
  } catch (error) {
    console.error('[ADD SCHOOL ERROR]', error);
    res.status(500).json({ message: 'Failed to add school', error: error.message });
  }
};

// Manual sync function to sync existing schools to their dedicated databases
exports.syncSchoolToDatabase = async (req, res) => {
  try {
    const { schoolId } = req.params;
    
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied. Only superadmins can sync school data.' });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: 'School not found' });
    }

    if (!school.databaseCreated) {
      return res.status(400).json({ 
        message: 'School database not created yet. Cannot sync data.' 
      });
    }

    await syncSchoolInfoToDatabase(school);
    
    res.json({ 
      message: 'School information synced successfully to dedicated database',
      school: {
        name: school.name,
        code: school.code,
        databaseName: school.databaseName,
        lastSyncedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error syncing school to database:', error);
    res.status(500).json({ 
      message: 'Error syncing school to database', 
      error: error.message 
    });
  }
};

// Sync all schools to their dedicated databases
exports.syncAllSchoolsToDatabase = async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied. Only superadmins can sync school data.' });
    }

    const schools = await School.find({ databaseCreated: true });
    const syncResults = [];

    for (const school of schools) {
      try {
        await syncSchoolInfoToDatabase(school);
        syncResults.push({
          schoolId: school._id,
          name: school.name,
          code: school.code,
          status: 'success',
          syncedAt: new Date()
        });
        console.log(`✅ Synced: ${school.name} (${school.code})`);
      } catch (error) {
        syncResults.push({
          schoolId: school._id,
          name: school.name,
          code: school.code,
          status: 'failed',
          error: error.message
        });
        console.error(`❌ Failed to sync: ${school.name} (${school.code})`, error);
      }
    }

    const successCount = syncResults.filter(r => r.status === 'success').length;
    const failCount = syncResults.filter(r => r.status === 'failed').length;

    res.json({
      message: `Sync completed. ${successCount} successful, ${failCount} failed.`,
      totalSchools: schools.length,
      successCount,
      failCount,
      results: syncResults
    });
  } catch (error) {
    console.error('Error syncing all schools:', error);
    res.status(500).json({ 
      message: 'Error syncing all schools to their databases', 
      error: error.message 
    });
  }
};

// Get classes and sections for a school (canonical endpoint)
exports.getClassesForSchool = async (req, res) => {
  try {
    const { schoolId: schoolIdOrCode } = req.params;
    const userSchoolId = req.user.schoolId;
    const userRole = req.user.role;

    // Resolve school by ID or by code (case-insensitive)
    let school = null;
    try {
      school = await School.findById(schoolIdOrCode);
    } catch (e) {
      school = null;
    }
    if (!school) {
      school = await School.findOne({ code: new RegExp(`^${schoolIdOrCode}$`, 'i') });
    }

    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Validate school ownership for admin users
    if (userRole === 'admin' && userSchoolId.toString() !== school._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Cannot access other schools\' data'
      });
    }

    // Get school database connection
    const schoolConnection = await SchoolDatabaseManager.getSchoolConnection(school.code);
    const classesCollection = schoolConnection.collection('classes');

    // Fetch all active classes by resolved school _id
    const classes = await classesCollection.find({
      schoolId: school._id.toString(),
      isActive: true
    }).sort({ className: 1 }).toArray();

    // Transform to the required format
    const transformedClasses = classes.map(cls => ({
      classId: cls.classId || cls._id.toString(),
      className: cls.className,
      sections: cls.sections ? cls.sections.map((section) => ({
        sectionId: `${cls.classId || cls._id.toString()}_${section}`,
        sectionName: section
      })) : []
    }));

    // Add caching headers (30 seconds)
    res.set('Cache-Control', 'private, max-age=30');
    
    res.json({
      success: true,
      data: transformedClasses
    });

  } catch (error) {
    console.error('Error fetching classes for school:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching classes for school',
      error: error.message
    });
  }
};
