import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Edit, CreditCard } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BankDetails } from '../types';

export function AccountDetails() {
  const { schools, selectedSchoolId, setCurrentView, updateBankDetails } = useApp();
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const school = schools.find(s => s.id === selectedSchoolId);

  useEffect(() => {
    if (school) {
      setBankDetails(school.bankDetails);
    }
  }, [school]);

  if (!school || !bankDetails) {
    return (
      <div className="p-6">
        <p className="text-gray-600">School not found</p>
      </div>
    );
  }

  const handleSave = () => {
    if (bankDetails && selectedSchoolId) {
      updateBankDetails(selectedSchoolId, bankDetails);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    if (school) {
      setBankDetails(school.bankDetails);
      setIsEditing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account Details - {school.name}</h1>
          </div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
            >
              <Edit className="h-5 w-5" />
              <span>Edit Details</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                <Save className="h-5 w-5" />
                <span>Save Changes</span>
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <CreditCard className="h-6 w-6 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Fee Payment Account Information</h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">Bank account details for fee collection</p>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={bankDetails.bankName}
                    onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">{bankDetails.bankName}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={bankDetails.accountNumber}
                    onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 font-mono">{bankDetails.accountNumber}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">IFSC Code</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={bankDetails.ifscCode}
                    onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 font-mono">{bankDetails.ifscCode}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={bankDetails.branch}
                    onChange={(e) => setBankDetails({...bankDetails, branch: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">{bankDetails.branch}</p>
                )}
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={bankDetails.accountHolderName}
                    onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900">{bankDetails.accountHolderName}</p>
                )}
              </div>
            </div>

            {!isEditing && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Account Status</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">Active for fee collection</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">Verified</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
