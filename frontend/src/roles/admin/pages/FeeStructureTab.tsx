import React, { useState } from 'react';
import { Plus, Save, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import ClassSectionSelect from '../components/ClassSectionSelect';
import { feesAPI } from '../../../services/api';

interface Installment {
  name: string;
  amount: number;
  dueDate: string;
  description: string;
}

const FeeStructureTab: React.FC = () => {
  const { user } = useAuth();
  
  // Form state
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [selectedSection, setSelectedSection] = useState('ALL');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [installments, setInstallments] = useState<Installment[]>([
    {
      name: '',
      amount: 0,
      dueDate: '',
      description: ''
    }
  ]);
  const [installmentCount, setInstallmentCount] = useState<number>(1);
  const [cleanHundredsMode, setCleanHundredsMode] = useState<boolean>(true);
  const [applyToStudents, setApplyToStudents] = useState(false);
  const [existingStructures, setExistingStructures] = useState<any[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  console.log('FeeStructureTab render');

  // Load existing fee structures
  React.useEffect(() => {
    const fetchStructures = async () => {
      try {
        const res = await feesAPI.getFeeStructures({
          class: selectedClass,
          section: selectedSection,
        });
        if (res.data?.success) {
          setExistingStructures(res.data.data || []);
        } else if (Array.isArray(res)) {
          // In case API helper returns parsed data directly
          setExistingStructures(res || []);
        } else {
          setExistingStructures([]);
        }
      } catch (e) {
        setExistingStructures([]);
      }
    };
    fetchStructures();
  }, [selectedClass, selectedSection]);

  // Add installment
  const handleAddInstallment = () => {
    setInstallments([...installments, {
      name: '',
      amount: 0,
      dueDate: '',
      description: ''
    }]);
  };

  // Remove installment
  const handleRemoveInstallment = (index: number) => {
    if (installments.length > 1) {
      setInstallments(installments.filter((_, i) => i !== index));
    }
  };

  // Update installment
  const handleInstallmentChange = (index: number, field: keyof Installment, value: string | number) => {
    const newInstallments = [...installments];
    newInstallments[index] = { ...newInstallments[index], [field]: value };
    setInstallments(newInstallments);
  };

  // Calculate total
  const calculatedTotal = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);

  const generateInstallments = () => {
    const total = Number(totalAmount || 0);
    const n = Math.max(1, Math.min(12, Number(installmentCount) || 1));
    if (!total || total <= 0) return;

    if (cleanHundredsMode && n > 1) {
      const unit = 100;
      if (total < unit * (n - 1)) {
        setError(`Total amount must be at least ${unit * (n - 1)} to split ${n} installments with first ${n - 1} multiples of ${unit}.`);
        return;
      }
      const base = Math.floor((total / n) / unit) * unit;
      const first = Array.from({ length: n - 1 }).map(() => ({
        name: '', amount: base, dueDate: '', description: ''
      } as Installment));
      const used = base * (n - 1);
      const lastAmount = total - used;
      const arr: Installment[] = [...first, { name: '', amount: lastAmount, dueDate: '', description: '' }]
        .map((inst, i) => ({ ...inst, name: `Installment ${i + 1}` }));
      setInstallments(arr);
      return;
    }

    const base = Math.floor(total / n);
    const remainder = total - base * n;
    const arr: Installment[] = Array.from({ length: n }).map((_, i) => ({
      name: `Installment ${i + 1}`,
      amount: i < remainder ? base + 1 : base,
      dueDate: '',
      description: ''
    }));
    setInstallments(arr);
  };

  // (auto-fill dates feature removed per revert)

  // Save fee structure
  const handleSaveStructure = async () => {
    setError(null);
    setSuccess(null);
    
    if (!name || !totalAmount || installments.some(inst => !inst.name || !inst.amount || !inst.dueDate)) {
      setError('Please fill all required fields');
      return;
    }

    if (calculatedTotal !== Number(totalAmount)) {
      setError('Sum of installment amounts must match total amount');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name,
        description,
        class: selectedClass,
        section: selectedSection,
        totalAmount: Number(totalAmount),
        installments: installments.map((i) => ({
          name: i.name,
          amount: Number(i.amount || 0),
          dueDate: i.dueDate,
          description: i.description
        })),
        applyToStudents,
      };
      const res = await feesAPI.createFeeStructure(payload);
      const applied = res.data?.data?.appliedToStudents;
      setSuccess(
        applied !== undefined
          ? `Fee structure saved successfully. Applied to ${applied} students.`
          : 'Fee structure saved successfully.'
      );

      // Refresh existing structures
      try {
        const list = await feesAPI.getFeeStructures({});
        if (list.data?.success) setExistingStructures(list.data.data || []);
      } catch {}
      
      // Reset form
      setName('');
      setDescription('');
      setTotalAmount('');
      setSelectedClass('ALL');
      setSelectedSection('ALL');
      setInstallments([{
        name: '',
        amount: 0,
        dueDate: '',
        description: ''
      }]);
      setApplyToStudents(false);
      
    } catch (error: any) {
      setError(error?.response?.data?.message || 'Failed to save fee structure');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Create Fee Structure</h2>

        {/* Alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fee Structure Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Annual Fee 2024-25"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Optional description"
              />
            </div>

            <ClassSectionSelect
              schoolCode={user?.schoolCode}
              valueClass={selectedClass}
              valueSection={selectedSection}
              onClassChange={setSelectedClass}
              onSectionChange={setSelectedSection}
              showSection={false}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Year
              </label>
              <select
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="2024-25">2024-25</option>
                <option value="2025-26">2025-26</option>
                <option value="2026-27">2026-27</option>
                <option value="2027-28">2027-28</option>
              </select>
            </div>
          </div>

          {/* Total Amount and Installments */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Amount *
              </label>
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                onKeyDown={(e) => {
                  const allowedKeys = [
                    'Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'
                  ];
                  if (allowedKeys.includes(e.key)) return;
                  if ((e.ctrlKey || e.metaKey) && ['a','c','v','x'].includes(e.key.toLowerCase())) return;
                  if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                onPaste={(e) => {
                  const text = (e.clipboardData || (window as any).clipboardData).getData('text');
                  const digits = text.replace(/\D+/g, '');
                  e.preventDefault();
                  setTotalAmount(prev => {
                    const selection = window.getSelection?.();
                    // Fallback: just replace entirely
                    return digits;
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter total amount"
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-gray-900">Installments</h3>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={installmentCount}
                    onChange={(e) => setInstallmentCount(Number(e.target.value))}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={generateInstallments}
                    className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {installments.map((installment, index) => (
                  <div key={index} className="bg-white p-3 rounded border">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-700">Installment {index + 1}</span>
                      {installments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInstallment(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Name"
                        value={installment.name}
                        onChange={(e) => handleInstallmentChange(index, 'name', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        placeholder="Amount"
                        value={installment.amount || ''}
                        onChange={(e) => handleInstallmentChange(index, 'amount', Number(e.target.value))}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="date"
                        value={installment.dueDate}
                        onChange={(e) => handleInstallmentChange(index, 'dueDate', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={installment.description}
                        onChange={(e) => handleInstallmentChange(index, 'description', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-2 bg-blue-50 rounded">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Calculated Total:</span>
                  <span className="font-bold">₹{calculatedTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Expected Total:</span>
                  <span className="font-bold">₹{totalAmount ? Number(totalAmount).toLocaleString() : '0'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="applyToStudents"
                checked={applyToStudents}
                onChange={(e) => setApplyToStudents(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="applyToStudents" className="ml-2 block text-sm text-gray-900">
                Apply this fee structure to all students in the selected class
              </label>
            </div>

            <button
              onClick={handleSaveStructure}
              disabled={loading}
              className={`w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Fee Structure
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Existing Fee Structures */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Existing Fee Structures</h2>
        {existingStructures.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No fee structures found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Class</th>
                  
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Installments</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applied</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {existingStructures.map((s: any) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 text-sm text-gray-900">{s.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{s.class}</td>
                    
                    <td className="px-4 py-2 text-sm text-gray-900">₹{(s.totalAmount || 0).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{s.installmentsCount}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{s.appliedToStudents || 0}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{s.academicYear}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeeStructureTab;
