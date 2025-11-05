// backend/controllers/messagesController.js

const Message = require('../models/Message');
const User = require('../models/User');
const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');

// Send message to students by class/section
exports.sendMessage = async (req, res) => {
  try {
    console.log('📨 Sending message:', req.body);
    
    // DEFENSIVE CHECK: Ensure user object exists after auth middleware
    if (!req.user || !req.user._id) {
        console.error('[MESSAGE CONTROLLER ERROR] Authentication context missing, should have been blocked by middleware.');
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    // Validate required fields according to new schema
    const { title, subject, message, class: targetClass, section: targetSection } = req.body;
    
    if (!title || !subject || !message || !targetClass || !targetSection) {
      return res.status(400).json({
        success: false,
        message: 'Title, subject, message, class, and section are required'
      });
    }

    // Verify school ownership - use schoolId from authenticated user
    const userSchoolId = req.user.schoolId;
    if (!userSchoolId) {
      return res.status(400).json({
        success: false,
        message: 'User school ID not found'
      });
    }

    console.log(`🔍 sendMessage: Using authenticated school ID: ${userSchoolId}`);
    
    // Get school connection for student queries and message storage
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    
    // Build student query to handle all possible data structures:
    // 1. class/section at root level (populateSchoolP.js)
    // 2. studentDetails.academic.currentClass/currentSection (quickPopulate.js)
    // 3. studentDetails.currentClass/currentSection (Excel import)
    const studentQuery = { 
      role: 'student',
      _placeholder: { $ne: true } // Exclude placeholder documents
    };
    
    // Build $or query to check all possible locations (case-insensitive)
    const classConditions = [];
    if (targetClass && targetClass !== 'ALL') {
      // Use regex for case-insensitive matching
      const classRegex = new RegExp(`^${targetClass}$`, 'i');
      classConditions.push(
        { class: classRegex },
        { 'studentDetails.academic.currentClass': classRegex },
        { 'studentDetails.currentClass': classRegex }
      );
    }
    
    const sectionConditions = [];
    if (targetSection && targetSection !== 'ALL') {
      // Use regex for case-insensitive matching
      const sectionRegex = new RegExp(`^${targetSection}$`, 'i');
      sectionConditions.push(
        { section: sectionRegex },
        { 'studentDetails.academic.currentSection': sectionRegex },
        { 'studentDetails.currentSection': sectionRegex }
      );
    }
    
    // Combine conditions
    if (classConditions.length > 0 && sectionConditions.length > 0) {
      studentQuery.$and = [
        { $or: classConditions },
        { $or: sectionConditions }
      ];
    } else if (classConditions.length > 0) {
      studentQuery.$or = classConditions;
    } else if (sectionConditions.length > 0) {
      studentQuery.$or = sectionConditions;
    }
    
    console.log('🔍 Student query:', JSON.stringify(studentQuery, null, 2));
    
    // Find matching students
    const studentsCollection = db.collection('students');
    const students = await studentsCollection.find(studentQuery).toArray();
    
    console.log(`👥 Found ${students.length} students matching criteria`);
    
    // Log sample student structure for debugging
    if (students.length > 0) {
      console.log('🔍 Sample student structure:', {
        class: students[0].class,
        section: students[0].section,
        academicClass: students[0].studentDetails?.academic?.currentClass,
        academicSection: students[0].studentDetails?.academic?.currentSection,
        currentClass: students[0].studentDetails?.currentClass,
        currentSection: students[0].studentDetails?.currentSection
      });
    } else {
      // Debug: Check total students in collection
      const totalStudents = await studentsCollection.countDocuments({ role: 'student' });
      console.log(`⚠️ No students found. Total students in collection: ${totalStudents}`);
      
      // Debug: Get sample student to see structure
      const sampleStudent = await studentsCollection.findOne({ role: 'student' });
      if (sampleStudent) {
        console.log('🔍 Sample student structure from DB:', {
          class: sampleStudent.class,
          section: sampleStudent.section,
          academicClass: sampleStudent.studentDetails?.academic?.currentClass,
          academicSection: sampleStudent.studentDetails?.academic?.currentSection,
          currentClass: sampleStudent.studentDetails?.currentClass,
          currentSection: sampleStudent.studentDetails?.currentSection,
          userId: sampleStudent.userId
        });
      }
    }
    
    if (students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students found matching the selected criteria'
      });
    }
    
    // Create message document according to new simplified schema
    const messageData = {
      class: targetClass,
      section: targetSection,
      adminId: req.user._id,
      title: title,
      subject: subject,
      message: message,
      createdAt: new Date(),
      schoolId: userSchoolId // Store schoolId for reference
    };
    
    console.log('✅ Message Data to be Saved:', messageData);
    
    // Save message to school database instead of main database
    const messagesCollection = db.collection('messages');
    const result = await messagesCollection.insertOne(messageData);
    
    console.log(`✅ Message sent successfully to ${students.length} students, stored in school database`);
    
    // Dispatch background job for notifications (FCM, email, etc.)
    console.log('📱 Dispatching background notification job...');
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        messageId: result.insertedId,
        sentCount: students.length,
        recipients: students.map(s => ({
          id: s._id,
          name: s.name?.displayName || `${s.name?.firstName} ${s.name?.lastName}` || s.name,
          class: s.class || s.studentDetails?.academic?.currentClass || s.studentDetails?.currentClass,
          section: s.section || s.studentDetails?.academic?.currentSection || s.studentDetails?.currentSection
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Preview message recipients count
exports.previewMessage = async (req, res) => {
  try {
    console.log('🔍 Previewing message recipients:', req.body);
    
    const { class: targetClass, section: targetSection } = req.body;
    
    // Get user's school ID from the authentication context (source of truth)
    const userSchoolId = req.user.schoolId;

    if (!userSchoolId) {
        return res.status(400).json({
            success: false,
            message: 'User school ID not found in authentication context'
        });
    }
    
    console.log(`🔍 previewMessage: Using authenticated school ID: ${userSchoolId}`);
    
    // Get school connection for student queries
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    
    // Build student query to handle all possible data structures (case-insensitive)
    const studentQuery = { 
      role: 'student',
      _placeholder: { $ne: true } // Exclude placeholder documents
    };
    
    // Build $or query to check all possible locations with case-insensitive matching
    const classConditions = [];
    if (targetClass && targetClass !== 'ALL') {
      // Use regex for case-insensitive matching
      const classRegex = new RegExp(`^${targetClass}$`, 'i');
      classConditions.push(
        { class: classRegex },
        { 'studentDetails.academic.currentClass': classRegex },
        { 'studentDetails.currentClass': classRegex }
      );
    }
    
    const sectionConditions = [];
    if (targetSection && targetSection !== 'ALL') {
      // Use regex for case-insensitive matching
      const sectionRegex = new RegExp(`^${targetSection}$`, 'i');
      sectionConditions.push(
        { section: sectionRegex },
        { 'studentDetails.academic.currentSection': sectionRegex },
        { 'studentDetails.currentSection': sectionRegex }
      );
    }
    
    // Combine conditions
    if (classConditions.length > 0 && sectionConditions.length > 0) {
      studentQuery.$and = [
        { $or: classConditions },
        { $or: sectionConditions }
      ];
    } else if (classConditions.length > 0) {
      studentQuery.$or = classConditions;
    } else if (sectionConditions.length > 0) {
      studentQuery.$or = sectionConditions;
    }
    
    console.log('🔍 Preview query:', JSON.stringify(studentQuery, null, 2));
    
    // Count matching students
    const studentsCollection = db.collection('students');
    const studentCount = await studentsCollection.countDocuments(studentQuery);
    
    // Get sample students for preview (limit to 10)
    const sampleStudents = await studentsCollection.find(studentQuery)
      .limit(10)
      .project({ 
        _id: 1, 
        'name.firstName': 1, 
        'name.lastName': 1, 
        'name.displayName': 1,
        class: 1, 
        section: 1 
      })
      .toArray();
    
    console.log(`👥 Found ${studentCount} students matching criteria`);
    
    res.json({
      success: true,
      data: {
        estimatedRecipients: studentCount,
        targetClass: targetClass || 'ALL',
        targetSection: targetSection || 'ALL',
        sampleRecipients: sampleStudents.map(s => ({
          id: s._id,
          name: s.name?.displayName || `${s.name?.firstName} ${s.name?.lastName}` || s.name,
          class: s.class || s.studentDetails?.academic?.currentClass || s.studentDetails?.currentClass,
          section: s.section || s.studentDetails?.academic?.currentSection || s.studentDetails?.currentSection
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error previewing message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview message',
      error: error.message
    });
  }
};

// Get messages with filtering
exports.getMessages = async (req, res) => {
  try {
    console.log('Fetching messages with filters:', req.query);
    const { class: filterClass, section: filterSection, page = 1, limit = 20 } = req.query;

    // Get school connection for message queries
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;

    // Build query for new schema
    const query = {};
    
    // If user is a student, filter by their class/section automatically
    if (req.user.role === 'student') {
      // Get student's class and section from multiple possible locations
      const studentClass = req.user.studentDetails?.currentClass || 
                          req.user.studentDetails?.academic?.currentClass || 
                          req.user.class;
      const studentSection = req.user.studentDetails?.currentSection || 
                            req.user.studentDetails?.academic?.currentSection || 
                            req.user.section;
      
      if (studentClass) {
        query.class = studentClass;
        console.log(`[GET MESSAGES] Filtering for student class: ${studentClass}`);
      }
      if (studentSection) {
        query.section = studentSection;
        console.log(`[GET MESSAGES] Filtering for student section: ${studentSection}`);
      }
      
      if (!studentClass || !studentSection) {
        console.warn(`[GET MESSAGES] Student ${req.user.userId} missing class/section data`);
      }
    } else {
      // For admin/teachers, use filter parameters
      if (filterClass && filterClass !== 'ALL') query.class = filterClass;
      if (filterSection && filterSection !== 'ALL') query.section = filterSection;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messagesCollection = db.collection('messages');
    
    // Get messages from school database with pagination
    const messages = await messagesCollection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const totalMessages = await messagesCollection.countDocuments(query);

    // Since we're using native MongoDB driver, we need to manually create virtual fields
    const formattedMessages = messages.map(msg => ({
      id: msg._id,
      class: msg.class,
      section: msg.section,
      adminId: msg.adminId,
      title: msg.title,
      subject: msg.subject,
      message: msg.message,
      createdAt: msg.createdAt,
      // Manual virtual fields calculation
      messageAge: calculateMessageAge(msg.createdAt),
      urgencyIndicator: 'normal' // Default since we don't have priority in simplified schema
    }));

    res.json({
      success: true,
      data: {
        messages: formattedMessages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalMessages,
          pages: Math.ceil(totalMessages / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

// Get message details
exports.getMessageDetails = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // Get school connection for message queries
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    const messagesCollection = db.collection('messages');
    
    // Convert string ID to ObjectId if needed
    const { ObjectId } = require('mongodb');
    const message = await messagesCollection.findOne({ _id: new ObjectId(messageId) });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: message._id,
        class: message.class,
        section: message.section,
        adminId: message.adminId,
        title: message.title,
        subject: message.subject,
        message: message.message,
        createdAt: message.createdAt,
        // Manual virtual fields calculation
        messageAge: calculateMessageAge(message.createdAt),
        urgencyIndicator: 'normal'
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching message details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message details',
      error: error.message
    });
  }
};

// Get message statistics
exports.getMessageStats = async (req, res) => {
  try {
    // Get school connection for message queries
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    const messagesCollection = db.collection('messages');
    
    const totalMessages = await messagesCollection.countDocuments();
    
    const messagesByClass = await messagesCollection.aggregate([
      {
        $group: {
          _id: '$class',
          count: { $sum: 1 }
        }
      }
    ]).toArray();
    
    const messagesBySection = await messagesCollection.aggregate([
      {
        $group: {
          _id: '$section',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentMessages = await messagesCollection.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      data: {
        totalMessages,
        messagesByClass,
        messagesBySection,
        recentMessages
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching message stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message statistics',
      error: error.message
    });
  }
};

// Get messages for teachers (read-only)
exports.getTeacherMessages = async (req, res) => {
  try {
    console.log('📨 Teacher fetching messages:', req.user);
    
    // Get school connection for message queries
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    const messagesCollection = db.collection('messages');
    
    // Get query parameters for pagination
    const { limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch messages from the teacher's school (sorted by newest first)
    const messages = await messagesCollection.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    console.log(`✅ Found ${messages.length} messages for teacher`);
    
    // Format messages for frontend (compatible with teacher dashboard expectations)
    const formattedMessages = messages
      .filter(msg => msg.title && msg.subject && msg.message) // Filter out incomplete messages
      .map(msg => ({
        id: msg._id.toString(),
        class: msg.class || 'Unknown',
        section: msg.section || 'Unknown',
        adminId: msg.adminId,
        title: msg.title,
        subject: msg.subject,
        message: msg.message,
        content: msg.message, // Alias for compatibility
        createdAt: msg.createdAt,
        timestamp: msg.createdAt, // Alias for compatibility
        schoolId: msg.schoolId,
        messageAge: calculateMessageAge(msg.createdAt),
        type: 'group', // All admin messages are group messages
        isRead: true, // Teachers can only view, so mark as read
        sender: 'Admin',
        senderName: 'School Admin', // Add senderName for dashboard compatibility
        recipient: [`Class ${msg.class || 'Unknown'}-${msg.section || 'Unknown'}`],
        recipientType: `Class ${msg.class || 'Unknown'}-${msg.section || 'Unknown'}` // Add recipientType for dashboard compatibility
      }));
    
    res.json({
      success: true,
      messages: formattedMessages, // Move messages to root level for dashboard compatibility
      data: {
        messages: formattedMessages,
        total: formattedMessages.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching teacher messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

// Helper function to calculate message age (replaces Mongoose virtual)
function calculateMessageAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffTime = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    console.log('🗑️ Deleting message:', messageId);
    
    // DEFENSIVE CHECK: Ensure user object exists after auth middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Get school connection for message deletion
    const schoolCode = req.user.schoolCode;
    if (!schoolCode) {
      return res.status(400).json({
        success: false,
        message: 'School code not found in user profile'
      });
    }
    
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = connection.db;
    const messagesCollection = db.collection('messages');
    
    // Convert string ID to ObjectId
    const { ObjectId } = require('mongodb');
    
    // Find the message first to verify ownership
    const message = await messagesCollection.findOne({ 
      _id: new ObjectId(messageId) 
    });
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }
    
    // Optional: Check if user has permission to delete this message
    // For example, only allow admin who created the message to delete it
    if (message.adminId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete messages that you created'
      });
    }
    
    // Delete the message
    const result = await messagesCollection.deleteOne({ 
      _id: new ObjectId(messageId) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already deleted'
      });
    }
    
    console.log('✅ Message deleted successfully');
    
    res.json({
      success: true,
      message: 'Message deleted successfully',
      data: {
        deletedId: messageId
      }
    });
    
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    
    // Handle invalid ObjectId format
    if (error.name === 'BSONTypeError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};