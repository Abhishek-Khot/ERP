const idCardGenerator = require('../utils/simpleIDCardGenerator');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

/**
 * ID Card Generation Controller - In-Memory Processing
 * No file storage - generates previews and downloads directly in memory
 */

// Preview single ID card without storing to disk
const previewIDCard = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { 
      studentId, 
      orientation = 'landscape',
      side = 'front'
    } = req.query;

    console.log('🔍 ID Card Preview Request:', {
      schoolId,
      studentId,
      orientation,
      side
    });

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    // Get student data
    const UserGenerator = require('../utils/userGenerator');
    const mongoose = require('mongoose');
    const schoolCode = req.user.schoolCode;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }
    
    const allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    const student = allStudents.find(s => s._id.toString() === studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Map student data
    const mappedStudent = {
      _id: student._id,
      name: student.name?.displayName || `${student.name?.firstName || ''} ${student.name?.lastName || ''}`.trim(),
      sequenceId: student.userId,
      rollNumber: student.studentDetails?.rollNumber || 'N/A',
      className: student.studentDetails?.currentClass || 'N/A',
      section: student.studentDetails?.currentSection || 'N/A',
      dateOfBirth: student.studentDetails?.dateOfBirth ? new Date(student.studentDetails.dateOfBirth).toLocaleDateString('en-GB') : 'N/A',
      bloodGroup: student.studentDetails?.bloodGroup || 'N/A',
      address: formatStudentAddress(student),
      phone: student.contact?.primaryPhone || student.studentDetails?.fatherPhone || student.studentDetails?.motherPhone || 'N/A',
      profileImage: student.profileImage
    };

    // Get school info
    const School = require('../models/School');
    const school = await School.findById(schoolId).select('name address logoUrl contact email phone');

    const schoolInfo = {
      schoolName: school?.name || '',
      address: formatSchoolAddress(school),
      logoUrl: school?.logoUrl || null,
      phone: school?.contact?.phone || school?.phone || '',
      email: school?.contact?.email || school?.email || ''
    };

    // Generate ID card in memory
    console.log('🔧 About to call generateIDCardBuffer with:', {
      studentName: mappedStudent.name,
      orientation,
      side,
      hasSchoolInfo: !!schoolInfo,
      methodExists: typeof idCardGenerator.generateIDCardBuffer
    });
    
    const cardBuffer = await idCardGenerator.generateIDCardBuffer(mappedStudent, orientation, side, schoolInfo);

    console.log('✅ Preview generated successfully');

    // Send image directly (like the old implementation but without file storage)
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': cardBuffer.length,
      'Cache-Control': 'no-cache'
    });
    
    res.send(cardBuffer);

  } catch (error) {
    console.error('❌ Error generating preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating preview',
      error: error.message
    });
  }
};

// Generate ID cards and return as ZIP stream without storing files
const generateAndDownloadIDCards = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { 
      studentIds, 
      orientation = 'landscape',
      includeBack = true 
    } = req.body;

    console.log('📥 In-Memory Download Request:', {
      schoolId,
      studentIds,
      studentCount: studentIds?.length,
      orientation,
      includeBack
    });

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students selected or invalid student IDs format'
      });
    }

    // Get students
    const UserGenerator = require('../utils/userGenerator');
    const mongoose = require('mongoose');
    const schoolCode = req.user.schoolCode;
    
    const validStudentIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student IDs'
      });
    }
    
    const allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    const students = allStudents.filter(student => 
      validStudentIds.includes(student._id.toString())
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found'
      });
    }

    // Map students
    const mappedStudents = students.map(s => ({
      _id: s._id,
      name: s.name?.displayName || `${s.name?.firstName || ''} ${s.name?.lastName || ''}`.trim(),
      sequenceId: s.userId,
      rollNumber: s.studentDetails?.rollNumber || 'N/A',
      className: s.studentDetails?.currentClass || 'N/A',
      section: s.studentDetails?.currentSection || 'N/A',
      dateOfBirth: s.studentDetails?.dateOfBirth ? new Date(s.studentDetails.dateOfBirth).toLocaleDateString('en-GB') : 'N/A',
      bloodGroup: s.studentDetails?.bloodGroup || 'N/A',
      address: formatStudentAddress(s),
      phone: s.contact?.primaryPhone || s.studentDetails?.fatherPhone || s.studentDetails?.motherPhone || 'N/A',
      profileImage: s.profileImage
    }));

    // Get school info
    const School = require('../models/School');
    const school = await School.findById(schoolId).select('name address logoUrl contact email phone');

    const schoolInfo = {
      schoolName: school?.name || '',
      address: formatSchoolAddress(school),
      logoUrl: school?.logoUrl || null,
      phone: school?.contact?.phone || school?.phone || '',
      email: school?.contact?.email || school?.email || ''
    };

    // Create ZIP file name
    const schoolName = school?.name || 'School';
    const zipFileName = `IDCards_${schoolName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.zip`;
    
    console.log('📦 Creating in-memory ZIP:', zipFileName);
    
    // Set response headers for download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Create archive that pipes directly to response
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Handle errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error creating ZIP file',
          error: err.message
        });
      }
    });

    // Pipe archive directly to response
    archive.pipe(res);

    // Generate and add ID cards to ZIP in memory
    let filesAdded = 0;
    for (const student of mappedStudents) {
      try {
        const studentId = student.sequenceId || student.rollNumber || student._id;
        const folderName = `${studentId}_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

        // Generate front card
        const frontBuffer = await idCardGenerator.generateIDCardBuffer(student, orientation, 'front', schoolInfo);
        archive.append(frontBuffer, { name: `${folderName}/${studentId}_front.png` });
        filesAdded++;

        // Generate back card if requested
        if (includeBack) {
          const backBuffer = await idCardGenerator.generateIDCardBuffer(student, orientation, 'back', schoolInfo);
          archive.append(backBuffer, { name: `${folderName}/${studentId}_back.png` });
          filesAdded++;
        }

        console.log(`✅ Added cards for: ${student.name}`);
      } catch (error) {
        console.error(`❌ Failed to generate cards for ${student.name}:`, error);
        // Continue with other students
      }
    }

    if (filesAdded === 0) {
      archive.destroy();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate any ID cards'
      });
    }

    // Finalize the archive
    await archive.finalize();
    
    console.log(`✅ ZIP download complete: ${filesAdded} files generated`);

  } catch (error) {
    console.error('❌ Error in download generation:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error generating download',
        error: error.message
      });
    }
  }
};

// Preview single ID card as base64 JSON (for frontend components)
const previewIDCardBase64 = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { 
      studentId, 
      orientation = 'landscape',
      side = 'front'
    } = req.query;

    console.log('🔍 ID Card Base64 Preview Request:', {
      schoolId,
      studentId,
      orientation,
      side
    });

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required'
      });
    }

    // Get student data
    const UserGenerator = require('../utils/userGenerator');
    const mongoose = require('mongoose');
    const schoolCode = req.user.schoolCode;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }
    
    const allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    const student = allStudents.find(s => s._id.toString() === studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Map student data
    const mappedStudent = {
      _id: student._id,
      name: student.name?.displayName || `${student.name?.firstName || ''} ${student.name?.lastName || ''}`.trim(),
      sequenceId: student.userId,
      rollNumber: student.studentDetails?.rollNumber || 'N/A',
      className: student.studentDetails?.currentClass || 'N/A',
      section: student.studentDetails?.currentSection || 'N/A',
      dateOfBirth: student.studentDetails?.dateOfBirth ? new Date(student.studentDetails.dateOfBirth).toLocaleDateString('en-GB') : 'N/A',
      bloodGroup: student.studentDetails?.bloodGroup || 'N/A',
      address: formatStudentAddress(student),
      phone: student.contact?.primaryPhone || student.studentDetails?.fatherPhone || student.studentDetails?.motherPhone || 'N/A',
      profileImage: student.profileImage
    };

    // Get school info
    const School = require('../models/School');
    const school = await School.findById(schoolId).select('name address logoUrl contact email phone');

    const schoolInfo = {
      schoolName: school?.name || '',
      address: formatSchoolAddress(school),
      logoUrl: school?.logoUrl || null,
      phone: school?.contact?.phone || school?.phone || '',
      email: school?.contact?.email || school?.email || ''
    };

    // Generate ID card in memory
    const cardBuffer = await idCardGenerator.generateIDCardBuffer(mappedStudent, orientation, side, schoolInfo);

    // Convert to base64 for JSON response
    const base64Image = cardBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64Image}`;

    console.log('✅ Base64 Preview generated successfully');

    res.json({
      success: true,
      message: 'Preview generated successfully',
      data: {
        imageUrl: dataUrl,
        studentName: mappedStudent.name,
        orientation,
        side
      }
    });

  } catch (error) {
    console.error('❌ Error generating base64 preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating preview',
      error: error.message
    });
  }
};

// Generate ID cards (for compatibility - returns success message)
const generateIDCards = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { 
      studentIds, 
      orientation = 'landscape',
      includeBack = true 
    } = req.body;

    console.log('🎯 ID Card Generation Request (In-Memory):', {
      schoolId,
      studentIds,
      studentCount: studentIds?.length,
      orientation,
      includeBack
    });

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students selected or invalid student IDs format'
      });
    }

    // Get students
    const UserGenerator = require('../utils/userGenerator');
    const mongoose = require('mongoose');
    const schoolCode = req.user.schoolCode;
    
    const validStudentIds = studentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student IDs'
      });
    }
    
    const allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    const students = allStudents.filter(student => 
      validStudentIds.includes(student._id.toString())
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found'
      });
    }

    console.log(`✅ Generation successful for ${students.length} students (in-memory)`);

    // Return success response (no files stored)
    res.json({
      success: true,
      message: `Generated ${students.length} ID cards successfully (in-memory)`,
      data: {
        totalRequested: studentIds.length,
        totalGenerated: students.length,
        totalFailed: studentIds.length - students.length,
        note: 'Cards generated in-memory - no files stored'
      }
    });

  } catch (error) {
    console.error('❌ Error in generate endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating ID cards',
      error: error.message
    });
  }
};

// Generate multiple ID cards for preview (returns array of base64 images)
const generateBulkPreview = async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { 
      studentIds, 
      orientation = 'landscape',
      includeBack = true,
      limit = 5 // Limit previews to avoid memory issues
    } = req.body;

    console.log('🔍 Bulk Preview Request:', {
      schoolId,
      studentIds,
      studentCount: studentIds?.length,
      orientation,
      includeBack,
      limit
    });

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No students selected'
      });
    }

    // Limit the number of previews to avoid memory issues
    const limitedStudentIds = studentIds.slice(0, limit);

    // Get students
    const UserGenerator = require('../utils/userGenerator');
    const mongoose = require('mongoose');
    const schoolCode = req.user.schoolCode;
    
    const validStudentIds = limitedStudentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    if (validStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student IDs'
      });
    }
    
    const allStudents = await UserGenerator.getUsersByRole(schoolCode, 'student');
    const students = allStudents.filter(student => 
      validStudentIds.includes(student._id.toString())
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found'
      });
    }

    // Map students
    const mappedStudents = students.map(s => ({
      _id: s._id,
      name: s.name?.displayName || `${s.name?.firstName || ''} ${s.name?.lastName || ''}`.trim(),
      sequenceId: s.userId,
      rollNumber: s.studentDetails?.rollNumber || 'N/A',
      className: s.studentDetails?.currentClass || 'N/A',
      section: s.studentDetails?.currentSection || 'N/A',
      dateOfBirth: s.studentDetails?.dateOfBirth ? new Date(s.studentDetails.dateOfBirth).toLocaleDateString('en-GB') : 'N/A',
      bloodGroup: s.studentDetails?.bloodGroup || 'N/A',
      address: formatStudentAddress(s),
      phone: s.contact?.primaryPhone || s.studentDetails?.fatherPhone || s.studentDetails?.motherPhone || 'N/A',
      profileImage: s.profileImage
    }));

    // Get school info
    const School = require('../models/School');
    const school = await School.findById(schoolId).select('name address logoUrl contact email phone');

    const schoolInfo = {
      schoolName: school?.name || '',
      address: formatSchoolAddress(school),
      logoUrl: school?.logoUrl || null,
      phone: school?.contact?.phone || school?.phone || '',
      email: school?.contact?.email || school?.email || ''
    };

    // Generate previews
    const previews = [];
    for (const student of mappedStudents) {
      try {
        // Generate front
        const frontBuffer = await idCardGenerator.generateIDCardBuffer(student, orientation, 'front', schoolInfo);
        const frontBase64 = `data:image/png;base64,${frontBuffer.toString('base64')}`;

        const preview = {
          studentId: student._id,
          studentName: student.name,
          sequenceId: student.sequenceId,
          front: frontBase64,
          back: null
        };

        // Generate back if requested
        if (includeBack) {
          const backBuffer = await idCardGenerator.generateIDCardBuffer(student, orientation, 'back', schoolInfo);
          preview.back = `data:image/png;base64,${backBuffer.toString('base64')}`;
        }

        previews.push(preview);
        console.log(`✅ Preview generated for: ${student.name}`);
      } catch (error) {
        console.error(`❌ Failed to generate preview for ${student.name}:`, error);
        // Continue with other students
      }
    }

    res.json({
      success: true,
      message: `Generated ${previews.length} previews`,
      data: {
        previews,
        orientation,
        includeBack,
        totalRequested: studentIds.length,
        totalGenerated: previews.length,
        limited: studentIds.length > limit
      }
    });

  } catch (error) {
    console.error('❌ Error generating bulk preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating previews',
      error: error.message
    });
  }
};

// Helper function to format student address
function formatStudentAddress(student) {
  let formattedAddress = '';
  
  if (student.address?.permanent) {
    const addr = student.address.permanent;
    const parts = [addr.street, addr.area, addr.locality, addr.city, addr.state, addr.pinCode || addr.zipCode].filter(Boolean);
    formattedAddress = parts.join(', ');
  } else if (student.address?.current) {
    const addr = student.address.current;
    const parts = [addr.street, addr.area, addr.locality, addr.city, addr.state, addr.pinCode || addr.zipCode].filter(Boolean);
    formattedAddress = parts.join(', ');
  } else if (student.contact?.address) {
    const addr = student.contact.address;
    const parts = [addr.street || addr.houseNo, addr.area || addr.locality, addr.city, addr.state, addr.pinCode || addr.zipCode].filter(Boolean);
    formattedAddress = parts.join(', ');
  } else if (student.address) {
    if (typeof student.address === 'string') {
      formattedAddress = student.address;
    } else if (typeof student.address === 'object') {
      const addr = student.address;
      const parts = [addr.street || addr.houseNo, addr.area || addr.locality, addr.city, addr.state, addr.pinCode || addr.zipCode].filter(Boolean);
      formattedAddress = parts.join(', ');
    }
  } else if (student.studentDetails) {
    const parts = [student.studentDetails.address, student.studentDetails.city, student.studentDetails.state, student.studentDetails.pinCode].filter(Boolean);
    formattedAddress = parts.join(', ');
  }
  
  return formattedAddress || 'N/A';
}

// Helper function to format school address
function formatSchoolAddress(school) {
  let formattedAddress = '';
  if (school?.address) {
    const addr = school.address;
    const addressParts = [addr.street, addr.area, addr.city, addr.state, addr.pinCode || addr.zipCode].filter(Boolean);
    formattedAddress = addressParts.join(', ');
  }
  return formattedAddress;
}

module.exports = {
  previewIDCard,
  previewIDCardBase64,
  generateIDCards,
  generateAndDownloadIDCards,
  generateBulkPreview
};
