import React, { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { School } from '../types';
import { VALIDATION_PATTERNS } from '../types/admission';
import LocationSelector from '../../../components/LocationSelector';
import { State, District, Taluka } from '../../../services/locationAPI';

export function AddSchoolForm() {
  const { setCurrentView, addSchool } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    street: '',
    area: '',
    city: '',
    district: '',
    taluka: '',
    state: '',
    stateId: '',
    districtId: '',
    talukaId: '',
    districtText: '',
    talukaText: '',
    pinCode: '',
    mobile: '',
    principalName: '',
    principalEmail: '',
    website: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    accountHolderName: '',
    schoolType: '',
    establishedYear: '',
    affiliationBoard: '',
    secondaryContact: ''
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};

    // Required field validations
    if (!formData.name.trim()) {
      errors.name = 'School name is required';
    }

    if (!formData.code.trim()) {
      errors.code = 'School code is required';
    }

    if (!formData.area.trim()) {
      errors.area = 'Area is required';
    }

    if (!formData.district.trim()) {
      errors.district = 'District is required';
    }

    if (!formData.pinCode.trim()) {
      errors.pinCode = 'Pin code is required';
    } else if (!VALIDATION_PATTERNS.pinCode.test(formData.pinCode.trim())) {
      errors.pinCode = 'Pin code must be 6 digits';
    }

    if (!formData.mobile.trim()) {
      errors.mobile = 'Mobile number is required';
    } else if (!VALIDATION_PATTERNS.mobile.test(formData.mobile.trim())) {
      errors.mobile = 'Mobile number must be 10 digits';
    }

    if (!formData.principalName.trim()) {
      errors.principalName = 'Principal name is required';
    }

    if (!formData.principalEmail.trim()) {
      errors.principalEmail = 'Principal email is required';
    } else if (!VALIDATION_PATTERNS.email.test(formData.principalEmail.trim())) {
      errors.principalEmail = 'Please enter a valid email address';
    }

    if (!formData.schoolType) {
      errors.schoolType = 'School type is required';
    }

    if (!formData.establishedYear.trim()) {
      errors.establishedYear = 'Established year is required';
    } else {
      const year = parseInt(formData.establishedYear);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1800 || year > currentYear) {
        errors.establishedYear = `Year must be between 1800 and ${currentYear}`;
      } else if (formData.establishedYear.length !== 4) {
        errors.establishedYear = 'Year must be exactly 4 digits';
      }
    }

    if (!formData.affiliationBoard) {
      errors.affiliationBoard = 'Affiliation board is required';
    }

    // Bank details validations
    if (!formData.bankName.trim()) {
      errors.bankName = 'Bank name is required';
    }

    if (!formData.accountNumber.trim()) {
      errors.accountNumber = 'Account number is required';
    } else if (!/^\d{16}$/.test(formData.accountNumber.trim())) {
      errors.accountNumber = 'Account number must be exactly 16 digits';
    }

    if (!formData.ifscCode.trim()) {
      errors.ifscCode = 'IFSC code is required';
    } else if (!VALIDATION_PATTERNS.ifsc.test(formData.ifscCode.trim().toUpperCase())) {
      errors.ifscCode = 'IFSC code must be 11 characters (format: ABCD0123456)';
    }

    if (!formData.branch.trim()) {
      errors.branch = 'Branch name is required';
    }

    if (!formData.accountHolderName.trim()) {
      errors.accountHolderName = 'Account holder name is required';
    }

    // Optional field validation for secondaryContact
    if (formData.secondaryContact.trim() && !VALIDATION_PATTERNS.mobile.test(formData.secondaryContact.trim())) {
      errors.secondaryContact = 'Secondary contact must be 10 digits';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setValidationErrors(prev => ({ ...prev, logo: 'Only image files (JPEG, PNG, GIF, WebP) are allowed' }));
        return;
      }

      // Validate file size (max 10MB before compression)
      if (file.size > 10 * 1024 * 1024) {
        setValidationErrors(prev => ({ ...prev, logo: 'File size must be less than 10MB' }));
        return;
      }

      setLogoFile(file);
      setValidationErrors(prev => ({ ...prev, logo: '' }));

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    // Validate form before submission
    if (!validateForm()) {
      setError('Please fix the validation errors below');
      return;
    }

    try {
      await addSchool({
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        mobile: formData.mobile.trim(),
        principalName: formData.principalName.trim(),
        principalEmail: formData.principalEmail.trim(),
        logoFile: logoFile || undefined,
        address: {
          street: formData.street.trim(),
          area: formData.area.trim(),
          city: formData.city.trim(),
          district: formData.district.trim(),
          taluka: formData.taluka.trim(),
          state: formData.state.trim(),
          stateId: formData.stateId ? parseInt(formData.stateId) : undefined,
          districtId: formData.districtId ? parseInt(formData.districtId) : undefined,
          talukaId: formData.talukaId ? parseInt(formData.talukaId) : undefined,
          pinCode: formData.pinCode.trim(),
          country: 'India'
        },
        contact: {
          phone: formData.mobile.trim(),
          email: formData.principalEmail.trim(),
          website: formData.website.trim()
        },
        bankDetails: {
          bankName: formData.bankName.trim(),
          accountNumber: formData.accountNumber.trim(),
          ifscCode: formData.ifscCode.trim().toUpperCase(),
          branch: formData.branch.trim(),
          accountHolderName: formData.accountHolderName.trim()
        } as any,
        accessMatrix: {
          admin: { manageUsers: true, manageSchoolSettings: true, viewAttendance: true, viewResults: true, messageStudentsParents: true },
          teacher: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: true },
          student: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: false },
          parent: { manageUsers: false, manageSchoolSettings: false, viewAttendance: true, viewResults: true, messageStudentsParents: false }
        } as any,
        schoolType: formData.schoolType.trim(),
        establishedYear: formData.establishedYear.trim(),
        affiliationBoard: formData.affiliationBoard.trim(),
        secondaryContact: formData.secondaryContact.trim()
      });
      setSuccess('School created successfully!');
      setTimeout(() => {
        setCurrentView('dashboard');
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to create school');
    }
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleClear = () => {
    setFormData({
      name: '',
      code: '',
      street: '',
      area: '',
      city: '',
      district: '',
      taluka: '',
      state: '',
      stateId: '',
      districtId: '',
      talukaId: '',
      districtText: '',
      talukaText: '',
      pinCode: '',
      mobile: '',
      principalName: '',
      principalEmail: '',
      website: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branch: '',
      accountHolderName: '',
      schoolType: '',
      establishedYear: '',
      affiliationBoard: '',
      secondaryContact: ''
    });
    setLogoFile(null);
    setLogoPreview(null);
    setValidationErrors({});
    setError(null);
    setSuccess(null);
  };

  // Location handlers
  const handleStateChange = (stateId: number, state: State) => {
    setFormData(prev => ({
      ...prev,
      stateId: stateId.toString(),
      state: state.name,
      // Clear dependent fields
      districtId: '',
      district: '',
      talukaId: '',
      taluka: '',
      districtText: '',
      talukaText: ''
    }));
  };

  const handleDistrictChange = (districtId: number, district: District) => {
    setFormData(prev => ({
      ...prev,
      districtId: districtId.toString(),
      district: district.name,
      // Clear dependent fields
      talukaId: '',
      taluka: '',
      talukaText: ''
    }));
  };

  const handleTalukaChange = (talukaId: number, taluka: Taluka) => {
    setFormData(prev => ({
      ...prev,
      talukaId: talukaId.toString(),
      taluka: taluka.name
    }));
  };

  const handleDistrictTextChange = (text: string) => {
    setFormData(prev => ({
      ...prev,
      districtText: text,
      district: text,
      // Clear dependent fields when typing manually
      talukaText: ''
    }));
  };

  const handleTalukaTextChange = (text: string) => {
    setFormData(prev => ({
      ...prev,
      talukaText: text,
      taluka: text
    }));
  };

  const renderFieldError = (fieldName: string) => {
    if (validationErrors[fieldName]) {
      return <p className="text-red-500 text-xs mt-1">{validationErrors[fieldName]}</p>;
    }
    return null;
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Add New School</h1>
        </div>

        {success && <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg">{success}</div>}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <X className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {error.includes('already exists') ? 'School Code Already Used' : 'Error Creating School'}
                </h3>
                <div className="mt-1 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* School Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">School Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">School Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.name ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter school name"
                />
                {renderFieldError('name')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">School Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className={`w-full px-3 py-2 border ${validationErrors.code ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter school code (e.g., NPS, DAV, KVS)"
                  maxLength={10}
                />
                <p className="text-xs text-gray-500 mt-1">This code will be used for admin and teacher panel identification. Must be unique across all schools.</p>
                {renderFieldError('code')}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">School Logo</label>
                <div className="flex items-start space-x-4">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleLogoChange}
                      className={`w-full px-3 py-2 border ${validationErrors.logo ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload school logo (JPEG, PNG, GIF, WebP). Max size: 10MB. Image will be compressed automatically.</p>
                    {renderFieldError('logo')}
                  </div>
                  {logoPreview && (
                    <div className="flex-shrink-0">
                      <div className="relative w-24 h-24 border-2 border-gray-300 rounded-lg overflow-hidden">
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreview(null);
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                <input
                  type="text"
                  required
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.street ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter street address"
                />
                {renderFieldError('street')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Area/Locality</label>
                <input
                  type="text"
                  required
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.area ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter area/locality"
                />
                {renderFieldError('area')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  required
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.city ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter city"
                />
                {renderFieldError('city')}
              </div>
            </div>

            {/* Location Selector */}
            <div className="mt-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Location Details</h3>
              <LocationSelector
                selectedState={formData.stateId}
                selectedDistrict={formData.districtId}
                selectedTaluka={formData.talukaId}
                districtText={formData.districtText}
                talukaText={formData.talukaText}
                onStateChange={handleStateChange}
                onDistrictChange={handleDistrictChange}
                onTalukaChange={handleTalukaChange}
                onDistrictTextChange={handleDistrictTextChange}
                onTalukaTextChange={handleTalukaTextChange}
                required={true}
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pin Code</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formData.pinCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                    setFormData({ ...formData, pinCode: value });
                  }}
                  className={`w-full px-3 py-2 border ${validationErrors.pinCode ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter 6-digit pin code"
                />
                {renderFieldError('pinCode')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mobile Number</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={formData.mobile}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                    setFormData({ ...formData, mobile: value });
                  }}
                  className={`w-full px-3 py-2 border ${validationErrors.mobile ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter 10-digit mobile number"
                />
                {renderFieldError('mobile')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Principal Name</label>
                <input
                  type="text"
                  required
                  value={formData.principalName}
                  onChange={(e) => setFormData({ ...formData, principalName: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.principalName ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter principal name"
                />
                {renderFieldError('principalName')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Principal Email ID</label>
                <input
                  type="email"
                  required
                  value={formData.principalEmail}
                  onChange={(e) => setFormData({ ...formData, principalEmail: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.principalEmail ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter principal email"
                />
                {renderFieldError('principalEmail')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.website ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter website URL (optional)"
                />
                {renderFieldError('website')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">School Type</label>
                <select
                  required
                  value={formData.schoolType}
                  onChange={(e) => setFormData({ ...formData, schoolType: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.schoolType ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                >
                  <option value="">Select School Type</option>
                  <option value="Public">Public</option>
                  <option value="Private">Private</option>
                  <option value="International">International</option>
                </select>
                {renderFieldError('schoolType')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Established Year</label>
                <input
                  type="number"
                  required
                  min={1800}
                  max={new Date().getFullYear()}
                  maxLength={4}
                  pattern="[0-9]{4}"
                  value={formData.establishedYear}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                    if (value.length <= 4) {
                      setFormData({ ...formData, establishedYear: value });
                    }
                  }}
                  className={`w-full px-3 py-2 border ${validationErrors.establishedYear ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter year"
                />
                {renderFieldError('establishedYear')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Affiliation Board</label>
                <select
                  required
                  value={formData.affiliationBoard}
                  onChange={(e) => setFormData({ ...formData, affiliationBoard: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.affiliationBoard ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                >
                  <option value="">Select Affiliation Board</option>
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="State Board">State Board</option>
                  <option value="IB">IB</option>
                </select>
                {renderFieldError('affiliationBoard')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Contact Number</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.secondaryContact}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                    setFormData({ ...formData, secondaryContact: value });
                  }}
                  className={`w-full px-3 py-2 border ${validationErrors.secondaryContact ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter 10-digit secondary contact number"
                />
                {renderFieldError('secondaryContact')}
              </div>
            </div>
          </div>

          {/* Bank Account Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Bank Account Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                <input
                  type="text"
                  required
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.bankName ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter bank name"
                />
                {renderFieldError('bankName')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                <input
                  type="text"
                  required
                  maxLength={16}
                  value={formData.accountNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                    setFormData({ ...formData, accountNumber: value });
                  }}
                  className={`w-full px-3 py-2 border ${validationErrors.accountNumber ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter 16-digit account number"
                />
                {renderFieldError('accountNumber')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                <input
                  type="text"
                  required
                  maxLength={11}
                  value={formData.ifscCode}
                  onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                  className={`w-full px-3 py-2 border ${validationErrors.ifscCode ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter 11-character IFSC code (e.g., SBIN0123456)"
                />
                {renderFieldError('ifscCode')}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                <input
                  type="text"
                  required
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.branch ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter branch name"
                />
                {renderFieldError('branch')}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
                <input
                  type="text"
                  required
                  value={formData.accountHolderName}
                  onChange={(e) => setFormData({ ...formData, accountHolderName: e.target.value })}
                  className={`w-full px-3 py-2 border ${validationErrors.accountHolderName ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Enter account holder name"
                />
                {renderFieldError('accountHolderName')}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => setCurrentView('dashboard')}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200 font-medium"
            >
              Clear
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}