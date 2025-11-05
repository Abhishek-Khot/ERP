import React, { useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  BarChart3,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
  School,
  Home,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { usePermissions, PermissionKey } from '../../../hooks/usePermissions';
import { PermissionDeniedModal } from '../../../components/PermissionDeniedModal';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onNavigate, onLogout }) => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasPermission, showPermissionDenied, setShowPermissionDenied, deniedPermissionName, checkAndNavigate } = usePermissions();

  // Get initials from teacher name
  const getInitials = () => {
    if (!user?.name) return 'T';
    const nameParts = user.name.split(' ');
    if (nameParts.length >= 2) {
      // First letter of first name + first letter of last name
      return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
    }
    // If only one name, return first two letters
    return user.name.substring(0, 2).toUpperCase();
  };

  const menuItems = [
    { name: 'Dashboard', icon: Home, page: 'dashboard', permission: null },
    { name: 'Attendance', icon: UserCheck, page: 'attendance', permission: 'viewAttendance' as PermissionKey },
    { name: 'Assignments', icon: FileText, page: 'assignments', permission: 'viewAssignments' as PermissionKey },
    { name: 'Results', icon: BarChart3, page: 'view-results', permission: 'viewResults' as PermissionKey },
    { name: 'Messages', icon: MessageSquare, page: 'messages', permission: 'messageStudentsParents' as PermissionKey },
    { name: 'Leave Request', icon: Calendar, page: 'leave-request', permission: 'viewLeaves' as PermissionKey }
  ];


  const handleMenuClick = (item: typeof menuItems[0]) => {
    if (item.permission && !hasPermission(item.permission)) {
      checkAndNavigate(item.permission, item.name, () => {
        onNavigate(item.page);
        setSidebarOpen(false);
      });
    } else {
      onNavigate(item.page);
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg mr-3">
              <School className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">ERP Portal</h1>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col h-full">
          <nav className="flex-1 px-4 py-6 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => handleMenuClick(item)}
                  className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${currentPage === item.page
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.name}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-6 border-t border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mr-3">
                <span className="text-white font-bold text-sm">
                  {getInitials()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user?.name || 'Teacher'}</p>
                <p className="text-xs text-gray-500">{user?.userId || user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={showPermissionDenied}
        onClose={() => setShowPermissionDenied(false)}
        permissionName={deniedPermissionName}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 capitalize">
              {currentPage.replace('-', ' ')}
            </h2>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;