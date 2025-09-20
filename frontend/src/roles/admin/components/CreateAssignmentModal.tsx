import React, { useState, useEffect } from 'react';
import { X, Upload, Calendar, FileText, Users } from 'lucide-react';
import * as assignmentAPI from '../../../api/assignment';
import { useAuth } from '../../../auth/AuthContext';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  title: string;
  subject: string;
  class: string;
  section: string;
  startDate: string;
  dueDate: string;
  instructions: string;
  attachments: File[];
}

const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { token } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    title: '',
    subject: '',
    class: '',
    section: '',
    startDate: '',
    dueDate: '',
    instructions: '',
    attachments: []
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);

  // Class options matching our class-subjects system
  const classes = [
    'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'
  ];

  const sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

  useEffect(() => {
    if (isOpen && formData.class) {
      fetchSubjectsForClass(formData.class);
    }
  }, [isOpen, formData.class]);

  const fetchSubjectsForClass = async (className: string) => {
    try {
      console.log(`🔍 Fetching subjects for class: ${className}`);
      
      // Add more detailed logging
      console.log(`🔗 Request URL: /api/class-subjects/class/${encodeURIComponent(className)}`);
      console.log(`🔑 Auth token available: ${!!token}`);
      
      // Try the regular endpoint first
      let response = await fetch(`/api/class-subjects/class/${encodeURIComponent(className)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      // If the regular endpoint fails, try the direct endpoint
      if (!response.ok) {
        console.log(`⚠️ Regular endpoint failed, trying direct endpoint...`);
        
        // Get the user's school code from the auth context
        let userSchoolCode = '';
        try {
          const authData = localStorage.getItem('erp.auth');
          if (authData) {
            const parsedAuth = JSON.parse(authData);
            userSchoolCode = parsedAuth.user?.schoolCode || '';
            console.log(`🏫 Using school code from auth: "${userSchoolCode}"`);
          }
        } catch (err) {
          console.error('Error parsing auth data:', err);
        }
        
        // Try direct endpoint with the user's school code
        response = await fetch(`/api/direct-test/class-subjects/${encodeURIComponent(className)}?schoolCode=${userSchoolCode}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-School-Code': userSchoolCode
          }
        });
        
        console.log(`📡 Direct endpoint response: ${response.status} ${response.statusText}`);
      }
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Class subjects response:', data);
        
        // Extract subjects from the response
        const subjects = data.data?.subjects || [];
        const subjectNames = subjects
          .filter((subject: any) => subject.isActive)
          .map((subject: any) => subject.name);
        
        console.log('📚 Available subjects:', subjectNames);
        setAvailableSubjects(subjectNames);
        
        // If current subject is not available for selected class, reset it
        if (formData.subject && !subjectNames.includes(formData.subject)) {
          setFormData(prev => ({ ...prev, subject: '' }));
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch subjects:', response.status, response.statusText);
        console.error('❌ Error details:', errorText);
        setAvailableSubjects([]);
      }
    } catch (error) {
      console.error('❌ Error fetching subjects:', error);
      // Fallback to empty array if API fails
      setAvailableSubjects([]);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = 'Please enter assignment title';
    if (!formData.subject) newErrors.subject = 'Please select a subject';
    if (!formData.class) newErrors.class = 'Please select a class';
    if (!formData.section) newErrors.section = 'Please select a section';
    if (!formData.startDate) newErrors.startDate = 'Please set a start date';
    if (!formData.dueDate) newErrors.dueDate = 'Please set a due date';
    if (!formData.instructions.trim()) newErrors.instructions = 'Please write assignment instructions';

    // Validate due date is after start date
    if (formData.startDate && formData.dueDate) {
      const startDate = new Date(formData.startDate);
      const dueDate = new Date(formData.dueDate);
      if (dueDate <= startDate) {
        newErrors.dueDate = 'Due date must be after start date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setFormData({ ...formData, attachments: [...formData.attachments, ...files] });
  };

  const removeFile = (index: number) => {
    const newAttachments = formData.attachments.filter((_, i) => i !== index);
    setFormData({ ...formData, attachments: newAttachments });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      
      // Add form fields
      formDataToSend.append('title', formData.title);
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('class', formData.class);
      formDataToSend.append('section', formData.section);
      formDataToSend.append('startDate', formData.startDate);
      formDataToSend.append('dueDate', formData.dueDate);
      formDataToSend.append('instructions', formData.instructions);

      // Log the data being sent
      console.log('📤 Sending assignment data:', {
        title: formData.title,
        subject: formData.subject,
        class: formData.class,
        section: formData.section,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        hasInstructions: !!formData.instructions,
        attachmentsCount: formData.attachments.length
      });

      // Add files
      formData.attachments.forEach(file => {
        formDataToSend.append('attachments', file);
      });

      // Get school code from auth context
      let schoolCode = '';
      try {
        const authData = localStorage.getItem('erp.auth');
        if (authData) {
          const parsedAuth = JSON.parse(authData);
          schoolCode = parsedAuth.user?.schoolCode || '';
          console.log(`🏫 Using school code for assignment: "${schoolCode}"`);
        }
      } catch (err) {
        console.error('Error parsing auth data:', err);
      }
      
      // Add school code to form data
      if (schoolCode) {
        formDataToSend.append('schoolCode', schoolCode);
        console.log('📤 Added schoolCode to request:', schoolCode);
      } else {
        console.warn('⚠️ No school code found in auth context');
      }

      const response = await assignmentAPI.createAssignmentWithFiles(formDataToSend);
      
      console.log('✅ Assignment created successfully:', response);
      setSuccessMessage(response.message || `Assignment created for ${formData.class} • Section ${formData.section}`);
      
      // Show success for 2 seconds then close
      setTimeout(() => {
        onSuccess();
        onClose();
        setSuccessMessage('');
        setFormData({
          title: '', subject: '', class: '', section: '', startDate: '',
          dueDate: '', instructions: '', attachments: []
        });
      }, 2000);

    } catch (error: any) {
      console.error('❌ Error creating assignment:', error);
      console.error('Error response:', error.response?.data || error.message);
      
      setErrors({ submit: error.response?.data?.message || 'Failed to create assignment' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        
        <div className="relative w-full max-w-4xl mx-auto bg-white rounded-lg shadow-xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Create Assignment</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {successMessage && (
            <div className="p-4 bg-green-50 border-l-4 border-green-400">
              <p className="text-sm text-green-700 font-medium">✅ {successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Title *</label>
              <input
                type="text"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                }`}
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter assignment title"
              />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                <select
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.class ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.class}
                  onChange={e => {
                    const newClass = e.target.value;
                    setFormData({ ...formData, class: newClass, subject: '' });
                    if (newClass) {
                      fetchSubjectsForClass(newClass);
                    } else {
                      setAvailableSubjects([]);
                    }
                  }}
                >
                  <option value="">Select Class</option>
                  {classes.map(cls => (
                    <option key={cls} value={cls}>
                      {cls === 'LKG' ? 'LKG' : cls === 'UKG' ? 'UKG' : `Class ${cls}`}
                    </option>
                  ))}
                </select>
                {errors.class && <p className="text-red-500 text-xs mt-1">{errors.class}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.subject ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  disabled={!formData.class}
                >
                  <option value="">{formData.class ? 'Select Subject' : 'Select Class First'}</option>
                  {availableSubjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
                {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section *</label>
                <select
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.section ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.section}
                  onChange={e => setFormData({ ...formData, section: e.target.value })}
                >
                  <option value="">Select Section</option>
                  {sections.map(section => (
                    <option key={section} value={section}>Section {section}</option>
                  ))}
                </select>
                {errors.section && <p className="text-red-500 text-xs mt-1">{errors.section}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />Start Date *
                </label>
                <input
                  type="date"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.startDate ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.startDate}
                  onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
                {errors.startDate && <p className="text-red-500 text-xs mt-1">{errors.startDate}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />Due Date *
                </label>
                <input
                  type="date"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.dueDate ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={formData.dueDate}
                  onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                  min={formData.startDate || new Date().toISOString().split('T')[0]}
                />
                {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="w-4 h-4 inline mr-1" />Assignment Instructions *
              </label>
              <textarea
                rows={4}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.instructions ? 'border-red-300' : 'border-gray-300'
                }`}
                value={formData.instructions}
                onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                placeholder="Write detailed instructions for the assignment..."
              />
              {errors.instructions && <p className="text-red-500 text-xs mt-1">{errors.instructions}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Upload className="w-4 h-4 inline mr-1" />Attachments (Optional)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
                onChange={handleFileSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              
              {formData.attachments.length > 0 && (
                <div className="mt-2 space-y-2">
                  {formData.attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {errors.submit && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{errors.submit}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Users className="w-4 h-4" />
                <span>{loading ? 'Creating...' : 'Create Assignment'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateAssignmentModal;
