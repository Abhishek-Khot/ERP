import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Users, UserCheck, BookOpen, TrendingUp, Calendar, Clock, AlertCircle, Building, Phone, Mail, MapPin, RefreshCw, Bug } from 'lucide-react';
import { schoolAPI } from '../../../services/api';
import { schoolUserAPI } from '../../../api/schoolUsers';
import api from '../../../services/api';
import { useAuth } from '../../../auth/AuthContext';

interface School {
  _id: string;
  name: string;
  code: string;
  logoUrl?: string;
  principalName?: string;
  principalEmail?: string;
  mobile?: string;
  address?: {
    street?: string;
    area?: string;
    city?: string;
    district?: string;
    taluka?: string;
    state?: string;
    stateId?: number;
    districtId?: number;
    talukaId?: number;
    country?: string;
    zipCode?: string;
    pinCode?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  bankDetails?: {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    branch?: string;
    accountHolderName?: string;
  };
  settings?: {
    academicYear?: {
      startDate?: Date;
      endDate?: Date;
      currentYear?: string;
    };
    classes?: string[];
    sections?: string[];
    subjects?: string[];
    workingDays?: string[];
    workingHours?: {
      start?: string;
      end?: string;
    };
    holidays?: Array<{
      date?: Date;
      description?: string;
    }>;
  };
  stats?: {
    totalStudents: number;
    totalTeachers: number;
    totalParents: number;
    totalClasses: number;
  };
  features?: {
    hasTransport?: boolean;
    hasCanteen?: boolean;
    hasLibrary?: boolean;
    hasSports?: boolean;
    hasComputerLab?: boolean;
  };
  schoolType?: string;
  establishedYear?: number;
  affiliationBoard?: string;
  website?: string;
  secondaryContact?: string;
  isActive?: boolean;
  establishedDate?: Date;
  admins?: string[];
  databaseName?: string;
  databaseCreated?: boolean;
  databaseCreatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const Dashboard: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [attendanceRate, setAttendanceRate] = useState<string>('0.0%');
  const [dailyAttendance, setDailyAttendance] = useState<Array<{ name: string, attendance: number }>>([]);
  const [todayAttendance, setTodayAttendance] = useState<{ present: number, absent: number }>({ present: 0, absent: 0 });
  const [morningAttendance, setMorningAttendance] = useState<{ present: number, absent: number }>({ present: 0, absent: 0 });
  const [afternoonAttendance, setAfternoonAttendance] = useState<{ present: number, absent: number }>({ present: 0, absent: 0 });
  const [classPerformance, setClassPerformance] = useState<Array<{ name: string, percentage: number, studentCount: number }>>([]);

  // Get auth token - improved to use AuthContext first
  const getAuthToken = () => {
    // First try the token from AuthContext
    if (token) {
      return token;
    }

    // Then try localStorage with the correct key
    try {
      const authData = localStorage.getItem('erp.auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.token;
      }
    } catch (e) {
      console.warn('Failed to parse auth data from localStorage:', e);
    }

    // Fallback to old storage methods
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  };

  useEffect(() => {
    const fetchSchoolAndUsers = async () => {
      try {
        setLoading(true);
        setError(null);

        const debug: any = {
          user: user,
          schoolIdentifier: user?.schoolId || user?.schoolCode,
          token: !!getAuthToken(),
          timestamp: new Date().toISOString()
        };

        console.log('🔍 Starting fetchSchoolAndUsers with debug info:', debug);
        setDebugInfo(debug);

        // Check if we have a valid school identifier
        const schoolIdentifier = user?.schoolId || user?.schoolCode;
        if (!schoolIdentifier) {
          throw new Error(`No school identifier found. Please log out and log back in to refresh your school association.`);
        }

        if (schoolIdentifier) {
          const token = getAuthToken();
          if (!token) {
            throw new Error('No authentication token found. Please log in again.');
          }

          try {
            // Try to fetch school details from school_info collection in school's database
            console.log('📡 Fetching school details from school_info collection');
            try {
              const schoolResponse = await api.get('/schools/database/school-info');
              console.log('✅ School response from school_info:', schoolResponse);

              // Extract data from nested response structure
              const schoolData = schoolResponse.data?.data || schoolResponse.data;
              console.log('📊 Extracted school data:', schoolData);
              setSchool(schoolData);

              debug.schoolFetch = { success: true, source: 'school_info', schoolName: schoolData?.name };
            } catch (schoolInfoErr: any) {
              // Fallback to main database if school_info collection fails
              console.warn('⚠️ Failed to fetch from school_info, trying main database:', schoolInfoErr.message);
              const fallbackResponse = await api.get(`/schools/${schoolIdentifier}/info`);
              console.log('✅ School response from main database:', fallbackResponse);

              const schoolData = fallbackResponse.data?.data || fallbackResponse.data;
              console.log('📊 Extracted school data (fallback):', schoolData);
              setSchool(schoolData);

              debug.schoolFetch = { success: true, source: 'main_database', schoolName: schoolData?.name };
            }
          } catch (schoolErr: any) {
            console.error('❌ Error fetching school:', schoolErr);
            console.error('❌ Error details:', schoolErr.response?.data);
            debug.schoolFetch = {
              success: false,
              error: schoolErr.message,
              status: schoolErr.response?.status,
              data: schoolErr.response?.data
            };
            // Don't set error state yet, continue with users
          }

          try {
            // Fetch school users using the correct API
            // Use schoolCode (P) for the API call, not schoolId (ObjectId)
            const schoolCodeForAPI = user?.schoolCode || 'P';
            console.log('📡 Fetching users for school code:', schoolCodeForAPI);
            const usersResponse = await schoolUserAPI.getAllUsers(schoolCodeForAPI, token);
            console.log('✅ Users response:', usersResponse);

            // Handle the new flat array format
            let allUsers: any[] = [];
            if (usersResponse && usersResponse.data && Array.isArray(usersResponse.data)) {
              // New format: flat array in data field
              allUsers = usersResponse.data;
            } else if (usersResponse && typeof usersResponse === 'object') {
              // Old format: grouped by role (fallback)
              const roles = ['admin', 'teacher', 'student', 'parent'];
              for (const role of roles) {
                if (usersResponse[role] && Array.isArray(usersResponse[role])) {
                  allUsers.push(...usersResponse[role].map((user: any) => ({ ...user, role })));
                }
              }
            }

            // Normalize user objects so `name` is always a string (displayName or first+last)
            const normalized = allUsers.map(u => {
              const userObj: any = { ...u };
              if (userObj.name && typeof userObj.name === 'object') {
                userObj.name = userObj.name.displayName || (((userObj.name.firstName || '') + ' ' + (userObj.name.lastName || '')).trim()) || userObj.email;
              }
              return userObj;
            });
            setUsers(normalized);
            debug.usersFetch = {
              success: true,
              totalUsers: allUsers.length,
              breakdown: allUsers.reduce((acc: Record<string, number>, user: any) => {
                acc[user.role] = (acc[user.role] || 0) + 1;
                return acc;
              }, {})
            };

          } catch (userErr: any) {
            console.error('❌ Error fetching users:', userErr);
            debug.usersFetch = {
              success: false,
              error: userErr.message,
              status: userErr.response?.status,
              data: userErr.response?.data
            };
            throw userErr; // Propagate user fetch errors
          }

          setDebugInfo({ ...debug });

        } else {
          // No school information in user object
          console.log('⚠️  User object:', user);
          debug.noSchoolInfo = true;

          if (user?.role === 'superadmin') {
            // SuperAdmin doesn't need school information
            setError(null);
            setSchool(null);
            setUsers([]);
            debug.superadminMode = true;
          } else {
            setError('No school associated with this account. Please contact support.');
            console.error('❌ No schoolId or schoolCode found in user object:', user);
            debug.missingSchoolAssociation = true;
          }

          setDebugInfo({ ...debug });
        }
      } catch (err: any) {
        console.error('💥 Error in fetchSchoolAndUsers:', err);
        setError(`Failed to load school information: ${err.message}`);
        setDebugInfo({
          ...debugInfo,
          generalError: {
            message: err.message,
            stack: err.stack,
            response: err.response?.data
          }
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSchoolAndUsers();
  }, [user]);
  console.log(user);

  // Fetch today's attendance rate only
  useEffect(() => {
    const fetchAttendanceStats = async () => {
      try {
        const token = getAuthToken();
        if (!token || !user?.schoolCode) return;

        const today = new Date().toISOString().split('T')[0];
        console.log('📊 Fetching today\'s attendance rate for:', today);

        const response = await fetch(
          `http://localhost:5050/api/attendance/stats?date=${today}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('📊 Today\'s attendance data:', data);

          if (data.success) {
            const totalStudents = (data.presentCount || 0) + (data.absentCount || 0);
            if (totalStudents > 0) {
              const rate = ((data.presentCount || 0) / totalStudents * 100).toFixed(1);
              setAttendanceRate(`${rate}%`);
            } else {
              setAttendanceRate('0.0%');
            }
          }
        }
      } catch (err) {
        console.error('Error fetching today\'s attendance rate:', err);
        // Keep default value on error
      }
    };

    fetchAttendanceStats();
  }, [user]);

  // Fetch today's attendance for pie chart (both sessions)
  useEffect(() => {
    const fetchTodayAttendance = async () => {
      try {
        const token = getAuthToken();
        if (!token || !user?.schoolCode) return;

        const today = new Date().toISOString().split('T')[0];
        console.log('📊 Fetching today\'s attendance for:', today);

        // Fetch overall today's attendance
        const response = await fetch(
          `http://localhost:5050/api/attendance/stats?date=${today}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('📊 Today\'s attendance data:', data);

          if (data.success) {
            setTodayAttendance({
              present: data.presentCount || 0,
              absent: data.absentCount || 0
            });
          }
        }

        // Fetch morning session data
        const morningResponse = await fetch(
          `http://localhost:5050/api/attendance/session-data?date=${today}&session=morning`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (morningResponse.ok) {
          const morningData = await morningResponse.json();
          console.log('🌅 Morning attendance data:', morningData);

          if (morningData.success) {
            setMorningAttendance({
              present: morningData.presentCount || 0,
              absent: morningData.absentCount || 0
            });
          }
        }

        // Fetch afternoon session data
        const afternoonResponse = await fetch(
          `http://localhost:5050/api/attendance/session-data?date=${today}&session=afternoon`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (afternoonResponse.ok) {
          const afternoonData = await afternoonResponse.json();
          console.log('🌆 Afternoon attendance data:', afternoonData);

          if (afternoonData.success) {
            setAfternoonAttendance({
              present: afternoonData.presentCount || 0,
              absent: afternoonData.absentCount || 0
            });
          }
        }
      } catch (err) {
        console.error('Error fetching today\'s attendance:', err);
      }
    };

    fetchTodayAttendance();
  }, [user]);

  // Fetch daily attendance data for the weekly graph
  useEffect(() => {
    const fetchDailyAttendance = async () => {
      try {
        const token = getAuthToken();
        if (!token || !user?.schoolCode) return;

        // Get last 7 days
        const today = new Date();
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          last7Days.push(date);
        }

        console.log('📅 Fetching attendance for last 7 days');

        // Fetch attendance data from backend
        const response = await fetch(
          `http://localhost:5050/api/attendance/daily-stats?schoolCode=${user.schoolCode}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('📅 Daily attendance data:', data);

          if (data.success && data.dailyStats) {
            // Format data for the chart
            const formattedData = data.dailyStats.map((day: any) => ({
              name: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
              attendance: day.attendanceRate || 0,
              date: day.date
            }));
            setDailyAttendance(formattedData);
          } else {
            // Fallback: create chart with last 7 days showing 0%
            const fallbackData = last7Days.map(date => ({
              name: date.toLocaleDateString('en-US', { weekday: 'short' }),
              attendance: 0,
              date: date.toISOString().split('T')[0]
            }));
            setDailyAttendance(fallbackData);
          }
        } else {
          // Fallback data
          const fallbackData = last7Days.map(date => ({
            name: date.toLocaleDateString('en-US', { weekday: 'short' }),
            attendance: 0,
            date: date.toISOString().split('T')[0]
          }));
          setDailyAttendance(fallbackData);
        }
      } catch (err) {
        console.error('Error fetching daily attendance:', err);
        // Fallback to showing last 7 days with 0%
        const today = new Date();
        const fallbackData = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          fallbackData.push({
            name: date.toLocaleDateString('en-US', { weekday: 'short' }),
            attendance: 0,
            date: date.toISOString().split('T')[0]
          });
        }
        setDailyAttendance(fallbackData);
      }
    };

    fetchDailyAttendance();
  }, [user]);

  // Fetch class performance data
  useEffect(() => {
    const fetchClassPerformance = async () => {
      try {
        const token = getAuthToken();
        if (!token || !user?.schoolCode) return;

        console.log('📊 Fetching class performance data');

        const response = await fetch(
          `http://localhost:5050/api/results/class-performance-stats`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const result = await response.json();
          console.log('📊 Class performance data:', result);

          if (result.success && result.data) {
            setClassPerformance(result.data);
          }
        }
      } catch (err) {
        console.error('Error fetching class performance:', err);
      }
    };

    fetchClassPerformance();
  }, [user]);


  // Helper function to get full logo URL
  const getLogoUrl = (logoPath: string | undefined): string => {
    if (!logoPath) return '';
    if (logoPath.startsWith('http')) return logoPath;
    if (logoPath.startsWith('/uploads')) {
      const envBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5050/api';
      const baseUrl = envBase.replace(/\/api\/?$/, '');
      return `${baseUrl}${logoPath}`;
    }
    return logoPath;
  };

  // Calculate stats from actual user data
  const totalStudents = users.filter(user => user.role === 'student').length;
  const totalTeachers = users.filter(user => user.role === 'teacher').length;

  // Use real data from the school or fallback to sample data
  const stats = [
    { name: 'Total Students', value: totalStudents.toString(), icon: Users, color: 'bg-blue-500' },
    { name: 'Attendance Rate', value: attendanceRate, icon: UserCheck, color: 'bg-green-500' },
    { name: 'Total Teachers', value: totalTeachers.toString(), icon: BookOpen, color: 'bg-purple-500' },
  ];

  // Use dynamic daily attendance data
  const attendanceData = dailyAttendance.length > 0 ? dailyAttendance : [
    { name: 'Mon', attendance: 0 },
    { name: 'Tue', attendance: 0 },
    { name: 'Wed', attendance: 0 },
    { name: 'Thu', attendance: 0 },
    { name: 'Fri', attendance: 0 },
    { name: 'Sat', attendance: 0 },
    { name: 'Sun', attendance: 0 },
  ];

  // Dynamic pie data for morning session
  const morningPieData = [
    { name: 'Present', value: morningAttendance.present, color: '#10B981' },
    { name: 'Absent', value: morningAttendance.absent, color: '#EF4444' },
  ];

  // Dynamic pie data for afternoon session
  const afternoonPieData = [
    { name: 'Present', value: afternoonAttendance.present, color: '#10B981' },
    { name: 'Absent', value: afternoonAttendance.absent, color: '#EF4444' },
  ];

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <span className="ml-4 text-gray-600">Loading school data...</span>
        </div>
      ) : error ? (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 p-4 rounded-md">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
              <p className="text-red-700 font-medium">Error Loading Data</p>
            </div>
            <p className="text-red-600 mt-2">{error}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </button>
              {!getAuthToken() && (
                <button
                  onClick={() => {
                    logout();
                    window.location.href = '/login';
                  }}
                  className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Login Again
                </button>
              )}
            </div>
          </div>

          {/* Debug Panel */}
          <div className="bg-gray-50 border border-gray-200 p-4 rounded-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <Bug className="h-5 w-5 text-gray-500 mr-2" />
                <h3 className="text-sm font-medium text-gray-700">Debug Information</h3>
              </div>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {showDebug ? 'Hide' : 'Show'} Details
              </button>
            </div>

            {showDebug && debugInfo && (
              <div className="bg-white p-3 rounded border text-xs">
                <pre className="whitespace-pre-wrap overflow-x-auto text-gray-600">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>
            )}

            <div className="text-xs text-gray-500 mt-2">
              <p>User Role: {user?.role}</p>
              <p>School ID: {user?.schoolId || 'Not found'}</p>
              <p>School Code: {user?.schoolCode || 'Not found'}</p>
              <p>Token Available: {!!getAuthToken() ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* School Info Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* School Logo */}
                {school?.logoUrl && (
                  <div className="w-24 h-24 border border-gray-200 rounded-lg p-2 flex-shrink-0">
                    <img
                      src={getLogoUrl(school.logoUrl)}
                      alt={`${school.name} logo`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* School Info */}
                <div className="flex-grow text-center md:text-left">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{school?.name || user?.schoolName || 'Your School'}</h2>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      {school?.code || 'N/A'}
                    </span>
                    {school?.affiliationBoard && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                        {school.affiliationBoard}
                      </span>
                    )}
                  </div>

                  {/* Address */}
                  {school?.address && (
                    <div className="flex items-start justify-center md:justify-start text-gray-600 mb-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 mt-0.5 flex-shrink-0">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
                      <span className="text-sm">
                        {school.address.street && school.address.city
                          ? `${school.address.street}, ${school.address.city}`
                          : school.address.street || school.address.city || 'Address not available'}
                        {school.address.state && `, ${school.address.state}`}
                        {school.address.pinCode && ` - ${school.address.pinCode}`}
                      </span>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-gray-600 text-sm">
                    {(school?.contact?.phone || school?.mobile) && (
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        {school.contact?.phone || school.mobile}
                      </div>
                    )}
                    {(school?.contact?.email || school?.principalEmail) && (
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                          <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                        </svg>
                        {school.contact?.email || school.principalEmail}
                      </div>
                    )}
                    {(school?.contact?.website || school?.website) && (
                      <div className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="2" x2="22" y1="12" y2="12"></line>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        <a href={(school.contact?.website || school.website)?.startsWith('http') ? (school.contact?.website || school.website) : `https://${school.contact?.website || school.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                          {school.contact?.website || school.website}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stats.map((stat) => (
              <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center">
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Users Section */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Associated Users
              <span className="text-sm font-normal text-gray-500 ml-2">({users.length} total)</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.length > 0 ? (
                    users.slice(0, 5).map((user) => (
                      <tr key={user._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {typeof (user as any).name === 'string'
                              ? (user as any).name
                              : ((user as any).name?.displayName || (((user as any).name?.firstName || '') + ' ' + ((user as any).name?.lastName || '')).trim() || user.email || 'Unknown User')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                              user.role === 'student' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                            }`}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                        No users found for this school
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {users.length > 5 && (
                <div className="px-6 py-4 text-center">
                  <Link to="/admin/users" className="text-sm text-blue-600 hover:text-blue-800">
                    View all {users.length} users
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Class Performance */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Class Performance</h3>
            {classPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={classPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 100]} label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(value: number, name: string, props: any) => [
                      `${value}%`,
                      `Average: ${value}% (${props.payload.studentCount} students)`
                    ]}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="percentage" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No performance data available</p>
                <p className="text-sm mt-2">Results will appear here once students' grades are entered</p>
              </div>
            )}
          </div>

          {/* Today's Attendance Section Title */}
          <div className="mt-2">
            <h2 className="text-xl font-semibold text-gray-900 text-center">Today's Attendance</h2>
          </div>

          {/* Today's Attendance - Morning and Afternoon Sessions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Morning Session */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-yellow-100 p-2 rounded-full mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Morning Session</h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={morningPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                    labelLine={true}
                  >
                    {morningPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value} students`, 'Count']}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center space-x-6 mt-4">
                {morningPieData.map((item) => (
                  <div key={item.name} className="flex items-center">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-xl font-bold text-gray-900 ml-2">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              {(morningAttendance.present + morningAttendance.absent) > 0 && (
                <div className="text-center mt-3 text-xs text-gray-500">
                  Total: {morningAttendance.present + morningAttendance.absent} students
                </div>
              )}
            </div>

            {/* Afternoon Session */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-orange-100 p-2 rounded-full mr-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-600">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Afternoon Session</h3>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={afternoonPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                    labelLine={true}
                  >
                    {afternoonPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value} students`, 'Count']}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center space-x-6 mt-4">
                {afternoonPieData.map((item) => (
                  <div key={item.name} className="flex items-center">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></div>
                    <div>
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="text-xl font-bold text-gray-900 ml-2">{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              {(afternoonAttendance.present + afternoonAttendance.absent) > 0 && (
                <div className="text-center mt-3 text-xs text-gray-500">
                  Total: {afternoonAttendance.present + afternoonAttendance.absent} students
                </div>
              )}
            </div>
          </div>

          {/* Weekly Attendance - Centered */}
          <div className="flex justify-center">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 w-full lg:w-1/2">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">Weekly Attendance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={attendanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="attendance" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Actions */}
          {/* <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to="/admin/users" className="flex items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                <Users className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-700">Manage Users</span>
              </Link>
              <Link to="/admin/attendance/mark" className="flex items-center justify-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                <UserCheck className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-700">Mark Attendance</span>
              </Link>
              <Link to="/admin/assignments" className="flex items-center justify-center p-4 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors">
                <BookOpen className="h-5 w-5 text-yellow-600 mr-2" />
                <span className="text-sm font-medium text-yellow-700">Assignments</span>
              </Link>
            </div>
          </div> */}
        </>
      )}
    </div>
  );
};

export default Dashboard;
