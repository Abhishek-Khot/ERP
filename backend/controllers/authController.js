const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');
const UserGenerator = require('../utils/userGenerator');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({ name, email, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role: selectedRole } = req.body;
    console.log(`🔍 Attempting login for email: ${email}`);

    let user;

    // First try to find in SuperAdmin collection
    user = await SuperAdmin.findOne({ email: { $regex: new RegExp(email, 'i') } });
    
    if (user) {
      console.log(`🔍 Found in SuperAdmin collection: ${email}`);
      console.log(`👤 User role: ${user.role}`);

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log(`[LOGIN FAIL] Wrong password for superadmin: ${email}`);
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        console.log(`[LOGIN FAIL] SuperAdmin is deactivated: ${email}`);
        return res.status(400).json({ message: 'Account has been deactivated. Contact system administrator.' });
      }

      // Validate that selected role matches user's actual role for SuperAdmin
      if (selectedRole && selectedRole !== user.role) {
        console.log(`[LOGIN FAIL] Role mismatch - Selected: ${selectedRole}, Actual: ${user.role} for superadmin: ${email}`);
        return res.status(400).json({ message: `Invalid credentials. You selected ${selectedRole} but your account is registered as ${user.role}.` });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log(`[LOGIN SUCCESS] Super Admin: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          _id: user._id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          lastLogin: user.lastLogin
        }
      });
    }

    // If not found in SuperAdmin, try regular Users collection
    user = await User.findOne({ email: { $regex: new RegExp(email, 'i') } }).read('primaryPreferred');
    console.log(`🔍 Querying users database for user: ${email}`);

    if (!user) {
      console.log(`[LOGIN FAIL] Email not found: ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    console.log(`👤 User role: ${user.role}`);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`[LOGIN FAIL] Wrong password for: ${email}`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Handle non-superadmin users
    if (!user.isActive) {
      console.log(`[LOGIN FAIL] User is deactivated: ${email}`);
      return res.status(400).json({ message: 'Account has been deactivated. Contact your administrator.' });
    }

    // Validate that selected role matches user's actual role
    if (selectedRole && selectedRole !== user.role) {
      console.log(`[LOGIN FAIL] Role mismatch - Selected: ${selectedRole}, Actual: ${user.role} for user: ${email}`);
      return res.status(400).json({ message: `Invalid credentials. You selected ${selectedRole} but your account is registered as ${user.role}.` });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign({ 
      id: user._id, 
      role: user.role, 
      schoolId: user.schoolId?._id 
    }, process.env.JWT_SECRET, { expiresIn: '1d' });

    console.log(`[LOGIN SUCCESS] User: ${user.email} (${user.role}) from school: ${user.schoolId?.name || 'None'}`);

    res.json({ 
      success: true,
      token, 
      user: { 
        id: user._id,
        userId: user.userId,
        name: user.name, 
        email: user.email, 
        role: user.role, 
        schoolId: user.schoolId?._id,
        schoolName: user.schoolId?.name || 'N/A',
        lastLogin: user.lastLogin 
      } 
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ message: 'Login failed. Please try again.' });
  }
};

// School-specific login (supports both email and user ID)
exports.schoolLogin = async (req, res) => {
  try {
    const { identifier, password, schoolCode, role: selectedRole } = req.body;
    
    if (!identifier || !password || !schoolCode) {
      return res.status(400).json({ 
        success: false,
        message: 'Email/User ID, password, and school code are required' 
      });
    }

    console.log(`🔍 School login attempt for: ${identifier} at school: ${schoolCode}`);

    // Find user in school database
    const user = await UserGenerator.getUserByIdOrEmail(schoolCode, identifier);
    
    console.log(`[SCHOOL LOGIN DEBUG] Found user object:`, user ? {
      _id: user._id,
      userId: user.userId,
      email: user.email,
      role: user.role,
      name: user.name,
      hasUserId: !!user.userId
    } : 'null');
    
    if (!user) {
      console.log(`[SCHOOL LOGIN FAIL] User not found: ${identifier} in school: ${schoolCode}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get user with password for verification
    const SchoolDatabaseManager = require('../utils/schoolDatabaseManager');
    const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
    const userCollection = connection.collection(user.collection);
    const userWithPassword = await userCollection.findOne({ userId: user.userId });

    if (!userWithPassword) {
      console.log(`[SCHOOL LOGIN FAIL] User data not found: ${identifier}`);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, userWithPassword.password);
    if (!isMatch) {
      console.log(`[SCHOOL LOGIN FAIL] Wrong password for: ${identifier}`);
      return res.status(400).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log(`[SCHOOL LOGIN FAIL] User is deactivated: ${identifier}`);
      return res.status(400).json({ 
        success: false,
        message: 'Account has been deactivated. Contact your administrator.' 
      });
    }

    // Validate that selected role matches user's actual role
    if (selectedRole && selectedRole !== user.role) {
      console.log(`[SCHOOL LOGIN FAIL] Role mismatch - Selected: ${selectedRole}, Actual: ${user.role} for user: ${identifier}`);
      return res.status(400).json({ 
        success: false,
        message: `Invalid credentials. You selected ${selectedRole} but your account is registered as ${user.role}.` 
      });
    }

    // Update last login
    await userCollection.updateOne(
      { userId: user.userId },
      { 
        $set: { 
          lastLogin: new Date(),
          loginAttempts: 0 // Reset login attempts on successful login
        }
      }
    );

    // Get access matrix for this school
    const accessCollection = connection.collection('access_matrix');
    const accessMatrix = await accessCollection.findOne({ _id: 'school_permissions' });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.userId,
        role: user.role,
        schoolCode: schoolCode,
        userType: 'school_user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`[SCHOOL LOGIN SUCCESS] User: ${user.userId} (${user.role}) from school: ${schoolCode}`);
    console.log(`[SCHOOL LOGIN DEBUG] User object keys:`, Object.keys(user));
    console.log(`[SCHOOL LOGIN DEBUG] User.userId:`, user.userId);
    console.log(`[SCHOOL LOGIN DEBUG] User._id:`, user._id);

    const responseUser = {
      _id: user._id,
      userId: user.userId,
      email: user.email,
      role: user.role,
      name: user.name,
      schoolCode: schoolCode,
      isActive: user.isActive,
      lastLogin: new Date(),
      permissions: accessMatrix?.matrix[user.role] || {}
    };

    console.log(`[SCHOOL LOGIN DEBUG] Response user object:`, responseUser);
    console.log(`[SCHOOL LOGIN DEBUG] Response user.userId specifically:`, responseUser.userId);
    console.log(`[SCHOOL LOGIN DEBUG] Response user.userId type:`, typeof responseUser.userId);

    const finalResponse = {
      success: true,
      message: 'Login successful',
      token,
      user: responseUser
    };

    console.log(`[SCHOOL LOGIN DEBUG] Final JSON response:`, JSON.stringify(finalResponse, null, 2));

    res.json(finalResponse);

  } catch (error) {
    console.error('[SCHOOL LOGIN ERROR]', error);
    res.status(500).json({ 
      success: false,
      message: 'Login failed. Please try again.',
      error: error.message 
    });
  }
};
