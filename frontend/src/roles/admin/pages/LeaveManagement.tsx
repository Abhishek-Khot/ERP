import React, { useState, useEffect } from 'react';
import { Calendar, Check, X, Clock, User, FileText, Filter, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../../auth/AuthContext';

interface LeaveRequest {
  _id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  leaveType: 'sick' | 'casual' | 'emergency' | 'personal' | 'other';
  subject: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedOn: string;
  reviewedBy?: string;
  reviewedOn?: string;
  reviewComments?: string;
}

const LeaveManagement: React.FC = () => {
  const { user, token } = useAuth();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [reviewComments, setReviewComments] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Get auth token - improved to use AuthContext first
  const getAuthToken = () => {
    // First try the token from AuthContext
    if (token) {
      return token;
    }
    // Fallback to localStorage
    return localStorage.getItem('token');
  };

  // Fetch leave requests from backend
  useEffect(() => {
    fetchLeaveRequests();
  }, []);

  const fetchLeaveRequests = async () => {
    setLoading(true);
    try {
      const authToken = getAuthToken();
      console.log('🔑 Token exists:', !!authToken);
      console.log('🔑 Token length:', authToken?.length || 0);
      console.log('👤 User:', user?.userId, user?.role);
      console.log('🏫 School Code:', user?.schoolCode);
      
      if (!authToken) {
        console.error('❌ No authentication token found');
        toast.error('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }

      console.log('📋 Fetching leave requests from backend...');
      console.log('🌐 API URL:', 'http://localhost:5050/api/leave-requests/admin/all');

      const response = await fetch('http://localhost:5050/api/leave-requests/admin/all', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('❌ API Error:', errorData);
        console.error('❌ Response status:', response.status);
        throw new Error(errorData.message || 'Failed to fetch leave requests');
      }

      const result = await response.json();
      console.log('✅ Leave requests API response:', result);
      console.log('📊 Number of requests:', result.data?.leaveRequests?.length || 0);
      
      if (result.success && result.data?.leaveRequests) {
        // Transform backend data to match frontend interface
        const transformedData: LeaveRequest[] = result.data.leaveRequests.map((req: any) => {
          // Calculate number of days
          const start = new Date(req.startDate);
          const end = new Date(req.endDate);
          const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          return {
            _id: req._id,
            teacherId: req.teacherUserId || req.teacherId?._id || req.teacherId || 'N/A',
            teacherName: req.teacherName || req.teacherId?.name?.displayName || 'Unknown',
            teacherEmail: req.teacherEmail || req.teacherId?.email || 'N/A',
            leaveType: req.leaveType || 'other',
            subject: req.subjectLine || 'No Subject',
            startDate: req.startDate,
            endDate: req.endDate,
            days: req.numberOfDays || days,
            reason: req.description || 'No description provided',
            status: req.status,
            appliedOn: req.createdAt,
            reviewedBy: req.reviewedByName || req.reviewedBy?.name?.displayName,
            reviewedOn: req.reviewedAt,
            reviewComments: req.adminComments
          };
        });
        
        console.log('📊 Transformed data:', transformedData);
        setLeaveRequests(transformedData);
        setFilteredRequests(transformedData);
      } else {
        // No leave requests found
        console.log('ℹ️ No leave requests found in the database');
        setLeaveRequests([]);
        setFilteredRequests([]);
      }
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      toast.error('Failed to load leave requests');
    } finally {
      setLoading(false);
    }
  };

  // Filter and search
  useEffect(() => {
    let filtered = leaveRequests;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(req => req.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(req =>
        req.teacherName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.teacherEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.reason.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredRequests(filtered);
  }, [statusFilter, searchQuery, leaveRequests]);

  const handleApprove = async (requestId: string) => {
    setActionLoading(true);
    try {
      const authToken = getAuthToken();
      if (!authToken) {
        toast.error('Authentication required');
        return;
      }

      const response = await fetch(`http://localhost:5050/api/leave-requests/admin/${requestId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'approved',
          adminComments: reviewComments || 'Approved'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to approve leave request');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success('Leave request approved successfully');
        setShowModal(false);
        setSelectedRequest(null);
        setReviewComments('');
        // Refresh the list
        await fetchLeaveRequests();
      }
    } catch (error) {
      console.error('Error approving leave request:', error);
      toast.error('Failed to approve leave request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    setActionLoading(true);
    try {
      const authToken = getAuthToken();
      if (!authToken) {
        toast.error('Authentication required');
        return;
      }

      const response = await fetch(`http://localhost:5050/api/leave-requests/admin/${requestId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'rejected',
          adminComments: reviewComments || 'Rejected'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to reject leave request');
      }

      const result = await response.json();
      
      if (result.success) {
        toast.success('Leave request rejected');
        setShowModal(false);
        setSelectedRequest(null);
        setReviewComments('');
        // Refresh the list
        await fetchLeaveRequests();
      }
    } catch (error) {
      console.error('Error rejecting leave request:', error);
      toast.error('Failed to reject leave request');
    } finally {
      setActionLoading(false);
    }
  };

  const openModal = (request: LeaveRequest) => {
    setSelectedRequest(request);
    setReviewComments(request.reviewComments || '');
    setShowModal(true);
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case 'sick':
        return 'bg-red-100 text-red-800';
      case 'casual':
        return 'bg-blue-100 text-blue-800';
      case 'emergency':
        return 'bg-orange-100 text-orange-800';
      case 'personal':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Leave Management</h1>
        <p className="text-gray-600">Review and manage teacher leave requests</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">{leaveRequests.length}</p>
            </div>
            <Calendar className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {leaveRequests.filter(r => r.status === 'pending').length}
              </p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-green-600">
                {leaveRequests.filter(r => r.status === 'approved').length}
              </p>
            </div>
            <Check className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Rejected</p>
              <p className="text-2xl font-bold text-red-600">
                {leaveRequests.filter(r => r.status === 'rejected').length}
              </p>
            </div>
            <X className="h-8 w-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by teacher name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leave Requests Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Teacher
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Applied On
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No leave requests found
                  </td>
                </tr>
              ) : (
                filteredRequests.map((request) => (
                  <tr key={request._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{request.teacherName}</div>
                          <div className="text-sm text-gray-500">{request.teacherId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(request.startDate)} - {formatDate(request.endDate)}
                      </div>
                      <div className="text-sm text-gray-500">{request.days} day{request.days > 1 ? 's' : ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(request.appliedOn)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(request.status)}`}>
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => openModal(request)}
                        className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                      >
                        <FileText className="h-4 w-4" />
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Leave Request Details</h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedRequest(null);
                    setReviewComments('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {/* Teacher Info */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Teacher Information</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center mb-2">
                    <User className="h-5 w-5 text-gray-400 mr-2" />
                    <span className="font-medium text-gray-900">{selectedRequest.teacherName}</span>
                  </div>
                  <p className="text-sm text-gray-600">{selectedRequest.teacherEmail}</p>
                  <p className="text-sm text-gray-600">ID: {selectedRequest.teacherId}</p>
                </div>
              </div>

              {/* Leave Details */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Leave Details</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div>
                    <span className="text-sm text-gray-600 block mb-1">Subject:</span>
                    <span className="text-sm font-medium text-gray-900">{selectedRequest.subject}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600 block mb-1">Description:</span>
                    <p className="text-sm text-gray-700">{selectedRequest.reason}</p>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Start Date:</span>
                    <span className="text-sm font-medium text-gray-900">{formatDate(selectedRequest.startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">End Date:</span>
                    <span className="text-sm font-medium text-gray-900">{formatDate(selectedRequest.endDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Duration:</span>
                    <span className="text-sm font-medium text-gray-900">{selectedRequest.days} day{selectedRequest.days > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(selectedRequest.status)}`}>
                      {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Review Information (if already reviewed) */}
              {selectedRequest.status !== 'pending' && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Review Information</h3>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Reviewed By:</span>
                      <span className="text-sm font-medium text-gray-900">{selectedRequest.reviewedBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Reviewed On:</span>
                      <span className="text-sm font-medium text-gray-900">{selectedRequest.reviewedOn && formatDate(selectedRequest.reviewedOn)}</span>
                    </div>
                    {selectedRequest.reviewComments && (
                      <div>
                        <span className="text-sm text-gray-600 block mb-1">Comments:</span>
                        <p className="text-sm text-gray-700">{selectedRequest.reviewComments}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedRequest.status === 'pending' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApprove(selectedRequest._id)}
                    disabled={actionLoading}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    {actionLoading ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest._id)}
                    disabled={actionLoading}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <X className="h-5 w-5" />
                    {actionLoading ? 'Processing...' : 'Reject'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveManagement;
