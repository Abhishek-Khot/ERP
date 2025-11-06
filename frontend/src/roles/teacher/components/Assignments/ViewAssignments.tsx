import React, { useState, useEffect } from 'react';
import { Search, Edit, Trash2, Calendar, X, Plus } from 'lucide-react';
import { useAuth } from '../../../../auth/AuthContext';
import { useSchoolClasses } from '../../../../hooks/useSchoolClasses';
import * as assignmentAPI from '../../../../api/assignment';

interface Assignment {
  _id: string;
  title: string;
  subject: string;
  class: string;
  section?: string;
  dueDate: string;
  startDate?: string;
  instructions?: string;
  description?: string;
  teacher?: any;
  status?: string;
}

const ViewAssignments: React.FC = () => {
  const { user } = useAuth();
  const { classesData, getSectionsByClass } = useSchoolClasses();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [academicYear, setAcademicYear] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const classList = classesData?.classes?.map(c => c.className) || [];

  useEffect(() => {
    fetchAssignments();
  }, []);

  useEffect(() => {
    filterAssignments();
  }, [assignments, searchTerm, selectedClass, selectedSection, selectedSubject]);

  useEffect(() => {
    if (selectedClass && classesData) {
      const sections = getSectionsByClass(selectedClass);
      setAvailableSections(sections);
    } else {
      setAvailableSections([]);
      setSelectedSection('');
    }
  }, [selectedClass, classesData]);

  useEffect(() => {
    if (selectedClass && selectedSection) {
      fetchSubjectsForClassSection();
    } else {
      setAvailableSubjects([]);
      setSelectedSubject('');
    }
  }, [selectedClass, selectedSection]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      console.log('🔍 Fetching assignments...');
      
      let data;
      let assignmentsArray = [];
      
      try {
        // Try the regular endpoint first
        data = await assignmentAPI.fetchAssignments();
        console.log('✅ Raw API response:', data);
        
        // Handle different response structures
        if (data.data && Array.isArray(data.data)) {
          assignmentsArray = data.data;
        } else if (data.assignments && Array.isArray(data.assignments)) {
          assignmentsArray = data.assignments;
        } else if (Array.isArray(data)) {
          assignmentsArray = data;
        }
        
        console.log('✅ Extracted assignments array:', assignmentsArray);
      } catch (regularError) {
        console.error('❌ Error with regular endpoint:', regularError);
        
        // If the regular endpoint fails, try the direct endpoint
        const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
        console.log('🔍 Trying direct endpoint with schoolCode:', schoolCode);
        
        const response = await fetch(`/api/direct-test/assignments?schoolCode=${schoolCode}`, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-School-Code': schoolCode
          }
        });
        
        if (!response.ok) {
          throw new Error(`Direct endpoint failed with status: ${response.status}`);
        }
        
        data = await response.json();
        console.log('✅ Direct endpoint response:', data);
        
        // Handle different response structures
        if (data.data && Array.isArray(data.data)) {
          assignmentsArray = data.data;
        } else if (data.assignments && Array.isArray(data.assignments)) {
          assignmentsArray = data.assignments;
        } else if (Array.isArray(data)) {
          assignmentsArray = data;
        }
      }
      
      console.log(`📊 Total assignments before filtering: ${assignmentsArray.length}`);
      
      // Validate each assignment has required fields
      const validAssignments = assignmentsArray.filter((assignment: any) => {
        if (!assignment || typeof assignment !== 'object') {
          console.log('❌ Invalid assignment (not an object):', assignment);
          return false;
        }
        const hasTitle = assignment.title && assignment.title.trim() !== '';
        const hasClass = assignment.class && assignment.class.trim() !== '';
        const hasSubject = assignment.subject && assignment.subject.trim() !== '';
        
        if (!hasTitle || !hasClass || !hasSubject) {
          console.log('❌ Invalid assignment (missing fields):', {
            title: assignment.title,
            class: assignment.class,
            subject: assignment.subject
          });
          return false;
        }
        
        return true;
      });
      
      console.log(`✅ Loaded ${validAssignments.length} valid assignments out of ${assignmentsArray.length} total`);
      console.log('📋 Valid assignments:', validAssignments);
      setAssignments(validAssignments);
    } catch (err: any) {
      console.error('❌ Error fetching assignments:', err);
      console.error('Error details:', err.message, err.response);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjectsForClassSection = async () => {
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      
      const resp = await fetch('/api/class-subjects/classes', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('erp.token')}`,
          'x-school-code': schoolCode.toUpperCase()
        }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        const classData = data?.data?.classes?.find((c: any) => 
          c.className === selectedClass && c.section === selectedSection
        );
        const activeSubjects = (classData?.subjects || []).filter((s: any) => s.isActive !== false);
        const subjectNames = activeSubjects.map((s: any) => s.name).filter(Boolean);
        setAvailableSubjects(subjectNames);
      }
    } catch (err) {
      console.error('Error fetching subjects:', err);
      setAvailableSubjects([]);
    }
  };

  const filterAssignments = () => {
    let filtered = [...assignments];

    if (searchTerm) {
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedClass) {
      filtered = filtered.filter(a => a.class === selectedClass);
    }

    if (selectedSection) {
      filtered = filtered.filter(a => a.section === selectedSection);
    }

    if (selectedSubject) {
      filtered = filtered.filter(a => a.subject === selectedSubject);
    }

    setFilteredAssignments(filtered);
  };

  const handleEdit = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setShowEditModal(true);
  };

  const handleUpdateAssignment = async (updatedData: any) => {
    if (!editingAssignment) return;

    try {
      const formDataToSend = new FormData();
      
      formDataToSend.append('title', updatedData.title);
      formDataToSend.append('subject', updatedData.subject);
      formDataToSend.append('class', updatedData.class);
      formDataToSend.append('section', updatedData.section);
      formDataToSend.append('startDate', updatedData.startDate);
      formDataToSend.append('dueDate', updatedData.dueDate);
      formDataToSend.append('instructions', updatedData.description);

      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      if (schoolCode) {
        formDataToSend.append('schoolCode', schoolCode);
      }

      await assignmentAPI.updateAssignment(editingAssignment._id, formDataToSend);
      
      alert('Assignment updated successfully');
      setShowEditModal(false);
      setEditingAssignment(null);
      fetchAssignments();
    } catch (err: any) {
      console.error('Error updating assignment:', err);
      alert(err.response?.data?.message || 'Failed to update assignment');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this assignment?')) {
      return;
    }

    try {
      await assignmentAPI.deleteAssignment(id);
      alert('Assignment deleted successfully');
      fetchAssignments();
    } catch (err) {
      console.error('Error deleting assignment:', err);
      alert('Failed to delete assignment');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <select
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All Years</option>
          <option value="2024-2025">2024-2025</option>
          <option value="2025-2026">2025-2026</option>
          <option value="2026-2027">2026-2027</option>
          <option value="2027-2028">2027-2028</option>
        </select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search assignments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={selectedClass}
          onChange={(e) => {
            setSelectedClass(e.target.value);
            setSelectedSection('');
            setSelectedSubject('');
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All Classes</option>
          {classList.map((cls) => (
            <option key={cls} value={cls}>Class {cls}</option>
          ))}
        </select>

        <select
          value={selectedSection}
          onChange={(e) => {
            setSelectedSection(e.target.value);
            setSelectedSubject('');
          }}
          disabled={!selectedClass}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="">All Sections</option>
          {availableSections.map((section) => (
            <option key={section.value} value={section.value}>Section {section.section}</option>
          ))}
        </select>

        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          disabled={!selectedSection}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        >
          <option value="">All Subjects</option>
          {availableSubjects.map((subject) => (
            <option key={subject} value={subject}>{subject}</option>
          ))}
        </select>
      </div>

      {/* Assignments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assignment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Class
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Section
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  Loading assignments...
                </td>
              </tr>
            ) : filteredAssignments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No assignments found
                </td>
              </tr>
            ) : (
              filteredAssignments.map((assignment) => (
                <tr key={assignment._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{assignment.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{assignment.class}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{assignment.section || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{assignment.subject}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                      {formatDate(assignment.dueDate)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleEdit(assignment)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(assignment._id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Assignment Modal */}
      {showEditModal && editingAssignment && (
        <EditAssignmentModal
          assignment={editingAssignment}
          onClose={() => {
            setShowEditModal(false);
            setEditingAssignment(null);
          }}
          onUpdate={handleUpdateAssignment}
        />
      )}
    </div>
  );
};

// Edit Assignment Modal Component
interface EditAssignmentModalProps {
  assignment: Assignment;
  onClose: () => void;
  onUpdate: (data: any) => void;
}

const EditAssignmentModal: React.FC<EditAssignmentModalProps> = ({ assignment, onClose, onUpdate }) => {
  const { user } = useAuth();
  const { classesData, getSectionsByClass } = useSchoolClasses();
  
  const [formData, setFormData] = useState({
    title: assignment.title || '',
    description: assignment.instructions || assignment.description || '',
    subject: assignment.subject || '',
    class: assignment.class || '',
    section: assignment.section || '',
    startDate: assignment.startDate ? assignment.startDate.split('T')[0] : '',
    dueDate: assignment.dueDate ? assignment.dueDate.split('T')[0] : '',
  });

  const [availableSections, setAvailableSections] = useState<any[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);

  const classList = classesData?.classes?.map(c => c.className) || [];

  // Update sections when class changes
  useEffect(() => {
    if (formData.class && classesData) {
      const sections = getSectionsByClass(formData.class);
      setAvailableSections(sections);
    } else {
      setAvailableSections([]);
    }
  }, [formData.class, classesData, getSectionsByClass]);

  // Fetch subjects when class and section are selected
  useEffect(() => {
    const fetchSubjects = async () => {
      if (!formData.class || !formData.section) {
        setAvailableSubjects([]);
        return;
      }

      setLoadingSubjects(true);
      try {
        const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
        
        const resp = await fetch('/api/class-subjects/classes', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('erp.token')}`,
            'x-school-code': schoolCode.toUpperCase()
          }
        });
        
        if (resp.ok) {
          const data = await resp.json();
          const classData = data?.data?.classes?.find((c: any) => 
            c.className === formData.class && c.section === formData.section
          );
          const activeSubjects = (classData?.subjects || []).filter((s: any) => s.isActive !== false);
          const subjectNames = activeSubjects.map((s: any) => s.name).filter(Boolean);
          setAvailableSubjects(subjectNames);
        }
      } catch (err) {
        console.error('Error fetching subjects:', err);
        setAvailableSubjects([]);
      } finally {
        setLoadingSubjects(false);
      }
    };

    fetchSubjects();
  }, [formData.class, formData.section, user?.schoolCode]);

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.title || !formData.description || !formData.class || 
        !formData.section || !formData.subject || !formData.startDate || 
        !formData.dueDate) {
      alert('Please fill in all required fields');
      return;
    }

    // Validate due date is after start date
    if (new Date(formData.dueDate) <= new Date(formData.startDate)) {
      alert('Due date must be after start date');
      return;
    }

    setSaving(true);
    try {
      await onUpdate(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Edit Assignment</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Assignment Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter assignment title"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Class, Section, Subject */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Class *</label>
              <select
                value={formData.class}
                onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select Class</option>
                {classList.map((cls) => (
                  <option key={cls} value={cls}>Class {cls}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Section *</label>
              <select
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                disabled={!formData.class}
              >
                <option value="">Select Section</option>
                {availableSections.map((section) => (
                  <option key={section.value} value={section.value}>Section {section.section}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                disabled={!formData.section || loadingSubjects}
              >
                <option value="">
                  {!formData.class ? 'Select Class First' : 
                   !formData.section ? 'Select Section First' :
                   loadingSubjects ? 'Loading subjects...' : 
                   'Select Subject'}
                </option>
                {availableSubjects.map((subject) => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start Date and Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Due Date *</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                min={formData.startDate || new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Assignment Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Instructions *</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              placeholder="Write detailed instructions for the assignment..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4 mr-2" />
              {saving ? 'Updating...' : 'Update Assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewAssignments;
