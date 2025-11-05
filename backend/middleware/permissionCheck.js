const School = require('../models/School');
const DatabaseManager = require('../utils/databaseManager');

/**
 * Middleware to check if user has specific permission based on access matrix
 * @param {string} permission - The permission key to check (e.g., 'manageUsers', 'viewAttendance')
 * @returns {Function} - Express middleware function
 */
const checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Superadmin always has all permissions
      if (req.user && req.user.role === 'superadmin') {
        return next();
      }

      // Check if user exists and has required properties
      if (!req.user || !req.user.role) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. User not authenticated or role not defined.'
        });
      }

      // Get school's access matrix
      let accessMatrix = null;
      
      // Try to get access matrix from school database if schoolCode is available
      if (req.user.schoolCode) {
        try {
          const schoolConn = await DatabaseManager.getSchoolConnection(req.user.schoolCode);
          
          // Try to get access matrix from the access_matrices collection
          const accessMatrixCollection = schoolConn.collection('access_matrices');
          const matrixDoc = await accessMatrixCollection.findOne({ schoolCode: req.user.schoolCode });
          
          console.log(`[PERMISSION CHECK] School DB lookup for ${req.user.schoolCode}:`, matrixDoc ? 'Found' : 'Not found');
          
          if (matrixDoc && matrixDoc.accessMatrix) {
            accessMatrix = matrixDoc.accessMatrix;
          } else if (matrixDoc && matrixDoc.matrix) {
            // Alternative structure: matrix instead of accessMatrix
            accessMatrix = matrixDoc.matrix;
          }
        } catch (error) {
          console.log('[PERMISSION CHECK] Could not fetch from school database:', error.message);
        }
      }

      // Fallback to main database if not found in school database
      if (!accessMatrix && req.user.schoolId) {
        try {
          const school = await School.findById(req.user.schoolId);
          console.log(`[PERMISSION CHECK] Main DB lookup for school ${req.user.schoolId}:`, school ? 'Found' : 'Not found');
          if (school && school.accessMatrix) {
            accessMatrix = school.accessMatrix;
          }
        } catch (error) {
          console.log('[PERMISSION CHECK] Could not fetch from main database:', error.message);
        }
      }

      // If no access matrix found, use default permissions based on role
      if (!accessMatrix) {
        console.log(`[PERMISSION CHECK] No access matrix found for ${req.user.role}, using default permissions`);
        const defaultPermissions = getDefaultPermissions(req.user.role);
        
        console.log(`[PERMISSION CHECK] Default permissions for ${req.user.role}:`, Object.keys(defaultPermissions).filter(k => defaultPermissions[k]));
        
        if (!defaultPermissions[permission]) {
          console.log(`[PERMISSION CHECK] Access denied: ${req.user.role} does not have ${permission} in default permissions`);
          return res.status(403).json({
            success: false,
            message: `Access denied. You do not have permission to ${permission}.`,
            debug: {
              role: req.user.role,
              requiredPermission: permission,
              usingDefaultPermissions: true
            }
          });
        }
        
        console.log(`[PERMISSION CHECK] Access granted via default permissions: ${req.user.role} has ${permission}`);
        return next();
      }

      // Check if user's role has the required permission
      const rolePermissions = accessMatrix[req.user.role];
      
      console.log(`[PERMISSION CHECK] Checking permission '${permission}' for role '${req.user.role}'`);
      console.log(`[PERMISSION CHECK] Access matrix structure:`, Object.keys(accessMatrix));
      console.log(`[PERMISSION CHECK] Role permissions:`, rolePermissions ? Object.keys(rolePermissions).filter(k => rolePermissions[k]) : 'None');
      
      // Special case: If student role has no permissions or all false in access matrix,
      // fall back to default permissions (bulk import might set student permissions to false)
      if (req.user.role === 'student' && (!rolePermissions || Object.keys(rolePermissions).length === 0 || !Object.values(rolePermissions).some(v => v === true))) {
        console.log('[PERMISSION CHECK] Student has no/false permissions in access matrix, using default permissions');
        const defaultPermissions = getDefaultPermissions('student');
        
        if (!defaultPermissions[permission]) {
          console.log(`[PERMISSION CHECK] Access denied: student does not have ${permission} in default permissions`);
          return res.status(403).json({
            success: false,
            message: `Access denied. You do not have permission to ${permission}.`,
            debug: {
              role: req.user.role,
              requiredPermission: permission,
              usingDefaultPermissions: true,
              reason: 'Access matrix has no student permissions'
            }
          });
        }
        
        console.log(`[PERMISSION CHECK] Access granted via default permissions: student has ${permission}`);
        return next();
      }
      
      // For admin and teacher roles, grant full CRUD access if they have the base "view" permission
      // This means if they have 'viewAttendance', they can also mark/update/delete attendance
      // If they have 'viewResults', they can also create/update/freeze results, etc.
      let hasAccess = rolePermissions && rolePermissions[permission];
      
      // Handle string values like 'own', 'limited', 'self' as truthy
      if (typeof hasAccess === 'string') {
        hasAccess = true;
        console.log(`[PERMISSION CHECK] String permission '${rolePermissions[permission]}' treated as granted for ${req.user.role}`);
      }
      
      // If permission doesn't exist in access matrix, fall back to default permissions
      if (hasAccess === undefined && rolePermissions) {
        const defaultPermissions = getDefaultPermissions(req.user.role);
        hasAccess = defaultPermissions[permission];
        console.log(`[PERMISSION CHECK] Permission '${permission}' not found in access matrix, using default: ${hasAccess}`);
      }
      
      if (!hasAccess && (req.user.role === 'admin' || req.user.role === 'teacher')) {
        // Map specific action permissions to their base view permission
        const permissionMapping = {
          'markAttendance': 'viewAttendance',
          'updateAttendance': 'viewAttendance',
          'deleteAttendance': 'viewAttendance',
          'createTimetable': 'viewTimetable',
          'updateTimetable': 'viewTimetable',
          'deleteTimetable': 'viewTimetable',
          'addAssignments': 'viewAssignments',
          'updateAssignments': 'viewAssignments',
          'deleteAssignments': 'viewAssignments',
          'updateResults': 'viewResults',
          'createResults': 'viewResults',
          'freezeResults': 'viewResults',
          'deleteResults': 'viewResults',
          'createLeave': 'viewLeaves',
          'updateLeave': 'viewLeaves',
          'deleteLeave': 'viewLeaves',
          'approveLeave': 'viewLeaves',
          'rejectLeave': 'viewLeaves'
        };
        
        // Check if this is an action permission that maps to a view permission
        const basePermission = permissionMapping[permission];
        if (basePermission && rolePermissions && rolePermissions[basePermission]) {
          console.log(`[PERMISSION CHECK] Granting ${permission} access based on ${basePermission} permission for ${req.user.role}`);
          hasAccess = true;
        }
      }
      
      if (!hasAccess) {
        console.log(`[PERMISSION CHECK] Access denied: ${req.user.role} does not have ${permission} permission`);
        console.log(`[PERMISSION CHECK] Available permissions:`, Object.keys(rolePermissions || {}));
        return res.status(403).json({
          success: false,
          message: `Access denied. Your role (${req.user.role}) does not have permission to ${permission}.`,
          debug: {
            role: req.user.role,
            requiredPermission: permission,
            availablePermissions: Object.keys(rolePermissions || {}),
            hasPermission: hasAccess
          }
        });
      }

      console.log(`[PERMISSION CHECK] Access granted: ${req.user.role} has ${permission} permission`);
      next();
    } catch (error) {
      console.error('[PERMISSION CHECK ERROR]', error);
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

/**
 * Get default permissions for a role when no access matrix is configured
 * Note: For admin and teacher roles, the "view" permissions automatically grant full CRUD access
 * through the permission mapping logic above. The additional action permissions (markAttendance, 
 * updateResults, etc.) are included here for backwards compatibility but are not strictly necessary.
 */
function getDefaultPermissions(role) {
  const defaultMatrix = {
    superadmin: {
      manageUsers: true,
      manageSchoolSettings: true,
      viewAttendance: true,
      viewResults: true,
      viewLeaves: true,
      messageStudentsParents: true,
      viewAcademicDetails: true,
      viewAssignments: true,
      viewFees: true,
      viewReports: true,
      createTimetable: true,
      viewTimetable: true,
      markAttendance: true,
      addAssignments: true,
      updateResults: true
    },
    admin: {
      manageUsers: true,
      manageSchoolSettings: true,
      viewAttendance: true,
      viewResults: true,
      viewLeaves: true,
      messageStudentsParents: true,
      viewAcademicDetails: true,
      viewAssignments: true,
      viewFees: true,
      viewReports: true,
      createTimetable: true,
      viewTimetable: true,
      markAttendance: true,
      addAssignments: true,
      updateResults: true
    },
    teacher: {
      manageUsers: false,
      manageSchoolSettings: false,
      viewAttendance: true,
      viewResults: true,
      viewLeaves: true,
      messageStudentsParents: true,
      viewAcademicDetails: true,
      viewAssignments: true,
      viewFees: false,
      viewReports: false,
      createTimetable: true,
      viewTimetable: true,
      markAttendance: true,
      addAssignments: true,
      updateResults: true
    },
    student: {
      manageUsers: false,
      manageSchoolSettings: false,
      viewAttendance: false,
      viewResults: true,
      viewLeaves: false,
      messageStudentsParents: false,
      viewAcademicDetails: false,
      viewAssignments: true,
      viewFees: false,
      viewReports: false,
      createTimetable: false,
      viewTimetable: true,
      markAttendance: false,
      addAssignments: false,
      updateResults: false
    },
    parent: {
      manageUsers: false,
      manageSchoolSettings: false,
      viewAttendance: false,
      viewResults: false,
      viewLeaves: false,
      messageStudentsParents: false,
      viewAcademicDetails: false,
      viewAssignments: false,
      viewFees: false,
      viewReports: false,
      createTimetable: false,
      viewTimetable: false,
      markAttendance: false,
      addAssignments: false,
      updateResults: false
    }
  };

  return defaultMatrix[role] || {};
}

module.exports = checkPermission;
