const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const School = require('../models/School');
// const User = require('../models/User'); // Not directly used
const { generateSequentialUserId } = require('./userController');
const { generateRandomPassword, generateStudentPasswordFromDOB } = require('../utils/passwordGenerator');
const SchoolDatabaseManager = require('../utils/databaseManager');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { uploadToCloudinary, deleteFromCloudinary, extractPublicId, deleteLocalFile } = require('../config/cloudinary');

// Get all users for a school with standardized format
exports.getAllUsers = async (req, res) => {
  try {
    const { schoolCode } = req.params;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🔍 Fetching all users for school: ${upperSchoolCode}`);

    // Find the school details from the central database
    const school = await School.findOne({ code: upperSchoolCode });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    // Get connection to the specific school's database
    let connection;
    try {
      connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode);
    } catch (connError) {
      console.error(`DB Connect Error for ${upperSchoolCode} in getAllUsers: ${connError.message}`);
      return res.status(500).json({ success: false, message: 'Could not connect to school database' });
    }
    if (!connection) {
      // This case might occur if getSchoolConnection returns null/undefined without throwing
      return res.status(500).json({ success: false, message: 'Database connection object invalid' });
    }

    const db = connection.db;
    const collections = ['admins', 'teachers', 'students', 'parents'];
    let allUsers = [];

    // Iterate over each user collection for the school
    for (const collection of collections) {
      try {
        // Find active users in the current collection
        // Ensure temporaryPassword is fetched if it exists
        const users = await db.collection(collection).find({ isActive: { $ne: false } }).toArray();

        // DEBUG: Log studentDetails structure
        if (collection === 'students' && users.length > 0) {
          const sampleUser = users[0];
          console.log('\n=== DEBUG - SAMPLE STUDENT DOCUMENT STRUCTURE ===');
          console.log('userId:', sampleUser.userId);
          console.log('Top-level keys:', Object.keys(sampleUser).filter(k => k !== 'password'));
          console.log('\nstudentDetails keys:', Object.keys(sampleUser.studentDetails || {}));
          console.log('studentDetails content:', JSON.stringify(sampleUser.studentDetails, null, 2));
          
          // Check if fields are at root level
          console.log('\nChecking root-level fields:');
          console.log('  fatherName:', sampleUser.fatherName);
          console.log('  motherName:', sampleUser.motherName);
          console.log('  dateOfBirth:', sampleUser.dateOfBirth);
          console.log('  religion:', sampleUser.religion);
          console.log('  caste:', sampleUser.caste);
          console.log('=== END DEBUG ===\n');
        }

        // Process each user found into a standardized format
        const processedUsers = users.map(user => {
          // --- Name Logic ---
          const firstName = user.name?.firstName?.trim() || '';
          const lastName = user.name?.lastName?.trim() || '';
          let displayName = user.name?.displayName?.trim();
          if (!displayName) {
            displayName = `${firstName} ${lastName}`.trim();
          }
          if (!displayName) { // Final fallback
            displayName = user.userId || user.email || 'Unknown User';
          }
          // --- End Name Logic ---

          // Construct the base user object to return
          const baseUser = {
            _id: user._id,
            userId: user.userId,
            schoolCode: user.schoolCode || upperSchoolCode,
            // Determine role based on user record or collection name
            role: user.role || collection.slice(0, -1),
            email: user.email || 'no-email@example.com',
            // Default isActive to true if undefined or null
            isActive: user.isActive !== false,
            createdAt: user.createdAt || new Date(0).toISOString(),
            updatedAt: user.updatedAt || user.createdAt || new Date(0).toISOString(),

            // Name details
            name: {
              firstName: firstName,
              middleName: user.name?.middleName?.trim() || '',
              lastName: lastName,
              displayName: displayName
            },

            // Contact details
            contact: {
              primaryPhone: user.contact?.primaryPhone || user.phone || 'No phone',
              secondaryPhone: user.contact?.secondaryPhone || '',
              whatsappNumber: user.contact?.whatsappNumber || '',
              emergencyContact: user.contact?.emergencyContact
            },
            
            // 💡 FIX: Include profileImage here
            profileImage: user.profileImage || null, 

            // --- Conditionally add temporaryPassword for teachers ---
            ...((user.role === 'teacher' || collection === 'teachers') ? // Check both user.role and collection name
              { temporaryPassword: user.temporaryPassword || null } // Include password, default to null if missing
              : {} // Empty object otherwise
            ),
            // --------------------------------------------------------

            // --- Conditionally add class/section for students ---
            ...((user.role === 'student' || collection === 'students') && user.studentDetails ?
              {
                'class': user.studentDetails.currentClass || 'Not assigned',
                'section': user.studentDetails.currentSection || 'Not assigned'
              }
              : {}
            ),
            // ----------------------------------------------------

            // Include full details - return entire studentDetails object as-is
            ...(user.studentDetails ? { studentDetails: user.studentDetails } : {}),
            ...(user.teacherDetails ? { teacherDetails: user.teacherDetails } : {}),
            ...(user.adminDetails ? { adminDetails: user.adminDetails } : {}),
            ...(user.parentDetails ? { parentDetails: user.parentDetails } : {}), // Added parentDetails

            passwordChangeRequired: user.passwordChangeRequired || false,
            schoolAccess: user.schoolAccess
          }; // End baseUser object

          return baseUser;
        }); // End map

        allUsers.push(...processedUsers);
      } catch (collectionError) {
        console.warn(`Error fetching from collection ${collection} for school ${upperSchoolCode}: ${collectionError.message}`);
        // Log error only if it's not a simple 'NamespaceNotFound' (collection doesn't exist yet)
        if (collectionError.codeName !== 'NamespaceNotFound') {
          console.error(collectionError);
        }
      }
    } // End for loop over collections

    console.log(`✅ Found ${allUsers.length} users for school ${upperSchoolCode}`);

    // Sort users alphabetically by displayName before sending response
    allUsers.sort((a, b) => a.name.displayName.localeCompare(b.name.displayName));


    // Send the combined list of users
    res.json({
      success: true,
      data: allUsers,
      total: allUsers.length,
      // Provide a breakdown count per role
      breakdown: {
        students: allUsers.filter(u => u.role === 'student').length,
        teachers: allUsers.filter(u => u.role === 'teacher').length,
        admins: allUsers.filter(u => u.role === 'admin').length,
        parents: allUsers.filter(u => u.role === 'parent').length
      }
    });

  } catch (error) {
    console.error(`❌ Critical Error fetching users for school ${req.params.schoolCode}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: error.message
    });
  }
};

// --- OTHER FUNCTIONS (getUserById, createUser, updateUser, deleteUser, resetPassword) ---
// Keep these functions exactly as they were in the previous correct version.
// (Omitted here for brevity, but ensure they are present in your file)
// Get user by ID
exports.getUserById = async (req, res) => { /* ... Keep code from previous correct version ... */
  try {
    const { schoolCode, userId: userIdToFind } = req.params;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🔍 Fetching user ${userIdToFind} for school: ${upperSchoolCode}`);

    let connection;
    try { connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode); }
    catch (connError) { return res.status(500).json({ success: false, message: 'Could not connect to school database' }); }
    if (!connection) { return res.status(500).json({ success: false, message: 'Database connection object invalid' }); }

    const db = connection.db;
    const collections = ['admins', 'teachers', 'students', 'parents'];
    let user = null;

    const isObjectId = ObjectId.isValid(userIdToFind);
    const query = isObjectId
      ? { $or: [{ userId: userIdToFind }, { _id: new ObjectId(userIdToFind) }] }
      : { userId: userIdToFind };

    for (const collection of collections) {
      try {
        const foundUser = await db.collection(collection).findOne(query);
        if (foundUser) {
          user = foundUser;
          break;
        }
      } catch (error) {
        console.warn(`Error searching in ${collection} for ${userIdToFind}: ${error.message}`);
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { password, temporaryPassword, passwordHistory, ...userWithoutSensitiveData } = user;

    res.json({ success: true, data: userWithoutSensitiveData });

  } catch (error) {
    console.error(`Error fetching user ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
  }
};

// Create new user
exports.createUser = async (req, res) => { /* ... Keep code from previous correct version ... */
  try {
    const { schoolCode } = req.params;
    const userData = req.body;
    const creatingUserId = req.user?._id;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🔥 Creating user for school: ${upperSchoolCode}`, userData);

    const school = await School.findOne({ code: upperSchoolCode });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found' });
    }

    if (!userData.firstName || !userData.lastName || !userData.email || !userData.role) {
      return res.status(400).json({ success: false, message: 'First name, last name, email, and role are required' });
    }
    const role = userData.role.toLowerCase();
    if (!['admin', 'teacher', 'student', 'parent'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role specified' });
    }
    const email = userData.email.trim().toLowerCase();

    let connection;
    try { connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode); }
    catch (connError) { return res.status(500).json({ success: false, message: 'Could not connect to school database' }); }
    if (!connection) { return res.status(500).json({ success: false, message: 'Database connection object invalid' }); }
    const db = connection.db;

    const collectionsToCheck = ['admins', 'teachers', 'students', 'parents'];
    for (const collection of collectionsToCheck) {
      try {
        const existingUser = await db.collection(collection).findOne({ email: email });
        if (existingUser) {
          return res.status(400).json({ success: false, message: `Email '${email}' already exists in collection '${collection}' for this school.` });
        }
      } catch (error) { if (error.codeName !== 'NamespaceNotFound') { console.warn(`Error checking email in ${collection}: ${error.message}`); } }
    }

    const userId = await generateSequentialUserId(upperSchoolCode, role);

    let tempPassword;
    if (userData.useGeneratedPassword !== false) {
      if (role === 'student' && userData.dateOfBirth) {
        try { tempPassword = generateStudentPasswordFromDOB(userData.dateOfBirth); }
        catch (dobError) { tempPassword = generateRandomPassword(8); }
      } else { tempPassword = generateRandomPassword(8); }
    } else if (userData.customPassword) {
      tempPassword = userData.customPassword;
      if (tempPassword.length < 6) { return res.status(400).json({ success: false, message: 'Custom password must be at least 6 characters.' }); }
    } else { tempPassword = generateRandomPassword(8); }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = {
      _id: new ObjectId(),
      userId,
      schoolCode: upperSchoolCode,
      schoolId: school._id,
      name: { firstName: userData.firstName.trim(), middleName: userData.middleName?.trim() || '', lastName: userData.lastName.trim(), displayName: `${userData.firstName.trim()} ${userData.lastName.trim()}`.trim() },
      email: email,
      password: hashedPassword,
      temporaryPassword: tempPassword,
      passwordChangeRequired: userData.passwordChangeRequired !== false,
      role: role,
      contact: {
        primaryPhone: userData.primaryPhone?.trim() || '', secondaryPhone: userData.secondaryPhone?.trim() || '', whatsappNumber: userData.whatsappNumber?.trim() || '',
        emergencyContact: userData.emergencyContactName ? { name: userData.emergencyContactName.trim(), relationship: userData.emergencyContactRelation?.trim() || '', phone: userData.emergencyContactPhone?.trim() || '' } : undefined
      },
      address: {
        permanent: { street: userData.permanentStreet?.trim() || '', area: userData.permanentArea?.trim() || '', city: userData.permanentCity?.trim() || '', state: userData.permanentState?.trim() || '', country: userData.permanentCountry || 'India', pincode: userData.permanentPincode?.trim() || '', landmark: userData.permanentLandmark?.trim() || '' },
        current: userData.sameAsPermanent === false ? { street: userData.currentStreet?.trim() || '', area: userData.currentArea?.trim() || '', city: userData.currentCity?.trim() || '', state: userData.currentState?.trim() || '', country: userData.currentCountry || 'India', pincode: userData.currentPincode?.trim() || '', landmark: userData.currentLandmark?.trim() || '' } : undefined,
        sameAsPermanent: userData.sameAsPermanent !== false
      },
      identity: { aadharNumber: userData.aadharNumber?.trim() || '', panNumber: userData.panNumber?.trim() || '' },
      isActive: userData.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
      schoolAccess: { joinedDate: userData.joiningDate ? new Date(userData.joiningDate) : new Date(), assignedBy: creatingUserId, status: 'active', accessLevel: 'full' },
      auditTrail: { createdBy: creatingUserId, createdAt: new Date() }
    };

    // Add Role-Specific Details
    if (role === 'student') {
      newUser.studentDetails = {
        currentClass: userData.currentClass?.trim() || '', currentSection: userData.currentSection?.trim() || '', rollNumber: userData.rollNumber?.trim() || '', admissionNumber: userData.admissionNumber?.trim() || '',
        admissionDate: userData.admissionDate ? new Date(userData.admissionDate) : null, dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null, gender: userData.gender?.toLowerCase() || 'male',
        fatherName: userData.fatherName?.trim() || '', fatherPhone: userData.fatherPhone?.trim() || '', motherName: userData.motherName?.trim() || '', motherPhone: userData.motherPhone?.trim() || '',
        bloodGroup: userData.bloodGroup?.trim() || '', nationality: userData.nationality || 'Indian', religion: userData.religion?.trim() || '', caste: userData.caste?.trim() || '', category: userData.category?.trim() || '',
        fatherEmail: userData.fatherEmail?.trim().toLowerCase() || '', fatherOccupation: userData.fatherOccupation?.trim() || '', fatherAnnualIncome: userData.fatherAnnualIncome || 0,
        motherEmail: userData.motherEmail?.trim().toLowerCase() || '', motherOccupation: userData.motherOccupation?.trim() || '', motherAnnualIncome: userData.motherAnnualIncome || 0,
        guardianName: userData.guardianName?.trim() || '', guardianRelationship: userData.guardianRelationship?.trim() || '', guardianPhone: userData.guardianPhone?.trim() || '', guardianEmail: userData.guardianEmail?.trim().toLowerCase() || '',
        previousSchoolName: userData.previousSchoolName?.trim() || '', previousBoard: userData.previousBoard?.trim() || '', lastClass: userData.lastClass?.trim() || '', tcNumber: userData.tcNumber?.trim() || '',
        transportMode: userData.transportMode?.trim() || '', busRoute: userData.busRoute?.trim() || '', pickupPoint: userData.pickupPoint?.trim() || '',
        feeCategory: userData.feeCategory?.trim() || '', concessionType: userData.concessionType?.trim() || '', concessionPercentage: userData.concessionPercentage || 0,
        bankName: userData.bankName?.trim() || '', bankAccountNo: userData.bankAccountNo?.trim() || '', bankIFSC: userData.bankIFSC?.trim() || '',
        medicalConditions: userData.medicalConditions?.trim() || '', allergies: userData.allergies?.trim() || '', specialNeeds: userData.specialNeeds?.trim() || ''
      };
    }
    else if (role === 'teacher') {
      newUser.teacherDetails = {
        employeeId: userData.employeeId?.trim() || userId, subjects: Array.isArray(userData.subjects) ? userData.subjects.map(s => String(s).trim()) : [], qualification: userData.qualification?.trim() || '', experience: userData.experience || 0,
        joiningDate: userData.joiningDate ? new Date(userData.joiningDate) : null,
        specialization: userData.specialization?.trim() || '', previousExperience: userData.previousExperience?.trim() || '', dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
        gender: userData.gender?.toLowerCase() || 'other', bloodGroup: userData.bloodGroup?.trim() || '', nationality: userData.nationality || 'Indian', religion: userData.religion?.trim() || '',
        bankName: userData.bankName?.trim() || '', bankAccountNo: userData.bankAccountNo?.trim() || '', bankIFSC: userData.bankIFSC?.trim() || ''
      };
    }
    else if (role === 'admin') {
      newUser.adminDetails = {
        employeeId: userData.employeeId?.trim() || userId, designation: userData.designation?.trim() || '', qualification: userData.qualification?.trim() || '', experience: userData.experience || 0,
        joiningDate: userData.joiningDate ? new Date(userData.joiningDate) : null,
        previousExperience: userData.previousExperience?.trim() || '', dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : null,
        gender: userData.gender?.toLowerCase() || 'other', bloodGroup: userData.bloodGroup?.trim() || '', nationality: userData.nationality || 'Indian',
        bankName: userData.bankName?.trim() || '', bankAccountNo: userData.bankAccountNo?.trim() || '', bankIFSC: userData.bankIFSC?.trim() || ''
      };
    }


    const collectionName = `${role}s`;
    const result = await db.collection(collectionName).insertOne(newUser);

    if (!result.insertedId) { throw new Error(`Failed to insert user ${userId} into ${collectionName}`); }

    console.log(`✅ User created successfully: ${userId} in ${collectionName}`);

    res.status(201).json({
      success: true, message: 'User created successfully',
      data: { _id: result.insertedId, userId: newUser.userId, name: newUser.name.displayName, email: newUser.email, role: newUser.role, temporaryPassword: tempPassword }
    });

  } catch (error) {
    console.error(`Error creating user:`, error);
    res.status(500).json({ success: false, message: 'Error creating user', error: error.message });
  }
};

// Update user
exports.updateUser = async (req, res) => { /* ... Keep code from previous correct version ... */
  try {
    const { schoolCode, userId: userIdToUpdate } = req.params;
    const updateData = req.body;
    const updatingUserId = req.user?._id;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🔄 Updating user ${userIdToUpdate} for school: ${upperSchoolCode}`);
    console.log('📦 Received updateData keys:', Object.keys(updateData));
    console.log('📦 Student-specific fields received:', {
      fatherName: updateData.fatherName,
      motherName: updateData.motherName,
      fatherPhone: updateData.fatherPhone,
      motherPhone: updateData.motherPhone,
      class: updateData.class,
      section: updateData.section,
      dateOfBirth: updateData.dateOfBirth,
      gender: updateData.gender,
      religion: updateData.religion,
      caste: updateData.caste,
      studentCaste: updateData.studentCaste,
      bankName: updateData.bankName,
      bankAccountNumber: updateData.bankAccountNumber,
      ifscCode: updateData.ifscCode
    });
    console.log('📦 Address fields received:', {
      permanentCity: updateData.permanentCity,
      permanentPincode: updateData.permanentPincode,
      permanentStreet: updateData.permanentStreet,
      permanentState: updateData.permanentState
    });

    let connection;
    try { connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode); }
    catch (connError) { return res.status(500).json({ success: false, message: 'Could not connect to school database' }); }
    if (!connection) { return res.status(500).json({ success: false, message: 'Database connection object invalid' }); }
    const db = connection.db;

    const collectionsToSearch = ['admins', 'teachers', 'students', 'parents'];
    let user = null;
    let collectionName = null;

    const isObjectId = ObjectId.isValid(userIdToUpdate);
    const query = isObjectId
      ? { $or: [{ userId: userIdToUpdate }, { _id: new ObjectId(userIdToUpdate) }] }
      : { userId: userIdToUpdate };

    for (const collection of collectionsToSearch) {
      try {
        const foundUser = await db.collection(collection).findOne(query);
        if (foundUser) { user = foundUser; collectionName = collection; break; }
      } catch (error) { console.warn(`Error searching ${collection} for ${userIdToUpdate}: ${error.message}`); }
    }

    if (!user) { return res.status(404).json({ success: false, message: 'User not found' }); }

    const updateFields = {};
    let changesMade = false;

    const setField = (fieldPath, newValue) => {
      let currentValue = user;
      try { fieldPath.split('.').forEach(part => { currentValue = currentValue?.[part]; }); }
      catch (e) { currentValue = undefined; }

      const processedNewValue = typeof newValue === 'string' ? newValue.trim() : newValue;
      const processedCurrentValue = currentValue === null || currentValue === undefined ? currentValue : (typeof currentValue === 'string' ? currentValue.trim() : currentValue);

      if (JSON.stringify(processedNewValue) !== JSON.stringify(processedCurrentValue)) {
        if (!(processedNewValue === '' && processedCurrentValue === undefined)) {
          updateFields[fieldPath] = processedNewValue;
          changesMade = true;
        } else if (processedCurrentValue !== undefined) {
          updateFields[fieldPath] = processedNewValue;
          changesMade = true;
        }
      }
    };

    // Update basic info
    if (updateData.firstName !== undefined || updateData.lastName !== undefined || updateData.middleName !== undefined) {
      const newName = { ...user.name };
      if (updateData.firstName !== undefined) newName.firstName = updateData.firstName.trim();
      if (updateData.lastName !== undefined) newName.lastName = updateData.lastName.trim();
      if (updateData.middleName !== undefined) newName.middleName = updateData.middleName?.trim() || '';
      newName.displayName = `${newName.firstName} ${newName.lastName}`.trim();

      if (JSON.stringify(newName) !== JSON.stringify(user.name)) {
        if (newName.firstName !== user.name?.firstName) updateFields['name.firstName'] = newName.firstName;
        if (newName.lastName !== user.name?.lastName) updateFields['name.lastName'] = newName.lastName;
        if (newName.middleName !== user.name?.middleName) updateFields['name.middleName'] = newName.middleName;
        if (newName.displayName !== user.name?.displayName) updateFields['name.displayName'] = newName.displayName;
        changesMade = true;
      }
    }
    if (updateData.email && updateData.email.trim().toLowerCase() !== user.email) {
      const newEmail = updateData.email.trim().toLowerCase();
      let emailExists = false;
      for (const col of collectionsToSearch) {
        try {
          const existing = await db.collection(col).findOne({ email: newEmail, _id: { $ne: user._id } });
          if (existing) { emailExists = true; break; }
        } catch (e) {/* ignore */ }
      }
      if (emailExists) { return res.status(400).json({ success: false, message: `Email '${newEmail}' already exists for another user.` }); }
      setField('email', newEmail);
    }
    if (updateData.isActive !== undefined && updateData.isActive !== user.isActive) {
      setField('isActive', updateData.isActive);
    }

    // Update Contact
    if (updateData.primaryPhone !== undefined) setField('contact.primaryPhone', updateData.primaryPhone);
    if (updateData.secondaryPhone !== undefined) setField('contact.secondaryPhone', updateData.secondaryPhone || '');
    if (updateData.whatsappNumber !== undefined) setField('contact.whatsappNumber', updateData.whatsappNumber || '');

    // Update Permanent Address
    if (updateData.permanentStreet !== undefined) setField('address.permanent.street', updateData.permanentStreet);
    if (updateData.permanentArea !== undefined) setField('address.permanent.area', updateData.permanentArea);
    if (updateData.permanentCity !== undefined) setField('address.permanent.city', updateData.permanentCity);
    if (updateData.permanentState !== undefined) setField('address.permanent.state', updateData.permanentState);
    if (updateData.permanentPincode !== undefined) setField('address.permanent.pincode', updateData.permanentPincode);
    if (updateData.permanentCountry !== undefined) setField('address.permanent.country', updateData.permanentCountry || 'India');
    if (updateData.permanentLandmark !== undefined) setField('address.permanent.landmark', updateData.permanentLandmark);

    // Update Current Address & sameAsPermanent flag
    if (updateData.sameAsPermanent !== undefined) setField('address.sameAsPermanent', updateData.sameAsPermanent);
    if (updateData.sameAsPermanent === false) {
      if (updateData.currentStreet !== undefined) setField('address.current.street', updateData.currentStreet);
      if (updateData.currentArea !== undefined) setField('address.current.area', updateData.currentArea);
      if (updateData.currentCity !== undefined) setField('address.current.city', updateData.currentCity);
      if (updateData.currentState !== undefined) setField('address.current.state', updateData.currentState);
      if (updateData.currentPincode !== undefined) setField('address.current.pincode', updateData.currentPincode);
      if (updateData.currentCountry !== undefined) setField('address.current.country', updateData.currentCountry || 'India');
      if (updateData.currentLandmark !== undefined) setField('address.current.landmark', updateData.currentLandmark);
    } else if (updateData.sameAsPermanent === true && user.address?.current) {
      updateFields['address.current'] = undefined;
      changesMade = true;
    }

    // Handle profile image upload with Cloudinary
    if (req.file) {
      let tempCompressedPath = null;
      
      try {
        console.log(`📸 Original image: ${req.file.originalname}, Size: ${(req.file.size / 1024).toFixed(2)}KB`);
        
        // Create temp directory for compression
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Generate unique filename with .jpg extension (Sharp will convert to JPEG)
        const timestamp = Date.now();
        const filename = `${user.userId}_${timestamp}.jpg`;
        tempCompressedPath = path.join(tempDir, filename);

        // Compress image using Sharp to ~30KB
        console.log('🔄 Compressing image with Sharp...');
        const sharpInstance = sharp(req.file.path);
        await sharpInstance
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toFile(tempCompressedPath);
        
        // Release Sharp resources
        sharpInstance.destroy();
        
        // Check file size and re-compress if needed
        let stats = fs.statSync(tempCompressedPath);
        let quality = 60;
        
        while (stats.size > 30 * 1024 && quality > 20) {
          quality -= 10;
          console.log(`🔄 Re-compressing with quality ${quality}...`);
          const recompressInstance = sharp(req.file.path);
          await recompressInstance
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality })
            .toFile(tempCompressedPath);
          recompressInstance.destroy();
          stats = fs.statSync(tempCompressedPath);
        }
        
        console.log(`✅ Compressed image: ${(stats.size / 1024).toFixed(2)}KB (quality: ${quality})`);
        
        // Upload to Cloudinary
        const cloudinaryFolder = `profiles/${upperSchoolCode}`;
        const publicId = `${user.userId}_${timestamp}`;
        const uploadResult = await uploadToCloudinary(tempCompressedPath, cloudinaryFolder, publicId);
        
        const newImageUrl = uploadResult.secure_url;
        
        // Extract old image public ID for deletion (check both profileImage and profilePicture)
        const currentProfileImage = user.profileImage || user.profilePicture;
        console.log(`🔍 DEBUG: Current user.profileImage:`, user.profileImage);
        console.log(`🔍 DEBUG: Current user.profilePicture:`, user.profilePicture);
        console.log(`🔍 DEBUG: Using currentProfileImage:`, currentProfileImage);
        console.log(`🔍 DEBUG: User role:`, user.role);
        console.log(`🔍 DEBUG: Collection name:`, collectionName);
        const oldImagePublicId = currentProfileImage ? extractPublicId(currentProfileImage) : null;
        console.log(`🔍 DEBUG: Extracted oldImagePublicId:`, oldImagePublicId);
        
        // CRITICAL: Set profileImage directly and mark changes as made
        console.log(`🔍 DEBUG: Before setting profileImage - updateFields:`, JSON.stringify(updateFields));
        console.log(`🔍 DEBUG: changesMade before:`, changesMade);
        
        updateFields['profileImage'] = newImageUrl;
        changesMade = true;
        
        console.log(`🔍 DEBUG: After setting profileImage - updateFields:`, JSON.stringify(updateFields));
        console.log(`🔍 DEBUG: changesMade after:`, changesMade);
        console.log(`✅ Profile image will be saved to DB: ${newImageUrl}`);
        console.log(`📝 Old image public ID (will delete after DB update): ${oldImagePublicId || 'None'}`);
        
        // Store cleanup info for deletion AFTER successful database update
        req.imageCleanup = {
          oldImagePublicId: oldImagePublicId,
          tempFilePath: req.file.path,
          tempCompressedPath: tempCompressedPath
        };
      } catch (error) {
        console.error('❌ Error handling profile image upload:', error);
        
        // Clean up temp files immediately on error
        deleteLocalFile(req.file.path);
        if (tempCompressedPath) {
          deleteLocalFile(tempCompressedPath);
        }
      }
    }
    
    // --- Update Role-Specific Details using setField ---
    const rolePrefix = `${user.role}Details`;
    if (user.role === 'student') {
      // Academic Information
      if (updateData.currentClass !== undefined || updateData.class !== undefined) setField(`${rolePrefix}.currentClass`, updateData.currentClass || updateData.class);
      if (updateData.currentSection !== undefined || updateData.section !== undefined) setField(`${rolePrefix}.currentSection`, updateData.currentSection || updateData.section);
      if (updateData.rollNumber !== undefined) setField(`${rolePrefix}.rollNumber`, updateData.rollNumber);
      if (updateData.admissionNumber !== undefined) setField(`${rolePrefix}.admissionNumber`, updateData.admissionNumber);
      if (updateData.admissionDate !== undefined) setField(`${rolePrefix}.admissionDate`, updateData.admissionDate ? new Date(updateData.admissionDate) : null);
      if (updateData.dateOfBirth !== undefined) setField(`${rolePrefix}.dateOfBirth`, updateData.dateOfBirth ? new Date(updateData.dateOfBirth) : null);
      if (updateData.gender !== undefined) setField(`${rolePrefix}.gender`, updateData.gender);
      if (updateData.academicYear !== undefined) setField(`${rolePrefix}.academicYear`, updateData.academicYear);
      
      // Family Information
      if (updateData.fatherName !== undefined) setField(`${rolePrefix}.fatherName`, updateData.fatherName);
      if (updateData.fatherPhone !== undefined) setField(`${rolePrefix}.fatherPhone`, updateData.fatherPhone);
      if (updateData.fatherEmail !== undefined) setField(`${rolePrefix}.fatherEmail`, updateData.fatherEmail);
      if (updateData.fatherOccupation !== undefined) setField(`${rolePrefix}.fatherOccupation`, updateData.fatherOccupation);
      if (updateData.motherName !== undefined) setField(`${rolePrefix}.motherName`, updateData.motherName);
      if (updateData.motherPhone !== undefined) setField(`${rolePrefix}.motherPhone`, updateData.motherPhone);
      if (updateData.motherEmail !== undefined) setField(`${rolePrefix}.motherEmail`, updateData.motherEmail);
      if (updateData.motherOccupation !== undefined) setField(`${rolePrefix}.motherOccupation`, updateData.motherOccupation);
      if (updateData.guardianName !== undefined) setField(`${rolePrefix}.guardianName`, updateData.guardianName);
      if (updateData.guardianRelation !== undefined || updateData.guardianRelationship !== undefined) setField(`${rolePrefix}.guardianRelationship`, updateData.guardianRelation || updateData.guardianRelationship);
      
      // Personal Information
      if (updateData.bloodGroup !== undefined) setField(`${rolePrefix}.bloodGroup`, updateData.bloodGroup);
      if (updateData.nationality !== undefined) setField(`${rolePrefix}.nationality`, updateData.nationality);
      if (updateData.religion !== undefined) setField(`${rolePrefix}.religion`, updateData.religion);
      if (updateData.caste !== undefined || updateData.studentCaste !== undefined) setField(`${rolePrefix}.caste`, updateData.caste || updateData.studentCaste);
      if (updateData.category !== undefined || updateData.socialCategory !== undefined) setField(`${rolePrefix}.category`, updateData.category || updateData.socialCategory);
      
      // Previous School
      if (updateData.previousSchoolName !== undefined) setField(`${rolePrefix}.previousSchoolName`, updateData.previousSchoolName);
      if (updateData.previousBoard !== undefined) setField(`${rolePrefix}.previousBoard`, updateData.previousBoard);
      if (updateData.lastClass !== undefined) setField(`${rolePrefix}.lastClass`, updateData.lastClass);
      if (updateData.tcNumber !== undefined) setField(`${rolePrefix}.tcNumber`, updateData.tcNumber);
      
      // Transport
      if (updateData.transportMode !== undefined) setField(`${rolePrefix}.transportMode`, updateData.transportMode);
      if (updateData.busRoute !== undefined) setField(`${rolePrefix}.busRoute`, updateData.busRoute);
      if (updateData.pickupPoint !== undefined) setField(`${rolePrefix}.pickupPoint`, updateData.pickupPoint);
      
      // Banking
      if (updateData.bankName !== undefined) setField(`${rolePrefix}.bankName`, updateData.bankName);
      if (updateData.bankAccountNo !== undefined || updateData.bankAccountNumber !== undefined) setField(`${rolePrefix}.bankAccountNo`, updateData.bankAccountNo || updateData.bankAccountNumber);
      if (updateData.ifscCode !== undefined || updateData.bankIFSC !== undefined) setField(`${rolePrefix}.bankIFSC`, updateData.ifscCode || updateData.bankIFSC);
      
      // Medical & Special Needs
      if (updateData.medicalConditions !== undefined) setField(`${rolePrefix}.medicalConditions`, updateData.medicalConditions);
      if (updateData.allergies !== undefined) setField(`${rolePrefix}.allergies`, updateData.allergies);
      if (updateData.specialNeeds !== undefined) setField(`${rolePrefix}.specialNeeds`, updateData.specialNeeds);
      if (updateData.disability !== undefined) setField(`${rolePrefix}.disability`, updateData.disability);
      if (updateData.isRTECandidate !== undefined) setField(`${rolePrefix}.isRTECandidate`, updateData.isRTECandidate);
      
      // Mother Tongue
      if (updateData.motherTongue !== undefined) setField(`${rolePrefix}.motherTongue`, updateData.motherTongue);
      if (updateData.motherTongueOther !== undefined) setField(`${rolePrefix}.motherTongueOther`, updateData.motherTongueOther);
    } else if (user.role === 'teacher') {
      if (updateData.qualification !== undefined) setField(`${rolePrefix}.qualification`, updateData.qualification);
      if (updateData.experience !== undefined) setField(`${rolePrefix}.experience`, updateData.experience);
      if (updateData.subjects !== undefined && Array.isArray(updateData.subjects)) {
        const newSubjects = updateData.subjects.map(s => String(s).trim()).filter(Boolean);
        if (JSON.stringify(newSubjects) !== JSON.stringify(user.teacherDetails?.subjects || [])) {
          updateFields[`${rolePrefix}.subjects`] = newSubjects;
          changesMade = true;
        }
      }
    } else if (user.role === 'admin') {
      if (updateData.designation !== undefined) setField(`${rolePrefix}.designation`, updateData.designation);
      if (updateData.qualification !== undefined) setField(`${rolePrefix}.qualification`, updateData.qualification);
    }

    console.log(`🔍 DEBUG: Before changesMade check - changesMade:`, changesMade);
    console.log(`🔍 DEBUG: Before changesMade check - updateFields:`, JSON.stringify(updateFields));
    
    if (!changesMade) {
      console.log(`⚠️ WARNING: No changes detected, returning early`);
      return res.status(200).json({ success: true, message: 'No changes detected to update.' });
    }

    updateFields.updatedAt = new Date();
    if (user.auditTrail) {
      updateFields['auditTrail.lastModifiedBy'] = updatingUserId;
      updateFields['auditTrail.lastModifiedAt'] = updateFields.updatedAt;
    }

    console.log(`📊 Updating database with fields:`, Object.keys(updateFields));
    console.log(`🔍 DEBUG: Full updateFields object:`, JSON.stringify(updateFields));
    try {
      const result = await db.collection(collectionName).updateOne({ _id: user._id }, { $set: updateFields });

      if (result.matchedCount === 0) { return res.status(404).json({ success: false, message: 'User not found during update operation.' }); }

      console.log(`✅ User ${user.userId} updated in ${collectionName}. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
      
      // Verify profileImage was saved if it was in updateFields
      if (updateFields['profileImage']) {
        console.log(`✅ Profile image URL saved to database: ${updateFields['profileImage']}`);
      }
      
      // NOW delete old image and temp files AFTER successful DB update
      if (req.imageCleanup) {
        const { oldImagePublicId, tempFilePath, tempCompressedPath } = req.imageCleanup;
        
        // Delete old profile image from Cloudinary
        if (oldImagePublicId) {
          try {
            await deleteFromCloudinary(oldImagePublicId);
            console.log(`🗑️ Deleted old profile image from Cloudinary: ${oldImagePublicId}`);
          } catch (err) {
            console.warn(`⚠️ Failed to delete old image from Cloudinary: ${err.message}`);
          }
        }
        
        // Delete temp files
        deleteLocalFile(tempFilePath);
        deleteLocalFile(tempCompressedPath);
      }
      
      res.json({ success: true, message: 'User updated successfully' });

    } catch (error) {
      console.error(`Error updating user ${req.params.userId}:`, error);
      res.status(500).json({ success: false, message: 'Error updating user', error: error.message });
    }
  } catch (error) {
    console.error(`Error updating user ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Error updating user', error: error.message });
  }
};

// Delete user (Logical Deactivate)
// Delete user (Logical Deactivate)
exports.deleteUser = async (req, res) => {
  try {
    const { schoolCode, userId: userIdToDelete } = req.params;
    const deletingUserId = req.user?._id;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🗑️ Deactivating user ${userIdToDelete} for school: ${upperSchoolCode}`);

    let connection;
    try { connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode); }
    catch (connError) { return res.status(500).json({ success: false, message: 'Could not connect to school database' }); }
    if (!connection) return res.status(500).json({ success: false, message: 'Database connection object invalid' });
    const db = connection.db;

    const collectionsToSearch = ['admins', 'teachers', 'students', 'parents'];
    let collectionName = null;
    let user = null;

    const isObjectId = ObjectId.isValid(userIdToDelete);
    const query = isObjectId
      ? { $or: [{ userId: userIdToDelete }, { _id: new ObjectId(userIdToDelete) }] }
      : { userId: userIdToDelete };

    for (const collection of collectionsToSearch) {
      try {
        const foundUser = await db.collection(collection).findOne(query);
        if (foundUser) { user = foundUser; collectionName = collection; break; }
      } catch (error) { /* ignore */ }
    }

    if (!user) { return res.status(404).json({ success: false, message: 'User not found' }); }

    if (user._id.equals(deletingUserId)) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account.' });
    }

    // Extract Cloudinary public ID for deletion AFTER successful DB update (check both profileImage and profilePicture)
    const currentProfileImage = user.profileImage || user.profilePicture;
    console.log(`🔍 DEBUG DELETE: User role:`, user.role);
    console.log(`🔍 DEBUG DELETE: Collection name:`, collectionName);
    console.log(`🔍 DEBUG DELETE: user.profileImage:`, user.profileImage);
    console.log(`🔍 DEBUG DELETE: user.profilePicture:`, user.profilePicture);
    console.log(`🔍 DEBUG DELETE: Using currentProfileImage:`, currentProfileImage);
    const imagePublicIdToDelete = currentProfileImage ? extractPublicId(currentProfileImage) : null;
    console.log(`🔍 DEBUG DELETE: Extracted imagePublicIdToDelete:`, imagePublicIdToDelete);

    const updateResult = await db.collection(collectionName).updateOne(
      { _id: user._id },
      {
        $set: {
          isActive: false,
          updatedAt: new Date(),
          ...(user.auditTrail && { 'auditTrail.lastModifiedBy': deletingUserId, 'auditTrail.lastModifiedAt': new Date() })
        }
      }
    );

    if (updateResult.matchedCount === 0) { return res.status(404).json({ success: false, message: 'User not found during deactivation.' }); }
    if (updateResult.modifiedCount === 0 && user.isActive === false) { return res.status(200).json({ success: true, message: 'User was already inactive.' }); }
    if (updateResult.modifiedCount === 0 && user.isActive === true) {
      console.warn(`User ${user.userId} matched but isActive status was not changed to false.`);
      return res.status(500).json({ success: false, message: 'Failed to deactivate user (no changes applied).' });
    }

    console.log(`✅ User ${user.userId} deactivated successfully in ${collectionName}.`);
    
    // NOW delete profile image from Cloudinary AFTER successful database update
    if (imagePublicIdToDelete) {
      try {
        await deleteFromCloudinary(imagePublicIdToDelete);
        console.log(`✅ Successfully deleted profile image from Cloudinary: ${imagePublicIdToDelete}`);
      } catch (err) {
        console.warn(`⚠️ Failed to delete profile image from Cloudinary: ${err.message}`);
      }
    }
    
    res.json({ success: true, message: 'User deactivated successfully' });

  } catch (error) {
    console.error(`Error deactivating user ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Error deactivating user', error: error.message });
  }
};

// Reset user password
exports.resetPassword = async (req, res) => { /* ... Keep code from previous correct version ... */
  try {
    const { schoolCode, userId: userIdToReset } = req.params;
    const resettingAdminId = req.user?._id;
    const upperSchoolCode = schoolCode.toUpperCase();

    console.log(`🔑 Resetting password for user ${userIdToReset} in school: ${upperSchoolCode}`);

    let connection;
    try { connection = await SchoolDatabaseManager.getSchoolConnection(upperSchoolCode); }
    catch (connError) { return res.status(500).json({ success: false, message: 'Could not connect to school database' }); }
    if (!connection) return res.status(500).json({ success: false, message: 'Database connection object invalid' });
    const db = connection.db;

    const collectionsToSearch = ['admins', 'teachers', 'parents']; // Exclude students
    let user = null;
    let collectionName = null;

    const isObjectId = ObjectId.isValid(userIdToReset);
    const query = isObjectId
      ? { $or: [{ userId: userIdToReset }, { _id: new ObjectId(userIdToReset) }] }
      : { userId: userIdToReset };

    for (const collection of collectionsToSearch) {
      try {
        const foundUser = await db.collection(collection).findOne(query);
        if (foundUser) { user = foundUser; collectionName = collection; break; }
      } catch (error) { /* ignore */ }
    }

    if (!user) {
      try {
        const studentUser = await db.collection('students').findOne(query);
        if (studentUser) {
          return res.status(403).json({ success: false, message: 'Password reset is not allowed for student accounts.' });
        }
      } catch (e) {/* ignore */ }
      return res.status(404).json({ success: false, message: 'User not found or is not eligible for password reset.' });
    }

    const newPassword = generateRandomPassword(10);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await db.collection(collectionName).updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          temporaryPassword: newPassword,
          passwordChangeRequired: true,
          updatedAt: new Date(),
          ...(user.auditTrail && { 'auditTrail.lastModifiedBy': resettingAdminId, 'auditTrail.lastModifiedAt': new Date() })
        }
      }
    );

    if (result.matchedCount === 0) { return res.status(404).json({ success: false, message: 'User not found during password update.' }); }
    if (result.modifiedCount === 0) {
      console.warn(`Password for user ${user.userId} was not modified.`);
      return res.status(400).json({ success: false, message: 'Failed to reset password (no changes applied).' });
    }

    console.log(`✅ Password reset successfully for user: ${user.userId}`);

    res.json({
      success: true,
      message: 'Password reset successfully. Please provide the new password to the user.',
      newPassword: newPassword
    });

  } catch (error) {
    console.error(`Error resetting password for user ${req.params.userId}:`, error);
    res.status(500).json({ success: false, message: 'Error resetting password', error: error.message });
  }
};


// Make sure all exported functions are included
module.exports = {
  getAllUsers: exports.getAllUsers,
  getUserById: exports.getUserById,
  createUser: exports.createUser,
  updateUser: exports.updateUser,
  deleteUser: exports.deleteUser,
  resetPassword: exports.resetPassword,
};