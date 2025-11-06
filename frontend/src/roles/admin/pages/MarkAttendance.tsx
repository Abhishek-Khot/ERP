import React, { useState, useEffect } from 'react';
import * as attendanceAPI from '../../../api/attendance';
import { schoolUserAPI } from '../../../api/schoolUsers';
import { useAuth } from '../../../auth/AuthContext';
import { useSchoolClasses } from '../../../hooks/useSchoolClasses'; // Import the hook
import { Save, Calendar, Users, UserCheck, UserX, Search, Clock, Sun, Moon, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Student {
  _id: string;
  userId: string;
  name: string;
  class: string;
  section: string;
  morningStatus: 'present' | 'absent' | null;
  afternoonStatus: 'present' | 'absent' | null;
}

const MarkAttendance: React.FC = () => {
  const { token, user } = useAuth();

  // Use the useSchoolClasses hook to fetch classes configured by superadmin
  const {
    classesData,
    loading: classesLoading,
    error: classesError,
    getClassOptions,
    getSectionsByClass,
    hasClasses
  } = useSchoolClasses();

  const [academicYear, setAcademicYear] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [session, setSession] = useState<'morning' | 'afternoon'>('morning');
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Session status tracking
  const [sessionStatus, setSessionStatus] = useState<{
    morning: { isMarked: boolean; isFrozen: boolean; canModify: boolean; data?: any };
    afternoon: { isMarked: boolean; isFrozen: boolean; canModify: boolean; data?: any };
  }>({
    morning: { isMarked: false, isFrozen: false, canModify: true },
    afternoon: { isMarked: false, isFrozen: false, canModify: true }
  });

  // Get class list from superadmin configuration instead of hardcoding
  const classList = classesData?.classes?.map(c => c.className) || [];

  // Update available sections when class changes
  useEffect(() => {
    if (selectedClass && classesData) {
      const sections = getSectionsByClass(selectedClass);
      setAvailableSections(sections);
      // Auto-select first section if available
      if (sections.length > 0) {
        setSelectedSection(sections[0].value);
      } else {
        setSelectedSection('');
      }
    } else {
      setAvailableSections([]);
      setSelectedSection('');
    }
  }, [selectedClass, classesData]);

  // Fetch students when class and section are selected
  useEffect(() => {
    if (selectedClass && selectedSection && token && user?.schoolCode) {
      fetchStudents();
    } else {
      setStudents([]);
    }
  }, [selectedClass, selectedSection, token, user?.schoolCode]);

  // Check session status when date or session changes
  useEffect(() => {
    if (selectedClass && selectedSection && selectedDate) {
      checkSessionStatus();
    }
  }, [selectedClass, selectedSection, selectedDate, session]);

  // Load existing attendance when students are loaded and filters are set
  useEffect(() => {
    if (students.length > 0 && selectedDate) {
      loadExistingAttendance();
    }
  }, [students.length, selectedDate, session]);

  useEffect(() => {
    filterStudents();
  }, [students, searchTerm]);

  const checkSessionStatus = async () => {
    if (!selectedClass || !selectedSection || !selectedDate) {
      return;
    }

    try {
      // Check both morning and afternoon sessions
      const morningCheck = await attendanceAPI.checkSessionStatus({
        class: selectedClass,
        section: selectedSection,
        date: selectedDate,
        session: 'morning'
      });

      const afternoonCheck = await attendanceAPI.checkSessionStatus({
        class: selectedClass,
        section: selectedSection,
        date: selectedDate,
        session: 'afternoon'
      });

      setSessionStatus({
        morning: {
          isMarked: morningCheck.isMarked || false,
          isFrozen: morningCheck.isFrozen || false,
          canModify: morningCheck.canModify !== false,
          data: morningCheck.data
        },
        afternoon: {
          isMarked: afternoonCheck.isMarked || false,
          isFrozen: afternoonCheck.isFrozen || false,
          canModify: afternoonCheck.canModify !== false,
          data: afternoonCheck.data
        }
      });

    } catch (err) {
      console.warn('Could not check session status:', err);
      // Reset to default if check fails
      setSessionStatus({
        morning: { isMarked: false, isFrozen: false, canModify: true },
        afternoon: { isMarked: false, isFrozen: false, canModify: true }
      });
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass || !selectedSection) {
      setStudents([]);
      return;
    }

    if (!token || !user?.schoolCode) {
      setError('Authentication required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      console.log('🔍 Fetching students for:', { 
        class: selectedClass, 
        section: selectedSection, 
        schoolCode: user.schoolCode 
      });

      // Make API call with query parameters for filtering
      const response = await fetch(
        `http://localhost:5050/api/users/role/student?class=${selectedClass}&section=${selectedSection}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-school-code': user.schoolCode
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch students');
      }

      const data = await response.json();
      console.log('📊 API Response:', data);
      
      const users = data.data || data || [];
      console.log(`👥 Total users received: ${users.length}`);

      // Filter students - check multiple possible field structures including currentClass/currentSection
      const filtered = users.filter((u: any) => {
        const isStudent = u.role === 'student';
        const matchesClass = u.academicInfo?.class === selectedClass || 
                            u.studentDetails?.class === selectedClass ||
                            u.studentDetails?.currentClass === selectedClass ||
                            u.class === selectedClass;
        const matchesSection = u.academicInfo?.section === selectedSection || 
                              u.studentDetails?.section === selectedSection ||
                              u.studentDetails?.currentSection === selectedSection ||
                              u.section === selectedSection;
        
        return isStudent && matchesClass && matchesSection;
      });

      console.log(`✅ Filtered students: ${filtered.length}`);

      const studentsWithAttendance = filtered.map((u: any) => ({
        _id: u._id,
        userId: u.userId,
        name: u.name?.displayName || u.name || 'Unknown',
        class: u.academicInfo?.class || u.studentDetails?.class || u.studentDetails?.currentClass || u.class || selectedClass,
        section: u.academicInfo?.section || u.studentDetails?.section || u.studentDetails?.currentSection || u.section || selectedSection,
        morningStatus: null,
        afternoonStatus: null
      }));

      setStudents(studentsWithAttendance);
      
      if (studentsWithAttendance.length === 0) {
        setError(`No students found for Class ${selectedClass} Section ${selectedSection}`);
      }
    } catch (err) {
      setError('Failed to fetch students');
      console.error('❌ Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterStudents = () => {
    if (!searchTerm) {
      setFilteredStudents(students);
      return;
    }

    const filtered = students.filter(student =>
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.userId.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredStudents(filtered);
  };

  const loadExistingAttendance = async () => {
    if (!selectedClass || !selectedSection || !selectedDate) {
      return;
    }

    try {
      // Use the new getAttendance API with session-based storage
      const response = await attendanceAPI.getAttendance({
        class: selectedClass,
        section: selectedSection,
        date: selectedDate,
        session: session
      });

      if (response.success && response.data && response.data.length > 0) {
        // Find the session document
        const sessionDoc = response.data.find(
          (doc: any) => doc.session === session && doc.dateString === selectedDate
        );

        if (sessionDoc && sessionDoc.students) {
          // Update students with existing attendance data from session document
          setStudents(prev => prev.map(student => {
            const existingRecord = sessionDoc.students.find(
              (record: any) => record.studentId === student.userId
            );

            if (existingRecord) {
              return {
                ...student,
                [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: existingRecord.status
              };
            }
            return student;
          }));
        }
      }
    } catch (err) {
      console.warn('Could not load existing attendance:', err);
      // Don't show error to user as this is optional
    }
  };

  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClass(e.target.value);
    setSelectedSection(''); // Reset section when class changes
    setStudents([]);
  };

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSection(e.target.value);
  };

  // Helper function to get display name for class
  const getClassDisplayName = (cls: string) => {
    if (cls === 'LKG' || cls === 'UKG') return cls;
    return `Class ${cls}`;
  };

  const updateStudentStatus = (studentId: string, status: 'present' | 'absent') => {
    setStudents(prev => prev.map(student =>
      student._id === studentId
        ? {
          ...student,
          [session === 'morning' ? 'morningStatus' : 'afternoonStatus']: status
        }
        : student
    ));
  };

  const markAllPresent = () => {
    const statusField = session === 'morning' ? 'morningStatus' : 'afternoonStatus';
    setStudents(prev => prev.map(student => ({
      ...student,
      [statusField]: 'present' as const
    })));
  };

  const markAllAbsent = () => {
    const statusField = session === 'morning' ? 'morningStatus' : 'afternoonStatus';
    setStudents(prev => prev.map(student => ({
      ...student,
      [statusField]: 'absent' as const
    })));
  };

  const getCurrentStatus = (student: Student) => {
    return session === 'morning' ? student.morningStatus : student.afternoonStatus;
  };

  const getAttendanceSummary = () => {
    const statusField = session === 'morning' ? 'morningStatus' : 'afternoonStatus';
    const present = filteredStudents.filter(s => s[statusField] === 'present').length;
    const absent = filteredStudents.filter(s => s[statusField] === 'absent').length;
    const unmarked = filteredStudents.filter(s => s[statusField] === null).length;

    return { present, absent, unmarked, total: filteredStudents.length };
  };

  const summary = getAttendanceSummary();

  const handleSaveAttendance = async () => {
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      // Check if current session is frozen
      const currentSessionStatus = sessionStatus[session];
      if (currentSessionStatus.isFrozen) {
        setError(`${session.charAt(0).toUpperCase() + session.slice(1)} attendance has already been marked and is frozen. Cannot modify existing attendance.`);
        setLoading(false);
        return;
      }

      // Filter students with marked attendance
      const studentsWithAttendance = students
        .map(s => ({
          studentId: s.userId, // Use userId (like "P-S-0997") instead of _id (ObjectId)
          userId: s.userId,
          status: getCurrentStatus(s)
        }))
        .filter(s => s.status !== null);

      if (studentsWithAttendance.length === 0) {
        setError('Please mark attendance for at least one student');
        return;
      }

      const attendanceData = {
        date: selectedDate,
        class: selectedClass,
        section: selectedSection,
        session: session,
        students: studentsWithAttendance
      };

      console.log('Saving attendance data:', attendanceData);

      const response = await attendanceAPI.markSessionAttendance(attendanceData);

      if (response.success) {
        setSuccessMessage(
          `✅ ${session.charAt(0).toUpperCase() + session.slice(1)} attendance saved successfully! ` +
          `${response.data.successCount} students marked.`
        );

        // Clear all attendance entries (reset to null)
        const statusField = session === 'morning' ? 'morningStatus' : 'afternoonStatus';
        setStudents(prev => prev.map(student => ({
          ...student,
          [statusField]: null
        })));

        // Refresh session status to show it's now frozen
        await checkSessionStatus();

        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError(response.message || 'Failed to save attendance');
      }
    } catch (err: any) {
      console.error('Error saving attendance:', err);
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to save attendance. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Mark Attendance</h1>
        <div className="flex space-x-3">
          <button
            onClick={markAllPresent}
            disabled={sessionStatus[session].isFrozen}
            className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors ${sessionStatus[session].isFrozen ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            title={sessionStatus[session].isFrozen ? 'Attendance is frozen and cannot be modified' : ''}
          >
            <UserCheck className="h-4 w-4 mr-2" />
            Mark All Present
          </button>
          <button
            onClick={markAllAbsent}
            disabled={sessionStatus[session].isFrozen}
            className={`bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors ${sessionStatus[session].isFrozen ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            title={sessionStatus[session].isFrozen ? 'Attendance is frozen and cannot be modified' : ''}
          >
            <UserX className="h-4 w-4 mr-2" />
            Mark All Absent
          </button>
          <button
            onClick={handleSaveAttendance}
            disabled={loading || !selectedClass || !selectedSection || sessionStatus[session].isFrozen}
            className={`bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center transition-colors ${sessionStatus[session].isFrozen ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            title={sessionStatus[session].isFrozen ? 'Attendance is frozen and cannot be modified' : ''}
          >
            <Save className="h-4 w-4 mr-2" />
            {sessionStatus[session].isFrozen ? 'Attendance Frozen' : (loading ? 'Saving...' : 'Save Attendance')}
          </button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year</label>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select year...</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2025-2026">2025-2026</option>
              <option value="2026-2027">2026-2027</option>
              <option value="2027-2028">2027-2028</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
            <select
              value={selectedClass}
              onChange={handleClassChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={classesLoading || !hasClasses()}
            >
              <option value="">{classesLoading ? 'Loading...' : 'Select Class'}</option>
              {classList.map((cls) => (
                <option key={cls} value={cls}>{getClassDisplayName(cls)}</option>
              ))}
            </select>
            {!classesLoading && !hasClasses() && (
              <span className="text-xs text-red-500 mt-1">No classes configured</span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Section</label>
            <select
              value={selectedSection}
              onChange={handleSectionChange}
              disabled={!selectedClass || availableSections.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">{!selectedClass ? 'Select Class First' : 'Select Section'}</option>
              {availableSections.map((section) => (
                <option key={section.value} value={section.value}>Section {section.section}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session</label>
            <div className="flex rounded-lg border border-gray-300">
              <button
                type="button"
                onClick={() => setSession('morning')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-l-lg flex items-center justify-center relative ${session === 'morning'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  } ${sessionStatus.morning.isFrozen ? 'opacity-75' : ''}`}
              >
                <Sun className="h-4 w-4 mr-1" />
                Morning
                {sessionStatus.morning.isFrozen && (
                  <div className="absolute top-0 right-0 -mt-1 -mr-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full border border-white" title="Attendance marked and frozen"></div>
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSession('afternoon')}
                className={`flex-1 py-2 px-3 text-sm font-medium rounded-r-lg flex items-center justify-center relative ${session === 'afternoon'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  } ${sessionStatus.afternoon.isFrozen ? 'opacity-75' : ''}`}
              >
                <Moon className="h-4 w-4 mr-1" />
                Afternoon
                {sessionStatus.afternoon.isFrozen && (
                  <div className="absolute top-0 right-0 -mt-1 -mr-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full border border-white" title="Attendance marked and frozen"></div>
                  </div>
                )}
              </button>
            </div>

            {/* Show session status info */}
            {selectedClass && selectedSection && (
              <div className="mt-2 text-sm">
                {sessionStatus[session].isFrozen ? (
                  <div className="flex items-center text-green-600">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    <span>
                      {session.charAt(0).toUpperCase() + session.slice(1)} attendance is marked and frozen
                      {sessionStatus[session].data?.markedAt && (
                        <span className="text-gray-500 ml-1">
                          (marked on {new Date(sessionStatus[session].data.markedAt).toLocaleString()})
                        </span>
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center text-blue-600">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    <span>
                      {session.charAt(0).toUpperCase() + session.slice(1)} attendance can be marked
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      {selectedClass && selectedSection && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or user ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {selectedClass && selectedSection && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Present</div>
                <div className="text-2xl font-bold text-green-600">{summary.present}</div>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Absent</div>
                <div className="text-2xl font-bold text-red-600">{summary.absent}</div>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Unmarked</div>
                <div className="text-2xl font-bold text-gray-600">{summary.unmarked}</div>
              </div>
              <Clock className="h-8 w-8 text-gray-600" />
            </div>
          </div>
        </div>
      )}

      {/* Students List */}
      {selectedClass && selectedSection && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {session.charAt(0).toUpperCase() + session.slice(1)} Attendance - {getClassDisplayName(selectedClass)} Section {selectedSection}
              </h3>
              <div className="text-sm text-gray-600">
                Progress: {summary.present + summary.absent}/{summary.total} marked
              </div>
            </div>

            {loading ? (
              <div className="text-center py-4">Loading students...</div>
            ) : filteredStudents.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                {students.length === 0
                  ? 'No students found in this class and section'
                  : 'No students match your search criteria'
                }
              </div>
            ) : (
              <div className="space-y-3">
                {filteredStudents.map((student) => (
                  <div key={student._id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-blue-600" />
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{student.name}</div>
                        <div className="text-sm text-gray-500">User ID: {student.userId}</div>
                        <div className="text-sm text-gray-500">{student.class} - Section {student.section}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => updateStudentStatus(student._id, 'present')}
                        disabled={sessionStatus[session].isFrozen}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center space-x-1 ${getCurrentStatus(student) === 'present'
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'
                          } ${sessionStatus[session].isFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={sessionStatus[session].isFrozen ? 'Attendance is frozen and cannot be modified' : ''}
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Present</span>
                      </button>
                      <button
                        onClick={() => updateStudentStatus(student._id, 'absent')}
                        disabled={sessionStatus[session].isFrozen}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center space-x-1 ${getCurrentStatus(student) === 'absent'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-red-50'
                          } ${sessionStatus[session].isFrozen ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={sessionStatus[session].isFrozen ? 'Attendance is frozen and cannot be modified' : ''}
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Absent</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      {!selectedClass || !selectedSection ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Get Started</h3>
              <div className="mt-2 text-sm text-blue-700">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Select a date for attendance</li>
                  <li>Choose a class from the dropdown</li>
                  <li>Select a section to view students</li>
                  <li>Choose morning or afternoon session</li>
                  <li>Mark attendance for each student</li>
                  <li>Save the attendance record</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarkAttendance;