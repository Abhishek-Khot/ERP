import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  MessageSquare,
  Eye,
  AlertCircle,
  Users,
  Clock,
  Mail,
  BookOpen,
  Trash2,
  Maximize2
} from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { useSchoolClasses } from '../../../hooks/useSchoolClasses';
import { toast } from 'react-hot-toast';
import {
  getMessages,
  sendMessage as sendMessageAPI,
  previewMessageRecipients,
  deleteMessage as deleteMessageAPI
} from '../../../api/message';

// Define Message type based on the NEW backend controller format
interface Message {
  id: string;
  class: string;
  section: string;
  adminId: string;
  adminName?: string;
  title: string;
  subject: string;
  message: string;
  createdAt: string;
  messageAge: string;
  urgencyIndicator: string;
  // Add these for delete functionality
  _id?: string; // MongoDB _id field
  schoolId?: string;
}

const MessagesPage: React.FC = () => {
  const { user } = useAuth();

  // Use the useSchoolClasses hook to fetch classes configured by superadmin
  const {
    classesData,
    loading: classesLoading,
    error: classesError,
    hasClasses
  } = useSchoolClasses();

  // Form state (for sending a new message) - defaults to empty string to enforce selection
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedClass, setSelectedClass] = useState(''); // Changed from 'ALL'
  const [selectedSection, setSelectedSection] = useState(''); // Changed from 'ALL'
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [recipientCount, setRecipientCount] = useState<number>(0);

  // Sent Messages List filter state
  const [academicYear, setAcademicYear] = useState('');
  const [messagesFilterClass, setMessagesFilterClass] = useState('ALL'); // 'ALL' for filtering
  const [messagesFilterSection, setMessagesFilterSection] = useState('ALL'); // 'ALL' for filtering
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 5;

  // UI state for sending
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Delete state
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);

  // Preview state
  const [messageToPreview, setMessageToPreview] = useState<Message | null>(null);

  // Get class list from superadmin configuration
  const classList = classesData?.classes?.map(c => c.className) || [];

  // Helper function to format date
  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Fetch messages from the backend
  const fetchMessages = useCallback(async (page: number, currentClass: string, currentSection: string) => {
    setMessagesLoading(true);
    setMessagesError(null);

    try {
      const params = {
        page,
        limit: LIMIT,
        class: currentClass === 'ALL' ? undefined : currentClass,
        section: currentSection === 'ALL' ? undefined : currentSection,
      };

      const result = await getMessages(params);

      setMessages(result.data.messages || []);
      setCurrentPage(result.data.pagination?.page || 1);
      setTotalPages(result.data.pagination?.pages || 1);

    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setMessagesError('Failed to load sent messages.');
      toast.error('Failed to load sent messages.');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Initial fetch of messages and refetch on filter change
  useEffect(() => {
    fetchMessages(1, messagesFilterClass, messagesFilterSection);
  }, [fetchMessages, messagesFilterClass, messagesFilterSection]);

  // Update available sections when class changes (for the SEND NEW MESSAGE form)
  useEffect(() => {
    // If no class is selected (empty string)
    if (!selectedClass || selectedClass === 'ALL') {
      setAvailableSections([]); // No sections to choose from
      setSelectedSection(''); // Clear section
      return;
    }

    // Logic for a specific class
    if (classesData) {
      const selectedClassData = classesData.classes.find(c => c.className === selectedClass);

      if (selectedClassData) {
        // Map sections to the expected format.
        const rawSections = selectedClassData.sections || [];

        // Robust mapping to extract section name correctly and ensure section options appear
        const sections = rawSections.map((s: any) => {
          // Handle data structure that is an object { sectionName: 'A' } or potentially just the string 'A'
          const sectionName = s.sectionName || s;
          return {
            value: sectionName, // The actual value to be sent to the API (e.g., 'A')
            section: sectionName // The display value (e.g., 'A')
          };
        });

        setAvailableSections(sections);

        // If current section is invalid, reset it. Otherwise keep the old value.
        const currentValidSections = sections.map(s => s.value);
        if (selectedSection && !currentValidSections.includes(selectedSection)) {
          setSelectedSection(''); // Reset to empty if no valid selection exists
        }

      } else {
        // Class exists but no sections defined
        setAvailableSections([]);
        setSelectedSection('');
      }
    }
  }, [selectedClass, classesData]);

  // Preview recipients when class/section changes
  useEffect(() => {
    // Only preview when a specific class and section is selected (not empty or 'ALL')
    if (selectedClass && selectedSection && selectedClass !== 'ALL' && selectedSection !== 'ALL') {
      previewRecipients(selectedClass, selectedSection);
    } else {
      // Ensure recipient count is cleared if selection is incomplete
      setRecipientCount(0);
    }
  }, [selectedClass, selectedSection]);


  const previewRecipients = async (targetClass: string, targetSection: string) => {
    try {
      // Backend gets schoolId from req.user.schoolId, no need to send it
      const result = await previewMessageRecipients({
        class: targetClass,
        section: targetSection
      });

      // The backend `previewMessage` returns `estimatedRecipients`
      setRecipientCount(result.data?.estimatedRecipients || 0);
    } catch (err: any) {
      console.error('Error previewing recipients:', err);
      // Fallback for demo purposes
      setRecipientCount(0);
    }
  };

  // Preview message
  const handlePreview = () => {
    if (!title.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all fields');
      return;
    }
    // Validation: Require specific class/section for sending (non-empty, non-'ALL')
    if (!selectedClass || selectedClass === 'ALL') {
      setError('Please select a specific Class to send a message');
      return;
    }
    if (!selectedSection || selectedSection === 'ALL') {
      setError('Please select a specific Section to send a message');
      return;
    }

    setError(null);
    setShowPreviewModal(true);
  };

  // Send message
  const handleSendMessage = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setShowPreviewModal(false); // Close modal on send attempt

      // Re-validate just in case
      if (!selectedClass || selectedClass === 'ALL' || !selectedSection || selectedSection === 'ALL') {
        throw new Error('Please select a specific Class and Section to send a message.');
      }

      // Only send required fields as per new backend schema
      const payload = {
        class: selectedClass,
        section: selectedSection,
        title,
        subject,
        message
      };

      const response = await sendMessageAPI(payload);

      if (response.success) {
        setSuccess('Message sent successfully!');
        setTitle('');
        setSubject('');
        setMessage('');
        setSelectedClass('');
        setSelectedSection('');
        setRecipientCount(0);
        // Re-fetch the message list to show the new message
        fetchMessages(1, messagesFilterClass, messagesFilterSection);
        toast.success('Message sent successfully!');

      } else {
        // Check for specific error message from the response body
        throw new Error(response.message || 'Failed to send message');
      }

    } catch (error: any) {
      setError(error.message || 'Failed to send message');
      toast.error(error.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  // Delete message function
  const handleDeleteMessage = async (messageId: string) => {
    try {
      setDeleteLoading(messageId);

      const response = await deleteMessageAPI(messageId);

      if (response.success) {
        toast.success('Message deleted successfully!');
        // Refresh the messages list
        fetchMessages(currentPage, messagesFilterClass, messagesFilterSection);
      } else {
        throw new Error(response.message || 'Failed to delete message');
      }
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error(error.message || 'Failed to delete message');
    } finally {
      setDeleteLoading(null);
      setMessageToDelete(null);
    }
  };

  // Confirm delete modal
  const confirmDelete = (message: Message) => {
    setMessageToDelete(message);
  };

  const cancelDelete = () => {
    setMessageToDelete(null);
    setDeleteLoading(null);
  };

  // Preview message details
  // Preview message details
  const previewMessageDetails = (message: Message) => {
    // Create a safe message object with fallbacks
    const safeMessage = {
      ...message,
      title: message.title || 'No Title',
      subject: message.subject || 'No Subject',
      message: message.message || 'No Message Content',
      class: message.class || 'N/A',
      section: message.section || 'N/A',
      createdAt: message.createdAt || '',
      messageAge: message.messageAge || 'Unknown',
      urgencyIndicator: message.urgencyIndicator || 'normal'
    };
    setMessageToPreview(safeMessage);
  };

  const closePreview = () => {
    setMessageToPreview(null);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchMessages(newPage, messagesFilterClass, messagesFilterSection);
    }
  };

  // Helper function to truncate text
  // Helper function to truncate text
  const truncateText = (text: string, maxLength: number) => {
    if (!text || typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const renderClassSectionSelector = () => {
    if (classesLoading) {
      return (
        <div className="bg-gray-50 p-4 rounded-lg border">
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading classes...</span>
          </div>
        </div>
      );
    }

    if (classesError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <h3 className="text-red-800 font-medium">Error Loading Classes</h3>
          </div>
          <p className="text-red-700 mt-1 text-sm">{classesError}</p>
        </div>
      );
    }

    if (!hasClasses() || classList.length === 0) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
            <h3 className="text-yellow-800 font-medium">No Classes Configured</h3>
          </div>
          <p className="text-yellow-700 mt-1 text-sm">
            No classes have been defined for this school. Please contact the Super Admin to add classes and sections.
          </p>
        </div>
      );
    }

    // Helper for section select text
    const getSectionSelectText = () => {
      if (!selectedClass) return 'Select Class First';
      if (availableSections.length === 0) return 'No Sections Available';
      return 'Select Section';
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Class Selection */}
          <div>
            <label htmlFor="class-select" className="block text-sm font-medium text-gray-700 mb-2">
              Class <span className="text-red-500">*</span>
            </label>
            <select
              id="class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Class</option>
              {classList.map((cls) => (
                <option key={cls} value={cls}>Class {cls}</option>
              ))}
            </select>
          </div>

          {/* Section Selection */}
          <div>
            <label htmlFor="section-select" className="block text-sm font-medium text-gray-700 mb-2">
              Section <span className="text-red-500">*</span>
            </label>
            <select
              id="section-select"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!selectedClass}
            >
              <option value="">
                {getSectionSelectText()}
              </option>
              {selectedClass && availableSections.map((section) => (
                <option key={section.value} value={section.value}>
                  Section {section.section}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Recipient Count Display */}
        {recipientCount > 0 && selectedClass && selectedSection && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center">
            <Users className="h-5 w-5 text-blue-600 mr-2" />
            <span className="text-sm text-blue-800">
              This message will be sent to <strong>{recipientCount}</strong> student{recipientCount !== 1 ? 's' : ''} in Class {selectedClass} - Section {selectedSection}
            </span>
          </div>
        )}
        {recipientCount === 0 && selectedClass && selectedSection && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
            <span className="text-sm text-yellow-800">
              No students found matching Class <strong>{selectedClass}</strong> - Section <strong>{selectedSection}</strong>.
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderMessageFilter = () => {
    const filterClassOptions = [{ name: 'ALL Classes', value: 'ALL' }, ...classList.map(cls => ({ name: `Class ${cls}`, value: cls }))];

    let filterSectionOptions = [{ name: 'ALL Sections', value: 'ALL' }];
    if (messagesFilterClass !== 'ALL' && classesData) {
      const selectedClassData = classesData.classes.find(c => c.className === messagesFilterClass);
      if (selectedClassData) {
        const rawSections = selectedClassData.sections || [];
        const sections = rawSections.map((s: any) => {
          const sectionName = s.sectionName || s;
          return { name: `Section ${sectionName}`, value: sectionName };
        });
        filterSectionOptions = [...filterSectionOptions, ...sections];
      }
    }

    return (
      <div className="flex space-x-4 mb-4">
        {/* Academic Year Filter */}
        <div className="w-1/3">
          <label htmlFor="filter-academic-year" className="block text-xs font-medium text-gray-500 mb-1">
            Academic Year
          </label>
          <select
            id="filter-academic-year"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Years</option>
            <option value="2024-2025">2024-2025</option>
            <option value="2025-2026">2025-2026</option>
            <option value="2026-2027">2026-2027</option>
            <option value="2027-2028">2027-2028</option>
          </select>
        </div>

        {/* Class Filter */}
        <div className="w-1/3">
          <label htmlFor="filter-class" className="block text-xs font-medium text-gray-500 mb-1">
            Filter by Class
          </label>
          <select
            id="filter-class"
            value={messagesFilterClass}
            onChange={(e) => {
              setMessagesFilterClass(e.target.value);
              setMessagesFilterSection('ALL'); // Reset section filter when class changes
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {filterClassOptions.map((option) => (
              <option key={`filter-class-${option.value}`} value={option.value}>{option.name}</option>
            ))}
          </select>
        </div>

        {/* Section Filter */}
        <div className="w-1/3">
          <label htmlFor="filter-section" className="block text-xs font-medium text-gray-500 mb-1">
            Filter by Section
          </label>
          <select
            id="filter-section"
            value={messagesFilterSection}
            onChange={(e) => setMessagesFilterSection(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={messagesFilterClass === 'ALL' && filterSectionOptions.length === 1}
          >
            {filterSectionOptions.map((option) => (
              <option key={`filter-section-${option.value}`} value={option.value}>{option.name}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <h1 className="text-3xl font-bold text-gray-900 flex items-center">
        <MessageSquare className="mr-3 h-8 w-8 text-blue-600" /> Messages
      </h1>

      {/* Alerts */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Success!</strong>
          <span className="block sm:inline"> {success}</span>
        </div>
      )}

      {/* Send New Message Section */}
      <div className="border-b pb-4 mb-4">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Send New Message</h2>

        {/* Class and Section Selection */}
        <div className="mb-6">
          {renderClassSectionSelector()}
        </div>

        <div className="grid grid-cols-1 gap-4 mb-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter message title"
              disabled={!hasClasses() || classList.length === 0}
            />
          </div>
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="subject"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter message subject"
              disabled={!hasClasses() || classList.length === 0}
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700">
              Message Body <span className="text-red-500">*</span>
            </label>
            <textarea
              id="message"
              rows={5}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              disabled={!hasClasses() || classList.length === 0}
            ></textarea>
          </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={handlePreview}
            disabled={!hasClasses() || classList.length === 0 || !title || !message || !selectedClass || !selectedSection}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Eye className="h-5 w-5 mr-2" /> Preview
          </button>
          <button
            onClick={handleSendMessage}
            disabled={loading || !hasClasses() || classList.length === 0 || !title || !message || !selectedClass || !selectedSection}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${loading || !hasClasses() || classList.length === 0 || !title || !message || !selectedClass || !selectedSection
              ? 'bg-blue-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors`}
          >
            {loading ? 'Sending...' : <><Send className="h-5 w-5 mr-2" />Send Message</>}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
          <div className="relative p-8 border w-full max-w-md md:max-w-lg lg:max-w-xl shadow-lg rounded-md bg-white">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Message Preview</h3>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">Title:</p>
              <p className="text-gray-900 font-semibold">{title}</p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">Subject:</p>
              <p className="text-gray-900 font-semibold">{subject}</p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">Message Body:</p>
              <p className="text-gray-800 whitespace-pre-wrap">{message}</p>
            </div>
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">Target Audience:</p>
              <p className="text-gray-800">
                Class {selectedClass} - Section {selectedSection}
                {recipientCount > 0 && (
                  <span className="text-blue-600 font-semibold"> ({recipientCount} students)</span>
                )}
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendMessage}
                disabled={loading}
                className={`px-4 py-2 text-white rounded-md ${loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } transition-colors`}
              >
                {loading ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      <hr className="my-6" />

      {/* Sent Messages List */}
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center">
          <Mail className="h-6 w-6 mr-2 text-blue-600" /> Sent Messages
        </h2>

        {/* Message Filtering UI */}
        {renderMessageFilter()}

        {messagesError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {messagesError}</span>
            <button onClick={() => fetchMessages(currentPage, messagesFilterClass, messagesFilterSection)} className="ml-4 text-sm font-semibold underline">Retry</button>
          </div>
        )}

        {messagesLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No sent messages found matching the selected filters.
          </div>
        ) : (
          <>
            {/* Messages Table */}
            {/* Messages Table */}
            <div className="overflow-x-auto shadow-sm border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title & Subject
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Class & Section
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Message
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Age
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {messages.map((message) => {
                    const title = message.title || '';
                    const subject = message.subject || '';
                    const messageText = message.message || '';
                    const messageClass = message.class || '';
                    const messageSection = message.section || '';
                    const createdAt = message.createdAt || '';
                    const messageAge = message.messageAge || '';
                    const urgencyIndicator = message.urgencyIndicator || 'normal';

                    const titleLength = title.length;
                    const subjectLength = subject.length;
                    const messageLength = messageText.length;

                    return (
                      <tr key={message.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {truncateText(title, 20)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {truncateText(subject, 20)}
                          </div>
                          {/* {(titleLength > 20 || subjectLength > 20) && (
                            <button
                              onClick={() => previewMessageDetails(message)}
                              className="mt-1 text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                              title="View full content"
                            >
                              <Maximize2 className="h-3 w-3" />
                              View full
                            </button>
                          )} */}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="font-semibold text-gray-700">Class {messageClass}</div>
                          <div className="text-xs text-gray-500">Section {messageSection}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center text-xs text-gray-600">
                            <Clock className="h-3 w-3 mr-1" /> {formatDateTime(createdAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 max-w-xs truncate">
                            {truncateText(messageText, 20)}
                          </div>
                          {messageLength > 30 && (
                            <button
                              onClick={() => previewMessageDetails(message)}
                              className="mt-1 text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1"
                              title="View full message"
                            >
                              <Maximize2 className="h-3 w-3" />
                              View full
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${urgencyIndicator === 'urgent' ? 'bg-red-100 text-red-800' :
                              urgencyIndicator === 'high' ? 'bg-orange-100 text-orange-800' :
                                'bg-green-100 text-green-800'
                              }`}
                          >
                            {messageAge}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => previewMessageDetails(message)}
                              className="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50"
                              title="Preview message"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => confirmDelete(message)}
                              disabled={deleteLoading === message.id}
                              className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors p-1 rounded hover:bg-red-50"
                              title="Delete message"
                            >
                              {deleteLoading === message.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {messageToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
          <div className="relative p-6 border w-full max-w-md shadow-lg rounded-md bg-white mx-4">
            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                <h3 className="text-lg font-bold text-red-800">Confirm Delete</h3>
              </div>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this message?
              </p>
              <div className="mt-2 p-3 bg-red-50 rounded-md border border-red-200">
                <p className="font-semibold text-gray-900 break-words">{messageToDelete.title}</p>
                <p className="text-sm text-gray-600">Class {messageToDelete.class} - Section {messageToDelete.section}</p>
                <p className="text-xs text-gray-500 mt-1 break-words">{messageToDelete.message}</p>
              </div>
              <p className="text-xs text-red-600 mt-2">
                This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                disabled={deleteLoading === messageToDelete.id}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteMessage(messageToDelete.id)}
                disabled={deleteLoading === messageToDelete.id}
                className={`px-4 py-2 text-white rounded-md ${deleteLoading === messageToDelete.id
                  ? 'bg-red-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
                  } transition-colors`}
              >
                {deleteLoading === messageToDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Preview Modal */}
      {/* Message Preview Modal */}
      {messageToPreview && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
          <div className="relative p-8 border w-full max-w-2xl shadow-lg rounded-md bg-white mx-4">
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4 rounded">
              <div className="flex items-center">
                <Eye className="h-5 w-5 text-green-400 mr-2" />
                <h3 className="text-xl font-bold text-green-800">Message Details</h3>
              </div>
            </div>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Title:</p>
                <p className="text-gray-900 font-semibold break-words">{messageToPreview.title}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Subject:</p>
                <p className="text-gray-900 font-semibold break-words">{messageToPreview.subject}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Class & Section:</p>
                <p className="text-gray-800">Class {messageToPreview.class} - Section {messageToPreview.section}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Sent:</p>
                <p className="text-gray-800">{formatDateTime(messageToPreview.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Message Body:</p>
                <div className="mt-1 p-3 bg-green-50 rounded-md border border-green-200">
                  <p className="text-gray-800 whitespace-pre-wrap break-words">{messageToPreview.message}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={closePreview}
                className="px-4 py-2 bg-green-100 text-green-800 border border-green-300 rounded-md hover:bg-green-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;