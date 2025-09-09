const Subject = require('../models/Subject');
const User = require('../models/User');
const Class = require('../models/Class');
const { gradeSystem, gradeUtils } = require('../utils/gradeSystem');

// Create a new subject with grade assignments
const createSubject = async (req, res) => {
  try {
    const {
      subjectName,
      subjectCode,
      subjectType,
      category = 'core',
      applicableGrades,
      academicDetails,
      curriculum,
      resources,
      assessmentConfig
    } = req.body;

    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    // Validate required fields
    if (!subjectName || !subjectCode || !subjectType || !applicableGrades) {
      return res.status(400).json({
        message: 'Subject name, code, type, and applicable grades are required'
      });
    }

    // Check if subject code already exists
    const existingSubject = await Subject.findOne({
      schoolCode,
      subjectCode: subjectCode.toUpperCase(),
      academicYear: req.body.academicYear || '2024-25'
    });

    if (existingSubject) {
      return res.status(400).json({
        message: 'Subject with this code already exists'
      });
    }

    // Validate grades
    const invalidGrades = applicableGrades.filter(gradeInfo => 
      !gradeSystem.gradeStructure[gradeInfo.grade]
    );

    if (invalidGrades.length > 0) {
      return res.status(400).json({
        message: `Invalid grades: ${invalidGrades.map(g => g.grade).join(', ')}`
      });
    }

    // Create subject
    const subjectData = {
      subjectName: subjectName.trim(),
      subjectCode: subjectCode.toUpperCase(),
      schoolId,
      schoolCode,
      subjectType,
      category,
      applicableGrades: applicableGrades.map(grade => ({
        ...grade,
        level: gradeUtils.getGradeLevel(grade.grade)
      })),
      academicDetails,
      curriculum,
      resources,
      assessmentConfig,
      academicYear: req.body.academicYear || '2024-25',
      createdBy: req.user._id
    };

    const newSubject = await Subject.createSubjectForGrades(subjectData);

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      subject: {
        id: newSubject._id,
        subjectId: newSubject.subjectId,
        subjectName: newSubject.subjectName,
        subjectCode: newSubject.subjectCode,
        applicableGrades: newSubject.applicableGrades,
        totalTeachersAssigned: newSubject.totalTeachersAssigned
      }
    });

  } catch (error) {
    console.error('Error creating subject:', error);
    res.status(500).json({ message: 'Error creating subject', error: error.message });
  }
};

// Assign teacher to subject
const assignTeacherToSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const {
      teacherId,
      classAssignments, // Array of { classId, className, grade, section, stream, periodsPerWeek }
      role = 'primary_teacher',
      isPrimaryTeacher = false
    } = req.body;

    const schoolCode = req.user.schoolCode;

    // Validate required fields
    if (!teacherId || !classAssignments || !Array.isArray(classAssignments)) {
      return res.status(400).json({
        message: 'Teacher ID and class assignments are required'
      });
    }

    // Find subject
    const subject = await Subject.findOne({
      _id: subjectId,
      schoolCode,
      isActive: true
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Find teacher
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      schoolCode,
      isActive: true
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Validate class assignments
    const classIds = classAssignments.map(ca => ca.classId);
    const classes = await Class.find({
      _id: { $in: classIds },
      schoolCode,
      'settings.isActive': true
    });

    if (classes.length !== classIds.length) {
      return res.status(400).json({ message: 'Some classes not found' });
    }

    // Check if subject is applicable to assigned grades
    const assignedGrades = [...new Set(classAssignments.map(ca => ca.grade))];
    const subjectGrades = subject.applicableGrades.map(ag => ag.grade);
    const invalidGrades = assignedGrades.filter(grade => !subjectGrades.includes(grade));

    if (invalidGrades.length > 0) {
      return res.status(400).json({
        message: `Subject is not applicable to grades: ${invalidGrades.join(', ')}`
      });
    }

    // Check teacher's existing workload
    const teacherSubjects = await Subject.find({
      schoolCode,
      'teacherAssignments.teacherId': teacherId,
      'teacherAssignments.assignmentHistory.isActive': true,
      isActive: true
    });

    let currentWorkload = 0;
    teacherSubjects.forEach(sub => {
      const assignment = sub.teacherAssignments.find(ta => 
        ta.teacherId.toString() === teacherId && ta.assignmentHistory.isActive
      );
      if (assignment) {
        currentWorkload += assignment.totalPeriodsPerWeek;
      }
    });

    const newWorkload = classAssignments.reduce((total, ca) => total + ca.periodsPerWeek, 0);
    const maxWorkload = teacher.teacherDetails?.workSchedule?.maxPeriodsPerWeek || 25;

    if (currentWorkload + newWorkload > maxWorkload) {
      return res.status(400).json({
        message: `Teacher workload exceeded. Current: ${currentWorkload}, New: ${newWorkload}, Max: ${maxWorkload}`
      });
    }

    // Prepare teacher data
    const teacherData = {
      teacherId: teacher._id,
      teacherName: `${teacher.name.firstName} ${teacher.name.lastName}`,
      employeeId: teacher.teacherDetails?.employeeId,
      role,
      isPrimaryTeacher
    };

    // Assign teacher to subject
    await subject.assignTeacher(teacherData, classAssignments, req.user._id);

    // Update teacher's subjects in User model
    if (!teacher.teacherDetails.subjects) {
      teacher.teacherDetails.subjects = [];
    }

    const existingSubjectIndex = teacher.teacherDetails.subjects.findIndex(
      s => s.subjectCode === subject.subjectCode
    );

    if (existingSubjectIndex >= 0) {
      // Update existing subject assignment
      teacher.teacherDetails.subjects[existingSubjectIndex].classes = [
        ...teacher.teacherDetails.subjects[existingSubjectIndex].classes,
        ...classAssignments.map(ca => ca.className)
      ];
    } else {
      // Add new subject
      teacher.teacherDetails.subjects.push({
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        classes: classAssignments.map(ca => ca.className),
        isPrimary: isPrimaryTeacher
      });
    }

    await teacher.save();

    res.json({
      success: true,
      message: 'Teacher assigned to subject successfully',
      assignment: {
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        teacherName: teacherData.teacherName,
        assignedClasses: classAssignments.length,
        totalPeriods: newWorkload,
        newTotalWorkload: currentWorkload + newWorkload
      }
    });

  } catch (error) {
    console.error('Error assigning teacher to subject:', error);
    res.status(500).json({ message: 'Error assigning teacher to subject', error: error.message });
  }
};

// Remove teacher from subject
const removeTeacherFromSubject = async (req, res) => {
  try {
    const { subjectId, teacherId } = req.params;
    const { reason = 'reassignment' } = req.body;

    const schoolCode = req.user.schoolCode;

    // Find subject
    const subject = await Subject.findOne({
      _id: subjectId,
      schoolCode,
      isActive: true
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Remove teacher assignment
    await subject.removeTeacher(teacherId, reason);

    // Update teacher's subjects in User model
    const teacher = await User.findById(teacherId);
    if (teacher && teacher.teacherDetails.subjects) {
      teacher.teacherDetails.subjects = teacher.teacherDetails.subjects.filter(
        s => s.subjectCode !== subject.subjectCode
      );
      await teacher.save();
    }

    res.json({
      success: true,
      message: 'Teacher removed from subject successfully'
    });

  } catch (error) {
    console.error('Error removing teacher from subject:', error);
    res.status(500).json({ message: 'Error removing teacher from subject', error: error.message });
  }
};

// Get subjects by grade
const getSubjectsByGrade = async (req, res) => {
  try {
    const { grade } = req.params;
    const { stream, includeTeachers = true } = req.query;

    const schoolCode = req.user.schoolCode;
    const academicYear = req.query.academicYear || '2024-25';

    // Validate grade
    if (!gradeSystem.gradeStructure[grade]) {
      return res.status(400).json({ message: 'Invalid grade' });
    }

    let query = {
      schoolCode,
      academicYear,
      'applicableGrades.grade': grade,
      isActive: true
    };

    // Add stream filter for higher secondary grades
    if (stream && ['11', '12'].includes(grade)) {
      query['applicableGrades.streams'] = stream;
    }

    let subjects = await Subject.find(query);

    if (includeTeachers === 'true') {
      subjects = await Subject.populate(subjects, {
        path: 'teacherAssignments.teacherId',
        select: 'name email teacherDetails.employeeId'
      });
    }

    // Filter and format response
    const formattedSubjects = subjects.map(subject => {
      const gradeInfo = subject.applicableGrades.find(ag => ag.grade === grade);
      const activeTeachers = subject.teacherAssignments.filter(ta => 
        ta.assignmentHistory.isActive && ta.assignedGrades.includes(grade)
      );

      return {
        id: subject._id,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        category: subject.category,
        isCore: gradeInfo?.isCore,
        isOptional: gradeInfo?.isOptional,
        academicDetails: subject.academicDetails,
        teachers: activeTeachers.map(teacher => ({
          teacherId: teacher.teacherId._id,
          teacherName: teacher.teacherName,
          employeeId: teacher.employeeId,
          role: teacher.role,
          isPrimaryTeacher: teacher.isPrimaryTeacher,
          assignedClasses: teacher.assignedClasses.filter(ac => ac.grade === grade),
          totalPeriods: teacher.assignedClasses
            .filter(ac => ac.grade === grade)
            .reduce((total, ac) => total + ac.periodsPerWeek, 0)
        })),
        totalTeachers: activeTeachers.length
      };
    });

    res.json({
      success: true,
      grade,
      stream: stream || null,
      level: gradeUtils.getGradeLevel(grade),
      totalSubjects: formattedSubjects.length,
      subjects: formattedSubjects
    });

  } catch (error) {
    console.error('Error fetching subjects by grade:', error);
    res.status(500).json({ message: 'Error fetching subjects by grade', error: error.message });
  }
};

// Get subjects assigned to a teacher
const getSubjectsByTeacher = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { includeClasses = true } = req.query;

    const schoolCode = req.user.schoolCode;
    const academicYear = req.query.academicYear || '2024-25';

    // Find teacher
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      schoolCode,
      isActive: true
    });

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Get subjects assigned to teacher
    let subjects = await Subject.getSubjectsByTeacher(schoolCode, teacherId, academicYear);

    if (includeClasses === 'true') {
      subjects = await Subject.populate(subjects, {
        path: 'teacherAssignments.assignedClasses.classId',
        select: 'className grade section stream capacity'
      });
    }

    // Format response
    const formattedSubjects = subjects.map(subject => {
      const teacherAssignment = subject.teacherAssignments.find(ta => 
        ta.teacherId.toString() === teacherId && ta.assignmentHistory.isActive
      );

      return {
        id: subject._id,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        subjectType: subject.subjectType,
        category: subject.category,
        assignedGrades: teacherAssignment.assignedGrades,
        assignedClasses: teacherAssignment.assignedClasses,
        role: teacherAssignment.role,
        isPrimaryTeacher: teacherAssignment.isPrimaryTeacher,
        totalPeriodsPerWeek: teacherAssignment.totalPeriodsPerWeek,
        assignedDate: teacherAssignment.assignmentHistory.assignedDate,
        academicDetails: subject.academicDetails,
        performance: teacherAssignment.performance
      };
    });

    // Calculate workload summary
    const workloadSummary = {
      totalSubjects: formattedSubjects.length,
      totalPeriods: formattedSubjects.reduce((total, subject) => 
        total + subject.totalPeriodsPerWeek, 0
      ),
      totalClasses: formattedSubjects.reduce((total, subject) => 
        total + subject.assignedClasses.length, 0
      ),
      primarySubjects: formattedSubjects.filter(s => s.isPrimaryTeacher).length,
      gradeDistribution: {}
    };

    // Calculate grade distribution
    formattedSubjects.forEach(subject => {
      subject.assignedGrades.forEach(grade => {
        workloadSummary.gradeDistribution[grade] = 
          (workloadSummary.gradeDistribution[grade] || 0) + 1;
      });
    });

    res.json({
      success: true,
      teacher: {
        id: teacher._id,
        name: `${teacher.name.firstName} ${teacher.name.lastName}`,
        employeeId: teacher.teacherDetails?.employeeId,
        maxWorkload: teacher.teacherDetails?.workSchedule?.maxPeriodsPerWeek || 25
      },
      workloadSummary,
      subjects: formattedSubjects
    });

  } catch (error) {
    console.error('Error fetching subjects by teacher:', error);
    res.status(500).json({ message: 'Error fetching subjects by teacher', error: error.message });
  }
};

// Get teacher workload summary for school
const getTeacherWorkloadSummary = async (req, res) => {
  try {
    const schoolCode = req.user.schoolCode;
    const academicYear = req.query.academicYear || '2024-25';

    const workloadSummary = await Subject.getTeacherWorkloadSummary(schoolCode, academicYear);

    // Get all teachers for comparison
    const allTeachers = await User.find({
      role: 'teacher',
      schoolCode,
      isActive: true
    }).select('name teacherDetails.employeeId teacherDetails.workSchedule.maxPeriodsPerWeek');

    // Identify unassigned teachers
    const assignedTeacherIds = workloadSummary.map(summary => summary._id.toString());
    const unassignedTeachers = allTeachers.filter(teacher => 
      !assignedTeacherIds.includes(teacher._id.toString())
    );

    // Calculate statistics
    const stats = {
      totalTeachers: allTeachers.length,
      assignedTeachers: workloadSummary.length,
      unassignedTeachers: unassignedTeachers.length,
      averageWorkload: workloadSummary.length > 0 ? 
        workloadSummary.reduce((sum, t) => sum + t.totalPeriods, 0) / workloadSummary.length : 0,
      overloadedTeachers: workloadSummary.filter(t => t.totalPeriods > 25).length,
      underloadedTeachers: workloadSummary.filter(t => t.totalPeriods < 15).length
    };

    res.json({
      success: true,
      academicYear,
      statistics: stats,
      teacherWorkload: workloadSummary,
      unassignedTeachers: unassignedTeachers.map(teacher => ({
        id: teacher._id,
        name: `${teacher.name.firstName} ${teacher.name.lastName}`,
        employeeId: teacher.teacherDetails?.employeeId,
        maxWorkload: teacher.teacherDetails?.workSchedule?.maxPeriodsPerWeek || 25
      }))
    });

  } catch (error) {
    console.error('Error fetching teacher workload summary:', error);
    res.status(500).json({ message: 'Error fetching teacher workload summary', error: error.message });
  }
};

// Update teacher's class assignments for a subject
const updateTeacherSubjectAssignment = async (req, res) => {
  try {
    const { subjectId, teacherId } = req.params;
    const { classAssignments } = req.body;

    const schoolCode = req.user.schoolCode;

    // Validate input
    if (!classAssignments || !Array.isArray(classAssignments)) {
      return res.status(400).json({
        message: 'Class assignments array is required'
      });
    }

    // Find subject
    const subject = await Subject.findOne({
      _id: subjectId,
      schoolCode,
      isActive: true
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Update assignment
    await subject.updateTeacherWorkload(teacherId, classAssignments);

    res.json({
      success: true,
      message: 'Teacher assignment updated successfully',
      newWorkload: classAssignments.reduce((total, ca) => total + ca.periodsPerWeek, 0)
    });

  } catch (error) {
    console.error('Error updating teacher subject assignment:', error);
    res.status(500).json({ message: 'Error updating teacher assignment', error: error.message });
  }
};

// Get all subjects for academic details management
const getAllSubjects = async (req, res) => {
  try {
    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;

    const subjects = await Subject.find({
      schoolCode,
      academicYear: req.query.academicYear || '2024-25'
    }).select('subjectName subjectCode className description isActive');

    res.json({ subjects });
  } catch (error) {
    console.error('Error fetching all subjects:', error);
    res.status(500).json({ message: 'Error fetching subjects', error: error.message });
  }
};

// Bulk save subjects for academic details management
const bulkSaveSubjects = async (req, res) => {
  try {
    const { subjects } = req.body;
    const schoolCode = req.user.schoolCode;
    const schoolId = req.user.schoolId;
    const academicYear = req.body.academicYear || '2024-25';

    if (!subjects || !Array.isArray(subjects)) {
      return res.status(400).json({ message: 'Subjects array is required' });
    }

    // Clear existing subjects for this school and academic year
    await Subject.deleteMany({
      schoolCode,
      academicYear
    });

    // Prepare subjects for bulk insert
    const subjectsToInsert = subjects.map(subject => ({
      ...subject,
      schoolCode,
      schoolId,
      academicYear,
      subjectCode: subject.code || subject.subjectCode,
      subjectName: subject.name || subject.subjectName,
      subjectType: 'academic',
      category: 'core',
      applicableGrades: [{
        grade: subject.className,
        isCompulsory: true,
        maxMarks: 100,
        passMarks: 40
      }],
      createdBy: req.user.userId,
      updatedBy: req.user.userId
    }));

    // Insert new subjects
    const insertedSubjects = await Subject.insertMany(subjectsToInsert);

    res.json({ 
      message: 'Subjects saved successfully',
      subjects: insertedSubjects,
      count: insertedSubjects.length
    });
  } catch (error) {
    console.error('Error bulk saving subjects:', error);
    res.status(500).json({ message: 'Error saving subjects', error: error.message });
  }
};

module.exports = {
  createSubject,
  assignTeacherToSubject,
  removeTeacherFromSubject,
  getSubjectsByGrade,
  getSubjectsByTeacher,
  getTeacherWorkloadSummary,
  updateTeacherSubjectAssignment,
  getAllSubjects,
  bulkSaveSubjects
};
