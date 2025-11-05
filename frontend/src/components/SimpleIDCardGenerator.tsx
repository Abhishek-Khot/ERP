import React, { useState } from 'react';
import axios from 'axios';
import { Download, Eye, Loader2, CheckCircle, AlertCircle, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import toast from 'react-hot-toast';

interface Student {
  id: string;
  _id?: string;
  name: string;
  sequenceId?: string;
  rollNumber?: string;
  className: string;
  section: string;
  profileImage?: string;
}

interface SimpleIDCardGeneratorProps {
  selectedStudents: Student[];
  onClose: () => void;
  initialOrientation?: 'landscape' | 'portrait';
  lockOrientation?: boolean;
}

const SimpleIDCardGenerator: React.FC<SimpleIDCardGeneratorProps> = ({ 
  selectedStudents, 
  onClose, 
  initialOrientation = 'landscape',
  lockOrientation = false 
}) => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(initialOrientation);
  const [includeBack, setIncludeBack] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatedCards, setGeneratedCards] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [orientationLocked, setOrientationLocked] = useState(lockOrientation);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5050/api';

  const handleGenerate = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Please select at least one student');
      return;
    }

    try {
      setGenerating(true);
      const authData = localStorage.getItem('erp.auth');
      const token = authData ? JSON.parse(authData).token : null;
      const studentIds = selectedStudents.map(s => s._id || s.id);

      const schoolCode = localStorage.getItem('erp.schoolCode') || '';

      console.log('🎯 Generating ID cards for students:', {
        studentIds: studentIds.map((id, idx) => ({
          id,
          isValidObjectId: /^[0-9a-fA-F]{24}$/.test(id),
          studentName: selectedStudents[idx]?.name
        })),
        students: selectedStudents,
        orientation: orientation,
        orientationType: typeof orientation,
        orientationValue: `"${orientation}"`,
        includeBack,
        apiUrl: `${API_BASE_URL}/id-card-templates/generate`,
        schoolCode,
        hasToken: !!token
      });

      console.log('⚠️ CRITICAL - ORIENTATION VALUE:', orientation);
      console.log('⚠️ IS PORTRAIT?', orientation === 'portrait');
      console.log('⚠️ IS LANDSCAPE?', orientation === 'landscape');

      const response = await axios.post(
        `${API_BASE_URL}/id-card-templates/generate`,
        {
          studentIds,
          orientation,
          includeBack
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-School-Code': schoolCode
          }
        }
      );

      console.log('✅ ID cards generated successfully:', response.data);

      if (response.data.success) {
        // Create a mock generated cards array since the new API doesn't return file paths
        const mockGeneratedCards = selectedStudents.slice(0, response.data.data.totalGenerated).map((student, index) => ({
          studentId: student._id || student.id,
          studentName: student.name,
          sequenceId: student.sequenceId || `STU${String(index + 1).padStart(3, '0')}`,
          frontCard: null, // No file paths in new in-memory system
          backCard: null,
          success: true
        }));
        
        setGeneratedCards(mockGeneratedCards);
        setShowResults(true);
        setOrientationLocked(true);
        toast.success(response.data.message);
      }
    } catch (error: any) {
      console.error('❌ Error generating ID cards:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      const errorMessage = error.response?.data?.message || 'Failed to generate ID cards';
      const debugHint = error.response?.data?.debug?.hint;
      
      if (debugHint) {
        toast.error(`${errorMessage}\n\n${debugHint}`, { duration: 6000 });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadBulk = async () => {
    if (selectedStudents.length === 0) {
      toast.error('Please select at least one student');
      return;
    }

    try {
      setDownloading(true);
      const authData = localStorage.getItem('erp.auth');
      const token = authData ? JSON.parse(authData).token : null;
      const studentIds = selectedStudents.map(s => s._id || s.id);
      const schoolCode = localStorage.getItem('erp.schoolCode') || '';

      console.log('📥 Downloading ID cards (Bulk ZIP) for students:', {
        count: selectedStudents.length,
        studentIds,
        orientation,
        includeBack,
        schoolCode
      });

      const response = await axios.post(
        `${API_BASE_URL}/id-card-templates/download`,
        {
          studentIds,
          orientation,
          includeBack
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-School-Code': schoolCode
          },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `IDCards_Bulk_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`ID cards downloaded successfully (${selectedStudents.length} students in folders)`);
    } catch (error: any) {
      console.error('❌ Error downloading ID cards:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      const errorMessage = error.response?.data?.message || 'Failed to download ID cards';
      const debugHint = error.response?.data?.debug?.hint;
      
      if (debugHint) {
        toast.error(`${errorMessage}\n\n${debugHint}`, { duration: 6000 });
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadIndividual = async (student: any) => {
    try {
      const authData = localStorage.getItem('erp.auth');
      const token = authData ? JSON.parse(authData).token : null;
      const schoolCode = localStorage.getItem('erp.schoolCode') || '';

      console.log('📥 Downloading ID card for individual student:', student.name);

      const response = await axios.post(
        `${API_BASE_URL}/id-card-templates/download`,
        {
          studentIds: [student._id || student.id],
          orientation,
          includeBack
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'X-School-Code': schoolCode
          },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `IDCard_${student.name.replace(/[^a-zA-Z0-9]/g, '_')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(`ID card downloaded for ${student.name}`);
    } catch (error: any) {
      console.error('❌ Error downloading individual ID card:', error);
      toast.error(`Failed to download ID card for ${student.name}`);
    }
  };

  const handlePreview = async (studentId: string, side: 'front' | 'back' = 'front') => {
    try {
      const authData = localStorage.getItem('erp.auth');
      const token = authData ? JSON.parse(authData).token : null;
      const schoolCode = localStorage.getItem('erp.schoolCode') || '';

      console.log('🔍 Previewing ID card:', { studentId, side, orientation });

      // Use the new in-memory preview endpoint
      const previewUrl = `${API_BASE_URL}/id-card-templates/preview?studentId=${studentId}&orientation=${orientation}&side=${side}`;
      
      const response = await fetch(previewUrl, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-School-Code': schoolCode
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        setPreviewImage(imageUrl);
        setShowPreview(true);
      } else {
        toast.error('Failed to load preview');
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      toast.error('Failed to load preview');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Generate ID Cards ({selectedStudents.length} students)
            </h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {!showResults ? (
              <>
                {/* Info Alert */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Template Setup Required</p>
                    <p>Make sure you have placed your ID card template PNG files in:</p>
                    <code className="block mt-1 bg-blue-100 px-2 py-1 rounded text-xs">
                      backend/idcard-templates/
                    </code>
                    <p className="mt-2">Required files: {orientation}-front.png{includeBack && ', ' + orientation + '-back.png'}</p>
                  </div>
                </div>

                {/* Configuration */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Choose ID Card Orientation
                    </label>
                    <div className="flex flex-col gap-3">
                      <label className={`flex items-center p-4 border-2 rounded-lg transition-all ${
                        orientation === 'landscape' 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      } ${orientationLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="radio"
                          value="landscape"
                          checked={orientation === 'landscape'}
                          onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                          disabled={orientationLocked}
                          className="mr-3"
                        />
                        <RectangleHorizontal className="w-8 h-8 mr-3 text-blue-600" />
                        <div>
                          <div className="font-medium">Landscape</div>
                          <div className="text-sm text-gray-500">Horizontal ID card (85.6mm × 54mm) - Credit card style layout</div>
                        </div>
                      </label>
                      <label className={`flex items-center p-4 border-2 rounded-lg transition-all ${
                        orientation === 'portrait' 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      } ${orientationLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                          type="radio"
                          value="portrait"
                          checked={orientation === 'portrait'}
                          onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                          disabled={orientationLocked}
                          className="mr-3"
                        />
                        <RectangleVertical className="w-8 h-8 mr-3 text-blue-600" />
                        <div>
                          <div className="font-medium">Portrait</div>
                          <div className="text-sm text-gray-500">Vertical ID card (54mm × 85.6mm) - Vertical layout with larger photo</div>
                        </div>
                      </label>
                    </div>
                    {orientationLocked && (
                      <p className="text-xs text-blue-600 mt-2">
                        ℹ️ Orientation is locked as selected from the previous page
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={includeBack}
                        onChange={(e) => setIncludeBack(e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Include back side
                      </span>
                    </label>
                  </div>
                </div>

                {/* Selected Students */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Students:</h4>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {selectedStudents.map((student) => (
                      <div key={student._id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-900">{student.name}</span>
                        <span className="text-xs text-gray-500">
                          {student.className} - {student.section}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Eye className="w-5 h-5" />
                        Generate & Preview
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadBulk}
                    disabled={downloading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download ZIP
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Results */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <h4 className="text-lg font-semibold text-gray-900">
                      ID Cards Generated Successfully!
                    </h4>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-green-800">
                      Generated {generatedCards.length} ID cards in <strong>{orientation}</strong> orientation. You can preview them below or download all as ZIP.
                    </p>
                  </div>

                  {/* Generated Cards List */}
                  <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    {generatedCards.map((card, index) => {
                      const student = selectedStudents.find(s => (s._id || s.id) === card.studentId);
                      return (
                        <div key={index} className="flex items-center justify-between p-4 border-b border-gray-100 last:border-0">
                          <div>
                            <p className="font-medium text-gray-900">{card.studentName}</p>
                            <p className="text-sm text-gray-500">ID: {card.studentId}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePreview(card.studentId, 'front')}
                              className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                            >
                              View Front
                            </button>
                            {includeBack && (
                              <button
                                onClick={() => handlePreview(card.studentId, 'back')}
                                className="text-xs px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                              >
                                View Back
                              </button>
                            )}
                            {student && (
                              <button
                                onClick={() => handleDownloadIndividual(student)}
                                className="text-xs px-3 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowResults(false);
                      setGeneratedCards([]);
                      setOrientationLocked(false);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Generate Again
                  </button>
                  <button
                    onClick={handleDownloadBulk}
                    disabled={downloading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Download All (Bulk ZIP with Folders)
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && previewImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className={`bg-white rounded-lg w-full overflow-auto ${orientation === 'portrait' ? 'max-w-2xl max-h-[95vh]' : 'max-w-5xl max-h-[90vh]'}`}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                ID Card Preview ({orientation === 'portrait' ? 'Portrait' : 'Landscape'})
              </h3>
              <button
                onClick={() => {
                  setShowPreview(false);
                  if (previewImage) {
                    URL.revokeObjectURL(previewImage);
                  }
                  setPreviewImage(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="p-6 flex justify-center bg-gray-50">
              <img 
                src={previewImage} 
                alt="ID Card Preview" 
                className={`${orientation === 'portrait' ? 'w-auto h-auto max-h-[80vh]' : 'max-w-full h-auto'} shadow-lg`}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SimpleIDCardGenerator;
