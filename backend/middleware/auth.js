const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    console.log('🔑 AUTH middleware called for:', req.method, req.originalUrl);
    console.log('Authorization header:', req.headers.authorization);

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.error('[AUTH ERROR] Missing Authorization header');
      return res.status(401).json({ success: false, message: 'Authorization token is missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[AUTH] Token decoded:', decoded);

    console.log('[DEBUG] mainDb in auth middleware:', req.mainDb);

    // Note: mainDb is not always required in auth middleware, it's set by setMainDbContext middleware when needed

    // Handle different user ID formats based on userType
    let userId = decoded.userId;

    // Only convert to ObjectId for non-school users
    if (decoded.userType !== 'school_user') {
      try {
        userId = new mongoose.Types.ObjectId(decoded.userId);
      } catch (error) {
        console.error('[AUTH ERROR] Invalid user ID format:', decoded.userId);
        return res.status(401).json({ success: false, message: 'Invalid user ID format' });
      }
    }

    // For superadmin, check the superadmins collection
    if (decoded.role === 'superadmin') {
      const superAdmin = await SuperAdmin.findById(userId);
      if (!superAdmin) {
        console.error('[AUTH ERROR] Superadmin user not found for decoded token:', decoded);
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      if (!superAdmin.isActive) {
        console.error('[AUTH ERROR] Superadmin is deactivated:', decoded);
        return res.status(401).json({ success: false, message: 'Account deactivated' });
      }

      req.user = superAdmin;
      return next();
    }

    // For other roles, check the appropriate collection based on userType
    let user;
    if (decoded.userType === 'school_user' && decoded.schoolCode) {
      // For school users, use the UserGenerator to find them across all school collections
      console.log(`[AUTH DEBUG] Looking for user ID: ${userId} in school database: ${decoded.schoolCode}`);
      const UserGenerator = require('../utils/userGenerator');
      user = await UserGenerator.getUserByIdOrEmail(decoded.schoolCode, userId);
      console.log(`[AUTH DEBUG] Found user:`, user ? { id: user._id, userId: user.userId, name: user.name, role: user.role, collection: user.collection } : 'null');

      // For school users, we need to add the schoolId from the School collection
      if (user) {
        const School = require('../models/School');
        const school = await School.findOne({ code: decoded.schoolCode });
        if (school) {
          user.schoolId = school._id;
          user.schoolCode = decoded.schoolCode;
        } else {
          console.error('[AUTH ERROR] School not found for code:', decoded.schoolCode);
          return res.status(401).json({ success: false, message: 'School not found' });
        }
      }
    } else {
      // For global users, check the main users collection
      console.log(`[AUTH DEBUG] Looking for user ID: ${userId} in main database`);
      user = await User.findById(userId);

      // For global users that have a schoolCode, populate schoolId
      if (user && user.schoolCode) {
        const School = require('../models/School');
        const school = await School.findOne({ code: user.schoolCode });
        if (school) {
          user.schoolId = school._id;
        }
      }
    }

    if (!user) {
      console.error('[AUTH ERROR] User not found for decoded token:', decoded);
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    console.log('[AUTH] User fetched - ID:', user._id || user.userId);
    console.log('[AUTH] User role:', user.role);
    console.log('[AUTH] User role type:', typeof user.role);
    console.log('[AUTH] User role length:', user.role ? user.role.length : 'null');
    console.log('[AUTH] User keys:', Object.keys(user));
    console.log('[AUTH] User object type:', user.constructor.name);
    
    // For students, log class/section info for debugging
    if (user.role === 'student') {
      console.log('[AUTH] Student class/section info:', {
        class: user.class,
        section: user.section,
        currentClass: user.studentDetails?.currentClass,
        currentSection: user.studentDetails?.currentSection,
        academicClass: user.studentDetails?.academic?.currentClass,
        academicSection: user.studentDetails?.academic?.currentSection
      });
    }
    
    // Ensure user object is a plain object with role property
    req.user = {
      ...user,
      role: user.role || 'admin', // Fallback to admin if role is missing
      _id: user._id,
      userId: user.userId,
      schoolId: user.schoolId,
      schoolCode: user.schoolCode,
      // Preserve student details for filtering
      studentDetails: user.studentDetails,
      class: user.class,
      section: user.section
    };
    console.log('[AUTH] req.user.role after assignment:', req.user.role);
    next();
  } catch (error) {
    console.error('[AUTH ERROR] Token verification failed:', error);
    res.status(401).json({ success: false, message: 'Invalid token', error: error.message });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('[AUTHORIZE ERROR] No user on request');
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // Flatten roles array in case it's passed as authorize(['admin', 'teacher'])
    const allowedRoles = roles.flat();
    
    console.log(`[AUTHORIZE DEBUG] Checking if role "${req.user.role}" is in allowed roles:`, allowedRoles);

    if (!allowedRoles.includes(req.user.role)) {
      console.error(`[AUTHORIZE ERROR] User role "${req.user.role}" not in allowed roles:`, allowedRoles);
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    console.log(`[AUTHORIZE SUCCESS] User role "${req.user.role}" is authorized`);
    next();
  };
};

// School access middleware (for admin users)
const schoolAccess = async (req, res, next) => {
  try {
    if (req.user.role === 'superadmin') {
      return next(); // Super admin has access to all schools
    }

    if (req.user.role === 'admin' && req.user.schoolId) {
      return next(); // Admin has access to their school
    }

    return res.status(403).json({ message: 'Access denied. School access required.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// Resource ownership middleware
const resourceOwnership = (model, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      if (req.user.role === 'superadmin') {
        return next(); // Super admin has access to all resources
      }

      const resourceId = req.params[resourceIdField];
      const resource = await model.findById(resourceId);

      if (!resource) {
        return res.status(404).json({ message: 'Resource not found.' });
      }

      // Check if admin has access to the resource's school
      if (req.user.role === 'admin' && req.user.schoolId?.toString() !== resource.schoolId?.toString()) {
        return res.status(403).json({ message: 'Access denied. Resource not in your school.' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: 'Server error.' });
    }
  };
};

module.exports = {
  auth,
  authorize,
  schoolAccess,
  resourceOwnership
};
