import React, { useState, useEffect, useCallback } from 'react';
import { Search, Edit, Save, Check, X } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { testDetailsAPI } from '../../../api/testDetails';
import { resultsAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';
import { useSchoolClasses } from '../../../hooks/useSchoolClasses';

interface StudentResult {
  id: string;
  name: string;
  userId: string;
  rollNumber?: string;
  class: string;
  section: string;
  totalMarks: number | null;
  obtainedMarks: number | null;
  grade: string | null;
  resultId?: string;
}

const Results: React.FC = () => {
  const { user, token } = useAuth();

  // Use the useSchoolClasses hook to fetch classes configured by superadmin
  const {
    classesData,
    loading: classesLoading,
    error: classesError,
    getClassOptions,
    getSectionsByClass,
    hasClasses
  } = useSchoolClasses();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [availableSections, setAvailableSections] = useState<any[]>([]);
  // const [selectedSubject, setSelectedSubject] = useState('');
  // const [subjects, setSubjects] = useState<string[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedTestType, setSelectedTestType] = useState('');

  // const [maxMarks, setMaxMarks] = useState<number | ''>('');
  const [configuredMaxMarks, setConfiguredMaxMarks] = useState<number | null>(null);

  // Subject selection replaces Max Marks input in UI
  const [subjects, setSubjects] = useState<{ label: string; value: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  // Keep maxMarks internally for backend compatibility (default 100)
  const [maxMarks, setMaxMarks] = useState<number | ''>(100);

  const [showResultsTable, setShowResultsTable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [editingAll, setEditingAll] = useState(false);
  const [savedRows, setSavedRows] = useState<{ [key: string]: boolean }>({});

  // Dynamic state for test types
  const [testTypes, setTestTypes] = useState<string[]>([]);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [loadingTestTypes, setLoadingTestTypes] = useState(false);

  // State for existing results
  const [existingResults, setExistingResults] = useState<any[]>([]);
  const [loadingExistingResults, setLoadingExistingResults] = useState(false);
  const [showExistingResults, setShowExistingResults] = useState(false);

  // State for inline editing in existing results table
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editingMarks, setEditingMarks] = useState<number | null>(null);
  const [savingResultId, setSavingResultId] = useState<string | null>(null);

  // State for freeze functionality
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezing, setFreezing] = useState(false);

  // Reset frozen state when filters change or tables are hidden
  useEffect(() => {
    setIsFrozen(false);
    setShowExistingResults(false);
    setShowResultsTable(false);
  }, [selectedClass, selectedSection, selectedSubject, selectedTestType]);

  // Keep only the latest result per student (by createdAt/updatedAt)
  const dedupeResultsByStudent = useCallback((items: any[]) => {
    const pickTimestamp = (r: any) => new Date(r.updatedAt || r.createdAt || 0).getTime();
    const map = new Map<string, any>();
    for (const r of items || []) {
      const studentKey = String(r.studentId || r.student_id || r.id || '');
      if (!studentKey) continue;
      const subjKey = String(r.subject || selectedSubject || '');
      const testKey = String(r.testType || selectedTestType || '');
      const classKey = String(r.className || r.class || selectedClass || '');
      const sectionKey = String(r.section || selectedSection || '');
      const key = `${studentKey}::${classKey}::${sectionKey}::${subjKey}::${testKey}`;
      const existing = map.get(key);
      if (!existing || pickTimestamp(r) >= pickTimestamp(existing)) {
        map.set(key, r);
      }
    }
    return Array.from(map.values());
  }, [selectedSubject, selectedTestType, selectedClass, selectedSection]);

  // Comparator: sort by userId like SK-S-0847 (prefix, then numeric)
  const compareUserId = useCallback((a: string | undefined, b: string | undefined) => {
    const norm = (s?: string) => String(s || '').toUpperCase().trim();
    const parse = (s?: string) => {
      const id = norm(s);
      const m = id.match(/^(.*?)(\d+)$/);
      if (m) return { p: m[1], n: parseInt(m[2], 10) };
      return { p: id, n: Number.MAX_SAFE_INTEGER };
    };
    const A = parse(a);
    const B = parse(b);
    const pc = A.p.localeCompare(B.p);
    if (pc !== 0) return pc;
    return A.n - B.n;
  }, []);

  const sortStudentsByUserId = useCallback((list: StudentResult[]) => {
    return [...list].sort((x, y) => compareUserId(x.userId, y.userId));
  }, [compareUserId]);

  const sortResultsByUserId = useCallback((list: any[]) => {
    return [...list].sort((x, y) => compareUserId(x?.userId, y?.userId));
  }, [compareUserId]);

  // Enrich a list of results with roll numbers by fetching students for class/section (batch-only)
  const enrichWithRollNumbers = useCallback(async (list: StudentResult[]): Promise<StudentResult[]> => {
    try {
      const schoolCodeRaw = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      const schoolCode = schoolCodeRaw.toUpperCase();
      if (!schoolCode || !selectedClass || !selectedSection) return list;

      const resp = await resultsAPI.getStudents(schoolCode, {
        class: selectedClass,
        section: selectedSection
      });
      const raw = resp?.data?.data || [];
      const byStudentId = new Map<string, any>();
      const byUserId = new Map<string, any>();
      const byName = new Map<string, any>();
      for (const s of raw) {
        const sid = String(s._id || s.id || '');
        const uid = String(s.userId || s.user_id || '');
        const sname = String(
          s.name?.displayName || `${s.name?.firstName || ''} ${s.name?.lastName || ''}`.trim() || s.fullName || ''
        ).toLowerCase();
        if (sid) byStudentId.set(sid, s);
        if (uid) byUserId.set(uid, s);
        if (sname) byName.set(sname, s);
      }

      const enriched = list.map(r => {
        if (r.rollNumber && r.rollNumber !== '-') return r;
        const rNameKey = String(r.name || '').toLowerCase();
        const studentDoc = byStudentId.get(String(r.id)) || byUserId.get(String(r.userId)) || byName.get(rNameKey);
        const roll = studentDoc?.studentDetails?.rollNumber
          || studentDoc?.studentDetails?.currentRollNumber
          || studentDoc?.studentDetails?.rollNo
          || studentDoc?.rollNumber
          || studentDoc?.sequenceId
          || r.rollNumber
          || '';
        return { ...r, rollNumber: roll };
      });
      return enriched;
    } catch {
      return list;
    }
  }, [selectedClass, selectedSection, user?.schoolCode]);

  const grades = ['A+', 'A', 'B', 'C', 'D', 'F'];

  // Get class list from superadmin configuration
  const classList = classesData?.classes?.map(c => c.className) || [];

  // Function to fetch test types for the selected class
  const fetchTestTypes = useCallback(async (className: string) => {
    if (!className) {
      setTestTypes([]);
      return;
    }

    setLoadingTestTypes(true);
    try {
      // First try to use tests already loaded via useSchoolClasses hook
      if (classesData && classesData.testsByClass) {
        let classTests = classesData.testsByClass[className] || classesData.testsByClass[String(className)] || [];
        if (classTests.length === 0 && classesData.tests) {
          classTests = classesData.tests.filter((t: any) => String(t.className) === String(className));
        }

        // Only include tests with configured maxMarks
        const withMarks = (classTests || []).filter((t: any) => typeof t?.maxMarks === 'number' && t.maxMarks > 0);
        if (withMarks.length > 0) {
          const names = withMarks
            .map((t: any) => t.testName || t.displayName || t.name || t.testType)
            .filter(Boolean);
          const unique = [...new Set(names)];
          setTestTypes(unique);
          setLoadingTestTypes(false);
          return;
        }
      }

      // Fallback: use testDetails API based on school code
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      if (!schoolCode) {
        toast.error('School code not available');
        return;
      }

      // Fallback API does not provide maxMarks config reliably; to respect requirement,
      // do not populate tests from fallback if max marks are not configured.
      setTestTypes([]);
    } catch (error) {
      console.error('Error fetching test types:', error);
      toast.error('Failed to load test types');
      setTestTypes([]);
    } finally {
      setLoadingTestTypes(false);
    }
  }, [user?.schoolCode, classesData]);

  // Update available sections when class changes
  useEffect(() => {
    if (selectedClass && classesData) {
      const sections = getSectionsByClass(selectedClass);
      setAvailableSections(sections);
      // Auto-select first section if available
      if (sections.length > 0) {
        setSelectedSection(sections[0].value);
      } else {
        setSelectedSection('');
      }
      // Reset subject whenever class changes
      setSelectedSubject('');
      setSubjects([]);
    } else {
      setAvailableSections([]);
      setSelectedSection('');
      setSelectedSubject('');
      setSubjects([]);
    }
  }, [selectedClass, classesData]);

  // Fetch subjects for selected class and section (aligned with superadmin-created subjects)
  useEffect(() => {
    const fetchSubjects = async () => {
      setSubjects([]);
      setSelectedSubject('');
      if (!selectedClass || !selectedSection) return;
      try {
        // Use class-subjects route to get subjects for grade/section
        const res = await api.get(`/class-subjects/grade/${encodeURIComponent(selectedClass)}/section/${encodeURIComponent(selectedSection)}`);
        // Expecting res.data.subjects or res.data.data; support both
        const items = (res.data?.subjects || res.data?.data || []) as any[];
        const mapped = items.map((s: any) => ({
          label: s.subjectName || s.name || s.subject || s,
          value: s.subjectCode || s.code || s.subjectName || s.name || s
        })).filter((x: any) => x.label && x.value);
        setSubjects(mapped);
        if (mapped.length > 0) setSelectedSubject(mapped[0].value);
      } catch (err) {
        console.error('Error fetching subjects for class/section:', err);
        toast.error('Failed to load subjects for selected class/section');
      }
    };
    fetchSubjects();
  }, [selectedClass, selectedSection]);

  // Fetch test types when selected class changes
  useEffect(() => {
    if (selectedClass) {
      fetchTestTypes(selectedClass);
      setSelectedTestType(''); // Reset test type when class changes
      setConfiguredMaxMarks(null);
      setMaxMarks('');
    } else {
      setTestTypes([]);
    }
  }, [selectedClass, fetchTestTypes]);

  // When class or selected test changes, compute configured max marks from test config
  useEffect(() => {
    if (!selectedClass || !selectedTestType || !classesData) {
      setConfiguredMaxMarks(null);
      return;
    }
    const classTests = (classesData.testsByClass?.[selectedClass] || classesData.tests || []) as any[];
    const match = classTests.find((t: any) => {
      const name = t.testName || t.displayName || t.name || t.testType;
      return name === selectedTestType;
    });
    const value = typeof match?.maxMarks === 'number' ? match.maxMarks : null;
    setConfiguredMaxMarks(value);
    if (value !== null) {
      setMaxMarks(value);
    }
  }, [selectedClass, selectedTestType, classesData]);

  // Fetch subjects when class and section are selected
  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedClass || !selectedSection) {
        setSubjects([]);
        setSelectedSubject('');
        return;
      }

      setLoadingSubjects(true);
      try {
        const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
        if (!schoolCode) {
          toast.error('School code not available');
          return;
        }

        // Primary API
        try {
          const resp = await fetch('/api/class-subjects/classes', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-school-code': schoolCode.toUpperCase()
            }
          });
          if (resp.ok) {
            const data = await resp.json();
            const classData = data?.data?.classes?.find((c: any) => c.className === selectedClass && c.section === selectedSection);
            const activeSubjects = (classData?.subjects || []).filter((s: any) => s.isActive !== false);
            const subjectNames = activeSubjects.map((s: any) => s.name).filter(Boolean);
            setSubjects(subjectNames);
            // Auto-select first subject if available
            setSelectedSubject(subjectNames[0] || '');
            return;
          }
        } catch (_) {
          // fall through to fallback
        }

        // Fallback API
        try {
          const resp2 = await fetch(`/api/direct-test/class-subjects/${selectedClass}?schoolCode=${schoolCode}`, {
            headers: {
              'x-school-code': schoolCode.toUpperCase()
            }
          });
          if (resp2.ok) {
            const data2 = await resp2.json();
            const subjectNames = (data2?.data?.subjects || []).map((s: any) => s.name).filter(Boolean);
            setSubjects(subjectNames);
            setSelectedSubject(subjectNames[0] || '');
            return;
          }
        } catch (_) {
          // ignore
        }

        setSubjects([]);
        setSelectedSubject('');
        toast.error('No subjects found for selected class and section');
      } catch (err) {
        console.error('Error fetching subjects:', err);
        toast.error('Failed to load subjects');
        setSubjects([]);
        setSelectedSubject('');
      } finally {
        setLoadingSubjects(false);
      }
    };

    fetchSubjects();
  }, [selectedClass, selectedSection, token, user?.schoolCode]);

  // Fetch students from the school database
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const schoolCodeRaw = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      const schoolCode = schoolCodeRaw.toUpperCase();

      if (!schoolCode) {
        toast.error('School code not available');
        return;
      }

      // Fetch students from the school's student collection
      const response = await resultsAPI.getStudents(schoolCode, {
        class: selectedClass,
        section: selectedSection
      });

      if (response.data.success && response.data.data) {
        // Robust client-side filtering as backend may not filter by class/section
        const rawStudents = response.data.data as any[];
        const filtered = rawStudents.filter((s: any) => {
          const sClass = s.studentDetails?.currentClass || s.currentclass || s.class || s.className;
          const sSection = s.studentDetails?.currentSection || s.currentsection || s.section;
          return String(sClass) === String(selectedClass) && String(sSection).toUpperCase() === String(selectedSection).toUpperCase();
        });

        const students = filtered.map((student: any, index: number) => ({
          id: student._id || student.id,
          name: student.name?.displayName || `${student.name?.firstName || ''} ${student.name?.lastName || ''}`.trim() || student.fullName || 'Unknown',
          userId: student.userId || student.user_id || 'N/A',
          rollNumber: student.studentDetails?.rollNumber
            || student.studentDetails?.currentRollNumber
            || student.rollNumber
            || student.sequenceId
            || `${schoolCode}-${selectedSection}-${String(index + 1).padStart(4, '0')}`,
          class: selectedClass,
          section: selectedSection,
          totalMarks: configuredMaxMarks,
          obtainedMarks: null, // Will be filled when user enters marks
          grade: null
        }));

        if (students.length > 0) {
          setStudentResults(sortStudentsByUserId(students));
          setShowResultsTable(true);

          // Initialize saved states
          const initialSavedState: { [key: string]: boolean } = {};
          students.forEach((student: StudentResult) => {
            initialSavedState[student.id] = false;
          });
          setSavedRows(initialSavedState);

          toast.success(`Found ${students.length} students in ${selectedClass}-${selectedSection}`);
          return;
        }
      } else {
        console.warn('Primary students API did not return data or success=false', response.data);
      }

      // Fallback: try school-users endpoint pattern used elsewhere
      try {
        const altResp = await fetch(`http://localhost:5050/api/school-users/${schoolCode}/users`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (altResp.ok) {
          const altData = await altResp.json();
          const users = (altData?.data || []) as any[];
          const filtered = users.filter((u: any) => {
            const isStudent = u.role === 'student';
            const uClass = u.studentDetails?.currentClass || u.currentclass || u.class || u.className;
            const uSection = u.studentDetails?.currentSection || u.currentsection || u.section;
            return isStudent && String(uClass) === String(selectedClass) && String(uSection).toUpperCase() === String(selectedSection).toUpperCase();
          });

          const students = filtered.map((student: any, index: number) => ({
            id: student._id || student.id,
            name: student.name?.displayName || `${student.name?.firstName || ''} ${student.name?.lastName || ''}`.trim() || student.fullName || 'Unknown',
            userId: student.userId || student.user_id || 'N/A',
            rollNumber: student.studentDetails?.rollNumber
              || student.studentDetails?.currentRollNumber
              || student.rollNumber
              || student.sequenceId
              || `${schoolCode}-${selectedSection}-${String(index + 1).padStart(4, '0')}`,
            class: selectedClass,
            section: selectedSection,
            totalMarks: configuredMaxMarks,
            obtainedMarks: null,
            grade: null
          }));

          if (students.length > 0) {
            setStudentResults(sortStudentsByUserId(students));
            setShowResultsTable(true);
            const initialSavedState: { [key: string]: boolean } = {};
            students.forEach((student: StudentResult) => { initialSavedState[student.id] = false; });
            setSavedRows(initialSavedState);
            toast.success(`Loaded ${students.length} students via fallback API`);
            return;
          }
        } else {
          console.warn('Fallback school-users API failed', altResp.status, altResp.statusText);
        }
      } catch (altErr) {
        console.error('Fallback school-users API error:', altErr);
      }

      // If both methods fail or yielded zero students
      setError('No students found for the selected class and section');
      setStudentResults([]);
      setShowResultsTable(false);

    } catch (err: any) {
      console.error('Error fetching students:', err);
      setError('Failed to load students. Please try again.');
      setStudentResults([]);
      setShowResultsTable(false);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedSection, configuredMaxMarks, user?.schoolCode]);

  // Try to fetch saved results first; if none, fall back to fetching students list
  const fetchResultsOrStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';
      if (!schoolCode) {
        toast.error('School code not available');
        return;
      }

      // Attempt to load existing results for this selection
      const res = await resultsAPI.getResults({
        schoolCode,
        class: selectedClass,
        section: selectedSection,
        subject: selectedSubject,
        testType: selectedTestType
      });

      if (res.data?.success && Array.isArray(res.data?.data) && res.data.data.length > 0) {
        const latest = dedupeResultsByStudent(res.data.data);

        // Check if results are frozen
        const firstResult = latest[0];
        const frozen = firstResult?.frozen || false;
        setIsFrozen(frozen);

        let results: StudentResult[] = latest.map((r: any) => ({
          id: r.studentId,
          name: r.studentName,
          userId: r.userId,
          rollNumber: r.rollNumber || r.sequenceId || '',
          class: r.className || selectedClass,
          section: r.section || selectedSection,
          totalMarks: typeof r.totalMarks === 'number' ? r.totalMarks : configuredMaxMarks,
          obtainedMarks: r.obtainedMarks ?? null,
          grade: calculateGrade(r.obtainedMarks, typeof r.totalMarks === 'number' ? r.totalMarks : configuredMaxMarks), // Calculate grade from marks
          resultId: r._id || r.id
        }));

        // Enrich missing roll numbers from students collection and sort by User ID
        results = await enrichWithRollNumbers(results);
        setStudentResults(sortStudentsByUserId(results));
        setShowResultsTable(true);

        const savedState: { [key: string]: boolean } = {};
        results.forEach((s) => { savedState[s.id] = true; });
        setSavedRows(savedState);

        if (frozen) {
          toast.error(`⚠️ Results are FROZEN and cannot be edited. Loaded ${results.length} result(s).`, { duration: 5000 });
        } else {
          toast.success(`Loaded ${results.length} saved result(s)`);
        }
        return;
      }

      // Fallback: fetch students for entering fresh marks
      await fetchStudents();
    } catch (err: any) {
      console.error('Error fetching results/students:', err);
      setError('Failed to load results/students. Please try again.');
      setStudentResults([]);
      setShowResultsTable(false);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedSection, selectedSubject, selectedTestType, configuredMaxMarks, user?.schoolCode, fetchStudents]);

  // Function to fetch existing results for a class and section
  const fetchExistingResults = useCallback(async () => {
    if (!selectedClass || !selectedSection) {
      toast.error('Please select class and section first');
      return;
    }

    if (!selectedSubject) {
      toast.error('Please select a subject first');
      return;
    }

    if (!selectedTestType) {
      toast.error('Please select a test type first');
      return;
    }

    setLoadingExistingResults(true);
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';

      if (!schoolCode) {
        toast.error('School code not available');
        return;
      }

      // Call API to get existing results
      const response = await resultsAPI.getResults({
        schoolCode,
        class: selectedClass,
        section: selectedSection,
        subject: selectedSubject,
        testType: selectedTestType
      });

      if (response.data.success && response.data.data) {
        const latest = dedupeResultsByStudent(response.data.data);

        // Check if results are frozen (check first result's frozen status)
        const firstResult = latest[0];
        const frozen = firstResult?.frozen || false;
        setIsFrozen(frozen);

        // Enrich existing results list with roll numbers
        const enriched = await enrichWithRollNumbers(latest.map((r: any) => ({
          id: r.studentId,
          name: r.studentName,
          userId: r.userId,
          rollNumber: r.rollNumber || r.sequenceId || '',
          class: r.className || selectedClass,
          section: r.section || selectedSection,
          totalMarks: r.totalMarks ?? configuredMaxMarks,
          obtainedMarks: r.obtainedMarks ?? null,
          grade: r.grade ?? null,
          resultId: r._id || r.id
        })));
        // Map back to original result shape for listing while keeping roll numbers and calculating grades
        const rollByStudentId = new Map(enriched.map(er => [String(er.id), er.rollNumber]));
        const latestWithRoll = latest.map((r: any) => ({
          ...r,
          rollNumber: r.rollNumber || rollByStudentId.get(String(r.studentId)) || r.sequenceId || '',
          grade: calculateGrade(r.obtainedMarks, r.totalMarks), // Calculate grade from marks
          frozen: r.frozen || false
        }));
        setExistingResults(sortResultsByUserId(latestWithRoll));
        setShowExistingResults(true);
        // Hide editable results table when showing existing results
        setShowResultsTable(false);
        toast.success(`Found ${latestWithRoll.length} existing results for ${selectedClass}-${selectedSection}`);
      } else {
        // No existing results: load students so teacher can enter marks now
        setExistingResults([]);
        setShowExistingResults(false);
        await fetchStudents();
        setEditingAll(true);
        toast.success('No existing results found. Loaded students for entering marks.');
      }
    } catch (error: any) {
      console.error('Error fetching existing results:', error);
      toast.error('Failed to load existing results');
      setExistingResults([]);
      setShowExistingResults(false);
    } finally {
      setLoadingExistingResults(false);
    }
  }, [selectedClass, selectedSection, selectedSubject, selectedTestType, configuredMaxMarks, user?.schoolCode, enrichWithRollNumbers, sortResultsByUserId, dedupeResultsByStudent, fetchStudents]);

  // Function to start inline editing
  const startInlineEdit = (result: any) => {
    setEditingResultId(result._id);
    setEditingMarks(result.obtainedMarks);
  };

  // Function to cancel inline editing
  const cancelInlineEdit = () => {
    setEditingResultId(null);
    setEditingMarks(null);
  };

  // Function to save inline edited result
  const saveInlineEdit = async (result: any) => {
    if (editingMarks === null || editingMarks === undefined) {
      toast.error('Please enter valid marks');
      return;
    }

    setSavingResultId(result._id);
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';

      // Call update API
      await resultsAPI.updateResult(result._id, {
        schoolCode,
        class: result.className,
        section: result.section,
        subject: result.subject,
        testType: result.testType,
        maxMarks: result.maxMarks || result.totalMarks,
        obtainedMarks: editingMarks,
        totalMarks: result.totalMarks,
        studentId: result.studentId,
        studentName: result.studentName,
        userId: result.userId
      });

      // Update local state with new marks and calculated grade
      const updatedGrade = calculateGrade(editingMarks, result.totalMarks);
      setExistingResults(prev =>
        prev.map(r =>
          r._id === result._id
            ? { ...r, obtainedMarks: editingMarks, grade: updatedGrade }
            : r
        )
      );

      // Clear editing state
      setEditingResultId(null);
      setEditingMarks(null);

      toast.success('Result updated successfully!');
    } catch (error: any) {
      console.error('Error updating result:', error);
      toast.error('Failed to update result');
    } finally {
      setSavingResultId(null);
    }
  };

  // Function to freeze results
  const handleFreezeResults = async () => {
    if (!selectedClass || !selectedSection || !selectedSubject || !selectedTestType) {
      toast.error('Please ensure all filters are selected');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to FREEZE results for ${selectedClass}-${selectedSection}, ${selectedSubject} (${selectedTestType})?\n\nOnce frozen, marks CANNOT be edited anymore!`
    );

    if (!confirmed) return;

    setFreezing(true);
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';

      await resultsAPI.freezeResults({
        schoolCode,
        class: selectedClass,
        section: selectedSection,
        subject: selectedSubject,
        testType: selectedTestType,
        academicYear: '2024-25'
      });

      // Update local state to mark all results as frozen
      setExistingResults(prev => prev.map(r => ({ ...r, frozen: true })));
      setIsFrozen(true);

      toast.success('Results frozen successfully! Marks can no longer be edited.');
    } catch (error: any) {
      console.error('Error freezing results:', error);
      toast.error('Failed to freeze results');
    } finally {
      setFreezing(false);
    }
  };

  const handleSearch = () => {
    if (!selectedClass) {
      toast.error('Please select a class');
      return;
    }
    if (!selectedSection) {
      toast.error('Please select a section');
      return;
    }
    if (!selectedSubject) {
      toast.error('Please select a subject');
      return;
    }
    if (!selectedTestType) {
      toast.error('Please select a test type');
      return;
    }
    if (!configuredMaxMarks || configuredMaxMarks <= 0) {
      toast.error('Configured max marks not found for this test. Please configure in Admin > Settings.');
      return;
    }

    // Hide existing results table when showing editable table
    setShowExistingResults(false);
    // Auto-enable editing when search is clicked
    setEditingAll(true);
    fetchResultsOrStudents();
  };

  // Removed handleEditAll - editing is now automatic after search

  const handleSaveAll = async () => {
    try {
      const schoolCode = localStorage.getItem('erp.schoolCode') || user?.schoolCode || '';

      console.log('🔵 Starting save process...', {
        schoolCode,
        selectedClass,
        selectedSection,
        selectedSubject,
        selectedTestType,
        configuredMaxMarks,
        totalStudents: studentResults.length
      });

      if (!schoolCode) {
        toast.error('School code not available');
        return;
      }

      // Filter out students with no obtained marks
      const validResults = studentResults.filter(student =>
        student.obtainedMarks !== null && student.obtainedMarks !== undefined
      );

      console.log('🔵 Valid results to save:', validResults.length, validResults);

      if (validResults.length === 0) {
        toast.error('Please enter obtained marks for at least one student');
        return;
      }

      // Split into updates (existing) and creates (new)
      const toUpdate = validResults.filter(s => !!s.resultId);
      const toCreate = validResults.filter(s => !s.resultId);

      console.log('🔵 Split results:', { toUpdate: toUpdate.length, toCreate: toCreate.length });

      // Issue updates first
      if (toUpdate.length > 0) {
        console.log('🔵 Updating existing results:', toUpdate);
        await Promise.all(toUpdate.map(async (s) => {
          const fullUpdate = {
            schoolCode,
            class: selectedClass,
            section: selectedSection,
            subject: selectedSubject,
            testType: selectedTestType,
            maxMarks: configuredMaxMarks,
            totalMarks: s.totalMarks ?? configuredMaxMarks,
            obtainedMarks: s.obtainedMarks,
            studentId: s.id,
            studentName: s.name,
            userId: s.userId
          };
          try {
            await resultsAPI.updateResult(s.resultId!, fullUpdate);
          } catch (e) {
            console.warn('Update failed for result, attempting upsert via saveResults', s.resultId, e);
            const upsertPayload = {
              schoolCode,
              class: selectedClass,
              section: selectedSection,
              testType: selectedTestType,
              subject: selectedSubject,
              maxMarks: configuredMaxMarks,
              academicYear: '2024-25',
              results: [
                {
                  studentId: s.id,
                  studentName: s.name,
                  userId: s.userId,
                  obtainedMarks: s.obtainedMarks,
                  totalMarks: s.totalMarks ?? configuredMaxMarks,
                  grade: s.grade
                }
              ]
            };
            try {
              await resultsAPI.saveResults(upsertPayload);
            } catch (e2) {
              console.error('Upsert via saveResults also failed for student', s.id, e2);
            }
          }
        }));
      }

      // Create remaining
      if (toCreate.length > 0) {
        const resultsData = {
          schoolCode,
          class: selectedClass,
          section: selectedSection,
          testType: selectedTestType,
          subject: selectedSubject,
          maxMarks: configuredMaxMarks,
          academicYear: '2024-25',
          results: toCreate.map(student => ({
            studentId: student.id,
            studentName: student.name,
            userId: student.userId,
            obtainedMarks: student.obtainedMarks,
            totalMarks: student.totalMarks ?? configuredMaxMarks,
            grade: student.grade
          }))
        };
        console.log('🔵 Creating new results:', resultsData);
        const createResp = await resultsAPI.saveResults(resultsData);
        console.log('🔵 Create response:', createResp.data);
        if (!createResp.data?.success) {
          toast.error(createResp.data?.message || 'Failed to create new results');
          return;
        }
      }

      console.log('✅ Save completed successfully!');
      toast.success(`Saved ${toUpdate.length} update(s)${toCreate.length ? ` and created ${toCreate.length}` : ''}`);

      // Mark all rows as saved
      const allSavedState: { [key: string]: boolean } = {};
      studentResults.forEach(student => {
        allSavedState[student.id] = true;
      });
      setSavedRows(allSavedState);
      setEditingAll(false);

      // Refresh latest data to avoid duplicates view
      console.log('🔵 Refreshing results...');
      await fetchResultsOrStudents();

    } catch (error: any) {
      console.error('Error saving results:', error);
      toast.error('Failed to save results. Please try again.');
    }
  };

  const updateStudentResult = (studentId: string, field: keyof StudentResult, value: any) => {
    setStudentResults(prev =>
      prev.map(student => {
        if (student.id === studentId) {
          const updatedStudent = { ...student, [field]: value };

          // Auto-calculate grade when obtainedMarks or totalMarks changes
          if (field === 'obtainedMarks' || field === 'totalMarks') {
            updatedStudent.grade = calculateGrade(
              field === 'obtainedMarks' ? value : student.obtainedMarks,
              field === 'totalMarks' ? value : student.totalMarks
            );
          }

          return updatedStudent;
        }
        return student;
      })
    );

    // Mark this row as unsaved
    setSavedRows(prev => ({ ...prev, [studentId]: false }));
  };

  const calculateGrade = (obtained: number | null, total: number | null): string => {
    if (obtained === null || obtained === undefined || !total || total === 0) return 'N/A';

    const percentage = (obtained / total) * 100;

    // Standard CBSE/ICSE Grading Scheme
    if (percentage >= 91) return 'A1';
    if (percentage >= 81) return 'A2';
    if (percentage >= 71) return 'B1';
    if (percentage >= 61) return 'B2';
    if (percentage >= 51) return 'C1';
    if (percentage >= 41) return 'C2';
    if (percentage >= 33) return 'D';
    if (percentage >= 21) return 'E1';
    return 'E2';
  };

  // Note: Grade calculation is now handled directly in updateStudentResult function
  // This ensures immediate grade updates when marks are edited

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Academic Results</h1>
        {showResultsTable && !isFrozen && (
          <div className="flex space-x-3">
            <button
              onClick={handleSaveAll}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors"
            >
              <Save className="h-4 w-4 mr-2" />
              Save All Changes
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-4">
          {/* Class Selection */}
          <div className="flex flex-col">
            <label htmlFor="class-select" className="text-sm font-medium text-gray-700">Class</label>
            <select
              id="class-select"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
              disabled={classesLoading || !hasClasses()}
            >
              <option value="">{classesLoading ? 'Loading...' : 'Select Class'}</option>
              {classList.map((cls) => (
                <option key={cls} value={cls}>Class {cls}</option>
              ))}
            </select>
            {!classesLoading && !hasClasses() && (
              <span className="text-xs text-red-500 mt-1">No classes configured</span>
            )}
          </div>

          {/* Section Selection */}
          <div className="flex flex-col">
            <label htmlFor="section-select" className="text-sm font-medium text-gray-700">Section</label>
            <select
              id="section-select"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
              disabled={!selectedClass || availableSections.length === 0}
            >
              <option value="">{!selectedClass ? 'Select Class First' : 'Select Section'}</option>
              {availableSections.map((section) => (
                <option key={section.value} value={section.value}>Section {section.section}</option>
              ))}
            </select>
          </div>

          {/* Subject Selection */}
          <div className="flex flex-col">
            <label htmlFor="subject-select" className="text-sm font-medium text-gray-700">Subject</label>
            <select
              id="subject-select"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[180px]"
              disabled={!selectedClass || !selectedSection || loadingSubjects}
            >
              <option value="">
                {!selectedClass || !selectedSection
                  ? 'Select Class & Section'
                  : loadingSubjects
                    ? 'Loading...'
                    : subjects.length === 0
                      ? 'No Subjects'
                      : 'Select Subject'}
              </option>
              {subjects.map((subj) => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
          </div>

          {/* Test Type Selection */}
          <div className="flex flex-col">
            <label htmlFor="test-type-select" className="text-sm font-medium text-gray-700">Test Type</label>
            <select
              id="test-type-select"
              value={selectedTestType}
              onChange={(e) => setSelectedTestType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[150px]"
              disabled={!selectedClass || loadingTestTypes}
            >
              <option value="">
                {!selectedClass
                  ? 'Select Class First'
                  : loadingTestTypes
                    ? 'Loading...'
                    : 'Select Test'}
              </option>
              {testTypes.map((type, index) => (
                <option key={`${type}-${index}`} value={type}>{type}</option>
              ))}
            </select>
            {!selectedClass && (
              <span className="text-xs text-gray-500 mt-1">Select a class to see available tests</span>
            )}
          </div>

          {/* Total Marks (read-only from configuration) */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Total Marks</label>
            <input
              type="number"
              value={configuredMaxMarks ?? ''}
              readOnly
              className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 min-w-[120px]"
              placeholder="Configured"
            />
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors self-end"
            disabled={loading}
          >
            {loading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Search
          </button>

          {/* View Existing Results Button */}
          <button
            onClick={fetchExistingResults}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center transition-colors self-end disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={loadingExistingResults || !selectedClass || !selectedSection || !selectedSubject || !selectedTestType}
          >
            {loadingExistingResults ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            View Existing Results
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Existing Results Table */}
      {showExistingResults && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  Existing Results for {selectedClass}-{selectedSection}
                  {selectedSubject && ` - ${selectedSubject}`}
                  {selectedTestType && ` (${selectedTestType})`}
                  {isFrozen && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full flex items-center gap-1">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      FROZEN
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Found {existingResults.length} results. {isFrozen ? 'Results are frozen and cannot be edited.' : 'Click on a result to edit it.'}
                </p>
              </div>
              {!isFrozen && existingResults.length > 0 && (
                <button
                  onClick={handleFreezeResults}
                  disabled={freezing}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {freezing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Freezing...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      Freeze Results
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Test Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Obtained Marks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Marks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grade
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {existingResults.map((result, index) => (
                  <tr key={result._id || index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.userId || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.studentName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-medium">
                        {result.subject || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-xs font-medium">
                        {result.testType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {editingResultId === result._id ? (
                        <input
                          type="number"
                          value={editingMarks || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || (value.length <= 3 && parseInt(value) <= result.totalMarks)) {
                              setEditingMarks(value === '' ? null : parseInt(value));
                            }
                          }}
                          className="w-20 px-2 py-1 border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Marks"
                          min="0"
                          max={result.totalMarks}
                          maxLength={3}
                          autoFocus
                        />
                      ) : (
                        result.obtainedMarks
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {result.totalMarks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${['A1', 'A2'].includes(editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade) ? 'bg-green-100 text-green-800' :
                          ['B1', 'B2'].includes(editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade) ? 'bg-blue-100 text-blue-800' :
                            ['C1', 'C2'].includes(editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade) ? 'bg-yellow-100 text-yellow-800' :
                              (editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade) === 'D' ? 'bg-orange-100 text-orange-800' :
                                ['E1', 'E2'].includes(editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade) ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-600'
                        }`}>
                        {editingResultId === result._id ? calculateGrade(editingMarks, result.totalMarks) : result.grade || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(result.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {editingResultId === result._id ? (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => saveInlineEdit(result)}
                            disabled={savingResultId === result._id}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                            title="Save"
                          >
                            {savingResultId === result._id ? (
                              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <Save className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            disabled={savingResultId === result._id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            title="Cancel"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startInlineEdit(result)}
                          disabled={isFrozen || result.frozen}
                          className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                          title={isFrozen || result.frozen ? "Results are frozen" : "Edit"}
                        >
                          {isFrozen || result.frozen ? (
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <Edit className="h-5 w-5" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results Table */}
      {showResultsTable && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isFrozen && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
              <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700 font-semibold">Results are FROZEN - Editing is disabled</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Marks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Obtained Marks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {studentResults.map((student) => (
                  <tr key={student.id} className={isFrozen ? "bg-gray-50" : "hover:bg-gray-50"}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.userId || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {student.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {student.totalMarks ?? configuredMaxMarks ?? '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <input
                        type="number"
                        value={student.obtainedMarks || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const maxMarks = student.totalMarks ?? configuredMaxMarks ?? 100;
                          if (value === '' || (value.length <= 3 && parseInt(value) <= maxMarks)) {
                            updateStudentResult(student.id, 'obtainedMarks', value === '' ? null : parseInt(value));
                          }
                        }}
                        disabled={isFrozen}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="Enter marks"
                        min="0"
                        max={student.totalMarks ?? configuredMaxMarks ?? 100}
                        maxLength={3}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-3 py-1 rounded-md text-sm font-semibold ${student.grade && ['A1', 'A2'].includes(student.grade) ? 'bg-green-100 text-green-800' :
                          student.grade && ['B1', 'B2'].includes(student.grade) ? 'bg-blue-100 text-blue-800' :
                            student.grade && ['C1', 'C2'].includes(student.grade) ? 'bg-yellow-100 text-yellow-800' :
                              student.grade === 'D' ? 'bg-orange-100 text-orange-800' :
                                student.grade && ['E1', 'E2'].includes(student.grade) ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-600'
                        }`}>
                        {student.grade || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Results;
