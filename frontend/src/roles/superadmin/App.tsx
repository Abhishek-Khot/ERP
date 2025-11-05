import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { AddSchoolForm } from './components/AddSchoolForm';
import { ViewAccess } from './components/ViewAccess';
import { AccountDetails } from './components/AccountDetails';
import SchoolDetails from './components/SchoolDetails';
import SchoolEditDetails from './components/SchoolEditDetails';
import { SchoolLogin } from '../../pages/SchoolLogin';
import { ChangePasswordDialog } from './components/ChangePasswordDialog';
import { useAuth } from '../../auth/AuthContext';

function AppContent() {
  console.log('[AppContent] Rendering AppContent');
  const { currentView, setCurrentView } = useApp();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  // Check if password change is required
  useEffect(() => {
    if (user && (user as any).passwordChangeRequired) {
      console.log('[SuperAdmin] Password change required for user');
      setShowPasswordDialog(true);
    }
  }, [user]);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'add-school':
        return <AddSchoolForm />;
      case 'view-access':
        return <ViewAccess />;
      case 'account-details':
        return <AccountDetails />;
      case 'school-details':
        return <SchoolDetails />;
      case 'edit-school':
        return <SchoolEditDetails />;
      case 'school-login':
        return (
          <SchoolLogin 
            onLoginSuccess={(userInfo) => {
              // Navigate to the appropriate dashboard based on role
              console.log('[SuperAdmin] School login successful, navigating to school dashboard');
              if (userInfo.role === 'admin') {
                navigate('/admin', { replace: true });
              } else if (userInfo.role === 'teacher') {
                navigate('/teacher', { replace: true });
              } else {
                alert(`Login successful!\nWelcome ${userInfo.name}\nRole: ${userInfo.role}\nSchool: ${userInfo.schoolName}`);
                setCurrentView('dashboard');
              }
            }}
            onBack={() => setCurrentView('dashboard')}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  const handlePasswordChangeSuccess = () => {
    setShowPasswordDialog(false);
    alert('Password changed successfully! Please login again.');
    logout();
    navigate('/login', { replace: true });
  };

  const handlePasswordDialogClose = () => {
    // Don't allow closing if password change is required
    if (user && (user as any).passwordChangeRequired) {
      alert('You must change your password to continue using the system.');
      return;
    }
    setShowPasswordDialog(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {currentView !== 'school-login' && <Navigation />}
      <main className={`flex-1 overflow-y-auto ${currentView === 'school-login' ? 'w-full' : ''}`}>
        {renderCurrentView()}
      </main>
      
      {/* Password Change Dialog */}
      {showPasswordDialog && (
        <ChangePasswordDialog
          onClose={handlePasswordDialogClose}
          onSuccess={handlePasswordChangeSuccess}
        />
      )}
    </div>
  );
}

function App() {
  console.log('[App] Rendering App component');
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;