const Chalan = require('../models/Chalan');
const School = require('../models/School');
const Counter = require('../models/Counter');
const StudentFeeRecord = require('../models/StudentFeeRecord');
const User = require('../models/User');
const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');
const { ObjectId } = require('mongodb');

// Generate a unique chalan number in the format: CRN-SCHOOLCODE-0000
async function generateChalanNumber(schoolCode, db) {
  try {
    console.log('\n=== Starting chalan number generation ===');
    console.log('School code:', schoolCode);
    
    // Get school code (with fallbacks)
    const safeSchoolCode = (schoolCode || 'SCH').toUpperCase();
    console.log('Using school code:', safeSchoolCode);
    
    // Use counter in per-school database
    const countersCol = db.collection('counters');
    const counterKey = `chalan:${safeSchoolCode}`;
    
    console.log('Using counter key:', counterKey);
    
    // Get next sequence number atomically
    const seqDoc = await countersCol.findOneAndUpdate(
      { _id: counterKey },
      {
        $setOnInsert: {
          createdAt: new Date(),
        },
        $inc: { seq: 1 },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    // Get sequence value
    let seqVal = (seqDoc && seqDoc.value && typeof seqDoc.value.seq === 'number') ? seqDoc.value.seq : undefined;
    if (typeof seqVal !== 'number') {
      const doc = await countersCol.findOne({ _id: counterKey });
      seqVal = (doc && typeof doc.seq === 'number') ? doc.seq : 1;
    }
    
    // Format the chalan number: CRN-SCHOOLCODE-0000
    const sequenceStr = String(seqVal).padStart(4, '0');
    const chalanNumber = `CRN-${safeSchoolCode}-${sequenceStr}`;
    
    console.log('Generated chalan number:', chalanNumber);
    console.log('=== End of chalan number generation ===\n');
    
    return chalanNumber;
  } catch (error) {
    console.error('❌ Error in generateChalanNumber:', error);
    
    // Fallback mechanism if counter fails
    const timestamp = Date.now().toString().slice(-6);
    const fallbackNumber = `CRN-${schoolCode || 'SCH'}-${timestamp}`;
    console.warn(`Using fallback chalan number: ${fallbackNumber}`);
    return fallbackNumber;
  }
}

// Get the next chalan number
exports.getNextChalanNumber = async (req, res) => {
  try {
    if (!req.user || !req.user.schoolId || !req.user.schoolCode) {
      return res.status(400).json({ success: false, message: 'School information is required' });
    }

    // Get school connection
    const schoolCode = req.user.schoolCode;
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;

    // Generate the chalan number using the existing function
    const chalanNumber = await generateChalanNumber(schoolCode, db);
    
    res.status(200).json({
      success: true,
      chalanNumber
    });
  } catch (error) {
    console.error('Error getting next chalan number:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate chalan number',
      error: error.message
    });
  }
};

// Generate chalans for students
exports.generateChalans = async (req, res) => {
  console.group('=== Starting Chalan Generation ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  console.log('User:', req.user);
  
  try {
    const { studentIds, amount, dueDate, installmentName } = req.body;
    const { schoolId, schoolCode } = req.user;
    
    console.log(`Generating ${studentIds.length} chalans for school: ${schoolId}`);
    
    // Get school details with academic year and code
    console.log('Fetching school details for ID:', schoolId);
    const school = await School.findById(schoolId).select('settings.academicYear.currentYear code name').lean();
    
    if (!school) {
      console.error('School not found for ID:', schoolId);
      throw new Error('School not found');
    }
    
    const academicYear = school?.settings?.academicYear?.currentYear;
    const finalSchoolCode = schoolCode || school.code || 'SCH';
    
    if (!academicYear) {
      throw new Error('Academic year not configured for this school');
    }
    
    console.log(`Using school code: ${finalSchoolCode} for chalan generation`);
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(finalSchoolCode);
    const db = conn.db || conn;
    
    // Get collections
    const chalansCol = db.collection('chalans');
    const studentFeeCol = db.collection('studentfeerecords');
    const usersCol = db.collection('users');
    
    const chalans = [];
    
    // Process each student
    for (let i = 0; i < studentIds.length; i++) {
      console.group(`Processing student ${i+1}/${studentIds.length}`);
      
      try {
        // Generate chalan number
        const chalanNumber = await generateChalanNumber(finalSchoolCode, db);
        
        console.log('Generated chalan number:', {
          chalanNumber,
          studentId: studentIds[i],
          index: i + 1,
          total: studentIds.length
        });
        
        // Get student details
        const student = await usersCol.findOne({ _id: new ObjectId(studentIds[i]) });
        if (!student) {
          console.warn(`Student not found: ${studentIds[i]}`);
          console.groupEnd();
          continue;
        }
        
        const studentName = student.name?.displayName || 
                           [student.name?.firstName, student.name?.lastName].filter(Boolean).join(' ') || 
                           student.fullName || 
                           student.username || 
                           'Student';
        
        // Create chalan document
        const chalanDoc = {
          chalanNumber,
          schoolId: new ObjectId(schoolId),
          studentId: new ObjectId(studentIds[i]),
          class: req.body.class,
          section: req.body.section,
          amount: parseFloat(amount),
          paidAmount: 0,
          dueDate: new Date(dueDate),
          status: 'unpaid',
          installmentName: installmentName || 'Fee Payment',
          academicYear,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Insert chalan into per-school database
        const chalanResult = await chalansCol.insertOne(chalanDoc);
        const chalanId = chalanResult.insertedId;
        
        console.log(`✅ Chalan created in per-school DB for student ${studentIds[i]}:`, chalanNumber);
        
        // Find or create student fee record
        let feeRecord = await studentFeeCol.findOne({
          schoolId: new ObjectId(schoolId),
          studentId: new ObjectId(studentIds[i]),
          academicYear
        });
        
        if (!feeRecord) {
          // Create new fee record
          const newFeeRecord = {
            schoolId: new ObjectId(schoolId),
            studentId: new ObjectId(studentIds[i]),
            feeStructureId: null,
            studentName,
            studentClass: req.body.class,
            studentSection: req.body.section,
            rollNumber: student.rollNumber || student.rollno || student.admNo || '',
            feeStructureName: installmentName || 'Default Fee Structure',
            academicYear,
            totalAmount: 0,
            totalPaid: 0,
            totalPending: 0,
            installments: [],
            payments: [],
            challans: [],
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const insertResult = await studentFeeCol.insertOne(newFeeRecord);
          feeRecord = { ...newFeeRecord, _id: insertResult.insertedId };
        }
        
        // Add chalan to fee record's challans array
        await studentFeeCol.updateOne(
          { _id: feeRecord._id },
          {
            $push: {
              challans: {
                chalanId,
                chalanNumber,
                installmentName: installmentName || 'Fee Payment',
                amount: parseFloat(amount),
                paidAmount: 0,
                dueDate: new Date(dueDate),
                issueDate: new Date(),
                status: 'unpaid',
                createdAt: new Date(),
                updatedAt: new Date()
              }
            },
            $inc: {
              totalAmount: parseFloat(amount),
              totalPending: parseFloat(amount)
            },
            $set: {
              updatedAt: new Date()
            }
          }
        );
        
        // Update chalan with fee record reference
        await chalansCol.updateOne(
          { _id: chalanId },
          { $set: { feeRecordId: feeRecord._id } }
        );
        
        console.log(`✅ Updated fee record for student ${studentIds[i]}`);
        
        // Format response
        const chalanData = {
          _id: chalanId.toString(),
          chalanNumber,
          studentId: studentIds[i],
          studentName,
          admissionNumber: student.admissionNo || student.admNo || '',
          rollNumber: student.rollNumber || student.rollno || '',
          class: req.body.class,
          section: req.body.section,
          amount: parseFloat(amount),
          totalAmount: parseFloat(amount),
          paidAmount: 0,
          dueDate: new Date(dueDate).toISOString(),
          status: 'unpaid',
          installmentName: installmentName || 'Fee Payment',
          academicYear,
          schoolId: schoolId.toString(),
          schoolCode: finalSchoolCode,
          schoolName: school.name || 'School Name',
          feeRecordId: feeRecord._id.toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        console.log(`Chalan ${i+1}/${studentIds.length} created:`, {
          chalanNumber: chalanData.chalanNumber,
          student: chalanData.studentName,
          amount: chalanData.amount
        });
        
        chalans.push(chalanData);
        console.groupEnd();
        
      } catch (studentError) {
        console.error(`Error processing student ${studentIds[i]}:`, studentError);
        console.groupEnd();
      }
    }
    
    console.log('=== Chalan Generation Complete ===');
    console.log('Total chalans generated:', chalans.length);
    console.log('Generated chalans:', JSON.stringify(chalans.map(c => ({
      _id: c._id,
      chalanNumber: c.chalanNumber,
      studentId: c.studentId,
      amount: c.amount,
      status: c.status
    })), null, 2));
    
    res.status(201).json({
      success: true,
      message: `${chalans.length} chalans generated successfully`,
      data: chalans,
      count: chalans.length
    });
    
    console.groupEnd(); // End the main group
    
  } catch (error) {
    console.error('=== Error generating chalans ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.groupEnd(); // Ensure the group is closed even on error
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate chalans',
      error: error.message
    });
  }
};

// Get chalans with optional filters
exports.getChalans = async (req, res) => {
  try {
    const { status, class: className, section, startDate, endDate } = req.query;
    const { schoolId, schoolCode } = req.user;
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;
    const chalansCol = db.collection('chalans');
    const usersCol = db.collection('users');
    
    const query = { schoolId: new ObjectId(schoolId) };
    
    if (status) query.status = status;
    if (className) query.class = className;
    if (section) query.section = section;
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const chalans = await chalansCol.find(query).sort({ createdAt: -1 }).toArray();
    
    // Fetch school info including bank details from school_info collection
    const schoolInfoCol = db.collection('school_info');
    const schoolInfo = await schoolInfoCol.findOne({});
    
    // Populate student details and generate chalan numbers if missing
    for (let chalan of chalans) {
      // Generate chalan number if it doesn't exist
      if (!chalan.chalanNumber) {
        console.log('[Chalan List] No chalan number found for chalan:', chalan._id);
        const school = await School.findById(schoolId).select('code schoolCode').lean();
        const schoolCodeForChalan = schoolCode || school?.code || school?.schoolCode || 'SCH';
        const chalanNumber = await generateChalanNumber(schoolCodeForChalan, db);
        console.log('[Chalan List] Generated chalan number:', chalanNumber);
        
        // Update the chalan in the database
        await chalansCol.updateOne(
          { _id: chalan._id },
          { $set: { chalanNumber: chalanNumber } }
        );
        
        // Update the chalan object for the response
        chalan.chalanNumber = chalanNumber;
      }
      
      if (chalan.studentId) {
        const student = await usersCol.findOne(
          { _id: chalan.studentId },
          { projection: { name: 1, rollNumber: 1, admissionNo: 1, admNo: 1, userId: 1 } }
        );
        if (student) {
          chalan.studentName = student.name?.displayName || 
                              [student.name?.firstName, student.name?.lastName].filter(Boolean).join(' ') || 
                              student.fullName || 
                              student.username || 
                              'Student';
          chalan.rollNumber = student.rollNumber || student.rollno || '';
          chalan.admissionNo = student.admissionNo || student.admNo || '';
          chalan.userId = student.userId; // User-friendly ID like KVS-S-0003
        }
      }
      
      // Add school data and bank details to each chalan
      if (schoolInfo) {
        chalan.schoolData = {
          name: schoolInfo.name,
          code: schoolInfo.code,
          address: schoolInfo.address,
          contact: schoolInfo.contact,
          logo: schoolInfo.logo,
          logoUrl: schoolInfo.logoUrl,
          bankDetails: schoolInfo.bankDetails
        };
        
        // Also add bank details directly for backward compatibility
        if (schoolInfo.bankDetails) {
          chalan.bankDetails = schoolInfo.bankDetails;
        }
      }
    }
    
    res.json({
      success: true,
      data: chalans
    });
    
  } catch (error) {
    console.error('Error fetching chalans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chalans',
      error: error.message
    });
  }
};

// Get chalan by ID
exports.getChalanById = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId, schoolCode } = req.user;
    
    // Validate that the ID is a valid MongoDB ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chalan ID format'
      });
    }
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;
    const chalansCol = db.collection('chalans');
    const usersCol = db.collection('users');
    
    const chalan = await chalansCol.findOne({
      _id: new ObjectId(id),
      schoolId: new ObjectId(schoolId)
    });
    
    if (!chalan) {
      return res.status(404).json({
        success: false,
        message: 'Chalan not found'
      });
    }
    
    // Populate student details
    if (chalan.studentId) {
      const student = await usersCol.findOne(
        { _id: chalan.studentId },
        { projection: { name: 1, rollNumber: 1, admissionNo: 1, admNo: 1, userId: 1 } }
      );
      console.log('[getChalanById] Student found:', {
        studentId: chalan.studentId,
        userId: student?.userId,
        studentName: student?.name
      });
      if (student) {
        chalan.studentName = student.name?.displayName || 
                            [student.name?.firstName, student.name?.lastName].filter(Boolean).join(' ') || 
                            student.fullName || 
                            student.username || 
                            'Student';
        chalan.rollNumber = student.rollNumber || student.rollno || '';
        chalan.admissionNo = student.admissionNo || student.admNo || '';
        chalan.userId = student.userId; // User-friendly ID like KVS-S-0003
        console.log('[getChalanById] Assigned userId to chalan:', chalan.userId);
      }
    }
    
    // Fetch school info including bank details from school_info collection
    const schoolInfoCol = db.collection('school_info');
    const schoolInfo = await schoolInfoCol.findOne({});
    
    if (schoolInfo) {
      chalan.schoolData = {
        name: schoolInfo.name,
        code: schoolInfo.code,
        address: schoolInfo.address,
        contact: schoolInfo.contact,
        logo: schoolInfo.logo,
        logoUrl: schoolInfo.logoUrl,
        bankDetails: schoolInfo.bankDetails
      };
      
      // Also add bank details directly for backward compatibility
      if (schoolInfo.bankDetails) {
        chalan.bankDetails = schoolInfo.bankDetails;
      }
    }
    
    res.json({
      success: true,
      data: chalan
    });
    
  } catch (error) {
    console.error('Error fetching chalan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chalan',
      error: error.message
    });
  }
};

// Get raw chalan data for a student (for debugging/development)
exports.getStudentChalanData = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, schoolCode } = req.user;
    
    if (!ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;
    const studentFeeCol = db.collection('studentfeerecords');
    
    // Find all fee records for this student
    const feeRecords = await studentFeeCol.find({
      schoolId: new ObjectId(schoolId),
      studentId: new ObjectId(studentId)
    }).toArray();
    
    if (!feeRecords || feeRecords.length === 0) {
      return res.json({
        success: true,
        message: 'No fee records found for this student',
        data: []
      });
    }
    
    // Extract all chalans from all fee records
    const allChalans = [];
    
    feeRecords.forEach(record => {
      if (record.challans && record.challans.length > 0) {
        record.challans.forEach(chalan => {
          allChalans.push({
            feeRecordId: record._id,
            academicYear: record.academicYear,
            ...chalan
          });
        });
      }
    });
    
    // Sort by academic year and due date
    allChalans.sort((a, b) => {
      if (a.academicYear !== b.academicYear) {
        return b.academicYear.localeCompare(a.academicYear);
      }
      return new Date(b.dueDate) - new Date(a.dueDate);
    });
    
    res.json({
      success: true,
      count: allChalans.length,
      data: allChalans
    });
    
  } catch (error) {
    console.error('Error fetching chalan data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chalan data',
      error: error.message
    });
  }
};

// Get chalans by student ID from StudentFeeRecord
exports.getChalansByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { schoolId, schoolCode } = req.user;
    const { status, academicYear: year } = req.query;
    
    if (!ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }
    
    // Get the academic year from query or school settings
    let academicYear = year;
    let school = null;
    if (!academicYear) {
      school = await School.findById(schoolId).select('settings.academicYear.currentYear name code').lean();
      academicYear = school?.settings?.academicYear?.currentYear;
      
      if (!academicYear) {
        return res.status(400).json({
          success: false,
          message: 'Academic year not configured for this school'
        });
      }
    } else {
      // Fetch school info even if academic year is provided
      school = await School.findById(schoolId).select('name code').lean();
    }
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;
    const studentFeeCol = db.collection('studentfeerecords');
    const usersCol = db.collection('users');
    
    // Build the query
    const query = {
      schoolId: new ObjectId(schoolId),
      studentId: new ObjectId(studentId),
      academicYear
    };
    
    // Find the fee record for this student and academic year
    const feeRecord = await studentFeeCol.findOne(query);
    
    // Get student details including userId
    const student = await usersCol.findOne(
      { _id: new ObjectId(studentId) },
      { projection: { name: 1, rollNumber: 1, admissionNo: 1, admNo: 1, class: 1, section: 1, userId: 1 } }
    );
    
    // If no fee record exists or no challans, return empty or 0 amount challan if all fees paid
    if (!feeRecord) {
      return res.json({
        success: true,
        data: [],
        student: student ? {
          _id: studentId,
          name: student.name?.displayName || [student.name?.firstName, student.name?.lastName].filter(Boolean).join(' ') || student.fullName || 'Student',
          rollNumber: student.rollNumber || student.rollno || '',
          admissionNo: student.admissionNo || student.admNo || '',
          class: student.class || '',
          section: student.section || ''
        } : null,
        feeSummary: {
          totalAmount: 0,
          totalPaid: 0,
          totalPending: 0,
          status: 'paid'
        }
      });
    }
    
    // Check if all fees are paid
    const allFeesPaid = feeRecord.totalPending === 0 && feeRecord.totalPaid >= feeRecord.totalAmount;
    
    // If all fees paid and no challans, return a 0 amount challan
    if (allFeesPaid && (!feeRecord.challans || feeRecord.challans.length === 0)) {
      return res.json({
        success: true,
        data: [{
          _id: 'all-paid',
          chalanNumber: 'PAID-IN-FULL',
          studentId: feeRecord.studentId,
          studentName: feeRecord.studentName,
          rollNumber: feeRecord.rollNumber || student?.rollNumber,
          admissionNo: student?.admissionNo || '',
          class: feeRecord.studentClass || student?.class,
          section: feeRecord.studentSection || student?.section,
          amount: 0,
          paidAmount: 0,
          dueDate: new Date(),
          status: 'paid',
          installmentName: 'All Fees Paid',
          academicYear: feeRecord.academicYear,
          schoolId: schoolId.toString(),
          schoolCode: schoolCode || school?.code || 'SCH',
          schoolName: school?.name || 'School Name',
          createdAt: new Date(),
          updatedAt: new Date(),
          feeRecordId: feeRecord._id
        }],
        student: {
          _id: studentId,
          name: feeRecord.studentName || student?.name,
          rollNumber: feeRecord.rollNumber || student?.rollNumber,
          admissionNo: student?.admissionNo,
          class: feeRecord.studentClass || student?.class,
          section: feeRecord.studentSection || student?.section
        },
        feeSummary: {
          totalAmount: feeRecord.totalAmount || 0,
          totalPaid: feeRecord.totalPaid || 0,
          totalPending: 0,
          status: 'paid'
        }
      });
    }
    
    if (!feeRecord.challans || feeRecord.challans.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Filter chalans by status if provided
    let chalans = feeRecord.challans;
    if (status) {
      chalans = chalans.filter(ch => ch.status === status);
    }
    
    // Format the response
    const formattedChalans = await Promise.all(chalans.map(async (chalan) => {
      // Generate chalan number if it doesn't exist
      let chalanNumber = chalan.chalanNumber;
      console.log(`[Chalan] Checking chalan number for chalan:`, { 
        chalanId: chalan.chalanId || chalan._id, 
        existingNumber: chalanNumber 
      });
      
      if (!chalanNumber) {
        console.log('[Chalan] No chalan number found, generating new one...');
        const school = await School.findById(schoolId).select('code schoolCode').lean();
        const schoolCodeForChalan = schoolCode || school?.code || school?.schoolCode || 'SCH';
        chalanNumber = await generateChalanNumber(schoolCodeForChalan, db);
        console.log(`[Chalan] Generated new chalan number: ${chalanNumber}`);
        
        // Update the chalan in the database with the new number
        const updateResult = await studentFeeCol.updateOne(
          { _id: feeRecord._id, 'challans.chalanId': chalan.chalanId || chalan._id },
          { $set: { 'challans.$.chalanNumber': chalanNumber } }
        );
        console.log('[Chalan] Update result:', updateResult);
      }
      
      const chalanData = {
      _id: chalan.chalanId || chalan._id,
      chalanNumber: chalanNumber,
      studentId: feeRecord.studentId,
      userId: feeRecord.userId || student?.userId, // Use fee record userId or fetch from student
      studentName: feeRecord.studentName,
      rollNumber: feeRecord.rollNumber || student?.rollNumber,
      admissionNo: student?.admissionNo || '',
      class: feeRecord.studentClass || student?.class,
      section: feeRecord.studentSection || student?.section,
      amount: chalan.amount,
      paidAmount: chalan.paidAmount || 0,
      dueDate: chalan.dueDate,
      status: chalan.status,
      paymentDate: chalan.paymentDate,
      paymentMethod: chalan.paymentMethod,
      paymentDetails: chalan.paymentDetails,
      installmentName: chalan.installmentName || 'Fee Payment',
      academicYear: feeRecord.academicYear,
      schoolId: schoolId.toString(),
      schoolCode: schoolCode || school?.code || 'SCH',
      schoolName: school?.name || 'School Name',
      createdAt: chalan.createdAt || chalan.issueDate,
      updatedAt: chalan.updatedAt || chalan.issueDate,
      feeRecordId: feeRecord._id
      };
      
      console.log('[getChalansByStudent] Formatted chalan:', {
        chalanId: chalanData._id,
        studentId: chalanData.studentId,
        userId: chalanData.userId,
        feeRecordUserId: feeRecord.userId,
        studentUserId: student?.userId
      });
      
      return chalanData;
    }));
    
    // Sort by due date (ascending - oldest first)
    formattedChalans.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    
    // Fetch school info including bank details from school_info collection
    const schoolInfoCol = db.collection('school_info');
    const schoolInfo = await schoolInfoCol.findOne({});
    
    // Add school data and bank details to each chalan
    if (schoolInfo) {
      formattedChalans.forEach(chalan => {
        chalan.schoolData = {
          name: schoolInfo.name,
          code: schoolInfo.code,
          address: schoolInfo.address,
          contact: schoolInfo.contact,
          logo: schoolInfo.logo,
          logoUrl: schoolInfo.logoUrl,
          bankDetails: schoolInfo.bankDetails
        };
        
        // Also add bank details directly for backward compatibility
        if (schoolInfo.bankDetails) {
          chalan.bankDetails = schoolInfo.bankDetails;
        }
      });
    }
    
    res.json({
      success: true,
      data: formattedChalans,
      student: {
        _id: studentId,
        name: feeRecord.studentName || student?.name,
        rollNumber: feeRecord.rollNumber || student?.rollNumber,
        admissionNo: student?.admissionNo,
        class: feeRecord.studentClass || student?.class,
        section: feeRecord.studentSection || student?.section
      },
      feeSummary: {
        totalAmount: feeRecord.totalAmount || 0,
        totalPaid: feeRecord.totalPaid || 0,
        totalPending: feeRecord.totalPending || 0,
        status: feeRecord.status || 'pending'
      }
    });
    
  } catch (error) {
    console.error('Error fetching student chalans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student chalans',
      error: error.message
    });
  }
};

// Mark chalan as paid
exports.markAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, paymentDetails, paymentDate } = req.body;
    const { schoolId, schoolCode } = req.user;
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chalan ID format'
      });
    }
    
    // Get per-school database connection
    const conn = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const db = conn.db || conn;
    const chalansCol = db.collection('chalans');
    const studentFeeCol = db.collection('studentfeerecords');
    
    // Find the chalan
    const chalan = await chalansCol.findOne({
      _id: new ObjectId(id),
      schoolId: new ObjectId(schoolId)
    });
    
    if (!chalan) {
      return res.status(404).json({
        success: false,
        message: 'Chalan not found'
      });
    }
    
    const paidAmount = parseFloat(amount) || chalan.amount;
    const newPaidAmount = (chalan.paidAmount || 0) + paidAmount;
    
    // Determine new status
    let newStatus = 'unpaid';
    if (newPaidAmount >= chalan.amount) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }
    
    // Update chalan in per-school database
    await chalansCol.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          paidAmount: newPaidAmount,
          status: newStatus,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          paymentMethod: paymentMethod || 'cash',
          paymentDetails: paymentDetails || {},
          updatedAt: new Date()
        }
      }
    );
    
    // Update chalan in StudentFeeRecord's challans array
    if (chalan.feeRecordId) {
      await studentFeeCol.updateOne(
        { 
          _id: chalan.feeRecordId,
          'challans.chalanId': chalan._id
        },
        {
          $set: {
            'challans.$.paidAmount': newPaidAmount,
            'challans.$.status': newStatus,
            'challans.$.paymentDate': paymentDate ? new Date(paymentDate) : new Date(),
            'challans.$.paymentMethod': paymentMethod || 'cash',
            'challans.$.paymentDetails': paymentDetails || {},
            'challans.$.updatedAt': new Date()
          },
          $inc: {
            totalPaid: paidAmount,
            totalPending: -paidAmount
          }
        }
      );
      
      console.log(`✅ Updated fee record for chalan ${chalan._id}`);
    }
    
    res.json({
      success: true,
      message: 'Chalan payment recorded successfully',
      data: {
        chalanId: id,
        chalanNumber: chalan.chalanNumber,
        paidAmount: newPaidAmount,
        totalAmount: chalan.amount,
        status: newStatus
      }
    });
    
  } catch (error) {
    console.error('Error marking chalan as paid:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chalan status',
      error: error.message
    });
  }
};
