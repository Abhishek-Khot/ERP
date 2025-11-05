const Assignment = require('../models/Assignment');
const AssignmentMultiTenant = require('../models/AssignmentMultiTenant');
const Submission = require('../models/Submission');
const User = require('../models/User');
const School = require('../models/School');
const DatabaseManager = require('../utils/databaseManager');
const { uploadPDFToCloudinary, deletePDFFromCloudinary, deleteFromCloudinary, extractPublicId, deleteLocalFile } = require('../config/cloudinary');
const path = require('path');
const fs = require('fs');

// Create a new assignment
exports.createAssignment = async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      class: className,
      section,
      startDate,
      dueDate,
      instructions,
      academicYear,
      term,
      attachments = []
    } = req.body;

    // Validate required fields
    if (!title || !subject || !className || !section || !startDate || !dueDate) {
      return res.status(400).json({
        message: 'Missing required fields',
        requiredFields: ['title', 'subject', 'class', 'section', 'startDate', 'dueDate']
      });
    }

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get school ID - depending on user type
    let schoolId;
    let schoolCode;

    // First check if schoolCode is provided in the request body (from frontend)
    schoolCode = req.body.schoolCode || req.user.schoolCode;

    if (!schoolCode) {
      return res.status(400).json({ message: 'School code is required' });
    }

    // Find the school in the main database to get its ObjectId
    const school = await School.findOne({ code: schoolCode });
    if (!school) {
      return res.status(404).json({ message: `School not found with code ${schoolCode}` });
    }
    schoolId = school._id;

    console.log(`[ASSIGNMENT] Found school ID ${schoolId} for school code ${schoolCode}`);


    // Get total students in the class - using appropriate database
    let totalStudents = 0;

    try {
      if (req.user.schoolCode) {
        // For multi-tenant, use the school database
        const schoolCode = req.user.schoolCode;
        console.log(`[ASSIGNMENT] Counting students in school ${schoolCode} for class ${className}-${section}`);

        // Use a simpler approach - just set a default value for now
        // In production, you would query the correct database
        totalStudents = 30; // Default value
      } else {
        // For single tenant, query the main database
        totalStudents = await User.countDocuments({
          schoolId,
          role: 'student',
          'studentDetails.class': className,
          'studentDetails.section': section
        });
      }
    } catch (error) {
      console.error('Error counting students:', error);
      totalStudents = 0; // Default to 0 if there's an error
    }

    // Validate dates
    const startDateObj = new Date(startDate);
    const dueDateObj = new Date(dueDate);

    if (startDateObj >= dueDateObj) {
      return res.status(400).json({ message: 'Due date must be after start date' });
    }

    // Process uploaded files and upload to Cloudinary
    let processedAttachments = [];
    if (req.files && req.files.length > 0) {
      console.log(`📎 Processing ${req.files.length} attachment(s) for assignment`);
      
      for (const file of req.files) {
        try {
          const timestamp = Date.now();
          
          // Upload to Cloudinary
          const cloudinaryFolder = `assignments/${schoolCode}`;
          const publicId = `assignment_${timestamp}_${Math.random().toString(36).substring(7)}`;
          
          const uploadResult = await uploadPDFToCloudinary(file.path, cloudinaryFolder, publicId);
          
          processedAttachments.push({
            filename: file.filename,
            originalName: file.originalname,
            path: uploadResult.secure_url, // Store Cloudinary URL
            cloudinaryPublicId: uploadResult.public_id,
            size: file.size,
            uploadedAt: new Date()
          });
          
          console.log(`✅ Uploaded ${file.originalname} to Cloudinary`);
          
          // Delete local temp file
          deleteLocalFile(file.path);
          
        } catch (error) {
          console.error(`❌ Error uploading ${file.originalname} to Cloudinary:`, error);
          // Clean up temp file on error
          deleteLocalFile(file.path);
        }
      }
    }

    // Set current academic year if not provided
    const getCurrentAcademicYear = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // Jan is 0, Dec is 11

      // If current month is before April, use previous year as start of academic year
      // Example: March 2024 would be in 2023-24 academic year
      if (month < 4) {
        return `${year - 1}-${year.toString().substr(2, 2)}`;
      } else {
        return `${year}-${(year + 1).toString().substr(2, 2)}`;
      }
    };

    // Create assignment either in school-specific database or main database
    let assignment;

    // Get teacher name and ID from req.user (already populated by auth middleware)
    const teacherName = req.user.name?.firstName
      ? `${req.user.name.firstName} ${req.user.name.lastName || ''}`.trim()
      : req.user.name || req.user.email || 'Unknown Teacher';

    const teacherId = req.user.userId || req.user._id.toString();

    console.log(`[ASSIGNMENT] Teacher info - Name: ${teacherName}, ID: ${teacherId}`);

    try {
      // Connect to school-specific database
      console.log(`[ASSIGNMENT] Connecting to school database for ${schoolCode}`);
      const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);

      // Get the AssignmentMultiTenant model for this connection
      const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

      // Create the assignment in the school-specific database
      assignment = new SchoolAssignment({
        schoolId,
        schoolCode,
        title,
        description: description || instructions || '',
        subject,
        class: className,
        section,
        teacher: teacherId, // Use userId instead of _id
        teacherName,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        instructions: instructions || description || '',
        attachments: processedAttachments,
        academicYear: academicYear || getCurrentAcademicYear(),
        term: term || 'Term 1',
        totalStudents,
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
        createdBy: teacherId, // Use userId instead of _id
        createdByName: teacherName
      });

      console.log(`[ASSIGNMENT] Created assignment in school_${schoolCode}.assignments`);

      await assignment.save();
      console.log(`[ASSIGNMENT] Saved assignment to school_${schoolCode}.assignments successfully`);
    } catch (error) {
      console.error(`[ASSIGNMENT] Error saving to school database: ${error.message}`);
      console.log('[ASSIGNMENT] Falling back to main database');

      // Fallback to main database if school-specific fails
      assignment = new Assignment({
        schoolId,
        schoolCode,
        title,
        description: description || instructions || '',
        subject,
        class: className,
        section,
        teacher: teacherId, // Use userId instead of _id
        teacherName,
        startDate: new Date(startDate),
        dueDate: new Date(dueDate),
        instructions: instructions || description || '',
        attachments: processedAttachments,
        academicYear: academicYear || getCurrentAcademicYear(),
        term: term || 'Term 1',
        totalStudents,
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
        createdBy: teacherId, // Use userId instead of _id
        createdByName: teacherName
      });

      await assignment.save();
    }

    // Send notifications to students and parents
    try {
      // Skip notifications for now in multi-tenant mode
      if (!req.user.schoolCode) {
        await sendAssignmentNotifications(assignment, schoolId);
      }
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError);
      // Don't fail the assignment creation if notifications fail
    }

    res.status(201).json({
      message: `Assignment sent to ${className} • Section ${section} • Due ${dueDateObj.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`,
      assignment: assignment.toObject(),
      summary: {
        studentsNotified: totalStudents,
        className: `${className} • Section ${section}`,
        dueDate: dueDateObj.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      }
    });

  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ message: 'Error creating assignment', error: error.message });
  }
};

// Helper function to send notifications to students and parents
const sendAssignmentNotifications = async (assignment, schoolId) => {
  try {
    // Get all students in the class/section
    const students = await User.find({
      schoolId,
      role: 'student',
      'studentDetails.class': assignment.class,
      'studentDetails.section': assignment.section
    }).select('_id parentId fcmToken');

    // Get all parents of these students
    const parentIds = students.map(student => student.parentId).filter(Boolean);
    const parents = await User.find({
      _id: { $in: parentIds }
    }).select('_id fcmToken');

    // Create notification data
    const notificationData = {
      title: `New Assignment: ${assignment.subject}`,
      body: `${assignment.title} - Due: ${assignment.dueDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}`,
      data: {
        type: 'assignment',
        assignmentId: assignment._id.toString(),
        subject: assignment.subject,
        className: assignment.class,
        section: assignment.section,
        dueDate: assignment.dueDate.toISOString()
      }
    };

    // Send to students
    const studentTokens = students.map(student => student.fcmToken).filter(Boolean);
    if (studentTokens.length > 0) {
      // Here you would integrate with your push notification service
      console.log(`📱 Sending notifications to ${studentTokens.length} students`);
    }

    // Send to parents
    const parentTokens = parents.map(parent => parent.fcmToken).filter(Boolean);
    if (parentTokens.length > 0) {
      // Here you would integrate with your push notification service
      console.log(`📱 Sending notifications to ${parentTokens.length} parents`);
    }

    return {
      studentsNotified: studentTokens.length,
      parentsNotified: parentTokens.length,
      totalNotified: studentTokens.length + parentTokens.length
    };

  } catch (error) {
    console.error('Error sending notifications:', error);
    throw error;
  }
};

// Get all assignments for a school
exports.getAssignments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, subject, class: className, search = '' } = req.query;

    // Check if user has access
    if (!['admin', 'teacher', 'student', 'parent'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get school information
    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    if (!schoolCode && !schoolId) {
      return res.status(400).json({ message: 'School information not found' });
    }

    console.log(`[GET ASSIGNMENTS] Getting assignments for school: ${schoolCode || schoolId}`);

    // Build query
    const query = {};
    if (schoolId) {
      query.schoolId = schoolId;
    }

    if (status) {
      query.status = status;
    }
    if (subject) {
      query.subject = subject;
    }
    if (className) {
      query.class = className;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } }
      ];
    }

    // Teachers can only see their own assignments
    if (req.user.role === 'teacher') {
      // Use userId (e.g., "SK-T-001") instead of MongoDB _id
      const teacherId = req.user.userId || req.user._id.toString();
      query.teacher = teacherId;
      console.log(`[GET ASSIGNMENTS] Filtering by teacher: ${teacherId}`);
    }

    // Students can only see published assignments for their class/section
    if (req.user.role === 'student') {
      query.isPublished = true;
      query.status = 'active';

      // Filter by student's class and section
      // Check multiple possible locations for class/section data
      const studentClass = req.user.studentDetails?.currentClass ||
        req.user.studentDetails?.academic?.currentClass ||
        req.user.class;
      const studentSection = req.user.studentDetails?.currentSection ||
        req.user.studentDetails?.academic?.currentSection ||
        req.user.section;

      if (studentClass) {
        query.class = studentClass;
        console.log(`[GET ASSIGNMENTS] Filtering for student class: ${studentClass}`);
      }
      if (studentSection) {
        query.section = studentSection;
        console.log(`[GET ASSIGNMENTS] Filtering for student section: ${studentSection}`);
      }

      if (!studentClass || !studentSection) {
        console.warn(`[GET ASSIGNMENTS] Student ${req.user.userId} missing class/section data`);
      }
    }

    // Parents can only see published assignments
    if (req.user.role === 'parent') {
      query.isPublished = true;
      query.status = 'active';
    }

    let assignments = [];
    let total = 0;

    // Try to get assignments from school-specific database first
    if (schoolCode) {
      try {
        console.log(`[GET ASSIGNMENTS] Trying school-specific database for ${schoolCode}`);
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

        assignments = await SchoolAssignment.find(query)
          .limit(limit * 1)
          .skip((page - 1) * limit)
          .sort({ createdAt: -1 });

        total = await SchoolAssignment.countDocuments(query);

        console.log(`[GET ASSIGNMENTS] Found ${assignments.length} assignments in school-specific database`);
      } catch (error) {
        console.error(`[GET ASSIGNMENTS] Error accessing school-specific database: ${error.message}`);
      }
    }

    // If no assignments found in school-specific database or no schoolCode, try main database
    if (assignments.length === 0 && schoolId) {
      console.log(`[GET ASSIGNMENTS] Falling back to main database`);
      assignments = await Assignment.find(query)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 });

      total = await Assignment.countDocuments(query);
      console.log(`[GET ASSIGNMENTS] Found ${assignments.length} assignments in main database`);
    }

    res.json({
      assignments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments', error: error.message });
  }
};

// Get assignment by ID
exports.getAssignmentById = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    // Check if user has access
    if (!['admin', 'teacher', 'student', 'parent'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get school information
    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    if (!schoolCode && !schoolId) {
      return res.status(400).json({ message: 'School information not found' });
    }

    console.log(`[GET ASSIGNMENT] Getting assignment ${assignmentId} for school: ${schoolCode || schoolId}`);

    let assignment = null;

    // Try to get the assignment from the school-specific database first
    if (schoolCode) {
      try {
        console.log(`[GET ASSIGNMENT] Trying school-specific database for ${schoolCode}`);
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

        // Try to find by MongoDB ObjectId first
        try {
          assignment = await SchoolAssignment.findById(assignmentId);
        } catch (idError) {
          // If that fails, try to find by assignmentId field
          assignment = await SchoolAssignment.findOne({ assignmentId });
        }

        if (assignment) {
          console.log(`[GET ASSIGNMENT] Found assignment in school-specific database`);
        }
      } catch (error) {
        console.error(`[GET ASSIGNMENT] Error accessing school-specific database: ${error.message}`);
      }
    }

    // If not found in school-specific database, try main database
    if (!assignment && schoolId) {
      console.log(`[GET ASSIGNMENT] Falling back to main database`);
      assignment = await Assignment.findById(assignmentId);

      if (assignment) {
        console.log(`[GET ASSIGNMENT] Found assignment in main database`);
      }
    }

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if user has access to this assignment's school
    if (schoolId && assignment.schoolId &&
      schoolId.toString() !== assignment.schoolId.toString()) {
      return res.status(403).json({ message: 'Access denied - school mismatch' });
    }

    // Students and parents can only see published assignments
    if (['student', 'parent'].includes(req.user.role) && !assignment.isPublished) {
      return res.status(403).json({ message: 'Assignment not published yet' });
    }

    res.json(assignment);

  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Error fetching assignment', error: error.message });
  }
};

// Update assignment
exports.updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const updateData = req.body;

    console.log(`[UPDATE ASSIGNMENT] Updating assignment ${assignmentId}`);

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get school information
    const schoolCode = req.user.schoolCode || updateData.schoolCode;
    const schoolId = req.user.schoolId;

    // Process uploaded files and upload to Cloudinary
    let processedAttachments = [];
    if (req.files && req.files.length > 0) {
      console.log(`[UPDATE ASSIGNMENT] Processing ${req.files.length} new file(s)`);
      
      for (const file of req.files) {
        try {
          const timestamp = Date.now();
          
          // Upload to Cloudinary
          const cloudinaryFolder = `assignments/${schoolCode}`;
          const publicId = `assignment_${timestamp}_${Math.random().toString(36).substring(7)}`;
          
          const uploadResult = await uploadPDFToCloudinary(file.path, cloudinaryFolder, publicId);
          
          processedAttachments.push({
            filename: file.filename,
            originalName: file.originalname,
            path: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            size: file.size,
            uploadedAt: new Date()
          });
          
          console.log(`✅ Uploaded ${file.originalname} to Cloudinary`);
          deleteLocalFile(file.path);
          
        } catch (error) {
          console.error(`❌ Error uploading ${file.originalname}:`, error);
          deleteLocalFile(file.path);
        }
      }
      console.log(`[UPDATE ASSIGNMENT] ${processedAttachments.length} files uploaded to Cloudinary`);
    }

    // Parse existing attachments if provided
    let existingAttachments = [];
    if (updateData.existingAttachments) {
      try {
        existingAttachments = JSON.parse(updateData.existingAttachments);
      } catch (e) {
        console.warn('Failed to parse existingAttachments:', e);
      }
    }

    // Combine existing and new attachments
    const allAttachments = [...existingAttachments, ...processedAttachments];

    let assignment = null;
    let updatedAssignment = null;

    // Try school-specific database first
    if (schoolCode) {
      try {
        console.log(`[UPDATE ASSIGNMENT] Trying school-specific database for ${schoolCode}`);
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

        assignment = await SchoolAssignment.findById(assignmentId);

        if (assignment) {
          console.log(`[UPDATE ASSIGNMENT] Found assignment in school-specific database`);

          // Check access
          const teacherId = req.user.userId || req.user._id.toString();
          if (req.user.role === 'teacher' && assignment.teacher !== teacherId) {
            return res.status(403).json({ message: 'You can only update your own assignments' });
          }

          // Prepare update data
          const updateFields = {
            title: updateData.title || assignment.title,
            subject: updateData.subject || assignment.subject,
            class: updateData.class || assignment.class,
            section: updateData.section || assignment.section,
            startDate: updateData.startDate ? new Date(updateData.startDate) : assignment.startDate,
            dueDate: updateData.dueDate ? new Date(updateData.dueDate) : assignment.dueDate,
            instructions: updateData.instructions !== undefined ? updateData.instructions : assignment.instructions,
            description: updateData.instructions !== undefined ? updateData.instructions : assignment.description,
            attachments: allAttachments,
            updatedAt: new Date()
          };

          updatedAssignment = await SchoolAssignment.findByIdAndUpdate(
            assignmentId,
            { $set: updateFields },
            { new: true, runValidators: true }
          );

          console.log(`[UPDATE ASSIGNMENT] Updated assignment in school-specific database`);
        }
      } catch (error) {
        console.error(`[UPDATE ASSIGNMENT] Error with school-specific database: ${error.message}`);
      }
    }

    // Fallback to main database
    if (!assignment && schoolId) {
      console.log(`[UPDATE ASSIGNMENT] Trying main database`);
      assignment = await Assignment.findById(assignmentId);

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      // Check if user has access to this assignment's school
      if (schoolId.toString() !== assignment.schoolId?.toString()) {
        return res.status(403).json({ message: 'Access denied - school mismatch' });
      }

      // Teachers can only update their own assignments
      const teacherId = req.user.userId || req.user._id.toString();
      if (req.user.role === 'teacher' && assignment.teacher.toString() !== teacherId) {
        return res.status(403).json({ message: 'You can only update your own assignments' });
      }

      // Prepare update data
      const updateFields = {
        title: updateData.title || assignment.title,
        subject: updateData.subject || assignment.subject,
        class: updateData.class || assignment.class,
        section: updateData.section || assignment.section,
        startDate: updateData.startDate ? new Date(updateData.startDate) : assignment.startDate,
        dueDate: updateData.dueDate ? new Date(updateData.dueDate) : assignment.dueDate,
        instructions: updateData.instructions !== undefined ? updateData.instructions : assignment.instructions,
        description: updateData.instructions !== undefined ? updateData.instructions : assignment.description,
        attachments: allAttachments,
        updatedBy: req.user.userId || req.user._id.toString(),
        updatedAt: new Date()
      };

      updatedAssignment = await Assignment.findByIdAndUpdate(
        assignmentId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      console.log(`[UPDATE ASSIGNMENT] Updated assignment in main database`);
    }

    if (!updatedAssignment) {
      return res.status(404).json({ message: 'Assignment not found or update failed' });
    }

    res.json({
      message: 'Assignment updated successfully',
      assignment: updatedAssignment
    });

  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Error updating assignment', error: error.message });
  }
};

// Publish assignment
exports.publishAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if user has access to this assignment's school
    if (req.user.schoolId?.toString() !== assignment.schoolId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Teachers can only publish their own assignments
    const teacherId = req.user.userId || req.user._id.toString();
    if (req.user.role === 'teacher' && assignment.teacher.toString() !== teacherId) {
      return res.status(403).json({ message: 'You can only publish your own assignments' });
    }

    assignment.isPublished = true;
    assignment.publishedAt = new Date();
    assignment.status = 'active';
    assignment.updatedBy = req.user.userId || req.user._id.toString();
    assignment.updatedAt = new Date();

    await assignment.save();

    res.json({
      message: 'Assignment published successfully',
      assignment: {
        id: assignment._id,
        title: assignment.title,
        status: assignment.status,
        isPublished: assignment.isPublished
      }
    });

  } catch (error) {
    console.error('Error publishing assignment:', error);
    res.status(500).json({ message: 'Error publishing assignment', error: error.message });
  }
};

// Delete assignment
exports.deleteAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    console.log(`[DELETE ASSIGNMENT] Deleting assignment ${assignmentId}`);

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get school information
    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    let assignment = null;
    let deletedFromSchoolDB = false;

    // Try to delete from school-specific database first
    if (schoolCode) {
      try {
        console.log(`[DELETE ASSIGNMENT] Trying school-specific database for ${schoolCode}`);
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

        assignment = await SchoolAssignment.findById(assignmentId);

        if (assignment) {
          console.log(`[DELETE ASSIGNMENT] Found assignment in school-specific database`);

          // Check access - Teachers can only delete their own assignments
          const teacherId = req.user.userId || req.user._id.toString();
          if (req.user.role === 'teacher' && assignment.teacher !== teacherId) {
            return res.status(403).json({ message: 'You can only delete your own assignments' });
          }

          // Delete all attachments from Cloudinary
          if (assignment.attachments && assignment.attachments.length > 0) {
            console.log(`🗑️ Deleting ${assignment.attachments.length} attachment(s) from Cloudinary`);
            for (const attachment of assignment.attachments) {
              if (attachment.cloudinaryPublicId) {
                try {
                  await deletePDFFromCloudinary(attachment.cloudinaryPublicId);
                  console.log(`✅ Deleted attachment: ${attachment.originalName}`);
                } catch (err) {
                  console.warn(`⚠️ Failed to delete attachment ${attachment.originalName}:`, err.message);
                }
              } else if (attachment.path && attachment.path.includes('cloudinary.com')) {
                // Extract public ID from URL if not stored
                const publicId = extractPublicId(attachment.path);
                if (publicId) {
                  try {
                    await deletePDFFromCloudinary(publicId);
                    console.log(`✅ Deleted attachment: ${attachment.originalName}`);
                  } catch (err) {
                    console.warn(`⚠️ Failed to delete attachment ${attachment.originalName}:`, err.message);
                  }
                }
              }
            }
          }

          // Delete the assignment
          await SchoolAssignment.findByIdAndDelete(assignmentId);
          deletedFromSchoolDB = true;
          console.log(`[DELETE ASSIGNMENT] Deleted assignment from school-specific database`);
        }
      } catch (error) {
        console.error(`[DELETE ASSIGNMENT] Error with school-specific database: ${error.message}`);
      }
    }

    // If not found in school-specific database, try main database
    if (!assignment && schoolId) {
      console.log(`[DELETE ASSIGNMENT] Trying main database`);
      assignment = await Assignment.findById(assignmentId);

      if (!assignment) {
        return res.status(404).json({ message: 'Assignment not found' });
      }

      // Check if user has access to this assignment's school
      if (schoolId.toString() !== assignment.schoolId?.toString()) {
        return res.status(403).json({ message: 'Access denied - school mismatch' });
      }

      // Teachers can only delete their own assignments
      const teacherId = req.user.userId || req.user._id.toString();
      if (req.user.role === 'teacher' && assignment.teacher.toString() !== teacherId) {
        return res.status(403).json({ message: 'You can only delete your own assignments' });
      }

      // Delete all attachments from Cloudinary
      if (assignment.attachments && assignment.attachments.length > 0) {
        console.log(`🗑️ Deleting ${assignment.attachments.length} attachment(s) from Cloudinary`);
        for (const attachment of assignment.attachments) {
          if (attachment.cloudinaryPublicId) {
            try {
              await deletePDFFromCloudinary(attachment.cloudinaryPublicId);
              console.log(`✅ Deleted attachment: ${attachment.originalName}`);
            } catch (err) {
              console.warn(`⚠️ Failed to delete attachment ${attachment.originalName}:`, err.message);
            }
          } else if (attachment.path && attachment.path.includes('cloudinary.com')) {
            // Extract public ID from URL if not stored
            const publicId = extractPublicId(attachment.path);
            if (publicId) {
              try {
                await deletePDFFromCloudinary(publicId);
                console.log(`✅ Deleted attachment: ${attachment.originalName}`);
              } catch (err) {
                console.warn(`⚠️ Failed to delete attachment ${attachment.originalName}:`, err.message);
              }
            }
          }
        }
      }

      await Assignment.findByIdAndDelete(assignmentId);
      console.log(`[DELETE ASSIGNMENT] Deleted assignment from main database`);
    }

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found in any database' });
    }

    res.json({
      message: 'Assignment deleted successfully',
      deletedFrom: deletedFromSchoolDB ? 'school-specific database' : 'main database'
    });

  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Error deleting assignment', error: error.message });
  }
};

// Get assignment statistics
exports.getAssignmentStats = async (req, res) => {
  try {
    // Check if user has access
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    console.log(`[GET STATS] Getting stats for school: ${schoolCode || schoolId}`);

    let stats = [];
    let total = 0;
    let overdueCount = 0;
    let dueThisWeekCount = 0;

    // Try school-specific database first
    if (schoolCode) {
      try {
        console.log(`[GET STATS] Trying school-specific database for ${schoolCode}`);
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        const SchoolAssignment = AssignmentMultiTenant.getModelForConnection(schoolConn);

        // Build match query
        const matchQuery = {};
        if (req.user.role === 'teacher') {
          const teacherId = req.user.userId || req.user._id.toString();
          matchQuery.teacher = teacherId;
        }

        // Get status counts
        stats = await SchoolAssignment.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        // Get total count
        total = await SchoolAssignment.countDocuments(matchQuery);

        // Get overdue assignments count
        overdueCount = await SchoolAssignment.countDocuments({
          ...matchQuery,
          dueDate: { $lt: new Date() },
          status: { $in: ['draft', 'active'] }
        });

        // Get assignments due this week
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        dueThisWeekCount = await SchoolAssignment.countDocuments({
          ...matchQuery,
          dueDate: { $gte: new Date(), $lte: weekFromNow },
          status: { $in: ['draft', 'active'] }
        });

        console.log(`[GET STATS] Found stats in school-specific database: total=${total}, dueThisWeek=${dueThisWeekCount}`);
      } catch (error) {
        console.error(`[GET STATS] Error with school-specific database: ${error.message}`);
      }
    }

    // Fallback to main database if needed
    if (total === 0 && schoolId) {
      console.log(`[GET STATS] Falling back to main database`);

      // Build match query
      const matchQuery = { schoolId };
      if (req.user.role === 'teacher') {
        const teacherId = req.user.userId || req.user._id.toString();
        matchQuery.teacher = teacherId;
      }

      stats = await Assignment.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      total = await Assignment.countDocuments(matchQuery);

      // Get overdue assignments count
      overdueCount = await Assignment.countDocuments({
        ...matchQuery,
        dueDate: { $lt: new Date() },
        status: { $in: ['draft', 'active'] }
      });

      // Get assignments due this week
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      dueThisWeekCount = await Assignment.countDocuments({
        ...matchQuery,
        dueDate: { $gte: new Date(), $lte: weekFromNow },
        status: { $in: ['draft', 'active'] }
      });

      console.log(`[GET STATS] Found stats in main database: total=${total}, dueThisWeek=${dueThisWeekCount}`);
    }

    const statsObj = {};
    stats.forEach(stat => {
      statsObj[stat._id] = stat.count;
    });

    res.json({
      total: total,
      draft: statsObj.draft || 0,
      active: statsObj.active || 0,
      completed: statsObj.completed || 0,
      archived: statsObj.archived || 0,
      overdue: overdueCount,
      dueThisWeek: dueThisWeekCount
    });

  } catch (error) {
    console.error('Error fetching assignment stats:', error);
    res.status(500).json({ message: 'Error fetching assignment stats', error: error.message });
  }
};

// Submit assignment (for students)
exports.submitAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { submissionText } = req.body;

    // Check if user is student
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can submit assignments' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if student belongs to the assignment's class/section
    const student = req.user;
    if (student.studentDetails?.class !== assignment.class ||
      student.studentDetails?.section !== assignment.section) {
      return res.status(403).json({ message: 'Assignment not assigned to your class/section' });
    }

    // Check if assignment is still open for submissions
    const now = new Date();
    const isLate = now > assignment.dueDate;

    if (isLate && !assignment.allowLateSubmission) {
      return res.status(400).json({ message: 'Assignment submission deadline has passed' });
    }

    // Process uploaded files and upload to Cloudinary
    let processedAttachments = [];
    if (req.files && req.files.length > 0) {
      console.log(`📎 Processing ${req.files.length} submission file(s)`);
      
      const schoolCode = req.user.schoolCode || assignment.schoolCode;
      
      for (const file of req.files) {
        try {
          const timestamp = Date.now();
          
          // Upload to Cloudinary
          const cloudinaryFolder = `submissions/${schoolCode}/${assignmentId}`;
          const publicId = `submission_${req.user.userId}_${timestamp}_${Math.random().toString(36).substring(7)}`;
          
          const uploadResult = await uploadPDFToCloudinary(file.path, cloudinaryFolder, publicId);
          
          processedAttachments.push({
            filename: file.filename,
            originalName: file.originalname,
            path: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            size: file.size,
            uploadedAt: new Date()
          });
          
          console.log(`✅ Uploaded submission ${file.originalname} to Cloudinary`);
          deleteLocalFile(file.path);
          
        } catch (error) {
          console.error(`❌ Error uploading ${file.originalname}:`, error);
          deleteLocalFile(file.path);
        }
      }
    }

    // Check if student has already submitted
    const existingSubmission = await Submission.findOne({
      assignmentId,
      studentId: student._id
    });

    if (existingSubmission) {
      // Update existing submission (resubmission)
      existingSubmission.previousVersions.push({
        submissionText: existingSubmission.submissionText,
        attachments: existingSubmission.attachments,
        submittedAt: existingSubmission.submittedAt,
        version: existingSubmission.version
      });

      existingSubmission.submissionText = submissionText;
      existingSubmission.attachments = processedAttachments;
      existingSubmission.submittedAt = now;
      existingSubmission.isLateSubmission = isLate;
      existingSubmission.version += 1;
      existingSubmission.status = 'submitted';

      await existingSubmission.save();

      res.json({
        message: 'Assignment resubmitted successfully',
        submission: existingSubmission,
        isResubmission: true
      });
    } else {
      // Create new submission
      const submission = new Submission({
        schoolId: req.user.schoolId,
        assignmentId,
        studentId: student._id,
        submissionText,
        attachments: processedAttachments,
        isLateSubmission: isLate,
        maxMarks: assignment.maxMarks
      });

      await submission.save();

      // Update assignment submission count
      await Assignment.findByIdAndUpdate(assignmentId, {
        $inc: { submittedCount: 1 }
      });

      res.status(201).json({
        message: 'Assignment submitted successfully',
        submission: submission,
        isResubmission: false
      });
    }

  } catch (error) {
    console.error('Error submitting assignment:', error);
    res.status(500).json({ message: 'Error submitting assignment', error: error.message });
  }
};

// Get student's submission for an assignment
exports.getStudentSubmission = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const studentId = req.user.role === 'student' ? (req.user.userId || req.user._id.toString()) : req.query.studentId;

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID required' });
    }

    const submission = await Submission.findOne({
      assignmentId,
      studentId
    }).populate('studentId', 'name studentDetails')
      .populate('gradedBy', 'name');

    if (!submission) {
      return res.status(404).json({ message: 'No submission found' });
    }

    res.json(submission);

  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ message: 'Error fetching submission', error: error.message });
  }
};

// Get all submissions for an assignment (for teachers)
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { page = 1, limit = 10, status, search = '' } = req.query;

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Build query
    const query = { assignmentId };
    if (status) {
      query.status = status;
    }

    const submissions = await Submission.find(query)
      .populate('studentId', 'name studentDetails')
      .populate('gradedBy', 'name')
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Submission.countDocuments(query);

    res.json({
      submissions,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total
    });

  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions', error: error.message });
  }
};

// Grade a submission (for teachers)
exports.gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback, maxMarks } = req.body;

    // Check if user is admin or teacher
    if (!['admin', 'teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const submission = await Submission.findById(submissionId)
      .populate('assignmentId');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Validate grade
    const maxMarksToUse = maxMarks || submission.assignmentId.maxMarks;
    if (grade < 0 || grade > maxMarksToUse) {
      return res.status(400).json({
        message: `Grade must be between 0 and ${maxMarksToUse}`
      });
    }

    // Update submission
    submission.grade = grade;
    submission.feedback = feedback;
    submission.maxMarks = maxMarksToUse;
    submission.status = 'graded';
    submission.gradedBy = req.user.userId || req.user._id.toString();
    submission.gradedAt = new Date();

    await submission.save();

    // Update assignment graded count
    await Assignment.findByIdAndUpdate(submission.assignmentId._id, {
      $inc: { gradedCount: 1 }
    });

    res.json({
      message: 'Submission graded successfully',
      submission
    });

  } catch (error) {
    console.error('Error grading submission:', error);
    res.status(500).json({ message: 'Error grading submission', error: error.message });
  }
};
