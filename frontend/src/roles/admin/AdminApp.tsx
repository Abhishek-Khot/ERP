import React from 'react'

import { Routes, Route, Navigate } from 'react-router-dom'

import AdminLayout from './components/AdminLayout'

import Dashboard from './pages/Dashboard'

import ManageUsers from './pages/ManageUsers'

import SchoolSettings from './pages/SchoolSettings'

import AcademicDetails from './pages/AcademicDetails'

import IDCardTemplatePreview from '../../pages/Settings/IDCardTemplatePreview'

import AcademicDetailsSimple from './pages/AcademicDetailsSimple'

import AttendanceHome from './pages/AttendanceHome'

import MarkAttendance from './pages/MarkAttendance'

import ViewAttendanceRecords from './pages/ViewAttendanceRecords'

import Assignments from './pages/Assignments'

import Results from './pages/Results'

import TestComponent from './pages/TestComponent'

import AcademicResultsEntry from './pages/AcademicResultsEntry'

import MessagesPage from './pages/MessagesPage'

import FeesPage from './pages/FeesPage'

import ReportsPage from './pages/ReportsPage'

import LeaveManagement from './pages/LeaveManagement'

import ErrorBoundary from '../../components/ErrorBoundary'

import { PermissionGuard } from '../../components/PermissionGuard'

import { PermissionProvider } from '../../hooks/usePermissions'
import StudentAttendanceStats from './pages/StudentAttendanceStats';

export function AdminApp() {

  return (
    <PermissionProvider>
      <AdminLayout>
        <Routes>
          <Route index element={<Dashboard />} />

          {/* User Management - Requires manageUsers permission */}
          <Route path="users" element={
            <PermissionGuard permission="manageUsers" permissionName="User Management">
              <ManageUsers />
            </PermissionGuard>

          } />

          <Route path="manage-users" element={
            <PermissionGuard permission="manageUsers" permissionName="User Management">
              <ManageUsers />
            </PermissionGuard>

          } />



          {/* School Settings - Requires manageSchoolSettings permission */}
          <Route path="settings" element={
            <PermissionGuard permission="manageSchoolSettings" permissionName="School Settings">
              <SchoolSettings />
            </PermissionGuard>

          } />
          <Route path="school-settings" element={
            <PermissionGuard permission="manageSchoolSettings" permissionName="School Settings">
              <SchoolSettings />
            </PermissionGuard>

          } />
          <Route path="settings/idcard-templates" element={
            <PermissionGuard permission="manageSchoolSettings" permissionName="ID Card Templates">
              <IDCardTemplatePreview />
            </PermissionGuard>

          } />

          {/* Academic Details - Requires viewAcademicDetails permission */}
          <Route path="academic-details" element={
            <PermissionGuard permission="viewAcademicDetails" permissionName="Academic Details">
              <ErrorBoundary>
                <AcademicDetails />
              </ErrorBoundary>
            </PermissionGuard>

          } />

          {/* Attendance - Requires viewAttendance permission */}
          <Route path="attendance" element={
            <PermissionGuard permission="viewAttendance" permissionName="Attendance">
              <AttendanceHome />
            </PermissionGuard>

          } />
          <Route path="attendance/mark" element={
            <PermissionGuard permission="viewAttendance" permissionName="Mark Attendance">
              <AttendanceHome />
            </PermissionGuard>

          } />
          <Route path="attendance/view" element={
            <PermissionGuard permission="viewAttendance" permissionName="View Attendance">
              <AttendanceHome />
            </PermissionGuard>

          } />

          {/* Assignments - Requires viewAssignments permission */}
          <Route path="assignments" element={
            <PermissionGuard permission="viewAssignments" permissionName="Assignments">
              <ErrorBoundary>
                <Assignments />
              </ErrorBoundary>
            </PermissionGuard>

          } />

          {/* Results - Requires viewResults permission */}
          <Route path="results" element={
            <PermissionGuard permission="viewResults" permissionName="Results">
              <Results />
            </PermissionGuard>

          } />
          <Route path="results/entry" element={
            <PermissionGuard permission="viewResults" permissionName="Results Entry">
              <ErrorBoundary>
                <AcademicResultsEntry />
              </ErrorBoundary>
            </PermissionGuard>

          } />

          {/* Messages - Requires messageStudentsParents permission */}
          <Route path="messages" element={
            <PermissionGuard permission="messageStudentsParents" permissionName="Messages">
              <MessagesPage />
            </PermissionGuard>

          } />

          {/* Fees - Requires viewFees permission */}
          <Route path="fees/structure" element={
            <PermissionGuard permission="viewFees" permissionName="Fee Structure">
              <FeesPage />
            </PermissionGuard>

          } />
          <Route path="fees/payments" element={
            <PermissionGuard permission="viewFees" permissionName="Fee Payments">
              <FeesPage />
            </PermissionGuard>

          } />

          {/* Reports - Requires viewReports permission */}
          <Route path="reports" element={
            <PermissionGuard permission="viewReports" permissionName="Reports">
              <ReportsPage />
            </PermissionGuard>

          } />

          {/* Leave Management - Requires viewLeaves permission */}
          <Route path="leave-management" element={
            <PermissionGuard permission="viewLeaves" permissionName="Leave Management">
              <LeaveManagement />
            </PermissionGuard>

          } />
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </AdminLayout>
    </PermissionProvider>

  )

}