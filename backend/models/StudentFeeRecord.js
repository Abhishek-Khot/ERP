const mongoose = require('mongoose');

const studentFeeRecordSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
  
  // Student details (denormalized for performance)
  studentName: { type: String, required: true },
  studentClass: { type: String, required: true },
  studentSection: { type: String, required: true },
  rollNumber: String,
  
  // Fee structure details (denormalized)
  feeStructureName: { type: String, required: true },
  academicYear: { type: String, required: true },
  
  // Financial details
  totalAmount: { type: Number, required: true, min: 0 },
  totalPaid: { type: Number, default: 0, min: 0 },
  totalPending: { type: Number, default: 0, min: 0 },
  
  // Installments tracking
  installments: [{
    installmentId: mongoose.Schema.Types.ObjectId,
    name: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: Date,
    status: { 
      type: String, 
      enum: ['pending', 'partial', 'paid', 'overdue'], 
      default: 'pending' 
    },
    lateFeeAmount: { type: Number, default: 0 },
    lateFeePaid: { type: Number, default: 0 },
    remarks: String
  }],
  
  // Payment history
  payments: [{
    paymentId: mongoose.Schema.Types.ObjectId,
    installmentName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    paymentDate: { type: Date, default: Date.now },
    paymentMethod: { 
      type: String, 
      enum: ['cash', 'cheque', 'bank_transfer', 'online', 'other'], 
      required: true 
    },
    paymentReference: String, // Cheque number, transaction ID, etc.
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who received payment
    remarks: String,
    receiptNumber: String,
    isVerified: { type: Boolean, default: false }
  }],
  
  // Challans (fee collection slips)
  challans: [{
    chalanId: mongoose.Schema.Types.ObjectId,
    chalanNumber: { type: String, required: true },
    installmentName: String,
    amount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date, required: true },
    issueDate: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['unpaid', 'paid', 'partial', 'cancelled'], 
      default: 'unpaid' 
    },
    paymentDate: Date,
    paymentMethod: String,
    paymentDetails: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['pending', 'partial', 'paid', 'overdue', 'exempted'], 
    default: 'pending' 
  },
  
  // Due date tracking
  nextDueDate: Date,
  overdueDays: { type: Number, default: 0 },
  
  // Exemption details
  exemption: {
    isExempted: { type: Boolean, default: false },
    exemptedAmount: { type: Number, default: 0 },
    exemptionReason: String,
    exemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    exemptedAt: Date
  },
  
  // Notifications
  lastReminderSent: Date,
  reminderCount: { type: Number, default: 0 },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for outstanding amount
studentFeeRecordSchema.virtual('outstandingAmount').get(function() {
  return this.totalAmount - this.totalPaid;
});

// Virtual for payment percentage
studentFeeRecordSchema.virtual('paymentPercentage').get(function() {
  if (this.totalAmount === 0) return 100;
  return Math.round((this.totalPaid / this.totalAmount) * 100);
});

// Pre-save middleware to update calculated fields
studentFeeRecordSchema.pre('save', function(next) {
  // Update total paid from payments
  this.totalPaid = this.payments.reduce((sum, payment) => sum + payment.amount, 0);
  
  // Update total pending
  this.totalPending = this.totalAmount - this.totalPaid;
  
  // Update installment statuses and paid amounts
  this.installments.forEach(installment => {
    const installmentPayments = this.payments.filter(p => p.installmentName === installment.name);
    installment.paidAmount = installmentPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Update installment status
    if (installment.paidAmount >= installment.amount) {
      installment.status = 'paid';
    } else if (installment.paidAmount > 0) {
      installment.status = 'partial';
    } else if (new Date() > installment.dueDate) {
      installment.status = 'overdue';
    } else {
      installment.status = 'pending';
    }
  });
  
  // Update overall status
  if (this.totalPaid >= this.totalAmount) {
    this.status = 'paid';
  } else if (this.totalPaid > 0) {
    this.status = 'partial';
  } else if (this.installments.some(inst => inst.status === 'overdue')) {
    this.status = 'overdue';
  } else {
    this.status = 'pending';
  }
  
  // Update overdue days
  const overdueInstallments = this.installments.filter(inst => inst.status === 'overdue');
  if (overdueInstallments.length > 0) {
    const oldestOverdue = overdueInstallments.reduce((oldest, inst) => 
      !oldest || inst.dueDate < oldest.dueDate ? inst : oldest
    );
    this.overdueDays = Math.max(0, Math.floor((new Date() - oldestOverdue.dueDate) / (1000 * 60 * 60 * 24)));
  }
  
  // Update next due date
  const pendingInstallments = this.installments.filter(inst => inst.status === 'pending');
  if (pendingInstallments.length > 0) {
    const nextDue = pendingInstallments.reduce((next, inst) => 
      !next || inst.dueDate < next.dueDate ? inst : next
    );
    this.nextDueDate = nextDue.dueDate;
  }
  
  next();
});

// Indexes for better query performance
studentFeeRecordSchema.index({ schoolId: 1, studentId: 1 });
studentFeeRecordSchema.index({ schoolId: 1, studentClass: 1, studentSection: 1 });
studentFeeRecordSchema.index({ schoolId: 1, status: 1 });
studentFeeRecordSchema.index({ feeStructureId: 1 });
studentFeeRecordSchema.index({ nextDueDate: 1 });
studentFeeRecordSchema.index({ createdAt: -1 });

// Export both the model and schema for dynamic registration
const StudentFeeRecord = mongoose.model('StudentFeeRecord', studentFeeRecordSchema);

module.exports = {
  schema: studentFeeRecordSchema,
  model: StudentFeeRecord
};
