// NOTE: This file contained duplicate implementations. Keeping the full editor implementation below.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, X, MapPin, Phone, Settings as SettingsIcon, Building } from 'lucide-react';
import { useApp } from '../context/AppContext';
import api from '../../../api/axios';
import LocationSelector from '../../../components/LocationSelector';
import { State, District, Taluka } from '../../../services/locationAPI';

const SchoolEditDetails: React.FC = () => {
  const { selectedSchoolId, setCurrentView, updateSchool } = useApp();
  const [profile, setProfile] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log('[SchoolEditDetails] Component rendered, selectedSchoolId:', selectedSchoolId);

  useEffect(() => {
    console.log('[SchoolEditDetails] useEffect triggered, selectedSchoolId:', selectedSchoolId);
    const fetch = async () => {
      if (!selectedSchoolId) {
        console.log('[SchoolEditDetails] No selectedSchoolId, skipping fetch');
        return;
      }
      console.log('[SchoolEditDetails] Starting fetch for school:', selectedSchoolId);
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/schools/${selectedSchoolId}`);
        console.log('[SchoolEditDetails] Raw API response:', res.data);
        
        // Extract the actual school data - API returns {success: true, data: {...}}
        const schoolData = res.data.data || res.data;
        console.log('[SchoolEditDetails] Extracted school data:', schoolData);
        
        console.log('[SchoolEditDetails] Key fields check:', {
          mobile: schoolData.mobile,
          contactPhone: schoolData.contact?.phone,
          principalName: schoolData.principalName,
          principalEmail: schoolData.principalEmail,
          address: schoolData.address,
          contact: schoolData.contact,
          // Check for address fields at root level too
          street: schoolData.street,
          area: schoolData.area,
          city: schoolData.city,
          district: schoolData.district,
          pinCode: schoolData.pinCode,
          state: schoolData.state
        });
        
        if (!schoolData) {
          throw new Error('No data received from API');
        }
        
        setProfile(schoolData);
        setForm(schoolData);
        console.log('[SchoolEditDetails] Profile and form state updated successfully');
      } catch (e: any) {
        console.error('[SchoolEditDetails] Error fetching school data:', e);
        console.error('[SchoolEditDetails] Error details:', {
          message: e?.message,
          response: e?.response?.data,
          status: e?.response?.status
        });
        setError(e?.response?.data?.message || e?.message || 'Failed to load school data');
      } finally {
        setLoading(false);
        console.log('[SchoolEditDetails] Fetch complete, loading set to false');
      }
    };
    fetch();
  }, [selectedSchoolId]);

  const update = (path: string, value: any) => {
    setForm((prev: any) => {
      const obj = { ...(prev || {}) } as any;
      const keys = path.split('.');
      let cur = obj as any;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
      }
      cur[keys[keys.length - 1]] = value;
      return obj;
    });
  };

  // Location handlers
  const handleStateChange = (stateId: number, state: State) => {
    update('address.stateId', stateId);
    update('address.state', state.name);
    // Clear dependent fields
    update('address.districtId', '');
    update('address.district', '');
    update('address.talukaId', '');
    update('address.taluka', '');
  };

  const handleDistrictChange = (districtId: number, district: District) => {
    update('address.districtId', districtId);
    update('address.district', district.name);
    // Clear dependent fields
    update('address.talukaId', '');
    update('address.taluka', '');
  };

  const handleTalukaChange = (talukaId: number, taluka: Taluka) => {
    update('address.talukaId', talukaId);
    update('address.taluka', taluka.name);
  };

  const handleDistrictTextChange = (text: string) => {
    update('address.district', text);
    // Clear dependent fields when typing manually
    update('address.taluka', '');
  };

  const handleTalukaTextChange = (text: string) => {
    update('address.taluka', text);
  };

  const handleSave = async () => {
    if (!selectedSchoolId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.put(`/schools/${selectedSchoolId}`, form);
      const updated = (res.data as any)?.school || res.data;
      setProfile(updated);
      await updateSchool({
        id: updated._id || updated.id || selectedSchoolId,
        name: updated.name,
        logo: updated.logoUrl ? (String(updated.logoUrl).startsWith('http') ? updated.logoUrl : `${import.meta.env.VITE_API_BASE_URL || ''}${updated.logoUrl}`) : '',
        area: updated.address?.area || '',
        district: updated.address?.district || '',
        pinCode: updated.address?.pinCode || updated.address?.zipCode || '',
        mobile: updated.contact?.phone || '',
        principalName: updated.principalName || '',
        principalEmail: updated.principalEmail || updated.contact?.email || '',
        bankDetails: updated.bankDetails || {},
        accessMatrix: updated.accessMatrix || {},
        address: updated.address || {},
        contact: updated.contact || {},
        schoolType: updated.schoolType || '',
        establishedYear: updated.establishedYear || '',
        affiliationBoard: updated.affiliationBoard || '',
        website: updated.contact?.website || '',
        secondaryContact: updated.secondaryContact || ''
      } as any);
      alert('School updated');
      setCurrentView('school-details');
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="p-6">
        <div className="flex items-center space-x-4 mb-6">
          <button onClick={() => setCurrentView('school-details')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Details</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit School</h1>
        </div>
        <div className="py-10 text-center text-gray-600">Loading…</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Edit School</h1>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-4 mb-4">
          <p className="font-semibold mb-2">No school data loaded</p>
          <p className="text-sm">Selected School ID: {selectedSchoolId || 'None'}</p>
          <p className="text-sm mt-2">Error: {error || 'No error message'}</p>
          <p className="text-sm mt-2">Check the browser console for more details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <button onClick={() => setCurrentView('school-details')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Details</span>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit: {profile.name}</h1>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => setCurrentView('school-details')} className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            <X className="h-4 w-4" />
            <span>Cancel</span>
          </button>
          <button onClick={handleSave} disabled={loading} className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-800 rounded p-4">{error}</div>}

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Building className="h-6 w-6 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Name</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={form?.name || ''} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Code</label>
              <input className="w-full px-3 py-2 border rounded-lg font-mono" value={form?.code || ''} onChange={(e) => update('code', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Principal Name</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={form?.principalName || ''} onChange={(e) => update('principalName', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Principal Email</label>
              <input type="email" className="w-full px-3 py-2 border rounded-lg" value={form?.principalEmail || form?.contact?.email || ''} onChange={(e) => update('principalEmail', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <MapPin className="h-6 w-6 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Address</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
              <input 
                className="w-full px-3 py-2 border rounded-lg" 
                value={form?.address?.street || form?.street || ''} 
                onChange={(e) => update('address.street', e.target.value)} 
                placeholder="Enter street address" 
                title={`Current value: ${form?.address?.street || form?.street || 'Empty'}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Area/Locality</label>
              <input 
                className="w-full px-3 py-2 border rounded-lg" 
                value={form?.address?.area || form?.area || ''} 
                onChange={(e) => update('address.area', e.target.value)} 
                placeholder="Enter area/locality" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
              <input 
                className="w-full px-3 py-2 border rounded-lg" 
                value={form?.address?.city || form?.city || ''} 
                onChange={(e) => update('address.city', e.target.value)} 
                placeholder="Enter city" 
              />
            </div>
          </div>

          {/* Location Selector */}
          <div className="mt-6">
            <h3 className="text-md font-medium text-gray-900 mb-4">Location Details</h3>
            <LocationSelector
              selectedState={form?.address?.stateId || ''}
              selectedDistrict={form?.address?.districtId || ''}
              selectedTaluka={form?.address?.talukaId || ''}
              districtText={form?.address?.district || form?.district || ''}
              talukaText={form?.address?.taluka || form?.taluka || ''}
              onStateChange={handleStateChange}
              onDistrictChange={handleDistrictChange}
              onTalukaChange={handleTalukaChange}
              onDistrictTextChange={handleDistrictTextChange}
              onTalukaTextChange={handleTalukaTextChange}
              required={false}
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pin Code</label>
              <input 
                className="w-full px-3 py-2 border rounded-lg" 
                value={form?.address?.pinCode || form?.address?.zipCode || form?.pinCode || ''} 
                onChange={(e) => { 
                  update('address.pinCode', e.target.value); 
                  update('address.zipCode', e.target.value); 
                  update('pinCode', e.target.value); 
                }} 
                placeholder="Enter pin code" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
              <input className="w-full px-3 py-2 border rounded-lg bg-gray-50" value={form?.address?.country || 'India'} readOnly />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Phone className="h-6 w-6 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Phone</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={form?.mobile || form?.contact?.phone || ''} onChange={(e) => { update('mobile', e.target.value); update('contact.phone', e.target.value); }} placeholder="Enter primary phone number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Phone</label>
              <input className="w-full px-3 py-2 border rounded-lg" value={form?.secondaryContact || ''} onChange={(e) => update('secondaryContact', e.target.value)} placeholder="Enter secondary phone number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input type="email" className="w-full px-3 py-2 border rounded-lg" value={form?.principalEmail || form?.contact?.email || ''} onChange={(e) => { update('principalEmail', e.target.value); update('contact.email', e.target.value); }} placeholder="Enter email address" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
              <input type="url" className="w-full px-3 py-2 border rounded-lg" value={form?.contact?.website || ''} onChange={(e) => update('contact.website', e.target.value)} placeholder="Enter website URL" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <Building className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">School Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Type</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={form?.schoolType || ''} onChange={(e) => update('schoolType', e.target.value)}>
                <option value="">Select School Type</option>
                <option value="Public">Public</option>
                <option value="Private">Private</option>
                <option value="International">International</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Established Year</label>
              <input type="number" className="w-full px-3 py-2 border rounded-lg" value={form?.establishedYear || ''} onChange={(e) => update('establishedYear', parseInt(e.target.value))} placeholder="Enter established year" min="1800" max="2030" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Affiliation Board</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={form?.affiliationBoard || ''} onChange={(e) => update('affiliationBoard', e.target.value)}>
                <option value="">Select Affiliation Board</option>
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE</option>
                <option value="State Board">State Board</option>
                <option value="IB">IB</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Established Date</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg" value={form?.establishedDate ? String(form.establishedDate).substring(0,10) : ''} onChange={(e) => update('establishedDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-6">
            <SettingsIcon className="h-6 w-6 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Status & Timestamps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Active Status</label>
              <select className="w-full px-3 py-2 border rounded-lg" value={form?.isActive ? 'true' : 'false'} onChange={(e) => update('isActive', e.target.value === 'true')}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Created At</label>
              <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">{profile.createdAt ? new Date(profile.createdAt).toLocaleString() : '—'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Last Updated</label>
              <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">{profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchoolEditDetails;
