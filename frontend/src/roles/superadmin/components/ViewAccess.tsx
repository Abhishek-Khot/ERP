import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AccessMatrix, RolePermissions } from '../types';
import { toast } from 'react-hot-toast';

const allPermissions = [
  { key: 'manageUsers', label: 'Manage Users', description: 'Access to add, edit, and delete users' },
  { key: 'manageSchoolSettings', label: 'Manage School Settings', description: 'Access to configure school settings' },
  { key: 'viewAcademicDetails', label: 'Academic Details', description: 'Access to manage academic year and classes' },
  { key: 'viewAttendance', label: 'Attendance', description: 'Access to view and mark attendance' },
  { key: 'viewAssignments', label: 'Assignments', description: 'Access to manage assignments' },
  { key: 'viewResults', label: 'Results', description: 'Access to view student results' },
  { key: 'viewLeaves', label: 'Leave Management', description: 'Access to manage leave requests and approvals' },
  { key: 'messageStudentsParents', label: 'Message Students/Parents', description: 'Access to send messages to students and parents' },
  { key: 'viewFees', label: 'Manage Fees', description: 'Access to manage fee structure and payments' },
  { key: 'viewReports', label: 'View Reports', description: 'Access to generate and view reports' },
];

// Permissions specific to teacher role
const teacherPermissions = [
  { key: 'viewAttendance', label: 'Attendance', description: 'Access to view and mark attendance' },
  { key: 'viewAssignments', label: 'Assignments', description: 'Access to view assignments' },
  { key: 'viewResults', label: 'Results', description: 'Access to view student results' },
  { key: 'viewLeaves', label: 'Leave Management', description: 'Access to manage own leave requests' },
  { key: 'messageStudentsParents', label: 'Message Students/Parents', description: 'Access to send messages to students and parents' }
];

// Admin gets all permissions (including new ones)
const adminPermissions = allPermissions;

const roles = ['admin', 'teacher'] as const;

export function ViewAccess() {
  const { schools, selectedSchoolId, setCurrentView, updateSchoolAccess } = useApp();
  const [accessMatrix, setAccessMatrix] = useState<AccessMatrix | null>(null);

  const school = schools.find(s => s.id === selectedSchoolId);

  useEffect(() => {
    if (school) {
      setAccessMatrix(school.accessMatrix);
    }
  }, [school]);

  if (!school || !accessMatrix) {
    return (
      <div className="p-6">
        <p className="text-gray-600">School not found</p>
      </div>
    );
  }

  const handlePermissionChange = (role: keyof AccessMatrix, permission: keyof RolePermissions) => {
    if (!accessMatrix) return;

    setAccessMatrix(prev => {
      const currentValue = prev![role][permission];
      let newValue;

      // Handle special cases for teacher permissions that use string values
      if (role === 'teacher' && permission === 'viewLeaves') {
        // Toggle between 'own' (enabled) and false (disabled)
        newValue = (currentValue === 'own' || currentValue === true) ? false : 'own';
      } else if (role === 'teacher' && permission === 'viewResults') {
        // Toggle between 'own' (enabled) and false (disabled)
        newValue = (currentValue === 'own' || currentValue === true) ? false : 'own';
      } else if (role === 'teacher' && permission === 'manageSchoolSettings') {
        // Toggle between 'limited' (enabled) and false (disabled)
        newValue = (currentValue === 'limited' || currentValue === true) ? false : 'limited';
      } else {
        // Standard boolean toggle for other permissions
        newValue = !currentValue;
      }

      return {
        ...prev!,
        [role]: {
          ...prev![role],
          [permission]: newValue
        }
      };
    });
  };

  const handleSave = async () => {
    if (accessMatrix && selectedSchoolId) {
      try {
        await updateSchoolAccess(selectedSchoolId, accessMatrix);

        toast.success('Access permissions updated successfully!');

        // Wait a moment for the backend to complete the update
        await new Promise(resolve => setTimeout(resolve, 500));

        // Trigger permission refresh event for logged-in users
        window.dispatchEvent(new Event('permission-refresh'));

        setCurrentView('dashboard');
      } catch (error) {
        toast.error('Failed to update access permissions');
        console.error('Error updating access matrix:', error);
      }
    }
  };

  const RolePermissionTable = ({ role }: { role: keyof AccessMatrix }) => {
    const permissions = role === 'teacher' ? teacherPermissions : adminPermissions;

    const activePermissions = permissions.filter(p =>
      !!accessMatrix[role][p.key as keyof RolePermissions]
    ).length;

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 capitalize">{role} Access Matrix</h2>
              <p className="text-sm text-gray-600 mt-1">Configure access permissions for {role} role</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {activePermissions} of {permissions.length} permissions enabled
                </p>
                <div className="w-32 bg-gray-200 rounded-full h-2 mt-1">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(activePermissions / permissions.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 min-w-[300px]">
                  Permissions
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900 min-w-[120px]">
                  Access
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {permissions.map((permission) => (
                <tr key={permission.key} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-900">
                        {permission.label}
                      </span>
                      {'description' in permission && (
                        <span className="text-xs text-gray-500 mt-0.5">
                          {permission.description}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={!!accessMatrix[role][permission.key as keyof RolePermissions]}
                        onChange={() => handlePermissionChange(role, permission.key as keyof RolePermissions)}
                        className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Access Control - {school.name}</h1>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            <Save className="h-5 w-5" />
            <span>Save Changes</span>
          </button>
        </div>

        {/* Info Banner */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
              <strong className="font-semibold">Access Control:</strong> When you uncheck a permission, users of that role will see a popup notification when they try to access that feature. Changes take effect immediately for logged-in users.
            </p>
          </div>
        </div>

        {/* Admin Table - Shows all permissions */}
        <div className="mb-6">
          <RolePermissionTable role="admin" />
        </div>

        {/* Teacher Table - Shows only specific permissions */}
        <div className="mb-6">
          <RolePermissionTable role="teacher" />
        </div>

        {/* Role Summary Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map(role => {
            const permissions = role === 'teacher' ? teacherPermissions : adminPermissions;
            const activePermissions = permissions.filter(p =>
              !!accessMatrix[role][p.key as keyof RolePermissions]
            ).length;

            return (
              <div key={role} className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 capitalize mb-2">{role} Role Summary</h3>
                <p className="text-xs text-gray-600 mb-2">
                  {activePermissions} of {permissions.length} permissions enabled
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(activePermissions / permissions.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}