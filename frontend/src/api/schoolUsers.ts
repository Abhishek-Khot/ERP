import axios from 'axios';
import api from './axios'; // Use the same axios instance

const API_BASE_URL = 'http://localhost:5050/api';

// School User Management API
export const schoolUserAPI = {
  // Add user to school
  addUser: async (schoolCode: string, userData: any, token: string) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/school-users/${schoolCode}/users`,
        userData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to add user');
    }
  },

  // Get all users in a school
  getAllUsers: async (schoolCode: string, token: string) => {
    try {
      console.log(`🔍 Calling API: GET ${API_BASE_URL}/school-users/${schoolCode}/users`);
      console.log(`🔐 Using token: ${token ? token.substring(0, 20) + '...' : 'MISSING'}`);
      
      const response = await axios.get(
        `${API_BASE_URL}/school-users/${schoolCode}/users`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      console.log('✅ API Response:', response);
      // Return the data field which contains the grouped users, with proper null checking
      return response.data || {};
    } catch (error: any) {
      console.error('❌ API Error Details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        headers: error.config?.headers
      });
      
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch users';
      throw new Error(errorMessage);
    }
  },

  // Get users by role
  getUsersByRole: async (schoolCode: string, role: string, token: string) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/school-users/${schoolCode}/users/role/${role}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch users');
    }
  },

  // Get specific user
  getUser: async (schoolCode: string, userId: string, token: string) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/school-users/${schoolCode}/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch user');
    }
  },

  // Update user
  updateUser: async (schoolCode: string, userId: string, updateData: any, token: string) => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/school-users/${schoolCode}/users/${userId}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update user');
    }
  },

  // Reset user password
  resetPassword: async (schoolCode: string, userId: string, token: string) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/school-users/${schoolCode}/users/${userId}/reset-password`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to reset password');
    }
  },

  // Toggle user status
  toggleStatus: async (schoolCode: string, userId: string, isActive: boolean, token: string) => {
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/school-users/${schoolCode}/users/${userId}/status`,
        { isActive },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update user status');
    }
  },

  // Get all school users (simplified version for attendance)
  getSchoolUsers: async () => {
    try {
      const response = await api.get('/users/role/student');
      return response.data.data || response.data || [];
    } catch (error: any) {
      console.error('Error fetching school users:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch school users');
    }
  },

  // Delete user
  deleteUser: async (schoolCode: string, userId: string, token: string) => {
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/school-users/${schoolCode}/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete user');
    }
  },

  // Get access matrix
  getAccessMatrix: async (schoolCode: string, token: string) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/school-users/${schoolCode}/access-matrix`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch access matrix');
    }
  },

  // Update access matrix
  updateAccessMatrix: async (schoolCode: string, matrix: any, token: string) => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/school-users/${schoolCode}/access-matrix`,
        { matrix },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to update access matrix');
    }
  }
};

// School login API
export const schoolAuthAPI = {
  login: async (identifier: string, password: string, schoolCode: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/school-login`, {
        identifier,
        password,
        schoolCode
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  }
};

// Types for TypeScript
export interface User {
  _id: string;
  userId: string;
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  name: {
    firstName: string;
    lastName: string;
    displayName: string;
  };
  contact: {
    primaryPhone: string;
    secondaryPhone?: string;
    emergencyContact?: string;
  };
  address?: any;
  schoolCode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  academicInfo?: any; // For students
  teachingInfo?: any; // For teachers
  adminInfo?: any; // For admins
  parentInfo?: any; // For parents
}

export interface CreateUserData {
  email: string;
  role: 'admin' | 'teacher' | 'student' | 'parent';
  firstName: string;
  lastName: string;
  phone?: string;
  // Role-specific fields
  class?: string; // For students
  section?: string; // For students
  rollNumber?: string; // For students
  subjects?: string[]; // For teachers
  qualification?: string; // For teachers
  department?: string; // For admins
  occupation?: string; // For parents
  relationToStudent?: string; // For parents
}

export interface UserCredentials {
  userId: string;
  email: string;
  password: string;
  loginUrl?: string;
  message?: string;
}

export interface AccessMatrix {
  admin: {
    [permission: string]: boolean;
  };
  teacher: {
    [permission: string]: boolean;
  };
  student: {
    [permission: string]: boolean;
  };
  parent: {
    [permission: string]: boolean;
  };
}
