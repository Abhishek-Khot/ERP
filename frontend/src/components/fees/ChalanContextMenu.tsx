import React, { useState, useRef, useEffect } from 'react';
import { X, Edit, Check, Calendar, FileText, User, BookOpen, DollarSign, Calendar as CalendarIcon } from 'lucide-react';
import { feesAPI } from '../../services/api';
import toast from 'react-hot-toast';

interface Installment {
  name: string;
  amount: number;
  dueDate: string;
  description?: string;
  chalanNumber?: string;
  status?: string;
}

interface ChalanContextMenuProps {
  isOpen: boolean;
  position?: { x: number; y: number }; // Made optional for centered modal
  onClose: () => void;
  onGenerateChalan: (data: {
    amount: number;
    dueDate: string;
    paymentDate?: string;
    description?: string;
  }) => Promise<void>;
  student?: {
    id: string;
    name: string;
    className: string;
    section: string;
    admissionNumber?: string;
  };
  installment?: Installment;
  isCentered?: boolean; // New prop to control modal position
}

const ChalanContextMenu: React.FC<ChalanContextMenuProps> = ({
  isOpen,
  position = { x: 0, y: 0 },
  onClose,
  onGenerateChalan,
  student,
  installment,
  isCentered = true,
}) => {
  const [amount, setAmount] = useState<number | ''>(installment?.amount || '');
  const [dueDate, setDueDate] = useState<string>(() => {
    return installment?.dueDate || new Date().toISOString().split('T')[0];
  });
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>(installment?.description || '');
  const [isEditing, setIsEditing] = useState(true); // Start in edit mode by default
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle clicks outside the context menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert empty string to 0 if needed
    const finalAmount = amount === '' ? 0 : Number(amount);
    
    // Validate amount
    if (isNaN(finalAmount) || finalAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    
    // Validate due date
    if (!dueDate) {
      toast.error('Please select a due date');
      return;
    }
    
    try {
      await onGenerateChalan({
        amount: finalAmount,
        dueDate,
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        description: description || 'Fee payment chalan'
      });
      onClose();
    } catch (error: any) {
      console.error('Error generating chalan:', error);
      toast.error(error.message || 'Failed to generate chalan');
    }
  };

  // Toggle edit mode
  const toggleEdit = () => {
    setIsEditing(!isEditing);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Format currency
  const formatCurrency = (value: number | '') => {
    if (value === '' || value === 0) {
      return '₹0';
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        
        <div 
          ref={menuRef}
          className={`inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full ${
            isCentered ? 'sm:align-middle' : 'fixed'
          }`}
          style={!isCentered ? { top: `${position.y}px`, left: `${position.x}px` } : {}}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                <FileText className="h-6 w-6 text-blue-600" aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    {installment?.chalanNumber ? `Chalan #${installment.chalanNumber}` : 'Generate New Chalan'}
                  </h3>
                  <div className="flex space-x-2">
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={toggleEdit}
                        className="text-blue-600 hover:text-blue-800"
                        title="Edit chalan"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="mt-4">
                  {/* Student Info */}
                  {student && (
                    <div className="bg-gray-50 p-3 rounded-lg mb-4">
                      <div className="flex items-center text-sm text-gray-700 mb-2">
                        <User className="h-4 w-4 text-gray-500 mr-2" />
                        <span className="font-medium">{student.name}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-500">
                        <BookOpen className="h-4 w-4 text-gray-400 mr-2" />
                        {student.className} - {student.section}
                        {student.admissionNumber && (
                          <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                            #{student.admissionNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <form onSubmit={handleSubmit}>
                    {/* Amount */}
                    <div className="mb-4">
                      <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                        Amount
                      </label>
                      {isEditing ? (
                        <div className="relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <DollarSign className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="number"
                            id="amount"
                            value={amount}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAmount(value === '' ? '' : Number(value));
                            }}
                            onFocus={(e) => {
                              if (amount === 0) {
                                setAmount('');
                              }
                            }}
                            onBlur={(e) => {
                              if (e.target.value === '') {
                                setAmount(0);
                              }
                            }}
                            className="block w-full pl-10 pr-12 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            required
                          />
                        </div>
                      ) : (
                        <div className="text-lg font-semibold text-gray-900">
                          {formatCurrency(amount)}
                        </div>
                      )}
                    </div>

                    {/* Due Date */}
                    <div className="mb-4">
                      <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
                        Due Date
                      </label>
                      {isEditing ? (
                        <div className="relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            id="dueDate"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="block w-full pl-10 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-gray-900">
                          {formatDate(dueDate)}
                        </div>
                      )}
                    </div>

                    {/* Payment Date */}
                    <div className="mb-4">
                      <label htmlFor="paymentDate" className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Date
                      </label>
                      {isEditing ? (
                        <div className="relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="date"
                            id="paymentDate"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="block w-full pl-10 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            required
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-gray-900">
                          {formatDate(paymentDate)}
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      {isEditing ? (
                        <textarea
                          id="description"
                          rows={3}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 mt-1 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
                          placeholder="Enter description (optional)"
                        />
                      ) : (
                        <div className="text-sm text-gray-900">
                          {description || 'No description'}
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    {installment?.status && (
                      <div className="mb-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          installment.status === 'paid' 
                            ? 'bg-green-100 text-green-800' 
                            : installment.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {installment.status.charAt(0).toUpperCase() + installment.status.slice(1)}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:col-start-1 sm:text-sm"
                      >
                        {isEditing ? 'Cancel' : 'Close'}
                      </button>
                      <button
                        type={isEditing ? 'submit' : 'button'}
                        onClick={isEditing ? undefined : toggleEdit}
                        className={`mt-3 w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:col-start-2 sm:text-sm ${
                          !isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        {isEditing ? (
                          <>
                            <Check className="h-5 w-5 mr-2" />
                            Save Changes
                          </>
                        ) : (
                          <>
                            <Edit className="h-5 w-5 mr-2" />
                            Edit Chalan
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChalanContextMenu;
