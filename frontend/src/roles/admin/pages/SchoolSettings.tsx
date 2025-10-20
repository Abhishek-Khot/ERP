import React, { useState, useEffect } from 'react';
import { Save, Calendar, GraduationCap, Clock, Bell, Users, Award, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

interface TestData {
  _id: string;
  testName: string;
  testType?: string;
  className: string;
  description?: string;
  isActive: boolean;
  maxMarks?: number;
  weightage?: number;
  displayName?: string;
}

interface ClassData {
  _id: string;
  className: string;
  sections: string[];
  academicYear: string;
  createdAt: string;
  studentCount?: number;
}

const SchoolSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('academic');
  const [tests, setTests] = useState<TestData[]>([]);
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(false);
  const [testScoring, setTestScoring] = useState<Record<string, { maxMarks: number; weightage: number }>>({});
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  // Get school code and token from localStorage
  const getAuthData = () => {
    const authData = localStorage.getItem('erp.auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      const schoolCode = parsed.user?.schoolCode || parsed.schoolCode || 'SB';
      const token = parsed.token;
      console.log('🔍 Admin Auth Data:', parsed);
      console.log('🔍 Extracted School Code:', schoolCode);
      console.log('🔍 Token exists:', !!token);
      return { schoolCode, token };
    }
    console.error('❌ No auth data found in localStorage');
    return { schoolCode: null, token: null };
  };

  // Fetch tests from Admin API
  const fetchTests = async () => {
    const { schoolCode, token } = getAuthData();
    if (!schoolCode || !token) {
      console.error('❌ Cannot fetch tests: School code or token not found');
      toast.error('Authentication error. Please login again.');
      return;
    }

    try {
      setLoading(true);
      const endpoint = `/admin/classes/${schoolCode}/tests`;
      console.log('📡 Fetching tests from endpoint:', endpoint);
      console.log('📡 Using school code:', schoolCode);
      
      const response = await api.get(endpoint);
      
      console.log('📥 Tests API Response:', response.data);
      
      if (response.data.success) {
        const tests = response.data.data?.tests || response.data.tests || [];
        
        // Log the first test to see its structure
        if (tests.length > 0) {
          console.log('📋 First test structure:', tests[0]);
          console.log('📋 Test fields:', Object.keys(tests[0]));
        }
        
        setTests(tests);
        console.log('✅ Fetched tests:', tests);
        toast.success(`Loaded ${tests.length} tests`);
      } else {
        console.error('❌ API returned success: false', response.data);
        toast.error(response.data.message || 'Failed to fetch tests');
      }
    } catch (error: any) {
      console.error('❌ Error fetching tests:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  };

  // Fetch classes from Admin API
  const fetchClasses = async () => {
    const { schoolCode, token } = getAuthData();
    if (!schoolCode || !token) {
      console.error('❌ Cannot fetch classes: School code or token not found');
      toast.error('Authentication error. Please login again.');
      return;
    }

    try {
      setLoading(true);
      const endpoint = `/admin/classes/${schoolCode}/classes-sections`;
      console.log('📡 Fetching classes from endpoint:', endpoint);
      console.log('📡 Using school code:', schoolCode);
      
      const response = await api.get(endpoint);
      
      console.log('📥 Classes API Response:', response.data);
      
      if (response.data.success) {
        const classes = response.data.data?.classes || response.data.classes || [];
        
        // Fetch all students once (more efficient than per-class)
        let allStudents: any[] = [];
        try {
          const studentsEndpoint = `/school-users/${schoolCode}/users/role/student`;
          const studentsResponse = await api.get(studentsEndpoint);
          
          if (studentsResponse.data.success) {
            allStudents = studentsResponse.data.data || studentsResponse.data.users || [];
            console.log(`📊 Fetched ${allStudents.length} total students`);
          }
        } catch (error) {
          console.error('Error fetching students:', error);
        }
        
        // Count students for each class
        const classesWithCounts = classes.map((cls: ClassData) => {
          const studentCount = allStudents.filter((s: any) => 
            s.studentDetails?.currentClass === cls.className || s.class === cls.className
          ).length;
          
          return { ...cls, studentCount };
        });
        
        // Sort classes in order: LKG, UKG, then 1-12
        const sortedClasses = classesWithCounts.sort((a: ClassData, b: ClassData) => {
          const classOrder = ['LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
          
          const aIndex = classOrder.indexOf(a.className);
          const bIndex = classOrder.indexOf(b.className);
          
          // If both are in the predefined order, sort by index
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }
          // If only a is in the order, it comes first
          if (aIndex !== -1) return -1;
          // If only b is in the order, it comes first
          if (bIndex !== -1) return 1;
          // If neither is in the order, sort alphabetically
          return a.className.localeCompare(b.className);
        });
        
        // Sort sections within each class
        sortedClasses.forEach((cls: ClassData) => {
          if (cls.sections && cls.sections.length > 0) {
            cls.sections.sort((a, b) => a.localeCompare(b));
          }
        });
        
        setClasses(sortedClasses);
        console.log('✅ Fetched classes with student counts (sorted):', sortedClasses);
        toast.success(`Loaded ${classes.length} classes`);
      } else {
        console.error('❌ API returned success: false', response.data);
        toast.error(response.data.message || 'Failed to fetch classes');
      }
    } catch (error: any) {
      console.error('❌ Error fetching classes:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'Failed to fetch classes');
    } finally {
      setLoading(false);
    }
  };

  // Toggle test expansion
  const toggleTestExpansion = (testId: string) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  // Handle test scoring changes
  const handleScoringChange = (testId: string, field: 'maxMarks' | 'weightage', value: number) => {
    setTestScoring(prev => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        [field]: value
      }
    }));
  };

  // Save scoring configuration
  const handleSaveScoring = async () => {
    const { schoolCode, token } = getAuthData();
    if (!schoolCode || !token) {
      toast.error('Authentication error. Please login again.');
      return;
    }

    // Get only configured tests (maxMarks must be set)
    const configuredTests = tests.filter(test => 
      testScoring[test._id]?.maxMarks
    );

    // Validate that at least one test is configured
    if (configuredTests.length === 0) {
      toast.error('Please configure at least one test before saving.');
      return;
    }

    try {
      console.log('Saving scoring configuration:', testScoring);
      console.log(`Saving ${configuredTests.length} configured test(s)`);
      
      // Prepare data for API - only send configured tests
      const scoringData = configuredTests.map(test => ({
        testId: test._id,
        testName: test.testName,
        className: test.className,
        maxMarks: testScoring[test._id]?.maxMarks,
        weightage: testScoring[test._id]?.weightage
      }));

      const endpoint = `/admin/classes/${schoolCode}/test-scoring`;
      const response = await api.post(endpoint, { scoring: scoringData });

      if (response.data.success) {
        const unconfiguredCount = tests.length - configuredTests.length;
        const message = unconfiguredCount > 0 
          ? `Saved ${configuredTests.length} test(s). ${unconfiguredCount} test(s) not configured yet.`
          : `All ${configuredTests.length} test(s) configured successfully!`;
        toast.success(message);
        console.log('✅ Saved scoring:', response.data);
        // Refresh tests to get updated data
        await fetchTests();
      } else {
        toast.error(response.data.message || 'Failed to save scoring');
      }
    } catch (error: any) {
      console.error('❌ Error saving scoring:', error);
      toast.error(error.response?.data?.message || 'Failed to save scoring configuration');
    }
  };

  // Load data when component mounts or tab changes
  useEffect(() => {
    if (activeTab === 'scoring') {
      fetchTests();
    } else if (activeTab === 'classes') {
      fetchClasses();
    }
  }, [activeTab]);

  // Initialize testScoring state when tests are loaded
  useEffect(() => {
    if (tests.length > 0) {
      const initialScoring: Record<string, { maxMarks: number; weightage: number }> = {};
      tests.forEach(test => {
        console.log(`🔍 Checking test ${test.testName || test._id}:`, {
          maxMarks: test.maxMarks,
          weightage: test.weightage,
          hasMaxMarks: !!test.maxMarks,
          hasWeightage: !!test.weightage
        });
        
        if (test.maxMarks || test.weightage) {
          initialScoring[test._id] = {
            maxMarks: test.maxMarks || 0,
            weightage: test.weightage || 0
          };
          console.log(`✅ Added to initialScoring:`, initialScoring[test._id]);
        }
      });
      setTestScoring(initialScoring);
      console.log('📊 Initialized test scoring with existing values:', initialScoring);
    }
  }, [tests]);

  const tabs = [
    { id: 'academic', name: 'Academic Year', icon: Calendar },
    { id: 'scoring', name: 'Scoring System', icon: GraduationCap },
    { id: 'classes', name: 'Class Structure', icon: Users },
    { id: 'schedule', name: 'Schedule Settings', icon: Clock },
    { id: 'notifications', name: 'Notifications', icon: Bell },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">School Settings</h1>
        {activeTab === 'scoring' && (
          <button 
            onClick={handleSaveScoring}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Scoring
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'academic' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Academic Year Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Academic Year</label>
                  <input
                    type="text"
                    defaultValue="2024-2025"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year Start</label>
                  <input
                    type="date"
                    defaultValue="2024-04-01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Academic Year End</label>
                  <input
                    type="date"
                    defaultValue="2025-03-31"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Number of Terms</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="2">2 Terms</option>
                    <option value="3">3 Terms</option>
                    <option value="4">4 Terms</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scoring' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Scoring System</h3>
                <p className="text-sm text-gray-600">Configure max marks and weightage for tests</p>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Tests are created by SuperAdmin. Here you can configure the scoring parameters (Max Marks and Weightage) for each test.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading tests...</p>
                </div>
              ) : tests.length === 0 ? (
                <div className="text-center py-12">
                  <Award className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Tests Found</h3>
                  <p className="text-gray-600">Tests created by SuperAdmin will appear here.</p>
                  <p className="text-sm text-gray-500 mt-2">Ask your SuperAdmin to create tests in the Academics section.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tests.sort((a, b) => {
                    // Sort tests by class order: LKG, UKG, 1-12
                    const classOrder = ['LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
                    const aClassName = a.className;
                    const bClassName = b.className;
                    
                    const aIndex = classOrder.indexOf(aClassName);
                    const bIndex = classOrder.indexOf(bClassName);
                    
                    if (aIndex !== -1 && bIndex !== -1) {
                      return aIndex - bIndex;
                    }
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return aClassName.localeCompare(bClassName);
                  }).map((test) => {
                    // Check if configured - only maxMarks is enough to determine configuration
                    const isConfigured = testScoring[test._id]?.maxMarks || test.maxMarks;
                    const isExpanded = expandedTests.has(test._id);
                    
                    // Get test name - handle both testName and name fields
                    const testName = test.testName || (test as any).name || 'Unnamed Test';
                    
                    // Debug log for each test
                    if (!test.testName && !(test as any).name) {
                      console.warn('⚠️ Test missing name:', test);
                    }
                    
                    return (
                      <div key={test._id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        {/* Clickable Header */}
                        <div 
                          onClick={() => toggleTestExpansion(test._id)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-gray-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-500 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-baseline gap-2">
                                <h3 className="text-base font-semibold text-gray-900">{testName}</h3>
                              </div>
                              <p className="text-sm text-gray-600 mt-0.5">Class {test.className}</p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 text-xs font-medium rounded-full flex-shrink-0 ${
                            isConfigured 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {isConfigured ? 'Configured' : 'Not Configured'}
                          </span>
                        </div>

                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="p-4 pt-0 border-t border-gray-100">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Max Marks</label>
                                <select
                                  value={testScoring[test._id]?.maxMarks || test.maxMarks || ''}
                                  onChange={(e) => handleScoringChange(test._id, 'maxMarks', parseInt(e.target.value) || 0)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                  <option value="">Select max marks</option>
                                  <option value="20">20</option>
                                  <option value="25">25</option>
                                  <option value="30">30</option>
                                  <option value="40">40</option>
                                  <option value="50">50</option>
                                  <option value="60">60</option>
                                  <option value="70">70</option>
                                  <option value="80">80</option>
                                  <option value="90">90</option>
                                  <option value="100">100</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Weightage (%)</label>
                                <select
                                  value={testScoring[test._id]?.weightage || test.weightage || ''}
                                  onChange={(e) => handleScoringChange(test._id, 'weightage', parseInt(e.target.value) || 0)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                >
                                  <option value="">Select weightage</option>
                                  <option value="5">5%</option>
                                  <option value="10">10%</option>
                                  <option value="15">15%</option>
                                  <option value="20">20%</option>
                                  <option value="25">25%</option>
                                  <option value="30">30%</option>
                                  <option value="35">35%</option>
                                  <option value="40">40%</option>
                                  <option value="50">50%</option>
                                  <option value="60">60%</option>
                                  <option value="70">70%</option>
                                  <option value="80">80%</option>
                                  <option value="100">100%</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>How it works:</strong> SuperAdmin creates tests (e.g., "Maths for Class 1"). You configure the scoring parameters here. Tests will appear automatically when SuperAdmin adds them.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Class Structure</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Classes and sections are managed by SuperAdmin. This is a read-only view.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading classes...</p>
                </div>
              ) : classes.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Classes Found</h3>
                  <p className="text-gray-600">Classes created by SuperAdmin will appear here.</p>
                  <p className="text-sm text-gray-500 mt-2">Ask your SuperAdmin to create classes in the Academics section.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {classes.map((cls) => (
                    <div key={cls._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900">Class {cls.className}</h4>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {cls.sections.length} sections
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-3 flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {cls.studentCount !== undefined ? cls.studentCount : '...'} student{cls.studentCount !== 1 ? 's' : ''}
                      </p>
                      {cls.sections.length > 0 ? (
                        <div className="space-y-1">
                          {cls.sections.map((section, index) => (
                            <div key={index} className="flex items-center text-sm text-gray-600">
                              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                              Section {section}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No sections added</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Schedule Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">School Start Time</label>
                  <input
                    type="time"
                    defaultValue="08:00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">School End Time</label>
                  <input
                    type="time"
                    defaultValue="15:30"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Period Duration (minutes)</label>
                  <input
                    type="number"
                    defaultValue="45"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Break Duration (minutes)</label>
                  <input
                    type="number"
                    defaultValue="15"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Working Days</label>
                  <div className="flex space-x-4">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                      <label key={day} className="flex items-center">
                        <input type="checkbox" defaultChecked={day !== 'Saturday'} className="rounded" />
                        <span className="ml-2 text-sm">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium">Email Notifications</h4>
                    <p className="text-sm text-gray-600">Send notifications via email</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium">SMS Notifications</h4>
                    <p className="text-sm text-gray-600">Send notifications via SMS</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="font-medium">Push Notifications</h4>
                    <p className="text-sm text-gray-600">Send push notifications to mobile app</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchoolSettings;