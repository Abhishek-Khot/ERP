import React, { useState, useEffect, useCallback } from 'react';
import { X, Printer } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import api from '../../services/api';

interface ViewChalanProps {
  isOpen: boolean;
  onClose: () => void;
  chalan: ChalanDetails;
}

// Utility functions
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  accountHolderName: string;
}

interface Address {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  [key: string]: any; // Allow additional dynamic properties
}

interface SchoolData {
  _id?: string;
  name?: string;
  schoolName?: string;
  code?: string;
  schoolCode?: string;
  logo?: string;
  logoUrl?: string;
  address?: string | Address;
  contact?: {
    email?: string;
    phone?: string;
    website?: string;
    [key: string]: any;
  };
  [key: string]: any; // Allow additional dynamic properties
}

interface ChalanDetails {
  // Chalan Details
  chalanNumber: string;
  chalanDate: string;
  
  // Installment Details
  installmentName: string;
  amount: number;
  dueDate: string;
  
  // Student Details
  studentName: string;
  studentId: string;
  userId?: string; // User-friendly ID (e.g., 123-S-0006)
  admissionNumber?: string; // Alternative ID field
  rollNumber?: string | null; // Another possible ID field
  className: string;
  section: string;
  academicYear: string;
  
  // School Details
  schoolName: string;
  schoolAddress: string;
  schoolPhone?: string;
  schoolEmail?: string;
  schoolLogo?: string;
  schoolCode?: string;
  schoolData?: SchoolData; // Add schoolData to store complete school information
  
  // Bank Details
  bankDetails?: BankDetails;
  
  // Backend fields
  _id?: string;
  status?: 'unpaid' | 'paid' | 'cancelled';
  
  [key: string]: unknown; // Allow additional dynamic properties
}

// Helper function to format chalan number if it's not in the expected format
const useChalanNumber = (chalan: ChalanDetails) => {
  const [chalanNumber, setChalanNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const generateChalanNumber = useCallback(() => {
    // Generate a simple chalan number with timestamp and random number
    const timestamp = new Date().getTime();
    const randomNum = Math.floor(Math.random() * 1000);
    return `CRN-TEMP-${randomNum}`;
  }, []);

  useEffect(() => {
    const fetchChalanNumber = async () => {
      // If we have a valid chalan number from the backend, use it as is
      if (chalan.chalanNumber && chalan.chalanNumber.trim() !== '') {
        setChalanNumber(chalan.chalanNumber.trim().toUpperCase());
        return;
      }
      
      setIsLoading(true);
      try {
        // Get the next chalan number from the server using api
        const response = await api.get('/chalans/next-chalan-number');
        if (response?.data?.success && response?.data?.chalanNumber) {
          setChalanNumber(response.data.chalanNumber);
          return;
        }
        
        // Fallback to local counter if API call fails
        const localChalanNumber = generateChalanNumber();
        setChalanNumber(localChalanNumber);
      } catch (error) {
        console.error('Error fetching chalan number:', error);
        // Fallback to local counter on error
        const localChalanNumber = generateChalanNumber();
        setChalanNumber(localChalanNumber);
      } finally {
        setIsLoading(false);
      }
    };

    if (chalan.chalanNumber) {
      setChalanNumber(chalan.chalanNumber);
    } else {
      fetchChalanNumber();
    }
  }, [chalan.chalanNumber, generateChalanNumber]);

  return { chalanNumber, isLoading };
};

interface ChalanCopyProps {
  chalan: ChalanDetails; 
  copyType: 'Student Copy' | 'Office Copy' | 'Admin Copy';
}

const ChalanCopy: React.FC<ChalanCopyProps> = ({ 
  chalan: propChalan, 
  copyType
}) => {
  // Don't call the hook here - use the chalan number from props
  // The parent component (ViewChalan) fetches it once for all copies
  const chalan = propChalan;
  const isLoading = false;
  

  // Debug: Log the chalan props including bank details
  React.useEffect(() => {
    console.group('Chalan props in ChalanCopy');
    console.log('School Logo:', chalan?.schoolLogo);
    console.log('School Code:', chalan?.schoolCode);
    console.log('School Name:', chalan?.schoolName);
    console.log('Chalan Number:', chalan?.chalanNumber);
    console.log('Has Bank Details:', !!chalan?.bankDetails);
    console.log('Bank Details:', JSON.stringify(chalan?.bankDetails, null, 2));
    console.log('Has School Data Bank Details:', !!chalan?.schoolData?.bankDetails);
    console.log('School Data Bank Details:', JSON.stringify(chalan?.schoolData?.bankDetails, null, 2));
    console.groupEnd();
  }, [chalan]);


  // Format logo URL consistently with UniversalTemplate
  const getLogoUrl = useCallback((logoPath?: string): string => {
    if (!logoPath) return '';
    
    // If it's already a full URL, return as is
    if (logoPath.startsWith('http')) {
      return logoPath;
    }
    
    // If it's a path starting with /uploads, prepend the API base URL
    if (logoPath.startsWith('/uploads')) {
      const envBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5050/api';
      const baseUrl = envBase.replace(/\/api\/?$/, '');
      return `${baseUrl}${logoPath}`;
    }
    
    // For other cases, return as is (handles relative paths like '/logo.png')
    return logoPath;
  }, []);

  // Get the logo URL with proper fallback logic
  const getChalanLogoUrl = useCallback(() => {
    // First try schoolLogo from chalan
    if (chalan?.schoolLogo) {
      return getLogoUrl(chalan.schoolLogo);
    }
    
    // Then try schoolData.logo or schoolData.logoUrl
    const logoFromSchoolData = chalan?.schoolData?.logo || chalan?.schoolData?.logoUrl;
    if (logoFromSchoolData) {
      return getLogoUrl(logoFromSchoolData);
    }
    
    // Fallback to school logo from env or default
    const defaultLogo = import.meta.env.VITE_DEFAULT_SCHOOL_LOGO || 
                       '/default-school-logo.svg';
    return getLogoUrl(defaultLogo);
  }, [chalan?.schoolLogo, chalan?.schoolData, getLogoUrl]);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    
    // Get the default logo URL from environment or use a default path
    const defaultLogo = import.meta.env.VITE_DEFAULT_SCHOOL_LOGO || '/default-school-logo.svg';
    const defaultLogoUrl = getLogoUrl(defaultLogo);
    
    // Only try to fallback if we're not already trying to load the default logo
    if (target.src !== defaultLogoUrl) {
      target.src = defaultLogoUrl;
    } else {
      // If default logo also fails, hide the image
      console.error('All logo loading attempts failed');
      target.style.display = 'none';
    }
  }, []);

  return (
    <div className="w-[90%] max-w-md mx-auto border-2 border-gray-400 p-4 mb-4">
      {/* School Header with Logo and Details */}
      <div className="mb-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-4">
          {/* School Logo */}
          <div className="flex-shrink-0">
            <div className="h-16 w-16 flex items-center justify-center border border-gray-200 rounded overflow-hidden">
              <img 
                src={getChalanLogoUrl()}
                alt={`${chalan.schoolName || 'School'} Logo`}
                className="w-full h-full object-contain p-1"
                onError={handleImageError}
              />
            </div>
          </div>
          
          {/* School Details */}
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {chalan.schoolName || 'School Name'}
            </h1>
            <p className="text-sm text-gray-600">
              {formatAddress(chalan.schoolAddress || chalan.schoolData?.address) || 'Address not available'}
            </p>
          </div>
        </div>
        
        {/* Title and copy type centered below */}
        <div className="text-center mt-3">
          <p className="text-sm font-bold uppercase tracking-wide">FEE PAYMENT CHALAN</p>
          <p className="text-xs text-gray-600 mt-1">Academic Year: 2024-25</p>
          <p className="text-xs font-semibold text-blue-600 mt-1">{copyType.toUpperCase()}</p>
          {/* Chalan Number - Horizontal like print version */}
          <p className="text-sm font-semibold text-gray-700 mt-2">
            Chalan: {isLoading ? 'Loading...' : chalan.chalanNumber || 'N/A'}
          </p>
        </div>
      </div>
      
      {/* Horizontal Line */}
      <div className="border-t border-gray-200 my-2"></div>
      
      {/* Student Details Section */}
      <div className="mt-2 px-4 text-xs">
        <div className="mb-2">
          <p className="text-xs font-medium">Student Details</p>
        </div>
        <div>
          <div className="space-y-1">
            {/* Student Name */}
            <div className="flex items-center mb-1">
              <span className="w-28 text-xs text-gray-600 font-medium">Name:</span>
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800">{chalan.studentName || 'N/A'}</span>
              </div>
            </div>
            
            {/* Student ID */}
            <div className="flex items-center mb-1">
              <span className="w-28 text-xs text-gray-600 font-medium">Student ID:</span>
              <div className="flex-1">
                <span className="text-sm font-mono text-gray-800">
                  {(() => {
                    console.log('[ViewChalan Preview] Student ID values:', {
                      userId: chalan.userId,
                      admissionNumber: chalan.admissionNumber,
                      studentId: chalan.studentId,
                      mongoId: chalan.mongoId
                    });
                    return chalan.userId || 
                           chalan.admissionNumber ||
                           (chalan.studentId?.startsWith('KVS-') ? chalan.studentId : 
                            chalan.studentId?.match(/^[0-9a-fA-F]{24}$/) ? 'N/A' : 
                            chalan.studentId || 'N/A');
                  })()}
                </span>
              </div>
            </div>
            
            {/* Class & Section */}
            <div className="flex items-center">
              <span className="w-28 text-xs text-gray-600 font-medium">Class & Sec:</span>
              <div className="flex-1">
                <span className="text-sm text-gray-800">
                  {chalan.className || 'N/A'} {chalan.section ? `- ${chalan.section}` : ''}
                </span>
              </div>
            </div>
          </div>
          
          {/* Divider */}
          <div className="border-t border-gray-100 my-2"></div>
          
          {/* Payment Info */}
          <div className="mt-4">
            <p className="font-semibold mb-2 text-sm">Payment Details:</p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center">
                <span className="w-28 text-xs text-gray-600 font-medium">Installment:</span>
                <div className="flex-1">
                  <span className="text-sm text-gray-900">{chalan.installmentName || 'N/A'}</span>
                </div>
              </div>
              
              <div className="flex items-center">
                <span className="w-28 text-xs text-gray-600 font-medium">Amount:</span>
                <span className="text-sm font-bold text-blue-700">{formatCurrency(chalan.amount)}</span>
              </div>
              
              <div className="flex items-center">
                <span className="w-28 text-xs text-gray-600 font-medium">Due Date:</span>
                <div className="flex-1">
                  <span className="text-sm text-gray-900">{formatDate(chalan.dueDate) || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* School Bank Details Section */}
        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="font-semibold mb-2 text-left text-xs">School Bank Details:</p>
          <div className="space-y-2 text-xs">
            <div className="flex items-center">
              <p className="w-28 text-xs text-gray-600 font-medium">Bank Name:</p>
              <p className="text-sm text-gray-900">
                {chalan.schoolData?.bankDetails?.bankName || 
                 chalan.bankDetails?.bankName || 
                 'Not Available'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="w-28 text-xs text-gray-600 font-medium">Account Holder:</p>
              <p className="text-sm font-medium text-gray-800">
                {chalan.schoolData?.bankDetails?.accountHolderName || 
                 chalan.bankDetails?.accountHolderName ||
                 'Not Available'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="w-28 text-xs text-gray-600 font-medium">A/c No:</p>
              <p className="text-sm font-mono text-gray-900">
                {chalan.schoolData?.bankDetails?.accountNumber || 
                 chalan.bankDetails?.accountNumber || 
                 'Not Available'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="w-28 text-xs text-gray-600 font-medium">IFSC Code:</p>
              <p className="text-sm font-mono text-gray-900">
                {chalan.schoolData?.bankDetails?.ifscCode || 
                 chalan.bankDetails?.ifscCode || 
                 'Not Available'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="w-28 text-xs text-gray-600 font-medium">Branch:</p>
              <p className="text-sm text-gray-900">
                {chalan.schoolData?.bankDetails?.branch || 
                 chalan.bankDetails?.branch || 
                 'Not Available'}
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

// Function to format address from object or string
const formatAddress = (address: string | Address | undefined): string => {
  if (!address) return 'School Address, City, State - Pincode';
  
  if (typeof address === 'string') return address;
  
  // Handle nested address object structure from API
  if (typeof address === 'object') {
    const {
      street = '',
      area = '',
      city = '',
      state = '',
      country = '',
      pinCode = '',
      district = ''
    } = address;

    const parts = [
      street,
      area,
      city,
      state,
      country,
      pinCode || ''
    ].filter(Boolean);

    return parts.join(', ');
  }

  // Fallback for other cases
  return String(address);
};

const ViewChalan: React.FC<ViewChalanProps> = ({ isOpen, onClose, chalan: initialChalan }) => {
  const { user } = useAuth();
  const [chalan, setChalan] = useState<ChalanDetails>(() => ({
    chalanNumber: initialChalan?.chalanNumber || '',
    chalanDate: '',
    chalanStatus: 'generated',
    installmentName: '',
    amount: 0,
    dueDate: '',
    studentName: '',
    studentId: '',
    className: '',
    section: '',
    academicYear: '',
    schoolName: '',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    schoolLogo: '',
    schoolData: {},
    bankDetails: {
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branch: '',
      accountHolderName: ''
    }
  }));

  // Log when initialChalan changes
  useEffect(() => {
    if (initialChalan) {
      console.group('ViewChalan - Initial Chalan Data');
      console.log('Received chalan data:', {
        chalanNumber: initialChalan.chalanNumber,
        studentName: initialChalan.studentName,
        studentId: initialChalan.studentId,
        amount: initialChalan.amount,
        status: initialChalan.status || initialChalan.chalanStatus,
        _id: initialChalan._id
      });
      console.log('Full chalan object:', JSON.parse(JSON.stringify(initialChalan)));
      console.groupEnd();
    }
  }, [initialChalan]);

  
  // Use the hook at parent level to fetch chalan number once for all copies
  // Use chalan state instead of initialChalan to ensure it has all the data
  const { chalanNumber: fetchedChalanNumber, isLoading: chalanNumberLoading } = useChalanNumber(chalan);
  
  // Debug log for fetched chalan number
  useEffect(() => {
    console.log('[ViewChalan] Fetched chalan number:', fetchedChalanNumber);
  }, [fetchedChalanNumber]);
  
  // Sync chalan number when it's fetched
  useEffect(() => {
    if (fetchedChalanNumber && isOpen) {
      setChalan(prev => {
        // Only update the chalan number, preserve everything else including bank details
        const updatedChalan = {
          ...prev,
          chalanNumber: fetchedChalanNumber
        };
        console.log('[ViewChalan] Updating chalan number:', fetchedChalanNumber);
        return updatedChalan;
      });
    }
  }, [fetchedChalanNumber, isOpen]);
  
  // Debug: Log the entire chalan data when it changes
  useEffect(() => {
    console.log('Chalan data updated:', {
      hasUserId: !!chalan.userId,
      hasStudentId: !!chalan.studentId,
      chalanNumber: chalan.chalanNumber,
      rawChalan: chalan
    });
  }, [chalan]);
  
  // Debug: Log chalan data on initial render
  useEffect(() => {
    console.log('Chalan data:', {
      userId: initialChalan.userId,
      studentId: initialChalan.studentId,
      rawChalan: initialChalan
    });
  }, [initialChalan]);

  // Get the best available student ID for display
  useEffect(() => {
    console.log('=== DEBUG: Starting student ID resolution ===');
    console.log('Initial chalan data:', {
      userId: chalan.userId,
      studentId: chalan.studentId,
      rawChalan: JSON.parse(JSON.stringify(chalan)) // Deep clone to avoid reference issues
    });

    // If we have a userId (which is actually the student ID), use it directly
    if (chalan.userId) {
      console.log('Using userId directly from chalan data:', chalan.userId);
      return;
    }

    const fetchStudentData = async () => {
      // Skip if studentId is not available or is 'N/A'
      if (!chalan.studentId || chalan.studentId === 'N/A') {
        console.warn('No valid student ID available');
        return;
      }

      try {
        console.log(`Attempting to fetch student data for studentId: ${chalan.studentId}`);
        
        // First try to get student data using studentId
        const response = await api.get(`/students/${chalan.studentId}`);
        console.log('Student API response:', response.data);
        
        const studentData = response.data?.data || response.data;
        console.log('Processed student data:', studentData);
        
        // First priority: Check for userId in student data
        if (studentData?.userId) {
          console.log('Using userId from student data:', studentData.userId);
          return;
        }
        
        // If no userId in student data, try to get it from the user record
        if (studentData?.user?._id) {
          console.log('Fetching user record for ID:', studentData.user._id);
          const userRes = await api.get(`/users/${studentData.user._id}`);
          if (userRes.data?.data?.userId) {
            console.log('Found userId in user record:', userRes.data.data.userId);
            return;
          }
        }
        
        // Third priority: Check for user object with _id or id
        if (studentData?.user) {
          const userId = studentData.user._id || studentData.user.id;
          console.log('Using ID from user object:', userId);
          if (userId) {
            return;
          }
        }
        
        // Fourth priority: Check for studentId in the student data (not the one from chalan)
        if (studentData?.studentId) {
          console.log('Using studentId from student data:', studentData.studentId);
          return;
        }
        
        // Fifth priority: Use the _id from student data
        if (studentData?._id) {
          console.log('Using _id from student data as fallback:', studentData._id);
          return;
        }
        
        // If all else fails, use the original studentId from chalan as fallback
        console.warn('No suitable ID found in student data, using studentId as fallback:', chalan.studentId);
        
      } catch (error: any) {
        console.error('Error in fetchStudentData:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        
        // Use whatever ID we have as fallback
        const fallbackId = chalan.userId || chalan.studentId;
        console.warn('Using fallback ID:', fallbackId || 'N/A');
      }
    };

    // First check if we have a userId in the chalan data (preferred)
    if (chalan.userId) {
      console.log('Using userId directly from chalan data:', chalan.userId);
    } else if (chalan.studentId) {
      console.log('No userId found, will try to fetch using studentId:', chalan.studentId);
      fetchStudentData();
    } else if (chalan.userId) {
      // If we have a userId but no studentId, use it directly
      console.log('Using provided userId:', chalan.userId);
    } else {
      console.warn('No student ID or user ID found in chalan data');
    }
  }, [chalan.studentId, chalan.userId]);

  const [loading, setLoading] = useState(true);
  
  // Fetch school data when component opens
  useEffect(() => {
    const fetchSchoolData = async () => {
      if (!initialChalan || !isOpen) return;
      
      try {
        setLoading(true);
        let updatedChalan = { ...initialChalan };
        
        console.log('[ViewChalan] Initial chalan received:', {
          studentId: initialChalan.studentId,
          userId: initialChalan.userId,
          studentName: initialChalan.studentName,
          hasBankDetails: !!initialChalan.bankDetails,
          bankDetails: JSON.stringify(initialChalan.bankDetails, null, 2),
          hasSchoolData: !!initialChalan.schoolData,
          schoolDataBankDetails: JSON.stringify(initialChalan.schoolData?.bankDetails, null, 2),
          allKeys: Object.keys(initialChalan)
        });
        
        console.log('[ViewChalan] Starting to fetch school data...');
        
        // Fetch school data from school's dedicated database (where bank details are stored)
        // Use /schools/database/school-info instead of /schools/:id/info
        // This fetches from school_info collection in the school's database
        const response = await api.get('/schools/database/school-info');
        
        console.log('[ViewChalan] API Response:', response);
        console.log('[ViewChalan] Response data structure:', {
          hasData: !!response?.data,
          hasDataData: !!response?.data?.data,
          dataKeys: response?.data ? Object.keys(response.data) : [],
          dataDataKeys: response?.data?.data ? Object.keys(response.data.data) : []
        });
        
        const schoolData = response?.data?.data || response?.data;
        
        console.log('[ViewChalan] Fetched school data:', {
          hasData: !!schoolData,
          hasBankDetails: !!schoolData?.bankDetails,
          bankDetails: JSON.stringify(schoolData?.bankDetails, null, 2),
          schoolDataKeys: schoolData ? Object.keys(schoolData) : []
        });
        
        if (schoolData) {
            // Format the logo URL
            let logoUrl = '';
            if (schoolData.logoUrl || schoolData.logo) {
              const rawLogoUrl = schoolData.logoUrl || schoolData.logo;
              if (rawLogoUrl.startsWith('/uploads')) {
                const envBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5050/api';
                const baseUrl = envBase.replace(/\/api\/?$/, '');
                logoUrl = `${baseUrl}${rawLogoUrl}`;
              } else {
                logoUrl = rawLogoUrl;
              }
              
              console.log('School logo URL:', {
                rawLogoUrl,
                finalLogoUrl: logoUrl,
                apiBase: import.meta.env.VITE_API_BASE_URL,
                schoolData
              });
            }
            
            // Update chalan with school data including bank details
            // Preserve existing schoolName from chalan if available, otherwise use fetched data
            updatedChalan = {
              ...updatedChalan,
              schoolName: updatedChalan.schoolName || schoolData.name || schoolData.schoolName || 'School Name',
              schoolCode: updatedChalan.schoolCode || schoolData.code || schoolData.schoolCode || 'SCH001',
              schoolAddress: formatAddress(schoolData.address) || updatedChalan.schoolAddress,
              schoolEmail: schoolData.contact?.email || schoolData.email || updatedChalan.schoolEmail,
              schoolPhone: schoolData.contact?.phone || schoolData.phone || updatedChalan.schoolPhone,
              schoolLogo: logoUrl || updatedChalan.schoolLogo,
              bankDetails: schoolData.bankDetails, // Use freshly fetched bank details
              schoolData // Store the complete school data for reference
            };
            
            // Log bank details for debugging
            console.log('Bank details after fetch:', {
              fromSchoolData: schoolData.bankDetails,
              inUpdatedChalan: updatedChalan.bankDetails,
              hasData: !!updatedChalan.bankDetails?.bankName
            });
          }
        
        // Ensure we don't show MongoDB _id as student ID
        if (updatedChalan.studentId && 
            updatedChalan.studentId.match(/^[0-9a-fA-F]{24}$/) && 
            (updatedChalan as any)._id === updatedChalan.studentId) {
          updatedChalan.studentId = 'N/A';
        }
        
        console.log('[ViewChalan] About to set chalan with bank details:', {
          hasBankDetails: !!updatedChalan.bankDetails,
          bankDetailsPreview: updatedChalan.bankDetails,
          hasSchoolData: !!updatedChalan.schoolData
        });
        setChalan(updatedChalan);
      } catch (error) {
        console.error('Error fetching school data:', error);
        // If there's an error, use the initial chalan data with fallback values
        setChalan({
          ...initialChalan,
          schoolName: initialChalan.schoolName || 'School Name',
          schoolCode: initialChalan.schoolCode || 'SCH001'
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchSchoolData();
  }, [isOpen]);
  
  if (!isOpen || !chalan || loading) return null;


  const handlePrint = () => {
    // Format dates
    const currentDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const dueDate = chalan?.dueDate
      ? new Date(chalan.dueDate).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })
      : 'N/A';
    const schoolName = chalan?.schoolData?.name || chalan?.schoolName || 'School';
    const schoolAddress = formatAddress(chalan?.schoolData?.address || chalan?.schoolAddress);
    const schoolPhone = chalan?.schoolData?.phone || chalan?.schoolData?.contact?.phone || chalan?.schoolPhone || '';
    const schoolEmail = chalan?.schoolData?.email || chalan?.schoolData?.contact?.email || chalan?.schoolEmail || '';
    const academicYear = chalan?.academicYear || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1);
    // Use chalan number from chalan object (already fetched by ChalanCopy component)
    const chalanNumber = chalan?.chalanNumber || initialChalan?.chalanNumber || 'N/A';
    console.log('[Print] Using chalan number:', chalanNumber);
    const studentName = chalan?.studentName || 'N/A';
    // Use userId (user-friendly ID like KVS-S-0003) if available, otherwise fall back to other IDs
    const studentId = chalan?.userId || 
                      chalan?.admissionNumber || 
                      (chalan?.studentId?.startsWith('KVS-') ? chalan.studentId : 
                       chalan?.studentId?.match(/^[0-9a-fA-F]{24}$/) ? 'N/A' : 
                       chalan?.studentId || 'N/A');
    const classSection = `${chalan?.className || ''}${chalan?.section ? '-' + chalan.section : ''}`;
    const installmentName = chalan?.installmentName || 'N/A';
    const amount = chalan?.amount ? `₹${chalan.amount.toLocaleString('en-IN')}` : '₹0';
    const paymentStatus = (chalan?.status || chalan?.chalanStatus || 'Status').toUpperCase();
    
    // Use bank details from schoolData (fetched) or fallback to chalan.bankDetails (passed from parent)
    console.log('[Print] Bank details check:', {
      hasSchoolDataBankDetails: !!chalan?.schoolData?.bankDetails,
      hasChalanBankDetails: !!chalan?.bankDetails,
      schoolDataBankDetails: chalan?.schoolData?.bankDetails,
      chalanBankDetails: chalan?.bankDetails
    });
    
    const accountHolder = chalan?.schoolData?.bankDetails?.accountHolderName || chalan?.bankDetails?.accountHolderName || 'Not Available';
    const bankName = chalan?.schoolData?.bankDetails?.bankName || chalan?.bankDetails?.bankName || 'Not Available';
    const accountNumber = chalan?.schoolData?.bankDetails?.accountNumber || chalan?.bankDetails?.accountNumber || 'Not Available';
    const ifscCode = chalan?.schoolData?.bankDetails?.ifscCode || chalan?.bankDetails?.ifscCode || 'Not Available';
    const branch = chalan?.schoolData?.bankDetails?.branch || chalan?.bankDetails?.branch || 'Not Available';

    // Get the logo URL using the same logic as in the component
    const getLogoUrl = (logoPath?: string): string => {
      if (!logoPath) return '';
      if (logoPath.startsWith('http')) return logoPath;
      if (logoPath.startsWith('/uploads')) {
        const envBase = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:5050/api';
        const baseUrl = envBase.replace(/\/api\/?$/, '');
        return `${baseUrl}${logoPath}`;
      }
      return logoPath;
    };
    const logoUrl = chalan?.schoolLogo || chalan?.schoolData?.logo || chalan?.schoolData?.logoUrl || '/default-school-logo.svg';
    const fullLogoUrl = getLogoUrl(logoUrl);

    const printContent = `
      <!DOCTYPE html>
      <html lang=\"en\">
      <head>
        <meta charset=\"UTF-8\">
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
        <title>Fee Payment Challan</title>
        <style>
          .header-row { display: flex; flex-direction: row; align-items: flex-start; }
          .logo-box { flex: 0 0 60px; }
          .school-logo { height: 50px; width: 50px; object-fit: contain; border-radius: 4px; border: 1px solid #eee; background: #fff; }
          .school-info-block { display: flex; flex-direction: column; justify-content: flex-start; margin-left: 12px; }
          .school-info { font-size: 11px; color: #2c3e50; font-weight: bold; text-align: left; }
          .school-details { font-size: 10px; color: #555; line-height: 1.4; text-align: left; }
          .title-row { text-align: center; margin: 10px 0 2px 0; }
          .challan-title { font-size: 13px; font-weight: bold; color: #2c3e50; }
          .academic-year { font-size: 9px; color: #666; margin-bottom: 2px; }
          .copy-type { display: inline-block; padding: 2px 8px; font-size: 8px; font-weight: bold; border-radius: 2px; color: white; margin-top: 3px; }
          .student-copy .copy-type { background: #3498db; }
          .office-copy .copy-type { background: #e74c3c; }
          .admin-copy .copy-type { background: #27ae60; }
          .challan-number { font-weight: 600; font-size: 14px; color: #555; text-align: left; margin-top: 6px; padding-left: 4px; }
          .header { margin-bottom: 8px; }
          @page { size: A4 portrait; margin: 0; }
          body { font-family: Arial, sans-serif; background-color: white; margin: 0; padding: 0; }
          .challan-container { width: 250mm; min-height: 320mm; display: flex; flex-direction: row; padding: 16mm; gap: 8mm; page-break-after: avoid; }
          .challan-copy { flex: 1; border: 2px solid #333; padding: 16px; background: white; display: flex; flex-direction: column; height: fit-content; max-height: 300mm; }
          .content-section { display: flex; flex-direction: column; gap: 12px; }
          .info-group { margin-bottom: 12px; }
          .info-title { font-size: 16px; font-weight: bold; color: #2c3e50; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .info-row { display: flex; padding: 2px 0; font-size: 14px; line-height: 1.5; }
          .info-label { font-weight: 600; color: #555; min-width: 90px; font-size: 14px; }
          .info-value { color: #333; flex: 1; word-break: break-word; font-size: 14px; }
          .payment-status { margin-top: 16px; padding: 10px; border: 1px dashed #95a5a6; text-align: center; font-weight: bold; color: #7f8c8d; font-size: 14px; }
          .branding { text-align: center; font-size: 12px; color: #95a5a6; margin-top: 8px; padding-top: 6px; border-top: 1px solid #ecf0f1; }
          @media print { body { margin: 0; padding: 0; } .challan-container { page-break-after: avoid; } .challan-copy { page-break-inside: avoid; } }
        </style>
      </head>
      <body>
        <div class=\"challan-container\">

          <!-- STUDENT COPY -->
          <div class=\"challan-copy student-copy\">
            <div class=\"header\">
              <div class=\"header-row\">
                <div class=\"logo-box\"><img src=\"${fullLogoUrl}\" alt=\"School Logo\" class=\"school-logo\" /></div>
                <div class=\"school-info-block\">
                  <div class=\"school-info\">${schoolName}</div>
                  <div class=\"school-details\">${schoolAddress}<br>${schoolPhone ? `Phone: ${schoolPhone}<br>` : ''}${schoolEmail ? `Email: ${schoolEmail}` : ''}</div>
                </div>
              </div>
              <div class=\"title-row\">
                <div class=\"challan-title\">FEE PAYMENT CHALAN</div>
                <div class=\"academic-year\">Academic Year: ${academicYear}</div>
                <span class=\"copy-type\">STUDENT COPY</span>
                <div class=\"challan-number\">Chalan: ${chalanNumber}</div>
              </div>
            </div>
        
            <div class=\"content-section\">
              <div class=\"info-group\">
                <div class=\"info-title\">Bank Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Bank Name:</span><span class=\"info-value\">${bankName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Account Holder:</span><span class=\"info-value\">${accountHolder}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">A/c No:</span><span class=\"info-value\">${accountNumber}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">IFSC Code:</span><span class=\"info-value\">${ifscCode}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Branch:</span><span class=\"info-value\">${branch}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Date:</span><span class=\"info-value\">${currentDate}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Student Details</div>
                <div class=\"info-row\"><span class=\"info-label\">Name:</span><span class=\"info-value\">${studentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Student ID:</span><span class=\"info-value\">${studentId}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Class & Sec:</span><span class=\"info-value\">${classSection}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Academic Year:</span><span class=\"info-value\">${academicYear}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Payment Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Installment:</span><span class=\"info-value\">${installmentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Amount:</span><span class=\"info-value\">${amount}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Due Date:</span><span class=\"info-value\">${dueDate}</span></div>
              </div>
            </div>
            <div class=\"branding\">EduLogix - Institute Management System</div>
          </div>

          <!-- OFFICE COPY -->
          <div class=\"challan-copy office-copy\">
            <div class=\"header\">
              <div class=\"header-row\">
                <div class=\"logo-box\"><img src=\"${fullLogoUrl}\" alt=\"School Logo\" class=\"school-logo\" /></div>
                <div class=\"school-info-block\">
                  <div class=\"school-info\">${schoolName}</div>
                  <div class=\"school-details\">${schoolAddress}<br>${schoolPhone ? `Phone: ${schoolPhone}<br>` : ''}${schoolEmail ? `Email: ${schoolEmail}` : ''}</div>
                </div>
              </div>
              <div class=\"title-row\">
                <div class=\"challan-title\">FEE PAYMENT CHALAN</div>
                <div class=\"academic-year\">Academic Year: ${academicYear}</div>
                <span class=\"copy-type\">OFFICE COPY</span>
                <div class=\"challan-number\">Chalan: ${chalanNumber}</div>
              </div>
            </div>
         
            <div class=\"content-section\">
              <div class=\"info-group\">
                <div class=\"info-title\">Bank Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Bank Name:</span><span class=\"info-value\">${bankName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Account Holder:</span><span class=\"info-value\">${accountHolder}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">A/c No:</span><span class=\"info-value\">${accountNumber}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">IFSC Code:</span><span class=\"info-value\">${ifscCode}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Branch:</span><span class=\"info-value\">${branch}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Date:</span><span class=\"info-value\">${currentDate}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Student Details</div>
                <div class=\"info-row\"><span class=\"info-label\">Name:</span><span class=\"info-value\">${studentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Student ID:</span><span class=\"info-value\">${studentId}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Class & Sec:</span><span class=\"info-value\">${classSection}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Academic Year:</span><span class=\"info-value\">${academicYear}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Payment Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Installment:</span><span class=\"info-value\">${installmentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Amount:</span><span class=\"info-value\">${amount}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Due Date:</span><span class=\"info-value\">${dueDate}</span></div>
              </div>
            </div>
            <div class=\"branding\">EduLogix - Institute Management System</div>
          </div>

          <!-- ADMIN COPY -->
          <div class=\"challan-copy admin-copy\">
            <div class=\"header\">
              <div class=\"header-row\">
                <div class=\"logo-box\"><img src=\"${fullLogoUrl}\" alt=\"School Logo\" class=\"school-logo\" /></div>
                <div class=\"school-info-block\">
                  <div class=\"school-info\">${schoolName}</div>
                  <div class=\"school-details\">${schoolAddress}<br>${schoolPhone ? `Phone: ${schoolPhone}<br>` : ''}${schoolEmail ? `Email: ${schoolEmail}` : ''}</div>
                </div>
              </div>
              <div class=\"title-row\">
                <div class=\"challan-title\">FEE PAYMENT CHALAN</div>
                <div class=\"academic-year\">Academic Year: ${academicYear}</div>
                <span class=\"copy-type\">ADMIN COPY</span>
                <div class=\"challan-number\">Chalan: ${chalanNumber}</div>
              </div>
            </div>
           
            <div class=\"content-section\">
              <div class=\"info-group\">
                <div class=\"info-title\">Bank Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Bank Name:</span><span class=\"info-value\">${bankName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Account Holder:</span><span class=\"info-value\">${accountHolder}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">A/c No:</span><span class=\"info-value\">${accountNumber}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">IFSC Code:</span><span class=\"info-value\">${ifscCode}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Branch:</span><span class=\"info-value\">${branch}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Date:</span><span class=\"info-value\">${currentDate}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Student Details</div>
                <div class=\"info-row\"><span class=\"info-label\">Name:</span><span class=\"info-value\">${studentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Student ID:</span><span class=\"info-value\">${studentId}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Class & Sec:</span><span class=\"info-value\">${classSection}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Academic Year:</span><span class=\"info-value\">${academicYear}</span></div>
              </div>
              <div class=\"info-group\">
                <div class=\"info-title\">Payment Details:</div>
                <div class=\"info-row\"><span class=\"info-label\">Installment:</span><span class=\"info-value\">${installmentName}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Amount:</span><span class=\"info-value\">${amount}</span></div>
                <div class=\"info-row\"><span class=\"info-label\">Due Date:</span><span class=\"info-value\">${dueDate}</span></div>
              </div>
            </div>
            <div class=\"branding\">EduLogix - Institute Management System</div>
          </div>
        </div>
      </body>
      </html>
    `;
    // Open print window
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load, then trigger print dialog
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 250);
      };
    } else {
      alert('Please allow popups to print the challan');
    }
  };


  // Create three copies of the chalan with different types
  const chalanCopies = [
    { type: 'Student Copy' as const, bgColor: 'bg-blue-50' },
    { type: 'Office Copy' as const, bgColor: 'bg-green-50' },
    { type: 'Admin Copy' as const, bgColor: 'bg-purple-50' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gray-200 p-4">
          <h2 className="text-xl font-semibold text-gray-800">Chalan Details</h2>
          <div className="flex space-x-2">
            <button
              onClick={handlePrint}
              className="p-2 text-gray-600 hover:text-blue-600"
              title="Print"
            >
              <Printer className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Chalan Content */}
        <div className="p-6 print:p-0">
          {/* Print-specific styles */}
          <style>{`
            @page {
              size: A4 landscape;
              margin: 0;
            }
            @media print {
              body * {
                visibility: hidden;
              }
              #chalan-print, #chalan-print * {
                visibility: visible;
              }
              #chalan-print {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                padding: 0;
                margin: 0;
              }
              .chalan-copy {
                page-break-inside: avoid;
                break-inside: avoid;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>
          
          <div id="chalan-print" className="space-y-6">
            {/* Removed duplicate school header from top of A4 page */}
            
            
            {/* Chalan Copies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2 print:px-4 print:py-2">
              {chalanCopies.map((copy, index) => (
                <div key={index} className={`chalan-copy ${copy.bgColor} print:bg-transparent print:border`}>
                  <ChalanCopy 
                    chalan={chalan} 
                    copyType={copy.type} 
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Student Info */}
          <div className="border border-gray-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-3 gap-1 text-xs">
              <div>
                <p className="text-sm text-gray-600">Class</p>
                <p className="font-medium">{chalan.className}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Date: <span className="font-medium">{chalan.chalanDate ? formatDate(chalan.chalanDate) : ''}</span></p>
              </div>
            </div>
          </div>

          {/* Fee Details */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-2">{chalan.installmentName} - {formatDate(chalan.dueDate)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(chalan.amount)}</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 font-semibold">Total Amount</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(chalan.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* School Bank Details */}
          <div className="mt-4 border-t border-gray-200 pt-3">
            <p className="font-semibold mb-3 text-left text-sm">Payment Instructions</p>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0 pt-0.5">
                  <svg className="h-5 w-5 text-yellow-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 mb-3">
                    Please deposit the fee in the following bank account and keep this chalan for future reference.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-center">
                <p className="w-28 text-xs text-gray-600 font-medium">Account Name:</p>
                <p className="text-sm font-medium text-gray-800">
                  {chalan.schoolData?.bankDetails?.accountHolderName || 
                   chalan.bankDetails?.accountHolderName ||
                   chalan.schoolData?.bankDetails?.accountName ||
                   chalan.bankDetails?.accountHolderName ||
                   'School Account'}
                </p>
              </div>
              <div className="flex items-center">
                <p className="w-28 text-xs text-gray-600 font-medium">Account No:</p>
                <p className="text-sm font-mono text-gray-900">
                  {chalan.schoolData?.bankDetails?.accountNumber || 
                   chalan.bankDetails?.accountNumber || 
                   'XXXXXXXXXXXX'}
                </p>
              </div>
              <div className="flex items-center">
                <p className="w-28 text-xs text-gray-600 font-medium">Bank Name:</p>
                <p className="text-sm text-gray-900">
                  {chalan.schoolData?.bankDetails?.bankName || 
                   chalan.bankDetails?.bankName || 
                   'Bank Name'}
                </p>
              </div>
              <div className="flex items-center">
                <p className="w-28 text-xs text-gray-600 font-medium">IFSC Code:</p>
                <p className="text-sm font-mono text-gray-900">
                  {chalan.schoolData?.bankDetails?.ifscCode || 
                   chalan.bankDetails?.ifscCode || 
                   'XXXX0000000'}
                </p>
              </div>
              <div className="flex items-center">
                <p className="w-28 text-xs text-gray-600 font-medium">Branch:</p>
                <p className="text-sm text-gray-900">
                  {chalan.schoolData?.bankDetails?.branch || 
                   chalan.bankDetails?.branch || 
                   'Branch Name'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
            <p>This is a computer-generated chalan. No signature is required.</p>
            <p className="mt-1">For any queries, please contact the school office.</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-4 py-3 flex justify-end space-x-3 border-t border-gray-200 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Chalan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewChalan;
