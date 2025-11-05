import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { School, ViewType, DashboardStats, SchoolData } from '../types';
import { schoolAPI } from '../../../services/api';

// Initial empty values for state
const initialSchools: School[] = [];
const initialSchoolsData: { [schoolId: string]: SchoolData } = {};
const initialStats: DashboardStats = {
  totalSchools: 0,
  totalUsers: 0,
  lastLogin: ''
};

interface AppContextType {
  schools: School[];
  schoolsData: { [schoolId: string]: SchoolData };
  currentView: ViewType;
  selectedSchoolId: string | null;
  stats: DashboardStats;
  setCurrentView: (view: ViewType) => void;
  setSelectedSchoolId: (id: string | null) => void;
  addSchool: (school: Partial<School> & { logoFile?: File }) => Promise<void>;
  updateSchool: (school: School) => void;
  deleteSchool: (id: string) => void;
  updateSchoolAccess: (schoolId: string, accessMatrix: any) => void;
  updateBankDetails: (schoolId: string, bankDetails: any) => void;
  updateUserRole: (schoolId: string, userId: string, newRole: 'admin' | 'teacher' | 'student' | 'parent') => void;
  updateSchoolSettings: (schoolId: string, settings: any) => void;
  getSchoolData: (schoolId: string) => SchoolData | undefined;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  console.log('[AppProvider] Rendering AppProvider');
  const [schools, setSchools] = useState<School[]>(initialSchools);
  const [schoolsData, setSchoolsData] = useState<{ [schoolId: string]: SchoolData }>(initialSchoolsData);
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(initialStats);

  // Fetch all schools and stats on mount
  useEffect(() => {
    async function fetchData() {
      try {
        console.log('Fetching schools from backend...');
        const schoolsRes = await schoolAPI.getAllSchools();
        console.log('Schools response:', schoolsRes.data);
        
        const mapped = (schoolsRes.data || []).map((created: any) => {
          // Construct logo URL: remove '/api' from base URL for static files
          const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace('/api', '');
          const logoUrl = created.logoUrl 
            ? (created.logoUrl.startsWith('http') ? created.logoUrl : `${baseUrl}${created.logoUrl}`) 
            : '/default-school-logo.svg';
          
          // Default access matrix with all required permissions
          const defaultAccessMatrix = {
            admin: {
              manageUsers: true,
              manageSchoolSettings: true,
              viewAcademicDetails: true,
              viewAttendance: true,
              viewAssignments: true,
              viewResults: true,
              viewLeaves: true,
              messageStudentsParents: true,
              viewFees: true,
              viewReports: true
            },
            teacher: {
              manageUsers: false,
              manageSchoolSettings: 'limited',
              viewAcademicDetails: true,
              viewAttendance: true,
              viewAssignments: true,
              viewResults: 'own',
              viewLeaves: 'own',
              messageStudentsParents: true,
              viewFees: false,
              viewReports: false
            },
            student: {
              manageUsers: false,
              manageSchoolSettings: false,
              viewAcademicDetails: false,
              viewAttendance: false,
              viewAssignments: true,
              viewResults: true,
              viewLeaves: false,
              messageStudentsParents: false,
              viewFees: false,
              viewReports: false
            },
            parent: {
              manageUsers: false,
              manageSchoolSettings: false,
              viewAcademicDetails: false,
              viewAttendance: false,
              viewAssignments: false,
              viewResults: false,
              viewLeaves: false,
              messageStudentsParents: false,
              viewFees: false,
              viewReports: false
            }
          };

          // Merge existing access matrix with defaults, ensuring all permissions exist
          const existingMatrix = created.accessMatrix || {};
          const mergedAccessMatrix = {
            admin: { ...defaultAccessMatrix.admin, ...existingMatrix.admin },
            teacher: { ...defaultAccessMatrix.teacher, ...existingMatrix.teacher },
            student: { ...defaultAccessMatrix.student, ...existingMatrix.student },
            parent: { ...defaultAccessMatrix.parent, ...existingMatrix.parent }
          };
          
          return {
            id: created._id || created.id,
            name: created.name,
            code: created.code || '',
            logo: logoUrl,
            area: created.address?.area || created.address?.street || '',
            district: created.address?.district || created.address?.city || '',
            pinCode: created.address?.pinCode || created.address?.zipCode || '',
            mobile: created.mobile || created.contact?.phone || '',
            principalName: created.principalName || '',
            principalEmail: created.principalEmail || created.contact?.email || '',
            bankDetails: created.bankDetails || {},
            accessMatrix: mergedAccessMatrix
          };
        });
        
        console.log('Mapped schools:', mapped);
        setSchools(mapped);
        
        // Fetch total users across all schools
        console.log('Fetching total users across all schools...');
        try {
          const statsRes = await schoolAPI.getAllSchoolsStats();
          console.log('All schools stats response:', statsRes.data);
          
          setStats(prev => ({
            ...prev,
            totalSchools: mapped.length,
            totalUsers: statsRes.data?.totalUsers || 0,
          }));
        } catch (statsError) {
          console.error('Error fetching all schools stats:', statsError);
          setStats(prev => ({
            ...prev,
            totalSchools: mapped.length,
            totalUsers: 0,
          }));
        }
        
        // Get last login time from auth context (check both storages)
        const authData = localStorage.getItem('erp.auth') || sessionStorage.getItem('erp.auth');
        if (authData) {
          try {
            const parsed = JSON.parse(authData);
            const lastLogin = parsed.user?.lastLogin;
            console.log('[AppContext] Last login from auth:', lastLogin);
            if (lastLogin) {
              const loginDate = new Date(lastLogin);
              const formattedTime = loginDate.toLocaleString();
              console.log('[AppContext] Formatted last login:', formattedTime);
              setStats(prev => ({
                ...prev,
                lastLogin: formattedTime,
              }));
            } else {
              console.log('[AppContext] No lastLogin found in auth data');
            }
          } catch (authError) {
            console.error('[AppContext] Error parsing auth data:', authError);
          }
        } else {
          console.log('[AppContext] No auth data found in storage');
        }
        
      } catch (err: any) {
        console.error('Error fetching schools:', err);
        setSchools([]);
        setStats(initialStats);
      }
    }
    fetchData();
  }, []);

  // Add a new school via backend
  const addSchool = async (schoolData: Partial<School> & { logoFile?: File }) => {
    const form = new FormData();
    
    // Basic school information
    form.append('name', String(schoolData.name || ''));
    form.append('code', String(schoolData.code || ''));
    form.append('mobile', String(schoolData.mobile || ''));
    form.append('principalName', String(schoolData.principalName || ''));
    form.append('principalEmail', String(schoolData.principalEmail || ''));
    
    // Legacy individual fields for backward compatibility
    form.append('area', String(schoolData.area || ''));
    form.append('district', String(schoolData.district || ''));
    form.append('pinCode', String(schoolData.pinCode || ''));
    
    // Address object as JSON string
    form.append('address', JSON.stringify({
      street: (schoolData as any).address?.street || '',
      area: (schoolData as any).address?.area || schoolData.area || '',
      city: (schoolData as any).address?.city || '',
      district: (schoolData as any).address?.district || schoolData.district || '',
      taluka: (schoolData as any).address?.taluka || '',
      state: (schoolData as any).address?.state || '',
      stateId: (schoolData as any).address?.stateId || null,
      districtId: (schoolData as any).address?.districtId || null,
      talukaId: (schoolData as any).address?.talukaId || null,
      country: (schoolData as any).address?.country || 'India',
      pinCode: (schoolData as any).address?.pinCode || schoolData.pinCode || '',
      zipCode: (schoolData as any).address?.pinCode || schoolData.pinCode || ''
    }));
    
    // Contact object as JSON string
    form.append('contact', JSON.stringify({
      phone: (schoolData as any).contact?.phone || schoolData.mobile || '',
      email: (schoolData as any).contact?.email || schoolData.principalEmail || '',
      website: (schoolData as any).contact?.website || (schoolData as any).website || ''
    }));
    
    // Bank details as JSON string
    form.append('bankDetails', JSON.stringify({
      bankName: (schoolData as any).bankDetails?.bankName || '',
      accountNumber: (schoolData as any).bankDetails?.accountNumber || '',
      ifscCode: (schoolData as any).bankDetails?.ifscCode || '',
      branch: (schoolData as any).bankDetails?.branch || '',
      accountHolderName: (schoolData as any).bankDetails?.accountHolderName || '',
    }));
    
    // Access matrix as JSON string
    form.append('accessMatrix', JSON.stringify((schoolData as any).accessMatrix || {
      admin: { manageUsers: true, manageSchoolSettings: true, viewAttendance: true, viewResults: true, messageStudentsParents: true },
      teacher: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: true },
      student: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: false },
      parent: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: false }
    }));
    
    // Additional school details
    form.append('schoolType', String((schoolData as any).schoolType || 'Public'));
    form.append('establishedYear', String((schoolData as any).establishedYear || new Date().getFullYear()));
    form.append('affiliationBoard', String((schoolData as any).affiliationBoard || 'CBSE'));
    form.append('website', String((schoolData as any).website || ''));
    form.append('secondaryContact', String((schoolData as any).secondaryContact || ''));
    
    // Settings and features
    form.append('settings', JSON.stringify({ 
      academicYear: { 
        startDate: new Date().toISOString(), 
        endDate: new Date().toISOString(), 
        currentYear: '2024-25' 
      } 
    }));
    form.append('features', JSON.stringify({}));
    
    // Logo file upload
    if ((schoolData as any).logoFile) {
      form.append('logo', (schoolData as any).logoFile as File);
    }

    try {
      // Try to get token from multiple possible storage locations
      let token = localStorage.getItem('token');
      
      if (!token) {
        token = localStorage.getItem('authToken');
      }
      
      if (!token) {
        const authData = localStorage.getItem('erp.auth');
        if (authData) {
          try {
            const parsed = JSON.parse(authData);
            token = parsed.token;
          } catch (err) {
            console.error('Error parsing auth data:', err);
          }
        }
      }
      
      console.log('Retrieved token:', token);
      if (!token) {
        throw new Error('Authorization token is missing');
      }
      
      // Use the schoolAPI.createSchool method which should automatically include the Authorization header via interceptor
      const res = await schoolAPI.createSchool(form);
      const created = res.data?.school || res.data;
      if (created) {
        // Construct logo URL: remove '/api' from base URL for static files
        const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace('/api', '');
        const logoUrl = created.logoUrl 
          ? (created.logoUrl.startsWith('http') ? created.logoUrl : `${baseUrl}${created.logoUrl}`) 
          : '';
        
        setSchools(prev => [...prev, {
          id: created._id || created.id,
          name: created.name,
          code: created.code || '',
          logo: logoUrl,
          area: created.address?.street || '',
          district: created.address?.city || '',
          pinCode: created.address?.zipCode || '',
          mobile: created.contact?.phone || '',
          principalName: created.principalName || '',
          principalEmail: created.contact?.email || '',
          bankDetails: created.bankDetails || {},
          accessMatrix: created.accessMatrix || {},
        } as any]);
        setStats(prev => ({ ...prev, totalSchools: prev.totalSchools + 1 }));
        
        // Refresh total users count after adding new school
        try {
          const statsRes = await schoolAPI.getAllSchoolsStats();
          setStats(prev => ({
            ...prev,
            totalUsers: statsRes.data?.totalUsers || 0,
          }));
          console.log('[ADD] Updated total users count after school addition');
        } catch (statsError) {
          console.error('[ADD] Error refreshing total users count:', statsError);
        }
      }
    } catch (error: any) {
      console.error('Error adding school:', error);
      
      // Extract meaningful error message from API response
      let errorMessage = 'Failed to create school';
      
      if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      // Create a new error with the extracted message
      const enhancedError = new Error(errorMessage);
      throw enhancedError;
    }
  };

  // Delete a school via backend
  const deleteSchool = async (id: string) => {
    try {
      console.log(`[DELETE] Starting deletion process for school ID: ${id}`);
      
      // Make API call to delete school using schoolAPI
      const res = await schoolAPI.deleteSchool(id);
      console.log('[DELETE] Backend response:', res.data);
      
      if (res.data?.success === false) {
        throw new Error(res.data?.message || 'Backend reported failure');
      }
      
      // Update local state only if backend deletion was successful
      setSchools(prev => {
        const schoolToDelete = prev.find(school => school.id === id);
        const filtered = prev.filter(school => school.id !== id);
        console.log(`[DELETE] Removed school "${schoolToDelete?.name}" from UI. Remaining schools: ${filtered.length}`);
        return filtered;
      });
      
      setStats(prev => ({ ...prev, totalSchools: prev.totalSchools - 1 }));
      console.log('[DELETE] School successfully deleted from UI state');
      
      // Refresh total users count after deletion
      try {
        const statsRes = await schoolAPI.getAllSchoolsStats();
        setStats(prev => ({
          ...prev,
          totalUsers: statsRes.data?.totalUsers || 0,
        }));
        console.log('[DELETE] Updated total users count after school deletion');
      } catch (statsError) {
        console.error('[DELETE] Error refreshing total users count:', statsError);
      }
      
      return res.data; // Return response data for additional info
    } catch (error: any) {
      console.error('[DELETE] Error deleting school:', {
        error: error,
        response: error?.response?.data,
        status: error?.response?.status,
        message: error?.message
      });
      
      // Enhance error message for user
      if (error?.response?.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error?.response?.status === 403) {
        throw new Error('Permission denied. Only super admin can delete schools.');
      } else if (error?.response?.status === 404) {
        throw new Error('School not found or already deleted.');
      } else if (error?.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else {
        throw new Error(error?.message || 'Failed to delete school. Please try again.');
      }
    }
  };

  // Update school (scaffold, implement as needed)
  const updateSchool = async (updatedSchool: School) => {
      const res = await schoolAPI.updateSchool(updatedSchool.id, updatedSchool);
    const returned = (res.data as any)?.school || res.data;
    setSchools(prev => prev.map(school => school.id === updatedSchool.id ? {
      ...school,
      name: returned.name ?? school.name,
      code: returned.code ?? school.code,
      logo: returned.logoUrl ? (String(returned.logoUrl).startsWith('http') ? returned.logoUrl : `${import.meta.env.VITE_API_BASE_URL || ''}${returned.logoUrl}`) : school.logo,
      area: returned.address?.street ?? school.area,
      district: returned.address?.city ?? school.district,
      pinCode: returned.address?.zipCode ?? school.pinCode,
      mobile: returned.contact?.phone ?? school.mobile,
      principalName: returned.principalName ?? school.principalName,
      principalEmail: returned.principalEmail ?? school.principalEmail,
      bankDetails: returned.bankDetails ?? school.bankDetails,
      accessMatrix: returned.accessMatrix ?? school.accessMatrix,
    } : school));
  };

  // Placeholder for other update functions
  const updateSchoolAccess = async (schoolId: string, accessMatrix: any) => {
    // Persist to backend then update local cache
      const res = await schoolAPI.updateAccessMatrix(schoolId, accessMatrix);
    const updated = (res.data as any)?.school || res.data;
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, accessMatrix: updated.accessMatrix || accessMatrix } : s));
  };

  const updateBankDetails = async (schoolId: string, bankDetails: any) => {
    const res = await schoolAPI.updateBankDetails(schoolId, bankDetails);
    const updated = (res.data as any)?.bankDetails || (res.data as any)?.school?.bankDetails || bankDetails;
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, bankDetails: updated } : s));
  };

  const updateUserRole = async (schoolId: string, userId: string, newRole: 'admin' | 'teacher' | 'student' | 'parent') => {
    // Scoped user update endpoint exists under /schools/:schoolId/users/:userId
    await schoolAPI.updateUserRole(schoolId, userId, newRole);
    // No local user list here; SchoolDetails handles refresh via its own API layer
  };

  const updateSchoolSettings = async (schoolId: string, settings: any) => {
  const res = await schoolAPI.updateSchoolSettings(schoolId, settings);
    const updated = (res.data as any)?.school || res.data;
    // We don't store full settings on the dashboard list, but keep bank/access in sync if returned
    setSchools(prev => prev.map(s => s.id === schoolId ? {
      ...s,
      bankDetails: updated.bankDetails ?? s.bankDetails,
      accessMatrix: updated.accessMatrix ?? s.accessMatrix,
    } : s));
    // Also cache detailed settings for SchoolDetails consumers if present
    setSchoolsData(prev => ({
      ...prev,
      [schoolId]: {
        ...(prev[schoolId] || {} as any),
        settings: updated.settings || settings,
      } as any
    }));
  };
  const getSchoolData = (schoolId: string) => schoolsData[schoolId];

  return (
    <AppContext.Provider
      value={{
        schools,
        schoolsData,
        currentView,
        selectedSchoolId,
        stats,
        setCurrentView,
        setSelectedSchoolId,
        addSchool,
        updateSchool,
        deleteSchool,
        updateSchoolAccess,
        updateBankDetails,
        updateUserRole,
        updateSchoolSettings,
        getSchoolData
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  console.log('[useApp] Context value:', context);
  if (context === undefined) {
    console.error('[useApp] Context is undefined - this should not happen if AppProvider is properly set up');
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export default AppProvider;