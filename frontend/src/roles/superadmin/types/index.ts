export interface School {
  id: string;
  name: string;
  code: string; // School code - now required
  logo: string;
  area: string;
  district: string;
  pinCode: string;
  mobile: string;
  principalName: string;
  principalEmail: string;
  bankDetails: BankDetails;
  accessMatrix: AccessMatrix;
  schoolType?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  establishedYear?: string;
  affiliationBoard?: string;
  website?: string;
  secondaryContact?: string;
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  accountHolderName: string;
}

export interface AccessMatrix {
  admin: RolePermissions;
  teacher: RolePermissions;
  student: RolePermissions;
  parent: RolePermissions;
}

export interface RolePermissions {
  manageUsers: boolean;
  manageSchoolSettings: boolean | string;
  viewAcademicDetails: boolean;
  viewAttendance: boolean;
  viewAssignments: boolean;
  viewResults: boolean | string;
  viewLeaves: boolean | string;
  messageStudentsParents: boolean;
  viewFees: boolean;
  viewReports: boolean;
}

export interface DashboardStats {
  totalSchools: number;
  totalUsers: number;
  lastLogin: string;
}

export type ViewType =
  | 'dashboard'
  | 'add-school'
  | 'view-access'
  | 'account-details'
  | 'school-details'
  | 'edit-school'
  | 'school-login';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'teacher';
  employeeId: string;
  subjects: string[];
  classes: string[];
  avatar?: string;
}

export interface Student {
  id: string;
  name: string;
  rollNumber: string;
  class: string;
  section: string;
  email?: string;
  parentEmail?: string;
  avatar?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  remarks?: string;
  class: string;
  subject: string;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  subject: string;
  class: string;
  dueDate: string;
  attachments: string[];
  createdDate: string;
  status: 'active' | 'expired';
}

export interface Result {
  id: string;
  studentId: string;
  subject: string;
  examType: string;
  maxMarks: number;
  obtainedMarks: number;
  grade: string;
  date: string;
}

export interface Message {
  id: string;
  sender: string;
  recipient: string[];
  subject: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  type: 'individual' | 'group';
}