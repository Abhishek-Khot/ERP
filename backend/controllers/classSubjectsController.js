const ClassSubjectsSimple = require('../models/ClassSubjectsSimple');
const User = require('../models/User');
const { gradeSystem } = require('../utils/gradeSystem');
const DatabaseManager = require('../utils/databaseManager');

// Simple Class-based Subject Controller

/**
 * Create or Get Class and Add Subject
 * POST /api/class-subjects/add-subject
 * Body: { className, grade, section?, subjectName, teacherId?, teacherName? }
 */
const addSubjectToClass = async (req, res) => {
  try {
    console.log('[ADD SUBJECT] Request received:', {
      body: req.body,
      user: { userId: req.user?.userId, role: req.user?.role, schoolCode: req.user?.schoolCode }
    });
    
    // Validate request user data
    if (!req.user || !req.user.schoolCode || !req.user.userId) {
      console.error('[ADD SUBJECT] Missing user data:', req.user);
      return res.status(401).json({
        success: false,
        message: 'User authentication error: missing user data'
      });
    }
    
    const {
      className,
      grade,
      section = 'A',
      subjectName,
      teacherId = null,
      teacherName = null
    } = req.body;

    const schoolCode = req.user.schoolCode;
    const userId = req.user.userId;

    // Validate required fields
    if (!className || !grade || !subjectName) {
      console.log(`[ADD SUBJECT] Validation failed:`, { className, grade, subjectName });
      return res.status(400).json({
        success: false,
        message: 'Class name, grade, and subject name are required'
      });
    }

    try {
      // Get schoolId by finding the school document in main DB
      const School = require('../models/School');
      // Handle case sensitivity - the School model uses uppercase: true for code field
      const school = await School.findOne({ code: schoolCode.toUpperCase() });
      
      console.log(`[ADD SUBJECT] Looking for school with code: '${schoolCode}' (uppercase: '${schoolCode.toUpperCase()}')`);
      console.log(`[ADD SUBJECT] Found school:`, school ? { _id: school._id, code: school.code, name: school.name } : 'null');
      
      if (!school) {
        return res.status(400).json({
          success: false,
          message: `School not found with code: ${schoolCode}`
        });
      }
      
      const schoolId = school._id;

      try {
        // Get the per-school mongoose connection and bind the model to it
        const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
        
        if (!schoolConn) {
          console.error(`[ADD SUBJECT] Failed to get school connection for: ${schoolCode}`);
          return res.status(500).json({
            success: false,
            message: `Failed to connect to school database: ${schoolCode}`
          });
        }
        
        try {
          const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);

          // Find or create the class on the school's DB
          let classSubjects = null;
          try {
            classSubjects = await SchoolClassSubjects.findOne({
              schoolCode,
              className,
              academicYear: '2024-25',
              isActive: true
            });
            
            console.log(`[ADD SUBJECT] Class exists:`, !!classSubjects);

            if (!classSubjects) {
              // Use static helper of the model if available, otherwise create directly
              if (typeof SchoolClassSubjects.findOrCreateClass === 'function') {
                classSubjects = await SchoolClassSubjects.findOrCreateClass({
                  className,
                  grade,
                  section,
                  schoolCode,
                  schoolId,
                  createdBy: userId
                });
              } else {
                classSubjects = new SchoolClassSubjects({
                  className,
                  grade,
                  section,
                  schoolCode,
                  schoolId,
                  academicYear: '2024-25',
                  subjects: [],
                  createdBy: userId,
                  lastModifiedBy: userId
                });
                await classSubjects.save();
              }
            }

            // Add the subject (simplified - just name and optional teacher info)
            try {
              classSubjects.addSubject({
                name: subjectName,
                teacherId,
                teacherName
              });

              classSubjects.lastModifiedBy = userId;
              
              try {
                await classSubjects.save();
                
                console.log(`[ADD SUBJECT] Subject added successfully:`, { className, subjectName });
                
                res.status(200).json({
                  success: true,
                  message: `Subject "${subjectName}" added to ${className} successfully`,
                  data: {
                    classId: classSubjects._id,
                    className: classSubjects.className,
                    grade: classSubjects.grade,
                    section: classSubjects.section,
                    totalSubjects: classSubjects.totalSubjects,
                    subjects: classSubjects.getActiveSubjects()
                  }
                });
              } catch (saveError) {
                console.error(`[ADD SUBJECT] Error saving class:`, saveError);
                return res.status(500).json({
                  success: false,
                  message: 'Error saving subject to class',
                  error: saveError.message
                });
              }
            } catch (addSubjectError) {
              console.error(`[ADD SUBJECT] Error adding subject to class:`, addSubjectError);
              return res.status(400).json({
                success: false,
                message: addSubjectError.message || 'Error adding subject to class'
              });
            }
          } catch (findClassError) {
            console.error(`[ADD SUBJECT] Error finding/creating class:`, findClassError);
            return res.status(500).json({
              success: false,
              message: 'Database error while finding or creating class',
              error: findClassError.message
            });
          }
        } catch (modelError) {
          console.error(`[ADD SUBJECT] Error getting model for connection:`, modelError);
          return res.status(500).json({
            success: false,
            message: 'Error getting database model',
            error: modelError.message
          });
        }
      } catch (connectionError) {
        console.error(`[ADD SUBJECT] Error getting school connection:`, connectionError);
        return res.status(500).json({
          success: false,
          message: 'Error connecting to school database',
          error: connectionError.message
        });
      }
    } catch (schoolError) {
      console.error(`[ADD SUBJECT] Error finding school:`, schoolError);
      return res.status(500).json({
        success: false,
        message: 'Error finding school information',
        error: schoolError.message
      });
    }
  } catch (error) {
    console.error('[ADD SUBJECT] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while adding subject',
      error: error.message
    });
  }
};

/**
 * Remove Subject from Class
 * DELETE /api/subjects/class/remove-subject
 * Body: { className, subjectName }
 */
const removeSubjectFromClass = async (req, res) => {
  try {
    const { className, subjectName } = req.body;
    const schoolCode = req.user.schoolCode;
    const userId = req.user.userId;

    // Validate required fields
    if (!className || !subjectName) {
      return res.status(400).json({
        success: false,
        message: 'Class name and subject name are required'
      });
    }

    // Find the class
    // Use per-school model to find class
    const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
    const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);

    const classSubjects = await SchoolClassSubjects.findOne({
      schoolCode,
      className,
      isActive: true
    });

    if (!classSubjects) {
      return res.status(404).json({
        success: false,
        message: `Class "${className}" not found`
      });
    }

    // Remove the subject
    try {
      classSubjects.removeSubject(subjectName);
      classSubjects.lastModifiedBy = userId;
      await classSubjects.save();

      res.status(200).json({
        success: true,
        message: `Subject "${subjectName}" removed from ${className} successfully`,
        data: {
          classId: classSubjects._id,
          className: classSubjects.className,
          totalSubjects: classSubjects.totalSubjects,
          subjects: classSubjects.getActiveSubjects()
        }
      });

    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

  } catch (error) {
    console.error('Error removing subject from class:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while removing subject'
    });
  }
};

/**
 * Get All Classes with Subjects
 * GET /api/subjects/classes
 */
const getAllClassesWithSubjects = async (req, res) => {
  try {
    console.log('[GET ALL CLASSES] Request received from:', {
      userId: req.user?.userId,
      role: req.user?.role,
      schoolCode: req.user?.schoolCode
    });
    
    // Validate request user data
    if (!req.user || !req.user.schoolCode) {
      console.error('[GET ALL CLASSES] Missing user data:', req.user);
      return res.status(401).json({
        success: false,
        message: 'User authentication error: missing school code'
      });
    }
    
    const schoolCode = req.user.schoolCode;
    const { academicYear = '2024-25' } = req.query;
    
    console.log(`[GET ALL CLASSES] Looking for classes in school: ${schoolCode}, academic year: ${academicYear}`);
    
    try {
      // Get classes from the school's DB
      const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
      
      if (!schoolConn) {
        console.error(`[GET ALL CLASSES] Failed to get school connection for: ${schoolCode}`);
        return res.status(500).json({
          success: false,
          message: `Failed to connect to school database: ${schoolCode}`
        });
      }
      
      try {
        const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);
        
        try {
          const classes = await SchoolClassSubjects.getAllClasses(schoolCode, academicYear);
          
          console.log(`[GET ALL CLASSES] Found ${classes.length} classes for school: ${schoolCode}`);
          
          const classesData = classes.map(classItem => ({
            classId: classItem._id,
            className: classItem.className,
            grade: classItem.grade,
            section: classItem.section,
            totalSubjects: classItem.totalSubjects,
            subjects: classItem.getActiveSubjects(),
            createdAt: classItem.createdAt,
            updatedAt: classItem.updatedAt
          }));

          res.status(200).json({
            success: true,
            message: 'Classes retrieved successfully',
            data: {
              academicYear,
              totalClasses: classesData.length,
              classes: classesData
            }
          });
        } catch (fetchError) {
          console.error(`[GET ALL CLASSES] Error fetching classes:`, fetchError);
          return res.status(500).json({
            success: false,
            message: 'Error fetching classes from database',
            error: fetchError.message
          });
        }
      } catch (modelError) {
        console.error(`[GET ALL CLASSES] Error getting model for connection:`, modelError);
        return res.status(500).json({
          success: false,
          message: 'Error getting database model',
          error: modelError.message
        });
      }
    } catch (connectionError) {
      console.error(`[GET ALL CLASSES] Error getting school connection:`, connectionError);
      return res.status(500).json({
        success: false,
        message: 'Error connecting to school database',
        error: connectionError.message
      });
    }
  } catch (error) {
    console.error('[GET ALL CLASSES] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching classes',
      error: error.message
    });
  }
};

/**
 * Get Subjects for a Specific Class
 * GET /api/subjects/class/:className
 */
const getSubjectsForClass = async (req, res) => {
  console.log(`[GET CLASS SUBJECTS] Request received for class: ${req.params.className}`);
  try {
    // Validate request user data
    if (!req.user || !req.user.schoolCode) {
      console.error('[GET CLASS SUBJECTS] Missing user data:', req.user);
      return res.status(401).json({
        success: false,
        message: 'User authentication error: missing school code'
      });
    }
    
    const { className } = req.params;
    const schoolCode = req.user.schoolCode;
    const { academicYear = '2024-25' } = req.query;

    console.log(`[GET CLASS SUBJECTS] Looking for class: "${className}", in school: "${schoolCode}"`);
    console.log(`[GET CLASS SUBJECTS] User:`, { userId: req.user.userId, role: req.user.role });

    try {
      const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
      
      if (!schoolConn) {
        console.error(`[GET CLASS SUBJECTS] Failed to get school connection for: ${schoolCode}`);
        return res.status(500).json({
          success: false,
          message: `Failed to connect to school database: ${schoolCode}`
        });
      }
      
      try {
        const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);
        
        try {
          const classSubjects = await SchoolClassSubjects.findOne({
            schoolCode,
            className,
            academicYear,
            isActive: true
          });

          console.log(`[GET CLASS SUBJECTS] Query result for class "${className}":`, classSubjects ? 'Found' : 'Not found');

          if (!classSubjects) {
            console.log(`[GET CLASS SUBJECTS] Class "${className}" not found in school "${schoolCode}"`);
            return res.status(404).json({
              success: false,
              message: `Class "${className}" not found`
            });
          }

          res.status(200).json({
            success: true,
            message: 'Subjects retrieved successfully',
            data: {
              classId: classSubjects._id,
              className: classSubjects.className,
              grade: classSubjects.grade,
              section: classSubjects.section,
              academicYear: classSubjects.academicYear,
              totalSubjects: classSubjects.totalSubjects,
              subjects: classSubjects.getActiveSubjects()
            }
          });
        } catch (error) {
          console.error('Error getting subjects for class:', error);
          console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            className: req.params.className,
            schoolCode: req.user?.schoolCode
          });
          return res.status(500).json({
            success: false,
            message: 'Internal server error while retrieving subjects'
          });
        }
      } catch (modelError) {
        console.error(`[GET CLASS SUBJECTS] Error getting model for connection:`, modelError);
        return res.status(500).json({
          success: false,
          message: 'Error getting database model',
          error: modelError.message
        });
      }
    } catch (connectionError) {
      console.error(`[GET CLASS SUBJECTS] Error getting school connection:`, connectionError);
      return res.status(500).json({
        success: false,
        message: 'Error connecting to school database',
        error: connectionError.message
      });
    }
  } catch (error) {
    console.error('[GET CLASS SUBJECTS] Unhandled error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving subjects',
      error: error.message
    });
  }
};

/**
 * Get Subjects by Grade and Section
 * GET /api/subjects/grade/:grade/section/:section
 */
const getSubjectsByGradeSection = async (req, res) => {
  try {
    const { grade, section } = req.params;
    const schoolCode = req.user.schoolCode;
    const { academicYear = '2024-25' } = req.query;

    const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
    const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);

    const classSubjects = await SchoolClassSubjects.findByGradeSection(
      schoolCode, 
      grade, 
      section, 
      academicYear
    );

    if (!classSubjects) {
      return res.status(404).json({
        success: false,
        message: `No class found for Grade ${grade}, Section ${section}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Subjects retrieved successfully',
      data: {
        classId: classSubjects._id,
        className: classSubjects.className,
        grade: classSubjects.grade,
        section: classSubjects.section,
        academicYear: classSubjects.academicYear,
        totalSubjects: classSubjects.totalSubjects,
        subjects: classSubjects.getActiveSubjects()
      }
    });
  } catch (error) {
    console.error('Error getting subjects by grade and section:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving subjects'
    });
  }
};

/**
 * Update Subject in Class (assign teacher, etc.)
 * PUT /api/class-subjects/update-subject
 * Body: { className, subjectName, teacherId?, teacherName? }
 */
const updateSubjectInClass = async (req, res) => {
  try {
    const { className, subjectName, teacherId, teacherName } = req.body;
    const schoolCode = req.user.schoolCode;
    const userId = req.user.userId;

    // Validate required fields
    if (!className || !subjectName) {
      return res.status(400).json({
        success: false,
        message: 'Class name and subject name are required'
      });
    }

    // Find the class
    const schoolConn = await DatabaseManager.getSchoolConnection(schoolCode);
    const SchoolClassSubjects = ClassSubjectsSimple.getModelForConnection(schoolConn);

    const classSubjects = await SchoolClassSubjects.findOne({
      schoolCode,
      className,
      isActive: true
    });

    if (!classSubjects) {
      return res.status(404).json({
        success: false,
        message: `Class "${className}" not found`
      });
    }

    // Find the subject
    const subject = classSubjects.subjects.find(sub => 
      sub.name.toLowerCase() === subjectName.toLowerCase() && sub.isActive
    );

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: `Subject "${subjectName}" not found in class "${className}"`
      });
    }

    // Update subject fields (simplified - only teacher info)
    if (teacherId !== undefined) subject.teacherId = teacherId;
    if (teacherName !== undefined) subject.teacherName = teacherName;

    classSubjects.lastModifiedBy = userId;
    await classSubjects.save();

    res.status(200).json({
      success: true,
      message: `Subject "${subjectName}" updated successfully`,
      data: {
        classId: classSubjects._id,
        className: classSubjects.className,
        updatedSubject: subject,
        totalSubjects: classSubjects.totalSubjects
      }
    });
  } catch (error) {
    console.error('Error updating subject in class:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating subject'
    });
  }
};

/**
 * Bulk Add Subjects to Class
 * POST /api/class-subjects/bulk-add
 * Body: { className, grade, section?, subjects: [{ name }] }
 */
const bulkAddSubjectsToClass = async (req, res) => {
  try {
    const {
      className,
      grade,
      section = 'A',
      subjects
    } = req.body;

    const schoolCode = req.user.schoolCode;
    const userId = req.user.userId;

    // Get schoolId by finding the school document
    const School = require('../models/School');
    // Handle case sensitivity - the School model uses uppercase: true for code field
    const school = await School.findOne({ code: schoolCode.toUpperCase() });
    
    console.log(`[DEBUG] Looking for school with code: '${schoolCode}' (uppercase: '${schoolCode.toUpperCase()}')`);
    console.log(`[DEBUG] Found school:`, school ? { _id: school._id, code: school.code, name: school.name } : 'null');
    
    if (!school) {
      return res.status(400).json({
        success: false,
        message: `School not found with code: ${schoolCode}`
      });
    }
    
    const schoolId = school._id;

    // Validate required fields
    if (!className || !grade || !subjects || !Array.isArray(subjects)) {
      return res.status(400).json({
        success: false,
        message: 'Class name, grade, and subjects array are required'
      });
    }

    if (subjects.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one subject is required'
      });
    }

    // Find or create the class
    let classSubjects = await ClassSubjectsSimple.findOrCreateClass({
      className,
      grade,
      section,
      schoolCode,
      schoolId,
      createdBy: userId
    });

    const results = {
      added: [],
      skipped: [],
      errors: []
    };

    // Add each subject (simplified)
    for (const subjectData of subjects) {
      try {
        if (!subjectData.name) {
          results.errors.push({ subject: subjectData, error: 'Subject name is required' });
          continue;
        }

        classSubjects.addSubject({
          name: subjectData.name
        });

        results.added.push(subjectData.name);
      } catch (error) {
        if (error.message.includes('already exists')) {
          results.skipped.push(subjectData.name);
        } else {
          results.errors.push({ subject: subjectData.name, error: error.message });
        }
      }
    }

    classSubjects.lastModifiedBy = userId;
    await classSubjects.save();

    res.status(200).json({
      success: true,
      message: 'Bulk subject addition completed',
      data: {
        classId: classSubjects._id,
        className: classSubjects.className,
        totalSubjects: classSubjects.totalSubjects,
        results,
        subjects: classSubjects.getActiveSubjects()
      }
    });
  } catch (error) {
    console.error('Error bulk adding subjects to class:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while bulk adding subjects'
    });
  }
};

module.exports = {
  addSubjectToClass,
  removeSubjectFromClass,
  getAllClassesWithSubjects,
  getSubjectsForClass,
  getSubjectsByGradeSection,
  updateSubjectInClass,
  bulkAddSubjectsToClass
};
