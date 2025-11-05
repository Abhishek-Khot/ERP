const mongoose = require('mongoose');

const chalanSchema = new mongoose.Schema({
  chalanNumber: {
    type: String,
    required: true,
    unique: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  feeRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentFeeRecord'
  },
  class: {
    type: String,
    required: true
  },
  section: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['unpaid', 'paid', 'partial', 'cancelled'],
    default: 'unpaid'
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'cheque', 'bank_transfer', 'online', 'other']
  },
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed
  },
  installmentName: {
    type: String
  },
  academicYear: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for faster lookups
chalanSchema.index({ chalanNumber: 1, schoolId: 1 }, { unique: true });
chalanSchema.index({ studentId: 1, status: 1 });
chalanSchema.index({ schoolId: 1, academicYear: 1 });

// Pre-save hook to update updatedAt and status
chalanSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update status based on payment
  if (this.paidAmount >= this.amount) {
    this.status = 'paid';
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  }
  
  next();
});

// Export both the model and schema for dynamic registration in per-school databases
const Chalan = mongoose.model('Chalan', chalanSchema);

module.exports = {
  schema: chalanSchema,
  model: Chalan
};
