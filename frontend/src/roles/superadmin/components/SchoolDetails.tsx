import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, GraduationCap, Settings, BarChart3, Calendar, BookOpen, Award, TrendingUp, Edit, Save, X, Plus, Trash2, Eye, EyeOff, RefreshCw, Key, Upload, School } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../../../api/axios';
import { schoolUserAPI } from '../../../api/schoolUsers';
import AcademicTestConfiguration from './AcademicTestConfiguration';
import { ImportUsersDialog } from './ImportUsersDialog'; // Import the dialog

// Define proper types for the component
type TabType = 'overview' | 'users' | 'academics' | 'settings';
type UserRole = 'admin' | 'teacher' | 'student' | 'parent';

interface User {
  _id: string;
  userId: string;
  name: {
    firstName: string;
    lastName: string;
    displayName: string;
  };
  email: string;
  role: UserRole;
  isActive: boolean;
  contact: {
    primaryPhone: string;
  };
  createdAt: string;
  lastLogin?: string;
  academicInfo?: any;
  teachingInfo?: any;
  adminInfo?: any;
  parentInfo?: any;
  profileImage?: string | null; // Add profileImage field
  // Add studentDetails to the interface
  studentDetails?: {
    currentClass?: string;
    currentSection?: string;
    [key: string]: any; // Allow other properties
  };
}

interface Result {
  id: string;
  studentId: string;
  term: string;
  totalMarks: number;
  totalPossible: number;
  percentage: number;
  grade: string;
  rank: number;
}

interface Attendance {
  id: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
}

interface Mark {
  id: string;
  studentId: string;
  teacherId: string;
  subject: string;
  examType: string;
  marks: number;
  totalMarks: number;
  date: string;
}

interface SchoolSettings {
  schoolName: string;
  academicYear: string;
  attendanceThreshold: number;
  schoolHours: {
    start: string;
    end: string;
  };
  subjects: string[];
  classes: string[];
  accessMatrix?: any;
}

interface SchoolData {
  users: User[];
  results: Result[];
  attendance: Attendance[];
  marks: Mark[];
  settings: SchoolSettings;
  accessMatrix?: any;
  // Add schoolCode to SchoolData
  schoolCode?: string;
}

function SchoolDetails() {
  // Error boundary wrapper
  try {
    return <SchoolDetailsContent />;
  } catch (err) {
    console.error('FATAL ERROR IN SCHOOL DETAILS:', err);
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-300 rounded-lg p-4">
          <h2 className="text-xl font-bold text-red-800 mb-2">Error Rendering School Details</h2>
          <p className="text-red-700 mb-2">An unexpected error occurred while rendering this page.</p>
          <p className="text-sm text-red-700 mb-4">Error: {String(err)}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

// The actual content component
function SchoolDetailsContent() {
  // Helper function to get token consistently
  const getAuthToken = (): string | null => {
    let token;
    // Check both localStorage and sessionStorage for erp.auth
    const auth = localStorage.getItem('erp.auth') || sessionStorage.getItem('erp.auth');
    if (auth) {
      try {
        const parsed = JSON.parse(auth);
        token = parsed.token;
        console.log('[SchoolDetails] Token found in erp.auth:', token ? token.substring(0, 20) + '...' : 'null');
      } catch (e) {
        console.log('[SchoolDetails] Failed to parse erp.auth:', e);
      }
    }
    // Fallback to direct token storage (check both storages)
    if (!token) {
      token = localStorage.getItem('token') || sessionStorage.getItem('token');
      console.log('[SchoolDetails] Token found in direct storage:', token ? token.substring(0, 20) + '...' : 'null');
    }
    // Additional fallback for authToken
    if (!token) {
      token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      console.log('[SchoolDetails] Token found in authToken:', token ? token.substring(0, 20) + '...' : 'null');
    }
    if (!token) {
      console.error('[SchoolDetails] No authentication token found in any storage');
    }
    return token;
  };

  // Safely access context
  const appContext = useApp();
  const schools = appContext?.schools || [];
  const selectedSchoolId = appContext?.selectedSchoolId || '';
  const setCurrentView = appContext?.setCurrentView || (() => { });
  const getSchoolData = appContext?.getSchoolData;
  const updateUserRole = appContext?.updateUserRole;
  const updateSchoolSettings = appContext?.updateSchoolSettings;

  // Component state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<SchoolData | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [editingUserData, setEditingUserData] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Partial<SchoolSettings>>({});

  // User management state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false); // State for import dialog
  const [schoolCode, setSchoolCode] = useState<string | null>(null); // State for school code
  const [addUserForm, setAddUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'admin' as UserRole,
    phone: ''
  });
  const [addingUser, setAddingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userEditForm, setUserEditForm] = useState<any>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<any>(null);
  const [showTestDetailsManager, setShowTestDetailsManager] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');


  // Find the selected school
  const school = schools.find(s => s.id === selectedSchoolId);

  // Logging for debugging
  useEffect(() => {
    console.log('SchoolDetails - Debug Info:');
    console.log('- selectedSchoolId:', selectedSchoolId);
    console.log('- school found:', school ? 'yes' : 'no');
    console.log('- school name:', school?.name);
    console.log('- loading state:', loading);
    console.log('- error state:', error);
    console.log('- data loaded:', fetchedData ? 'yes' : 'no');
    console.log('- schoolCode:', schoolCode);
  }, [selectedSchoolId, school, loading, error, fetchedData, schoolCode]);

  // Load data when component mounts or ID changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId: any;

    async function fetchData() {
      if (!selectedSchoolId) {
        console.log('No selectedSchoolId, skipping data fetch');
        return;
      }

      console.log('Fetching data for school:', selectedSchoolId, 'reloadKey:', reloadKey);

      setLoading(true);
      setError(null);
      setSchoolCode(null); // Reset school code on reload

      // Set a timeout in case the request takes too long
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setLoading(false);
          setError('Request timed out after 10 seconds');
        }
      }, 10000);

      try {
        console.log('Making API calls for school data...');
        // First get school information to get the school code
        let schoolRes;
        let schoolInfo;
        let currentSchoolCode;

        try {
          // Try the new school info endpoint first
          schoolRes = await api.get(`/schools/${selectedSchoolId}/info`);
          schoolInfo = schoolRes.data?.data || schoolRes.data || {};
          currentSchoolCode = schoolInfo.code;
        } catch (infoError) {
          console.log('School info endpoint failed, trying regular endpoint...');
          try {
            // Fallback to regular endpoint
            schoolRes = await api.get(`/schools/${selectedSchoolId}`);
            schoolInfo = schoolRes.data?.school || schoolRes.data || {};
            currentSchoolCode = schoolInfo.code;
          } catch (regularError) {
            console.log('Regular endpoint failed, trying to find school by ID from context...');
            // Last resort: find school from context
            const school = schools.find(s => s.id === selectedSchoolId);
            if (school) {
              currentSchoolCode = school.code;
              schoolInfo = {
                code: school.code,
                name: school.name,
                _id: school.id
              };
            } else {
              throw new Error('School not found in any source');
            }
          }
        }

        if (!isMounted) return;

        if (!currentSchoolCode) {
          throw new Error('School code not found');
        }

        setSchoolCode(currentSchoolCode); // Set school code in state

        console.log('Fetching users for school code:', currentSchoolCode);

        const token = getAuthToken();

        if (!token) {
          throw new Error('No authentication token found');
        }

        const usersRes = await schoolUserAPI.getAllUsers(currentSchoolCode, token);

        if (!isMounted) return;
        clearTimeout(timeoutId);

        console.log('API responses received:', {
          school: schoolInfo,
          users: usersRes
        });

        // Handle the new flat array format from the backend
        let allUsers = [];

        if (usersRes && usersRes.data && Array.isArray(usersRes.data)) {
          // New format: flat array in data field
          allUsers = usersRes.data;
          console.log('Processing user data (new format):', {
            totalUsers: allUsers.length,
            breakdown: usersRes.breakdown || {}
          });
        } else if (usersRes && typeof usersRes === 'object') {
          // Old format: grouped by role (fallback)
          console.log('Processing user data (old format):', {
            hasAdmins: !!usersRes.admin,
            hasTeachers: !!usersRes.teacher,
            hasStudents: !!usersRes.student,
            hasParents: !!usersRes.parent,
            adminCount: usersRes.admin?.length || 0,
            teacherCount: usersRes.teacher?.length || 0,
            studentCount: usersRes.student?.length || 0,
            parentCount: usersRes.parent?.length || 0
          });

          if (usersRes.admin && Array.isArray(usersRes.admin)) {
            console.log('Processing', usersRes.admin.length, 'admins');
            allUsers.push(...usersRes.admin.map((user: any) => ({ ...user, role: 'admin' })));
          }
          if (usersRes.teacher && Array.isArray(usersRes.teacher)) {
            console.log('Processing', usersRes.teacher.length, 'teachers');
            allUsers.push(...usersRes.teacher.map((user: any) => ({ ...user, role: 'teacher' })));
          }
          if (usersRes.student && Array.isArray(usersRes.student)) {
            console.log('Processing', usersRes.student.length, 'students');
            allUsers.push(...usersRes.student.map((user: any) => ({ ...user, role: 'student' })));
          }
          if (usersRes.parent && Array.isArray(usersRes.parent)) {
            console.log('Processing', usersRes.parent.length, 'parents');
            allUsers.push(...usersRes.parent.map((user: any) => ({ ...user, role: 'parent' })));
          }
        } else {
          console.log('No user data received or unexpected format');
          allUsers = [];
        }

        console.log('Processing', allUsers.length, 'users...');
        // Log first student to check studentDetails
        const firstStudent = allUsers.find((u: any) => u.role === 'student');
        if (firstStudent) {
          console.log('Sample student data:', firstStudent);
        }


        console.log('User breakdown:', {
          total: allUsers.length,
          byRole: allUsers.reduce((acc: Record<string, number>, user: any) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
          }, {})
        });

        // Process data into SchoolData format
        const processed: SchoolData = {
          users: allUsers.filter((user: any) => !user._placeholder), // Remove placeholder documents
          results: [],
          attendance: [],
          marks: [],
          settings: {
            schoolName: schoolInfo?.name || 'School',
            academicYear: schoolInfo?.settings?.academicYear?.currentYear || '2024-2025',
            attendanceThreshold: Number(schoolInfo?.settings?.attendanceThreshold) || 75,
            schoolHours: {
              start: schoolInfo?.settings?.workingHours?.start || '08:00',
              end: schoolInfo?.settings?.workingHours?.end || '15:00'
            },
            subjects: Array.isArray(schoolInfo?.settings?.subjects) ? schoolInfo.settings.subjects : [],
            classes: Array.isArray(schoolInfo?.settings?.classes) ? schoolInfo.settings.classes : []
          },
          schoolCode: currentSchoolCode, // Store the school code
          accessMatrix: schoolInfo?.accessMatrix || {} // Store access matrix
        };

        console.log('Final processed data:', {
          totalUsers: processed.users.length,
          userRoles: processed.users.reduce((acc: Record<string, number>, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
          }, {})
        });
        setFetchedData(processed);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        clearTimeout(timeoutId);

        console.error('Failed to load school details:', err);
        console.error('Error response:', err.response?.data);
        setError(err?.response?.data?.message || err?.message || 'Failed to load school details');
        setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [selectedSchoolId, reloadKey]); // Removed school?.name dependency, rely on reloadKey


  // Handle user management operations
  const handleSaveUser = async (userId: string) => {
    try {
      if (!schoolCode) {
        throw new Error('School code not found');
      }

      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Find the user to get their userId (not _id)
      const currentUser = schoolData?.users.find(u => u._id === userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      // Prepare update data
      const updateData: any = {
        'name.firstName': userEditForm.firstName || currentUser.name.firstName,
        'name.lastName': userEditForm.lastName || currentUser.name.lastName,
        email: userEditForm.email || currentUser.email,
        'contact.primaryPhone': userEditForm.phone || currentUser.contact.primaryPhone
      };

      // Add password if provided
      if (userEditForm.password && userEditForm.password.trim()) {
        if (userEditForm.password !== userEditForm.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        updateData.password = userEditForm.password;
      }

      // Add role if changed
      if (userEditForm.role && userEditForm.role !== currentUser.role) {
        updateData.role = userEditForm.role;
      }

      // Add status if changed
      if (userEditForm.isActive !== undefined && userEditForm.isActive !== currentUser.isActive) {
        updateData.isActive = userEditForm.isActive;
      }

      await schoolUserAPI.updateUser(schoolCode, currentUser.userId, updateData, token);

      setEditingUser(null);
      setUserEditForm({});
      setReloadKey(prev => prev + 1);

      alert('User updated successfully!');
    } catch (err: any) {
      console.error('Failed to update user:', err);
      alert('Failed to update user: ' + err.message);
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user._id);
    setUserEditForm({
      firstName: user.name?.firstName || '',
      lastName: user.name?.lastName || '',
      email: user.email || '',
      phone: user.contact?.primaryPhone || '',
      role: user.role || '',
      isActive: user.isActive !== undefined ? user.isActive : true,
      password: '',
      confirmPassword: ''
    });
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setUserEditForm((prev: any) => ({
      ...prev,
      password: result,
      confirmPassword: result
    }));
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      if (!schoolCode) {
        throw new Error('School code not found');
      }

      // Find the user to get their userId (not _id)
      const currentUser = schoolData?.users.find(u => u._id === userId);
      if (!currentUser) {
        throw new Error('User not found');
      }

      await schoolUserAPI.deleteUser(schoolCode, currentUser.userId, token);

      setDeletingUser(null);
      setReloadKey(prev => prev + 1);

      alert('User deleted successfully!');
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user: ' + err.message);
    }
  };

  const handleResetPassword = async (userId: string, userIdCode: string) => {
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      if (!schoolCode) {
        throw new Error('School code not found');
      }

      setResettingPassword(userId);

      const result = await schoolUserAPI.resetPassword(schoolCode, userIdCode, token);

      setResetPasswordResult(result.data);
      setResettingPassword(null);

      // Show the new password to the admin
      alert(`Password reset successfully!\n\nNew credentials:\nUser ID: ${result.data.userId}\nEmail: ${result.data.email}\nNew Password: ${result.data.password}\n\nPlease share these credentials with the user.`);

    } catch (err: any) {
      console.error('Failed to reset password:', err);
      setResettingPassword(null);
      alert('Failed to reset password: ' + err.message);
    }
  };

  const handleAddUser = async () => {
    setAddingUser(true);

    try {
      if (!schoolCode) {
        throw new Error('School code not found');
      }

      console.log('Adding user with data:', {
        firstName: addUserForm.firstName,
        lastName: addUserForm.lastName,
        email: addUserForm.email,
        role: addUserForm.role,
        phone: addUserForm.phone,
        selectedSchoolId
      });

      // Validate form data
      if (!addUserForm.firstName || !addUserForm.lastName || !addUserForm.email || !addUserForm.role) {
        throw new Error('Please fill in all required fields');
      }

      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Format the data for the new API
      const userData = {
        firstName: addUserForm.firstName,
        lastName: addUserForm.lastName,
        email: addUserForm.email,
        role: addUserForm.role,
        phone: addUserForm.phone
      };

      console.log('Making API call to create user in school:', schoolCode);

      // Call the new school-specific API to create the user
      const result = await schoolUserAPI.addUser(schoolCode, userData, token);

      console.log('User creation response:', result);

      // Close the modal and reset the form
      setShowAddUserModal(false);
      setAddUserForm({
        firstName: '',
        lastName: '',
        email: '',
        role: 'admin' as UserRole,
        phone: ''
      });

      // Refresh the data
      console.log('Triggering data refresh...');
      setReloadKey(prev => prev + 1);

      // Show success message with credentials
      alert(`User added successfully!\n\nCredentials:\nUser ID: ${result.data.credentials.userId}\nEmail: ${result.data.credentials.email}\nPassword: ${result.data.credentials.password}\n\nPlease share these credentials with the user.`);
    } catch (err: any) {
      console.error('Failed to add user:', err);
      console.error('Error response:', err.response?.data);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to add user. Please try again.';
      alert(errorMessage);
    } finally {
      setAddingUser(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error('No authentication token found');
      }

      // Update the school settings including access matrix
      await api.put(`/schools/${selectedSchoolId}`, settingsForm, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      // If access matrix was updated, also update it specifically
      if (settingsForm.accessMatrix) {
        await api.patch(`/schools/${selectedSchoolId}/access-matrix`, {
          accessMatrix: settingsForm.accessMatrix
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }

      // Close editing mode
      setEditingSettings(false);

      // Refresh the data to show updated settings
      setReloadKey(prev => prev + 1);

      alert('Settings updated successfully!');

    } catch (err: any) {
      console.error('Failed to update settings:', err);
      alert('Failed to update settings: ' + (err.response?.data?.message || err.message));
    }
  };

  // Alias for backward compatibility
  const schoolData = fetchedData;

  // Case 1: No school ID
  if (!selectedSchoolId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">School Details</h1>
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p>No school selected. Please go back and select a school.</p>
        </div>
      </div>
    );
  }

  // Case 2: School not found
  if (!school) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">School Details</h1>
        <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
          <p>School not found. The school ID may be invalid.</p>
          <p className="text-sm mt-2">ID: {selectedSchoolId}</p>
        </div>
      </div>
    );
  }

  // Case 3: Loading
  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">School Details - {school.name}</h1>
        </div>
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p>Loading school details...</p>
        </div>
      </div>
    );
  }

  // Case 4: Error
  if (error) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">School Details - {school.name}</h1>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-4">
          <h3 className="font-medium">Error loading school details</h3>
          <p className="mt-1">{error}</p>
        </div>
        <button
          onClick={() => setReloadKey(prev => prev + 1)} // Use reloadKey to retry
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Case 5: Success - basic view
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{school.name}</h1>
          <p className="text-sm text-gray-600 mt-1">School Code: {schoolCode || 'N/A'}</p>
        </div>

      {/* DEBUG Panel - visible to help diagnose issues */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
        <h2 className="font-bold text-blue-800 mb-2">Debug Information</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-medium">School ID:</span> {selectedSchoolId}</p>
            <p><span className="font-medium">School Name:</span> {school.name}</p>
            <p><span className="font-medium">School Code:</span> {schoolCode || 'N/A'}</p>
          </div>
          <div>
            <p><span className="font-medium">Data Loaded:</span> {schoolData ? '✅' : '❌'}</p>
            <p><span className="font-medium">Loading State:</span> {loading ? 'Loading' : 'Complete'}</p>
            <p><span className="font-medium">Users Count:</span> {schoolData?.users?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-2">
        <nav className="flex space-x-2">
          <button
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
              activeTab === 'overview'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Overview</span>
          </button>

          <button
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
              activeTab === 'users'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('users')}
          >
            <Users className="h-4 w-4" />
            <span>Users</span>
          </button>

          <button
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
              activeTab === 'academics'
                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab('academics')}
          >
            <GraduationCap className="h-4 w-4" />
            <span>Academics</span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6">
          {/* School Info Card - Expanded */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200 hover:shadow-xl transition-shadow duration-300">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-xl">
                <School className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">School Information</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-semibold text-gray-800 mb-4 text-lg">Basic Info</h3>
                <div className="space-y-3">
                  <p className="text-gray-700"><span className="font-medium">Name:</span> {school.name}</p>
                  <p className="text-gray-700"><span className="font-medium">Code:</span> {schoolCode || 'N/A'}</p>
                  <p className="text-gray-700"><span className="font-medium">Contact:</span> {schoolData?.settings?.schoolName || 'N/A'}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-4 text-lg">User Counts</h3>
                <div className="space-y-3">
                  <p className="text-gray-700"><span className="font-medium">Total Users:</span> {schoolData?.users?.length || 0}</p>
                  <p className="text-gray-700"><span className="font-medium">Admin Users:</span> {schoolData?.users?.filter((u: User) => u.role === 'admin').length || 0}</p>
                  <p className="text-gray-700"><span className="font-medium">Teachers:</span> {schoolData?.users?.filter((u: User) => u.role === 'teacher').length || 0}</p>
                  <p className="text-gray-700"><span className="font-medium">Students:</span> {schoolData?.users?.filter((u: User) => u.role === 'student').length || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Users Management</h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add User</span>
              </button>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading users...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="text-red-800 font-medium">Error loading users</div>
              <div className="text-red-600 text-sm mt-1">{error}</div>
              <button
                onClick={() => setReloadKey(prev => prev + 1)}
                className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && schoolData && (
            <>
              {/* Search */}
              <div className="mb-6">
                <label htmlFor="searchUsers" className="block text-sm font-medium text-gray-700 mb-1">
                  Search Users
                </label>
                <div className="relative">
                  <input
                    id="searchUsers"
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* User Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                  <div className="font-medium text-purple-800">Admins</div>
                  <div className="text-2xl font-bold text-purple-900">{schoolData.users.filter(u => u.role === 'admin').length}</div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="font-medium text-blue-800">Teachers</div>
                  <div className="text-2xl font-bold text-blue-900">{schoolData.users.filter(u => u.role === 'teacher').length}</div>
                </div>
                <div className="p-4 bg-green-50 border border-green-100 rounded-lg">
                  <div className="font-medium text-green-800">Students</div>
                  <div className="text-2xl font-bold text-green-900">{schoolData.users.filter(u => u.role === 'student').length}</div>
                </div>
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
                  <div className="font-medium text-gray-800">Total Users</div>
                  <div className="text-2xl font-bold text-gray-900">{schoolData.users.length}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {schoolData.users
                      .filter(user => {
                        // Apply search query
                        if (searchQuery) {
                          const query = searchQuery.toLowerCase();
                          return (
                            (user.name?.displayName || user.name?.firstName || user.email || '').toLowerCase().includes(query) ||
                            (user.email || '').toLowerCase().includes(query) ||
                            (user.userId || '').toLowerCase().includes(query)
                          );
                        }

                        return true;
                      })
                      .map((user: User) => (
                        <tr key={user._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="h-10 w-10 flex-shrink-0 bg-gray-200 rounded-full overflow-hidden">
                                {user.profileImage ? (
                                  <img
                                    src={`http://localhost:5050${user.profileImage}`}
                                    alt={user.name?.displayName || 'User'}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        parent.innerHTML = `<div class="h-full w-full flex items-center justify-center bg-blue-100 text-blue-800 font-medium">${user.name?.firstName?.[0]?.toUpperCase() || user.name?.displayName?.[0]?.toUpperCase() || 'U'}${user.name?.lastName?.[0]?.toUpperCase() || user.name?.displayName?.[1]?.toUpperCase() || 'U'}</div>`;
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center bg-blue-100 text-blue-800 font-medium">
                                    {user.name?.firstName?.[0]?.toUpperCase() || user.name?.displayName?.[0]?.toUpperCase() || 'U'}
                                    {user.name?.lastName?.[0]?.toUpperCase() || user.name?.displayName?.[1]?.toUpperCase() || 'U'}
                                  </div>
                                )}
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{user.name?.displayName || user.name?.firstName || user.email || 'Unknown User'}</div>
                                <div className="text-sm text-gray-500">ID: {user.userId || 'N/A'}</div>

                                {/* *** THIS IS THE FIX for Problem 1 *** */}
                                {user.role === 'student' && (
                                  <div className="text-sm text-gray-500">
                                    Class: <strong>{user.studentDetails?.currentClass || 'N/A'}</strong>
                                    {' - '}
                                    <strong>{user.studentDetails?.currentSection || 'N/A'}</strong>
                                  </div>
                                )}
                                {/* *** END OF FIX *** */}

                                <div className="text-sm text-gray-500 mt-1">Since {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                              user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                                user.role === 'student' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-800'
                              }`}>
                              {(user.role || 'unknown').charAt(0).toUpperCase() + (user.role || 'unknown').slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {user.email || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${(user.isActive !== false) ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                              {(user.isActive !== false) ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                            <button
                              className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1"
                              onClick={() => handleEditUser(user)}
                              title="Edit User"
                            >
                              <Edit size={16} />
                              Edit
                            </button>
                            <button
                              className="text-red-600 hover:text-red-900 inline-flex items-center gap-1"
                              onClick={() => setDeletingUser(user._id)}
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}

                    {/* No results message */}
                    {schoolData.users.filter(user => {
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        return (
                          (user.name?.displayName || user.name?.firstName || user.email || '').toLowerCase().includes(query) ||
                          (user.email || '').toLowerCase().includes(query) ||
                          (user.userId || '').toLowerCase().includes(query)
                        );
                      }
                      return true;
                    }).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                            <div className="flex flex-col items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-lg font-medium">No users found</p>
                              <p className="text-sm mt-1">
                                {searchQuery
                                  ? `No users match the search "${searchQuery}"`
                                  : 'There are no users to display'}
                              </p>
                              {searchQuery && (
                                <button
                                  onClick={() => setSearchQuery('')}
                                  className="mt-3 text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                  Clear search
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}


      {activeTab === 'academics' && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Academic Test Configuration</h2>
            <div className="text-sm text-gray-600">
              Configure test types and academic settings for {school?.name}
            </div>
          </div>

          <AcademicTestConfiguration />
        </div>
      )}

      {/* Settings tab removed - Super Admin view only */}
      {false && activeTab === 'settings' && schoolData && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">School Settings</h2>
            {!editingSettings ? (
              <button
                onClick={() => {
                  setEditingSettings(true);
                  setSettingsForm({
                    ...schoolData.settings,
                    accessMatrix: schoolData.accessMatrix || {}
                  });
                }}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <Edit className="h-4 w-4" />
                <span>Edit Settings</span>
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleSaveSettings}
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  <Save className="h-4 w-4" />
                  <span>Save</span>
                </button>
                <button
                  onClick={() => setEditingSettings(false)}
                  className="flex items-center space-x-2 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Name</label>
              {editingSettings ? (
                <input
                  type="text"
                  value={settingsForm.schoolName || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, schoolName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              ) : (
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {schoolData.settings.schoolName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
              {editingSettings ? (
                <input
                  type="text"
                  value={settingsForm.academicYear || ''}
                  onChange={(e) => setSettingsForm({ ...settingsForm, academicYear: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              ) : (
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {schoolData.settings.academicYear}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Attendance Threshold (%)</label>
              {editingSettings ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settingsForm.attendanceThreshold || 0}
                  onChange={(e) => setSettingsForm({ ...settingsForm, attendanceThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              ) : (
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {schoolData.settings.attendanceThreshold}%
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Hours</label>
              {editingSettings ? (
                <div className="flex space-x-4">
                  <input
                    type="time"
                    value={settingsForm.schoolHours?.start || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      schoolHours: {
                        start: e.target.value,
                        end: settingsForm.schoolHours?.end || '15:00'
                      }
                    })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="flex items-center text-gray-500">to</span>
                  <input
                    type="time"
                    value={settingsForm.schoolHours?.end || ''}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      schoolHours: {
                        start: settingsForm.schoolHours?.start || '08:00',
                        end: e.target.value
                      }
                    })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ) : (
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">
                  {schoolData.settings.schoolHours.start} - {schoolData.settings.schoolHours.end}
                </p>
              )}
            </div>

            {/* Access Matrix Section */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Access Control Matrix</h3>
              <p className="text-sm text-gray-600 mb-4">
                Configure role-based permissions for different user types.
              </p>

              {editingSettings ? (
                <div className="space-y-4">
                  {schoolData.accessMatrix && Object.keys(schoolData.accessMatrix).map((role) => (
                    <div key={role} className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-gray-800 mb-3 capitalize">{role}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.keys(schoolData.accessMatrix[role]).map((permission) => (
                          <label key={permission} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={settingsForm.accessMatrix?.[role]?.[permission] || false}
                              onChange={(e) => {
                                const newAccessMatrix = {
                                  ...settingsForm.accessMatrix,
                                  [role]: {
                                    ...settingsForm.accessMatrix?.[role],
                                    [permission]: e.target.checked
                                  }
                                };
                                setSettingsForm({
                                  ...settingsForm,
                                  accessMatrix: newAccessMatrix
                                });
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 capitalize">
                              {permission.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {schoolData.accessMatrix && Object.keys(schoolData.accessMatrix).map((role) => (
                    <div key={role} className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-gray-800 mb-3 capitalize">{role}</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.keys(schoolData.accessMatrix[role]).map((permission) => (
                          <div key={permission} className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded ${schoolData.accessMatrix[role][permission]
                              ? 'bg-green-500'
                              : 'bg-red-500'
                              }`}></div>
                            <span className="text-sm text-gray-700 capitalize">
                              {permission.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Add New User</h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleAddUser(); }}>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={addUserForm.firstName}
                      onChange={(e) => setAddUserForm({ ...addUserForm, firstName: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="First Name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={addUserForm.lastName}
                      onChange={(e) => setAddUserForm({ ...addUserForm, lastName: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Last Name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={addUserForm.email}
                    onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Email Address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <input
                    type="text"
                    value="Admin"
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">Super Admin can only create Admin users</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Optional)</label>
                  <input
                    type="tel"
                    value={addUserForm.phone}
                    onChange={(e) => setAddUserForm({ ...addUserForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Phone Number"
                  />
                </div>

                <div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-700">
                          <strong>Password Auto-Generation:</strong> A secure password and user ID will be automatically generated for this user. You'll receive the credentials after user creation.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className={`flex-1 px-4 py-2 rounded-lg text-white transition-colors duration-200 ${addingUser
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  {addingUser ? (
                    <>
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                      Adding...
                    </>
                  ) : (
                    'Add User'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Users Modal */}
      {showImportDialog && schoolCode && (
        <ImportUsersDialog
          schoolCode={schoolCode} // Pass schoolCode
          onClose={() => setShowImportDialog(false)}
          onSuccess={() => {
            setShowImportDialog(false);
            setReloadKey(prev => prev + 1); // Refresh user list on success
            alert('Users imported successfully! The user list has been updated.'); // Add success message
          }}
        />
      )}

      {/* Confirm Delete Modal */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-red-600">Confirm Delete</h3>
              <p className="text-gray-600 mt-2">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deletingUser)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Edit User</h3>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setUserEditForm({});
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveUser(editingUser); }}>
              <div className="space-y-6">
                {/* Basic Information Section */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-4">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={userEditForm.firstName || ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, firstName: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={userEditForm.lastName || ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, lastName: e.target.value })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={userEditForm.email || ''}
                      onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={userEditForm.phone || ''}
                      onChange={(e) => setUserEditForm({ ...userEditForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Password Section */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-4">Password Management</h4>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New Password (Optional)</label>
                      <input
                        type="password"
                        value={userEditForm.password || ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, password: e.target.value })}
                        placeholder="Leave blank to keep current password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave blank to keep the current password</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        value={userEditForm.confirmPassword || ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={async () => {
                          const user = schoolData?.users.find(u => u._id === editingUser);
                          if (!user) return;

                          try {
                            setResettingPassword(editingUser);
                            const token = getAuthToken();
                            if (!token) throw new Error('No authentication token');
                            if (!schoolCode) throw new Error('School code not found');

                            const result = await schoolUserAPI.resetPassword(schoolCode, user.userId, token);

                            // Generate a new password and update the form
                            const newPassword = result.data.password;
                            setUserEditForm({
                              ...userEditForm,
                              password: newPassword,
                              confirmPassword: newPassword
                            });

                            setResetPasswordResult(result.data);
                            setResettingPassword(null);

                            alert(`New password generated: ${newPassword}\n\nThe password has been set in the form above. Click "Save Changes" to apply it.`);
                          } catch (err: any) {
                            console.error('Failed to generate new password:', err);
                            setResettingPassword(null);
                            alert('Failed to generate new password: ' + err.message);
                          }
                        }}
                        disabled={resettingPassword === editingUser}
                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {resettingPassword === editingUser ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Key className="h-4 w-4" />
                            <span>Generate New Password</span>
                          </>
                        )}
                      </button>

                      <div className="text-sm text-gray-600">
                        This will generate a secure password and update the form fields above
                      </div>
                    </div>
                  </div>
                </div>

                {/* Role and Status Section */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-4">Role & Status</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={userEditForm.role || ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, role: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="admin">Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="student">Student</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        value={userEditForm.isActive !== undefined ? userEditForm.isActive.toString() : ''}
                        onChange={(e) => setUserEditForm({ ...userEditForm, isActive: e.target.value === 'true' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setUserEditForm({});
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

export default SchoolDetails;