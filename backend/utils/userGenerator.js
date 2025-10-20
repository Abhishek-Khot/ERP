const bcrypt = require('bcryptjs');
const SchoolDatabaseManager = require('./schoolDatabaseManager');
const { ObjectId } = require('mongodb');

class UserGenerator {
  
  /**
   * Generate a unique user ID based on school code and role
   * Format: SCHOOL-ROLE-####
   * Example: NPS-A-0001, NPS-T-0023, NPS-S-0156
   * Uses the same atomic counter system as the main generateSequentialUserId
   */
  static async generateUserId(schoolCode, role) {
    try {
      // Use the same atomic counter system from userController
      const userController = require('../controllers/userController');
      return await userController.generateSequentialUserId(schoolCode, role);
    } catch (error) {
      console.error('Error generating user ID:', error);
      throw error;
    }
  }
  
  /**
   * Generate a random password
   * Format: 8 characters with mix of letters and numbers
   */
  static generateRandomPassword(length = 8) {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }
  
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }
  
  /**
   * Create a new user in the appropriate school collection
   */
  static async createUser(schoolCode, userData) {
    try {
      const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
      
      // Generate user ID and password
      const userId = await this.generateUserId(schoolCode, userData.role);
      const plainPassword = this.generateRandomPassword();
      const hashedPassword = await this.hashPassword(plainPassword);
      
      // Determine collection based on role
      const collectionMap = {
        'admin': 'admins',
        'teacher': 'teachers', 
        'student': 'students',
        'parent': 'parents'
      };
      
      const collectionName = collectionMap[userData.role.toLowerCase()];
      if (!collectionName) {
        throw new Error(`Invalid role: ${userData.role}`);
      }
      
      const collection = connection.collection(collectionName);
      
      // Prepare user document
      const userDocument = {
        userId,
        email: userData.email,
        password: hashedPassword,
        temporaryPassword: plainPassword, // Store plain password for admin access
        role: userData.role.toLowerCase(),
        name: {
          firstName: userData.firstName || userData.name?.firstName || 'User',
          lastName: userData.lastName || userData.name?.lastName || 'Name',
          displayName: userData.displayName || userData.name?.displayName || `${userData.firstName || 'User'} ${userData.lastName || 'Name'}`
        },
        contact: {
          primaryPhone: userData.phone || userData.contact?.primaryPhone || '',
          secondaryPhone: userData.contact?.secondaryPhone || '',
          emergencyContact: userData.contact?.emergencyContact || ''
        },
        address: userData.address || {
          permanent: {
            street: 'Not provided',
            city: 'Not provided',
            state: 'Not provided',
            country: 'India',
            pincode: '000000'
          }
        },
        schoolCode,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userData.createdBy || null,
        loginAttempts: 0,
        lastLogin: null,
        profileImage: userData.profileImage || null
      };
      
      // Add role-specific fields
      if (userData.role.toLowerCase() === 'student') {
        userDocument.academicInfo = {
          class: userData.class || '',
          section: userData.section || '',
          rollNumber: userData.rollNumber || '',
          admissionNumber: userData.admissionNumber || userId,
          admissionDate: userData.admissionDate || new Date(),
          parentIds: userData.parentIds || []
        };
        
        // Karnataka SATS Personal Information
        userDocument.personal = {
          dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
          gender: userData.gender || 'male',
          bloodGroup: userData.bloodGroup || '',
          nationality: userData.nationality || 'Indian',
          religion: userData.religion || '',
          religionOther: userData.religionOther || '',
          caste: userData.caste || '',
          casteOther: userData.casteOther || '',
          category: userData.category || '',
          categoryOther: userData.categoryOther || '',
          motherTongue: userData.motherTongue || '',
          motherTongueOther: userData.motherTongueOther || '',
          
          // Karnataka SATS Specific Fields
          studentNameKannada: userData.studentNameKannada || '',
          ageYears: userData.ageYears || 0,
          ageMonths: userData.ageMonths || 0,
          socialCategory: userData.socialCategory || '',
          socialCategoryOther: userData.socialCategoryOther || '',
          studentCaste: userData.studentCaste || '',
          studentCasteOther: userData.studentCasteOther || '',
          studentAadhaar: userData.studentAadhaar || '',
          studentCasteCertNo: userData.studentCasteCertNo || '',
          
          // Additional SATS Fields
          specialCategory: userData.specialCategory || '',
          specialCategoryOther: userData.specialCategoryOther || '',
          
          // Economic Status
          belongingToBPL: userData.belongingToBPL || 'No',
          bplCardNo: userData.bplCardNo || '',
          bhagyalakshmiBondNo: userData.bhagyalakshmiBondNo || '',
          
          // Special Needs
          disability: userData.disability || 'Not Applicable',
          disabilityOther: userData.disabilityOther || ''
        };
        
        // Karnataka SATS Family Information
        userDocument.family = {
          father: {
            name: userData.fatherName || '',
            nameKannada: userData.fatherNameKannada || '',
            aadhaar: userData.fatherAadhaar || '',
            caste: userData.fatherCaste || '',
            casteOther: userData.fatherCasteOther || '',
            casteCertNo: userData.fatherCasteCertNo || '',
            occupation: userData.fatherOccupation || '',
            qualification: userData.fatherEducation || '',
            phone: userData.fatherPhone || userData.fatherMobile || '',
            email: userData.fatherEmail || ''
          },
          mother: {
            name: userData.motherName || '',
            nameKannada: userData.motherNameKannada || '',
            aadhaar: userData.motherAadhaar || '',
            caste: userData.motherCaste || '',
            casteOther: userData.motherCasteOther || '',
            casteCertNo: userData.motherCasteCertNo || '',
            occupation: userData.motherOccupation || '',
            qualification: userData.motherEducation || '',
            phone: userData.motherPhone || userData.motherMobile || '',
            email: userData.motherEmail || ''
          },
          guardian: {
            name: userData.guardianName || '',
            relationship: userData.guardianRelation || '',
            phone: userData.emergencyContactPhone || '',
            email: userData.parentEmail || ''
          }
        };
        
        // Banking Information
        userDocument.banking = {
          bankName: userData.bankName || '',
          accountNumber: userData.bankAccountNo || userData.bankAccountNumber || '',
          ifscCode: userData.bankIFSC || userData.ifscCode || '',
          accountHolderName: userData.accountHolderName || ''
        };
      } else if (userData.role.toLowerCase() === 'teacher') {
        userDocument.teachingInfo = {
          subjects: userData.subjects || [],
          classes: userData.classes || [],
          employeeId: userData.employeeId || userId,
          joinDate: userData.joinDate || new Date(),
          qualification: userData.qualification || '',
          experience: userData.experience || 0,
          designation: userData.designation || '',
          department: userData.department || ''
        };
        
        // Teacher Personal Information with "Other" fields
        userDocument.personal = {
          dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
          gender: userData.gender || 'male',
          bloodGroup: userData.bloodGroup || '',
          nationality: userData.nationality || 'Indian',
          religion: userData.religion || '',
          religionOther: userData.religionOther || '',
          caste: userData.caste || '',
          casteOther: userData.casteOther || '',
          category: userData.category || '',
          categoryOther: userData.categoryOther || '',
          motherTongue: userData.motherTongue || '',
          motherTongueOther: userData.motherTongueOther || '',
          aadhaar: userData.aadhaar || '',
          pan: userData.pan || '',
          
          // Disability information
          disability: userData.disability || 'Not Applicable',
          disabilityOther: userData.disabilityOther || ''
        };
        
        // Teacher Family Information
        userDocument.family = {
          father: {
            name: userData.fatherName || '',
            occupation: userData.fatherOccupation || '',
            caste: userData.fatherCaste || '',
            casteOther: userData.fatherCasteOther || ''
          },
          mother: {
            name: userData.motherName || '',
            occupation: userData.motherOccupation || '',
            caste: userData.motherCaste || '',
            casteOther: userData.motherCasteOther || ''
          },
          spouse: {
            name: userData.spouseName || '',
            occupation: userData.spouseOccupation || ''
          }
        };
      } else if (userData.role.toLowerCase() === 'admin') {
        userDocument.adminInfo = {
          permissions: userData.permissions || ['manage_users', 'view_reports'],
          employeeId: userData.employeeId || userId,
          joinDate: userData.joinDate || new Date(),
          department: userData.department || 'Administration'
        };
        
        // Admin Personal Information with "Other" fields
        userDocument.personal = {
          dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
          gender: userData.gender || 'male',
          bloodGroup: userData.bloodGroup || '',
          nationality: userData.nationality || 'Indian',
          religion: userData.religion || '',
          religionOther: userData.religionOther || '',
          caste: userData.caste || '',
          casteOther: userData.casteOther || '',
          category: userData.category || '',
          categoryOther: userData.categoryOther || '',
          motherTongue: userData.motherTongue || '',
          motherTongueOther: userData.motherTongueOther || '',
          aadhaar: userData.aadhaar || '',
          pan: userData.pan || '',
          
          // Disability information
          disability: userData.disability || 'Not Applicable',
          disabilityOther: userData.disabilityOther || ''
        };
      } else if (userData.role.toLowerCase() === 'parent') {
        userDocument.parentInfo = {
          children: userData.children || [],
          occupation: userData.occupation || '',
          relationToStudent: userData.relationToStudent || 'Parent'
        };
        
        // Parent Personal Information with "Other" fields
        userDocument.personal = {
          dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
          gender: userData.gender || 'male',
          bloodGroup: userData.bloodGroup || '',
          nationality: userData.nationality || 'Indian',
          religion: userData.religion || '',
          religionOther: userData.religionOther || '',
          caste: userData.caste || '',
          casteOther: userData.casteOther || '',
          category: userData.category || '',
          categoryOther: userData.categoryOther || '',
          motherTongue: userData.motherTongue || '',
          motherTongueOther: userData.motherTongueOther || '',
          aadhaar: userData.aadhaar || '',
          
          // Disability information
          disability: userData.disability || 'Not Applicable',
          disabilityOther: userData.disabilityOther || ''
        };
      }
      
      // Insert user
      const result = await collection.insertOne(userDocument);
      
      console.log(`👤 Created ${userData.role} user: ${userId} (${userData.email})`);
      
      return {
        success: true,
        user: {
          _id: result.insertedId,
          userId,
          email: userData.email,
          role: userData.role,
          name: userDocument.name,
          schoolCode
        },
        credentials: {
          userId,
          email: userData.email,
          password: plainPassword, // Return plain password for initial communication
          loginUrl: `/login/${schoolCode.toLowerCase()}`
        }
      };
      
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
  
  /**
   * Reset user password
   */
  static async resetUserPassword(schoolCode, userId) {
    try {
      const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
      
      // Find user in appropriate collection
      const collections = ['admins', 'teachers', 'students', 'parents'];
      let user = null;
      let userCollection = null;
      
      for (const collectionName of collections) {
        const collection = connection.collection(collectionName);
        
        // Build query - only use ObjectId if userId is a valid ObjectId format
        const query = { userId: userId };
        
        // Check if userId is a valid ObjectId format (24 character hex string)
        if (/^[0-9a-fA-F]{24}$/.test(userId)) {
          query.$or = [
            { _id: new ObjectId(userId) },
            { userId: userId }
          ];
          delete query.userId;
        }
        
        user = await collection.findOne(query);
        if (user) {
          userCollection = collection;
          break;
        }
      }
      
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      // Generate new password
      const newPassword = this.generateRandomPassword();
      const hashedPassword = await this.hashPassword(newPassword);
      
      // Update user password
      // Build update query - only use ObjectId if userId is a valid ObjectId format
      const updateQuery = { userId: userId };
      
      // Check if userId is a valid ObjectId format (24 character hex string)
      if (/^[0-9a-fA-F]{24}$/.test(userId)) {
        updateQuery.$or = [
          { _id: new ObjectId(userId) },
          { userId: userId }
        ];
        delete updateQuery.userId;
      }
      
      await userCollection.updateOne(
        updateQuery,
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date(),
            loginAttempts: 0 // Reset login attempts
          }
        }
      );
      
      console.log(`🔑 Password reset for user: ${userId}`);
      
      return {
        success: true,
        credentials: {
          userId,
          email: user.email,
          password: newPassword,
          message: 'Password has been reset successfully'
        }
      };
      
    } catch (error) {
      console.error('Error resetting password:', error);
      throw error;
    }
  }
  
  /**
   * Get user by ID or email from school database
   */
  static async getUserByIdOrEmail(schoolCode, identifier, includePassword = false) {
    try {
      const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
      const collections = ['admins', 'teachers', 'students', 'parents'];
      
      for (const collectionName of collections) {
        const collection = connection.collection(collectionName);
        const user = await collection.findOne({
          $or: [
            { _id: ObjectId.isValid(identifier) ? new ObjectId(identifier) : null },
            { userId: identifier },
            { email: identifier }
          ].filter(query => query !== null && Object.values(query)[0] !== null)
        });
        
        if (user) {
          // Optionally remove password from return object
          if (includePassword) {
            return {
              ...user,
              collection: collectionName
            };
          } else {
            const { password, ...userWithoutPassword } = user;
            return {
              ...userWithoutPassword,
              collection: collectionName
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }
  
  /**
   * Get all users from a school by role
   */
  static async getUsersByRole(schoolCode, role) {
    try {
      console.log(`🔍 Getting ${role}s from school_${schoolCode.toLowerCase()}`);
      
      const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
      const collectionMap = {
        'admin': 'admins',
        'teacher': 'teachers',
        'student': 'students', 
        'parent': 'parents'
      };
      
      const collectionName = collectionMap[role.toLowerCase()];
      if (!collectionName) {
        throw new Error(`Invalid role: ${role}`);
      }
      
      console.log(`📂 Accessing collection: ${collectionName} in school_${schoolCode.toLowerCase()}`);
      
      const collection = connection.collection(collectionName);
      const users = await collection.find(
        { _placeholder: { $ne: true } },
        { projection: { password: 0 } } // Exclude hashed password only, keep temporaryPassword
      ).toArray();
      
      console.log(`✅ Found ${users.length} ${role}s in ${collectionName} collection`);
      console.log(`🔑 Sample user fields:`, users.length > 0 ? Object.keys(users[0]) : 'No users');
      
      return users;
    } catch (error) {
      console.error(`❌ Error getting ${role}s from school_${schoolCode.toLowerCase()}:`, error);
      throw error;
    }
  }
  
  /**
   * Update user information
   */
  static async updateUser(schoolCode, userId, updateData) {
    try {
      const connection = await SchoolDatabaseManager.getSchoolConnection(schoolCode);
      const collections = ['admins', 'teachers', 'students', 'parents'];
      
      let userCollection = null;
      for (const collectionName of collections) {
        const collection = connection.collection(collectionName);
        // Try both _id and userId to cover different scenarios
        // Only try ObjectId if userId looks like a valid ObjectId (24 hex chars)
        const query = { userId: userId };
        if (userId.match(/^[0-9a-fA-F]{24}$/)) {
          query.$or = [
            { _id: new ObjectId(userId) },
            { userId: userId }
          ];
          delete query.userId;
        }
        
        const user = await collection.findOne(query);
        if (user) {
          userCollection = collection;
          break;
        }
      }
      
      if (!userCollection) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      // Handle password update separately
      if (updateData.password && updateData.password.trim()) {
        updateData.password = await this.hashPassword(updateData.password);
      } else {
        // Remove password field if empty to avoid overwriting with empty string
        delete updateData.password;
      }
      
      // Remove sensitive fields that shouldn't be updated
      delete updateData.userId;
      delete updateData._id;
      delete updateData.schoolCode;
      
      updateData.updatedAt = new Date();
      
      // Create the same query pattern as we used for finding the user
      const updateQuery = { userId: userId };
      if (userId.match(/^[0-9a-fA-F]{24}$/)) {
        updateQuery.$or = [
          { _id: new ObjectId(userId) },
          { userId: userId }
        ];
        delete updateQuery.userId;
      }
      
      const result = await userCollection.updateOne(
        updateQuery,
        { $set: updateData }
      );
      
      if (result.modifiedCount === 0) {
        throw new Error('No changes made to user');
      }
      
      console.log(`📝 Updated user: ${userId}`);
      return { success: true, message: 'User updated successfully' };
      
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }
}

module.exports = UserGenerator;
