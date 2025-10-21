const DatabaseManager = require('../utils/databaseManager');
const School = require('../models/School');
const UserGenerator = require('../utils/userGenerator');

// Class progression map
const classProgression = {
  'LKG': 'UKG',
  'UKG': '1',
  '1': '2',
  '2': '3',
  '3': '4',
  '4': '5',
  '5': '6',
  '6': '7',
  '7': '8',
  '8': '9',
  '9': '10',
  '10': '11',
  '11': '12',
  '12': null // Final year
};

// Bulk school-wide promotion
exports.bulkPromotion = async (req, res) => {
  console.log('🚀 BULK PROMOTION ENDPOINT HIT!');
  console.log('📋 Request params:', req.params);
  console.log('📋 Request body:', req.body);
  console.log('👤 User:', req.user ? { userId: req.user.userId, role: req.user.role } : 'No user');
  
  try {
    const { schoolCode } = req.params;
    const { fromYear, toYear, finalYearAction } = req.body;

    console.log('📢 Bulk Promotion Request:', { schoolCode, fromYear, toYear, finalYearAction });

    // Validate input
    if (!fromYear || !toYear || !finalYearAction) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fromYear, toYear, finalYearAction'
      });
    }

    if (!['graduate', 'request'].includes(finalYearAction)) {
      return res.status(400).json({
        success: false,
        message: 'finalYearAction must be either "graduate" or "request"'
      });
    }

    // Get school
    const school = await School.findOne({ code: schoolCode });
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Get school database connection
    const schoolConnection = await DatabaseManager.getSchoolConnection(schoolCode);
    let usersCollection = schoolConnection.collection('users');
    const alumniCollection = schoolConnection.collection('alumni');
    const classRequestsCollection = schoolConnection.collection('classrequests');

    // Try different academic year formats
    const yearFormats = [
      fromYear,                    // e.g., "2024-2025"
      fromYear.replace('-', '/'),  // e.g., "2024/2025"
      fromYear.split('-')[0] + '-' + fromYear.split('-')[1].slice(-2), // e.g., "2024-25"
    ];
    
    // Also try the reverse - if user sends "2024-25", try "2024-2025"
    if (fromYear.includes('-') && fromYear.split('-')[1].length === 2) {
      const [startYear, shortEndYear] = fromYear.split('-');
      const fullEndYear = '20' + shortEndYear;
      yearFormats.push(`${startYear}-${fullEndYear}`);
    }

    console.log(`🔍 Trying academic year formats: ${yearFormats.join(', ')}`);

    // Use UserGenerator to get students from the correct collection (students, not users)
    console.log('📚 Fetching students using UserGenerator...');
    let allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    console.log(`📊 Found ${allStudents.length} total students in school`);

    let students = [];
    let usedFormat = '';

    // Filter students by academic year format
    for (const format of yearFormats) {
      students = allStudents.filter(student => {
        const academicYear = student.studentDetails?.academicYear || 
                           student.studentDetails?.academic?.academicYear || 
                           student.academicYear || 
                           student.currentAcademicYear;
        return academicYear === format && (student.isActive !== false);
      });

      if (students.length > 0) {
        usedFormat = format;
        console.log(`📊 Found ${students.length} students with academic year format "${format}"`);
        break;
      }
    }

    // Update usersCollection to point to the students collection for updates
    usersCollection = schoolConnection.collection('students');

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No students found for academic year ${fromYear}`,
        details: {
          searchedFormats: yearFormats,
          schoolCode: schoolCode,
          suggestion: 'Please check if students exist in the system and verify the academic year format. Students might be in a different academic year or school.'
        }
      });
    }

    // Determine final year class
    const classOrder = ['LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const uniqueClasses = [...new Set(students.map(s => 
      s.studentDetails?.currentClass || s.studentDetails?.academic?.currentClass
    ).filter(Boolean))];
    const finalYearClass = uniqueClasses.reduce((max, cls) => {
      const maxIndex = classOrder.indexOf(max);
      const clsIndex = classOrder.indexOf(cls);
      return clsIndex > maxIndex ? cls : max;
    }, 'LKG');

    console.log(`🎓 Final year class detected: ${finalYearClass}`);

    let promotedCount = 0;
    let graduatedCount = 0;
    let errors = [];

    // Process each student
    for (const student of students) {
      try {
        const currentClass = student.studentDetails?.currentClass || student.studentDetails?.academic?.currentClass;
        const currentSection = student.studentDetails?.currentSection || student.studentDetails?.academic?.currentSection;

        if (!currentClass) {
          errors.push({ userId: student.userId, error: 'No current class found' });
          continue;
        }

        // Handle final year students
        if (currentClass === finalYearClass) {
          if (finalYearAction === 'graduate') {
            // Move to alumni
            const alumniRecord = {
              ...student,
              graduationYear: toYear,
              graduationClass: currentClass,
              graduationSection: currentSection,
              movedToAlumniAt: new Date(),
              originalStudentId: student._id
            };

            await alumniCollection.insertOne(alumniRecord);
            await usersCollection.updateOne(
              { _id: student._id },
              {
                $set: {
                  isActive: false,
                  'studentDetails.status': 'alumni',
                  'studentDetails.academic.academicYear': toYear,
                  updatedAt: new Date()
                }
              }
            );

            graduatedCount++;
            console.log(`✅ Graduated: ${student.userId} from Class ${currentClass}`);
          } else if (finalYearAction === 'request') {
            // Create class request for SuperAdmin
            const nextClass = (parseInt(finalYearClass) + 1).toString();
            await classRequestsCollection.updateOne(
              { schoolId: school._id.toString(), requestedClass: nextClass },
              {
                $set: {
                  schoolId: school._id.toString(),
                  schoolCode: schoolCode,
                  schoolName: school.name,
                  requestedClass: nextClass,
                  currentFinalClass: finalYearClass,
                  academicYear: toYear,
                  status: 'pending',
                  requestedBy: req.user?.userId || 'admin',
                  requestedAt: new Date(),
                  message: `Request to create Class ${nextClass} for ${toYear} academic year`
                }
              },
              { upsert: true }
            );

            console.log(`📨 Class request created for Class ${nextClass}`);
            // Don't promote final year students yet
            continue;
          }
        } else {
          // Promote to next class
          const nextClass = classProgression[currentClass];
          
          if (!nextClass) {
            errors.push({ userId: student.userId, error: `No progression defined for class ${currentClass}` });
            continue;
          }

          await usersCollection.updateOne(
            { _id: student._id },
            {
              $set: {
                'studentDetails.academic.currentClass': nextClass,
                'studentDetails.academic.academicYear': toYear,
                updatedAt: new Date()
              },
              $push: {
                'studentDetails.academicHistory': {
                  academicYear: fromYear,
                  class: currentClass,
                  section: currentSection,
                  result: 'promoted',
                  promotedAt: new Date()
                }
              }
            }
          );

          promotedCount++;
          console.log(`✅ Promoted: ${student.userId} from Class ${currentClass} to ${nextClass}`);
        }
      } catch (error) {
        console.error(`❌ Error processing student ${student.userId}:`, error);
        errors.push({ userId: student.userId, error: error.message });
      }
    }

    const message = finalYearAction === 'graduate'
      ? `Successfully promoted ${promotedCount} students and graduated ${graduatedCount} students.`
      : `Successfully promoted ${promotedCount} students. Class request sent to SuperAdmin for final year students.`;

    res.status(200).json({
      success: true,
      message: message,
      data: {
        promoted: promotedCount,
        graduated: graduatedCount,
        errors: errors.length > 0 ? errors : undefined,
        fromYear,
        toYear,
        finalYearClass,
        finalYearAction
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Error promoting students',
      error: error.message
    });
  }
};

// Manual section promotion with exceptions
exports.sectionPromotion = async (req, res) => {
  try {
    const { schoolCode } = req.params;
    const { fromYear, toYear, className, section, holdBackSequenceIds = [] } = req.body;

    console.log('📢 Section Promotion Request:', { schoolCode, fromYear, toYear, className, section, holdBackSequenceIds });

    // Validate input
    if (!fromYear || !toYear || !className || !section) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fromYear, toYear, className, section'
      });
    }

    // Get school
    const school = await School.findOne({ code: schoolCode });
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Get school database connection
    const schoolConnection = await DatabaseManager.getSchoolConnection(schoolCode);
    let usersCollection = schoolConnection.collection('users');

    // Try different academic year formats
    const yearFormats = [
      fromYear,                    // e.g., "2024-2025"
      fromYear.replace('-', '/'),  // e.g., "2024/2025"
      fromYear.split('-')[0] + '-' + fromYear.split('-')[1].slice(-2), // e.g., "2024-25"
    ];
    
    // Also try the reverse - if user sends "2024-25", try "2024-2025"
    if (fromYear.includes('-') && fromYear.split('-')[1].length === 2) {
      const [startYear, shortEndYear] = fromYear.split('-');
      const fullEndYear = '20' + shortEndYear;
      yearFormats.push(`${startYear}-${fullEndYear}`);
    }

    console.log(`🔍 Trying academic year formats for Class ${className}-${section}: ${yearFormats.join(', ')}`);

    // Use UserGenerator to get students from the correct collection
    console.log('📚 Fetching students using UserGenerator...');
    let allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    console.log(`📊 Found ${allStudents.length} total students in school`);

    let students = [];
    let usedFormat = '';

    // Filter students by academic year, class, and section
    for (const format of yearFormats) {
      students = allStudents.filter(student => {
        const academicYear = student.studentDetails?.academicYear || 
                           student.studentDetails?.academic?.academicYear || 
                           student.academicYear || 
                           student.currentAcademicYear;
        const currentClass = student.studentDetails?.currentClass || student.studentDetails?.academic?.currentClass || student.currentClass;
        const currentSection = student.studentDetails?.currentSection || student.studentDetails?.academic?.currentSection || student.currentSection;
        
        return academicYear === format && 
               currentClass === className && 
               currentSection === section && 
               (student.isActive !== false);
      });

      if (students.length > 0) {
        usedFormat = format;
        console.log(`📊 Found ${students.length} students for Class ${className}-${section} with format "${format}"`);
        break;
      }
    }

    // Update usersCollection to point to the students collection for updates
    usersCollection = schoolConnection.collection('students');

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No students found in Class ${className}-${section} for ${fromYear}`
      });
    }

    const nextClass = classProgression[className];
    if (!nextClass) {
      return res.status(400).json({
        success: false,
        message: `No progression defined for class ${className}. This may be the final year.`
      });
    }

    let promotedCount = 0;
    let heldBackCount = 0;
    let errors = [];

    // Process each student
    for (const student of students) {
      try {
        const userId = student.userId;

        // Check if student should be held back
        if (holdBackSequenceIds.includes(userId)) {
          // Keep in same class, just update academic year
          await usersCollection.updateOne(
            { _id: student._id },
            {
              $set: {
                'studentDetails.academic.academicYear': toYear,
                updatedAt: new Date()
              },
              $push: {
                'studentDetails.academicHistory': {
                  academicYear: fromYear,
                  class: className,
                  section: section,
                  result: 'detained',
                  detainedAt: new Date()
                }
              }
            }
          );

          heldBackCount++;
          console.log(`⏸️ Held back: ${userId} in Class ${className}`);
        } else {
          // Promote to next class
          await usersCollection.updateOne(
            { _id: student._id },
            {
              $set: {
                'studentDetails.academic.currentClass': nextClass,
                'studentDetails.academic.academicYear': toYear,
                updatedAt: new Date()
              },
              $push: {
                'studentDetails.academicHistory': {
                  academicYear: fromYear,
                  class: className,
                  section: section,
                  result: 'promoted',
                  promotedAt: new Date()
                }
              }
            }
          );

          promotedCount++;
          console.log(`✅ Promoted: ${userId} from Class ${className} to ${nextClass}`);
        }
      } catch (error) {
        console.error(`❌ Error processing student ${student.userId}:`, error);
        errors.push({ userId: student.userId, error: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Successfully promoted ${promotedCount} students. ${heldBackCount} student(s) held back.`,
      data: {
        promoted: promotedCount,
        heldBack: heldBackCount,
        errors: errors.length > 0 ? errors : undefined,
        fromYear,
        toYear,
        className,
        section,
        nextClass
      }
    });

  } catch (error) {
    console.error('❌ Error in section promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Error promoting section',
      error: error.message
    });
  }
};

module.exports = exports;
