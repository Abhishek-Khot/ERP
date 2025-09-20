import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/Dashboard'
import ManageUsers from './pages/ManageUsers'
import SchoolSettings from './pages/SchoolSettings'
import AcademicDetails from './pages/AcademicDetails'
import AcademicDetailsSimple from './pages/AcademicDetailsSimple'
import MarkAttendance from './pages/MarkAttendance'
import Assignments from './pages/Assignments'
import Results from './pages/Results'
import TestComponent from './pages/TestComponent'
import AcademicResultsEntry from './pages/AcademicResultsEntry'
import ErrorBoundary from '../../components/ErrorBoundary'

export function AdminApp() {
  return (
    <AdminLayout>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<ManageUsers />} />
        <Route path="manage-users" element={<ManageUsers />} />
        <Route path="settings" element={<SchoolSettings />} />
        <Route path="school-settings" element={<SchoolSettings />} />
        <Route path="academic-details" element={
          <ErrorBoundary>
            <AcademicDetails />
          </ErrorBoundary>
        } />
        <Route path="attendance/mark" element={<MarkAttendance />} />
        <Route path="assignments" element={
          <ErrorBoundary>
            <Assignments />
          </ErrorBoundary>
        } />
        <Route path="results" element={<Results />} />
        <Route path="results/entry" element={
          <ErrorBoundary>
            <AcademicResultsEntry />
          </ErrorBoundary>
        } />
        <Route path="*" element={<Navigate to="/admin" />} />
      </Routes>
    </AdminLayout>
  )
}
