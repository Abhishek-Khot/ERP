const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.error('[AUTH ERROR] Missing Authorization header');
      return res.status(401).json({ success: false, message: 'Authorization token is missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('[AUTH] Token decoded:', decoded);

    console.log('[DEBUG] mainDb in auth middleware:', req.mainDb);

    if (!req.mainDb) {
      console.error('[AUTH ERROR] mainDb is not defined on the request object');
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

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
      console.log(`[AUTH DEBUG] Found user:`, user ? { id: user._id, userId: user.userId, name: user.name } : 'null');
    } else {
      // For global users, check the main users collection
      console.log(`[AUTH DEBUG] Looking for user ID: ${userId} in main database`);
      user = await User.findById(userId);
    }
    
    if (!user) {
      console.error('[AUTH ERROR] User not found for decoded token:', decoded);
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    console.log('[AUTH] User fetched:', user);
    req.user = user;
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
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

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
