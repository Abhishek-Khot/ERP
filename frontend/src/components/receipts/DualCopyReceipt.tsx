import React from 'react';
import { Printer } from 'lucide-react';

export interface PaymentData {
  receiptNumber: string;
  paymentDate: string;
  paymentMethod: string;
  paymentReference?: string;
  amount: number;
  installmentName: string;
}

export interface StudentData {
  name: string;
  studentId: string;
  userId?: string;
  class: string;
  section: string;
  academicYear: string;
}

export interface SchoolData {
  schoolName: string;
  schoolCode: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  hasSchoolLogo?: boolean;
  schoolLogo?: string;
}

export interface InstallmentDetail {
  name: string;
  amount: number;
  paid: number;
  remaining: number;
  isCurrent?: boolean;
}

interface DualCopyReceiptProps {
  schoolData: SchoolData;
  studentData: StudentData;
  paymentData: PaymentData;
  installments: InstallmentDetail[];
  totalAmount: number;
  totalPaid: number;
  totalRemaining: number;
}

const DualCopyReceipt: React.FC<DualCopyReceiptProps> = ({
  schoolData,
  studentData,
  paymentData,
  installments,
  totalAmount,
  totalPaid,
  totalRemaining,
}) => {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return '-';
    try {
      console.log('Formatting date:', dateString);
      const date = new Date(dateString);
      console.log('Parsed date:', date);
      if (isNaN(date.getTime())) return '-';
      
      // Use local timezone for display
      const formatted = date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      console.log('Formatted date:', formatted);
      return formatted;
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  const formatDateTime = (dateString: string): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      
      const formattedDate = date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      const formattedTime = date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      
      return `${formattedDate} at ${formattedTime}`;
    } catch (error) {
      console.error('DateTime formatting error:', error);
      return '-';
    }
  };

  const handlePrint = () => {
    // Create a print-optimized version
    const printContent = generatePrintHTML();
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    }
  };


  const generatePrintHTML = () => {
    return `
      <!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Payment Receipt - ${paymentData.receiptNumber}</title>
    <style>
        /* Base styles matching the component's 'print' mode and image aesthetics */
        @page {
            size: A4 landscape;
            margin: 8mm;
        }
        body {
            font-family: Arial, sans-serif; /* Changed font to match reference */
            font-size: 10px; /* Base font size */
            margin: 0;
            padding: 0;
            background: white;
            color: #000; /* Primary text color */
        }
        .receipt-container {
            display: flex;
            flex-direction: row;
            gap: 16px; /* Space between the two copies - matched reference */
            width: 100%;
            min-height: 200mm; /* A bit less than A4 height for safety */
            box-sizing: border-box;
            padding: 10mm; /* Padding around the container, adjusting for margin */
        }
        .receipt-copy {
            flex: 1;
            border: 1px solid #d1d5db; /* Light grey border - matched reference */
            padding: 12px; /* Increased internal padding - matched reference */
            display: flex;
            flex-direction: column;
            border-radius: 0; /* Removing border-radius for cleaner print look */
        }

        /* --- Header Section (Refactored to match Invoice structure) --- */

        .copy-type-section {
            text-align: center;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #9ca3af; /* Darker border for section break */
        }
        .copy-header-title {
            font-size: 12px;
            font-weight: bold;
            color: #1f2937;
            margin: 0;
        }
        
        /* School Info (Refactored to match Invoice logo/address section) */
        .school-logo-section {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #d1d5db;
        }
        .school-logo-placeholder { /* For dynamic logo or simple text */
            width: 32px;
            height: 32px;
            background: #c53030; /* Example red for placeholder/accent */
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .school-logo-placeholder > div {
            width: 16px;
            height: 16px;
            border: 1px solid white;
            border-radius: 2px;
            transform: rotate(45deg);
        }
        .school-logo-actual {
            max-width: 40px; 
            max-height: 40px; 
            object-fit: contain;
        }

        .school-name-title {
            font-size: 14px; /* Slightly larger for prominence */
            font-weight: 900; /* Ultra bold */
            color: #000; /* Dark black */
            margin: 0;
        }
        .school-address {
            font-size: 8px;
            color: #4b5563;
            margin: 1px 0;
        }
        
        /* Document Title (RECEIPT) */
        .doc-title-section {
            text-align: center;
            margin-bottom: 24px; /* Increased space before details */
        }
        .doc-title {
            font-size: 14px;
            font-weight: bold;
            color: #2563eb; /* Blue color for RECEIPT/INVOICE */
            margin: 0;
        }
        .receipt-number {
            font-size: 10px;
            color: #4b5563;
            margin-top: 2px;
        }

        /* --- Details Section (Matching Invoice Details Grid) --- */
        
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            margin-bottom: 32px;
            font-size: 10px;
            color: #374151;
        }
        .details-box-title {
            font-size: 12px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
            padding-bottom: 4px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 10px;
        }
        .info-label {
            color: #6b7280;
            font-weight: normal;
        }
        .info-value {
            color: #1f2937;
            font-weight: 600;
        }

        /* --- Table Section (Matching Invoice Table) --- */
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 32px;
            font-size: 10px;
        }
        .items-table th, .items-table td {
            padding: 8px 12px; /* Adjusted padding for better fit */
            border: 1px solid #d1d5db;
            text-align: left;
        }
        .items-table th {
            background-color: #f3f4f6; /* Light grey header background */
            font-weight: 600;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .text-green { color: #047857; font-weight: 600; }
        .text-red { color: #dc2626; font-weight: 600; }

        /* --- Totals/Payment Section (Matching Invoice Totals) --- */

        .totals-section-container {
            display: flex;
            justify-content: flex-end;
        }
        .totals-box {
            width: 256px; /* Matched width from reference */
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #d1d5db;
        }
        .current-payment-row { 
            padding: 12px 0;
            font-weight: bold;
            font-size: 18px;
            border-bottom: 2px solid #1f2937;
            color: #1d4ed8;
        }
        .current-payment-label {
            font-size: 14px;
            color: #4b5563;
        }
        .current-payment-amount {
            font-weight: bold;
        }

        /* --- Footer (Matching Invoice Footer) --- */

        .receipt-footer {
            margin-top: auto;
            padding-top: 32px;
            border-top: 1px solid #d1d5db;
            text-align: center;
            font-size: 10px; /* Slightly larger footer text */
            color: #4b5563;
        }
        .footer-line {
            margin: 2px 0;
        }
        .footer-bold {
            font-weight: 600;
            color: #1f2937;
        }
        .footer-blue {
            color: #2563eb;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="receipt-copy">
            
            <div class="copy-type-section">
                <h3 class="copy-header-title">ADMIN COPY</h3>
            </div>
            
            <div class="school-logo-section">
                ${schoolData.hasSchoolLogo && schoolData.schoolLogo ? 
                    `<img src="${schoolData.schoolLogo}" alt="${schoolData.schoolName} Logo" class="school-logo-actual" />` : 
                    `<div class="school-logo-placeholder"><div></div></div>`
                }
                <div>
                    <h1 class="school-name-title">${schoolData.schoolName}</h1>
                    <p class="school-address">${schoolData.address}</p>
                </div>
                <div style="flex-grow: 1; text-align: right;"></div>
            </div>

            <div class="doc-title-section">
                <h2 class="doc-title">PAYMENT RECEIPT</h2>
                <p class="receipt-number">#${paymentData.receiptNumber}</p>
            </div>

            <div class="details-grid">
                <div>
                    <h3 class="details-box-title">PAID BY:</h3>
                    <div class="info-row">
                        <span class="info-label">Student Name:</span>
                        <span class="info-value">${studentData.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Student ID:</span>
                        <span class="info-value">${studentData.userId || studentData.studentId}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Class & Section:</span>
                        <span class="info-value">${studentData.class}-${studentData.section}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Academic Year:</span>
                        <span class="info-value">${studentData.academicYear}</span>
                    </div>
                </div>
                
                <div>
                    <h3 class="details-box-title" style="text-align: right;">PAYMENT INFO:</h3>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Payment Date:</span>
                        <span class="info-value">${formatDateTime(paymentData.paymentDate)}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Payment Method:</span>
                        <span class="info-value">${paymentData.paymentMethod}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Reference:</span>
                        <span class="info-value">${paymentData.paymentReference || '-'}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Installment Paid:</span>
                        <span class="info-value">${paymentData.installmentName}</span>
                    </div>
                </div>
            </div>
            
            <h3 class="details-box-title" style="margin-bottom: 8px;">FEE & INSTALLMENT DETAILS</h3>

            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">Installment / Fee Head</th>
                        <th style="width: 25%;" class="text-right">Amount Due</th>
                        <th style="width: 25%;" class="text-right">Paid to Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${installments.map(inst => `
                        <tr>
                            <td>${inst.isCurrent ? inst.name + ' (Current Payment)' : inst.name}</td>
                            <td class="text-right">${formatCurrency(inst.amount)}</td>
                            <td class="text-right text-green">${formatCurrency(inst.paid)}</td>
                        </tr>
                    `).join('')}
                    <tr style="background: #f9fafb; font-weight: 600;">
                        <td>Overall Total</td>
                        <td class="text-right">${formatCurrency(totalAmount)}</td>
                        <td class="text-right text-green">${formatCurrency(totalPaid)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="receipt-footer">
                <div class="footer-line footer-bold">Thank you for your payment!</div>
                <div class="footer-line">Powered by <span class="footer-blue">EduLogix</span></div>
                <div class="footer-line">This is a computer generated receipt.</div>
            </div>
        </div>

        <div class="receipt-copy">
            
            <div class="copy-type-section">
                <h3 class="copy-header-title">STUDENT COPY</h3>
            </div>
            
            <div class="school-logo-section">
                ${schoolData.hasSchoolLogo && schoolData.schoolLogo ? 
                    `<img src="${schoolData.schoolLogo}" alt="${schoolData.schoolName} Logo" class="school-logo-actual" />` : 
                    `<div class="school-logo-placeholder"><div></div></div>`
                }
                <div>
                    <h1 class="school-name-title">${schoolData.schoolName}</h1>
                    <p class="school-address">${schoolData.address}</p>
                </div>
                <div style="flex-grow: 1; text-align: right;"></div>
            </div>

            <div class="doc-title-section">
                <h2 class="doc-title">PAYMENT RECEIPT</h2>
                <p class="receipt-number">#${paymentData.receiptNumber}</p>
            </div>

            <div class="details-grid">
                <div>
                    <h3 class="details-box-title">PAID BY:</h3>
                    <div class="info-row">
                        <span class="info-label">Student Name:</span>
                        <span class="info-value">${studentData.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Student ID:</span>
                        <span class="info-value">${studentData.userId || studentData.studentId}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Class & Section:</span>
                        <span class="info-value">${studentData.class}-${studentData.section}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Academic Year:</span>
                        <span class="info-value">${studentData.academicYear}</span>
                    </div>
                </div>
                
                <div>
                    <h3 class="details-box-title" style="text-align: right;">PAYMENT INFO:</h3>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Payment Date:</span>
                        <span class="info-value">${formatDateTime(paymentData.paymentDate)}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Payment Method:</span>
                        <span class="info-value">${paymentData.paymentMethod}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Reference:</span>
                        <span class="info-value">${paymentData.paymentReference || '-'}</span>
                    </div>
                    <div class="info-row" style="justify-content: flex-end;">
                        <span class="info-label" style="margin-right: 8px;">Installment Paid:</span>
                        <span class="info-value">${paymentData.installmentName}</span>
                    </div>
                </div>
            </div>
            
            <h3 class="details-box-title" style="margin-bottom: 8px;">FEE & INSTALLMENT DETAILS</h3>

            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">Installment / Fee Head</th>
                        <th style="width: 25%;" class="text-right">Amount Due</th>
                        <th style="width: 25%;" class="text-right">Paid to Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${installments.map(inst => `
                        <tr>
                            <td>${inst.isCurrent ? inst.name + ' (Current Payment)' : inst.name}</td>
                            <td class="text-right">${formatCurrency(inst.amount)}</td>
                            <td class="text-right text-green">${formatCurrency(inst.paid)}</td>
                        </tr>
                    `).join('')}
                    <tr style="background: #f9fafb; font-weight: 600;">
                        <td>Overall Total</td>
                        <td class="text-right">${formatCurrency(totalAmount)}</td>
                        <td class="text-right text-green">${formatCurrency(totalPaid)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="receipt-footer">
                <div class="footer-line footer-bold">Thank you for your payment!</div>
                <div class="footer-line">Powered by <span class="footer-blue">EduLogix</span></div>
                <div class="footer-line">This is a computer generated receipt.</div>
            </div>
        </div>
    </div>
</body>
</html>
    `;
  };

  return (
    <div className="max-w-7xl mx-auto bg-white">
      {/* Print Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            }
            .print-hidden {
              display: none !important;
            }
            .receipt-container {
              display: flex !important;
              gap: 8mm !important;
              width: 100% !important;
              height: 100vh !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .receipt-copy {
              flex: 1 !important;
              border: 1px solid #d1d5db !important;
              border-radius: 4px !important;
              overflow: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              page-break-inside: avoid !important;
            }
            .receipt-header {
              background: #f9fafb !important;
              padding: 6px 8px !important;
              border-bottom: 1px solid #d1d5db !important;
              text-align: center !important;
            }
            .receipt-title {
              font-size: 12px !important;
              font-weight: 700 !important;
              color: #111827 !important;
              margin-bottom: 2px !important;
            }
            .school-info {
              font-size: 10px !important;
              color: #6b7280 !important;
              margin-bottom: 3px !important;
            }
            .copy-badge {
              background: #3b82f6 !important;
              color: white !important;
              padding: 2px 6px !important;
              border-radius: 3px !important;
              font-size: 8px !important;
              font-weight: 600 !important;
              display: inline-block !important;
              margin-top: 2px !important;
            }
            .receipt-number {
              background: #dbeafe !important;
              color: #1e40af !important;
              padding: 3px 8px !important;
              border-radius: 3px !important;
              font-size: 9px !important;
              font-weight: 600 !important;
              display: inline-block !important;
              margin-top: 3px !important;
            }
            .receipt-content {
              flex: 1 !important;
              padding: 6px 8px !important;
              display: flex !important;
              flex-direction: column !important;
            }
            .student-info, .payment-info {
              background: #f9fafb !important;
              padding: 6px !important;
              border-radius: 3px !important;
              margin-bottom: 6px !important;
              border: 1px solid #e5e7eb !important;
            }
            .info-row {
              display: flex !important;
              justify-content: space-between !important;
              margin-bottom: 2px !important;
              font-size: 9px !important;
            }
            .info-label {
              color: #6b7280 !important;
              font-weight: 500 !important;
            }
            .info-value {
              color: #111827 !important;
              font-weight: 600 !important;
            }
            .installment-table {
              width: 100% !important;
              border-collapse: collapse !important;
              margin: 6px 0 !important;
              font-size: 9px !important;
            }
            .installment-table th {
              background: #f3f4f6 !important;
              padding: 4px 6px !important;
              border: 1px solid #d1d5db !important;
              font-weight: 600 !important;
              text-align: left !important;
            }
            .installment-table td {
              padding: 4px 6px !important;
              border: 1px solid #d1d5db !important;
            }
            .installment-table .text-right {
              text-align: right !important;
            }
            .current-payment {
              background: #dbeafe !important;
              padding: 8px !important;
              border-radius: 4px !important;
              text-align: center !important;
              margin: 6px 0 !important;
            }
            .current-payment-label {
              font-size: 9px !important;
              color: #6b7280 !important;
              margin-bottom: 2px !important;
            }
            .current-payment-amount {
              font-size: 14px !important;
              font-weight: 700 !important;
              color: #1d4ed8 !important;
            }
            .receipt-footer {
              background: #f9fafb !important;
              padding: 6px 8px !important;
              border-top: 1px solid #d1d5db !important;
              text-align: center !important;
              font-size: 8px !important;
              color: #6b7280 !important;
              margin-top: auto !important;
            }
            .footer-line {
              margin-bottom: 1px !important;
            }
            .footer-bold {
              font-weight: 600 !important;
            }
            .footer-blue {
              color: #2563eb !important;
              font-weight: 600 !important;
            }
            .text-green {
              color: #047857 !important;
              font-weight: 600 !important;
            }
            .text-red {
              color: #dc2626 !important;
              font-weight: 600 !important;
            }
          }
        `
      }} />

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mb-6 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Printer size={16} />
          Print Receipt
        </button>
      </div>

      {/* Dual Copy Receipt */}
      <div className="receipt-container flex gap-4 print:gap-2">
        {/* Admin Copy */}
        <div className="receipt-copy flex-1 border border-gray-300 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-2">
                {schoolData.hasSchoolLogo && schoolData.schoolLogo && (
                  <img 
                    src={schoolData.schoolLogo} 
                    alt={`${schoolData.schoolName} Logo`} 
                    className="h-16 w-auto object-contain"
                    onError={(e) => {
                      // Hide the image if it fails to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <h1 className="text-lg font-bold text-gray-800">{schoolData.schoolName}</h1>
                  <p className="text-sm text-gray-600">
                    School Code: {schoolData.schoolCode}
                  </p>
                  {schoolData.address && (
                    <p className="text-xs text-gray-500 mt-1">
                      {schoolData.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <span className="inline-block bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold">
                  ADMIN COPY
                </span>
              </div>
              <div className="mt-3">
                <div className="text-sm text-gray-600">
                  {formatDateTime(paymentData.paymentDate)}
                </div>
                <div className="mt-1">
                  <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded text-xs font-semibold">
                    Receipt #{paymentData.receiptNumber}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Student Information */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Student Name</span>
                  <span className="font-medium">{studentData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Student ID</span>
                  <span className="font-medium">{studentData.userId || studentData.studentId}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Class & Section</span>
                  <span className="font-medium">{studentData.class}-{studentData.section}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Academic Year</span>
                  <span className="font-medium">{studentData.academicYear}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Date</span>
                  <span className="font-medium">{formatDateTime(paymentData.paymentDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-medium">{paymentData.paymentMethod}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Reference</span>
                  <span className="font-medium">{paymentData.paymentReference || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Installment</span>
                  <span className="font-medium">{paymentData.installmentName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Installment Details */}
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 bg-gray-100 px-3 py-2 rounded">
              Installment Details
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Installment</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Amount</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Paid</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((installment, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="px-3 py-2">
                        {installment.isCurrent ? (
                          <span className="font-medium">{installment.name} (Current)</span>
                        ) : (
                          installment.name
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(installment.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-green-600 font-medium">
                          {formatCurrency(installment.paid)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-red-600 font-medium">
                          {formatCurrency(installment.remaining)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(totalAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-red-600">{formatCurrency(totalRemaining)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Fee Summary Table */}
          <div className="px-4 py-3">
            <h4 className="text-sm font-semibold text-gray-800 mb-2 bg-gray-100 px-3 py-2 rounded">
              Fee Summary
            </h4>
            <table className="w-full text-sm border border-gray-200 rounded">
              <thead>
                <tr className="bg-blue-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">Description</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b border-gray-200">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium">Total Annual Fee</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(totalAmount)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium text-green-700">Total Amount Paid</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{formatCurrency(totalPaid)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium text-red-700">Total Remaining</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-700">{formatCurrency(totalRemaining)}</td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className="px-3 py-2">Balance Due</td>
                  <td className="px-3 py-2 text-right text-red-700">{formatCurrency(totalRemaining)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Current Payment */}
          <div className="px-4 py-3 bg-blue-50 border-t border-gray-200">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Current Payment</div>
              <div className="text-2xl font-bold text-blue-800">
                {formatCurrency(paymentData.amount)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 text-center text-xs text-gray-600 border-t border-gray-200">
            <div className="font-semibold">This is a computer generated copy.</div>
            <div className="mt-1">
              Powered by <span className="font-semibold text-blue-600">EduLogix</span>
            </div>
            <div className="mt-1">
              Thank you for your payment! • {schoolData.website}
            </div>
            <div className="mt-1">
              {schoolData.phone} • {schoolData.email}
            </div>
          </div>
        </div>

        {/* Student Copy */}
        <div className="flex-1 border border-gray-300 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="text-center">
              <div className="flex items-center justify-center gap-4 mb-2">
                {schoolData.hasSchoolLogo && schoolData.schoolLogo && (
                  <img 
                    src={schoolData.schoolLogo} 
                    alt={`${schoolData.schoolName} Logo`} 
                    className="h-16 w-auto object-contain"
                    onError={(e) => {
                      // Hide the image if it fails to load
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
                <div>
                  <h1 className="text-lg font-bold text-gray-800">{schoolData.schoolName}</h1>
                  <p className="text-sm text-gray-600">
                    School Code: {schoolData.schoolCode}
                  </p>
                  {schoolData.address && (
                    <p className="text-xs text-gray-500 mt-1">
                      {schoolData.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <span className="inline-block bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold">
                  STUDENT COPY
                </span>
              </div>
              <div className="mt-3">
                <div className="text-sm text-gray-600">
                  {formatDateTime(paymentData.paymentDate)}
                </div>
                <div className="mt-1">
                  <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded text-xs font-semibold">
                    Receipt #{paymentData.receiptNumber}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Student Information */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Student Name</span>
                  <span className="font-medium">{studentData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Student ID</span>
                  <span className="font-medium">{studentData.userId || studentData.studentId}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Class & Section</span>
                  <span className="font-medium">{studentData.class}-{studentData.section}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Academic Year</span>
                  <span className="font-medium">{studentData.academicYear}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Date</span>
                  <span className="font-medium">{formatDateTime(paymentData.paymentDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment Method</span>
                  <span className="font-medium">{paymentData.paymentMethod}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Reference</span>
                  <span className="font-medium">{paymentData.paymentReference || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Installment</span>
                  <span className="font-medium">{paymentData.installmentName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Installment Details */}
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 bg-gray-100 px-3 py-2 rounded">
              Installment Details
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Installment</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Amount</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Paid</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((installment, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="px-3 py-2">
                        {installment.isCurrent ? (
                          <span className="font-medium">{installment.name} (Current)</span>
                        ) : (
                          installment.name
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(installment.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-green-600 font-medium">
                          {formatCurrency(installment.paid)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-red-600 font-medium">
                          {formatCurrency(installment.remaining)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(totalAmount)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-green-600">{formatCurrency(totalPaid)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-red-600">{formatCurrency(totalRemaining)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Fee Summary Table */}
          <div className="px-4 py-3">
            <h4 className="text-sm font-semibold text-gray-800 mb-2 bg-gray-100 px-3 py-2 rounded">
              Fee Summary
            </h4>
            <table className="w-full text-sm border border-gray-200 rounded">
              <thead>
                <tr className="bg-blue-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">Description</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-700 border-b border-gray-200">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium">Total Annual Fee</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(totalAmount)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium text-green-700">Total Amount Paid</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700">{formatCurrency(totalPaid)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-3 py-2 font-medium text-red-700">Total Remaining</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-700">{formatCurrency(totalRemaining)}</td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className="px-3 py-2">Balance Due</td>
                  <td className="px-3 py-2 text-right text-red-700">{formatCurrency(totalRemaining)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Current Payment */}
          <div className="px-4 py-3 bg-blue-50 border-t border-gray-200">
            <div className="text-center">
              <div className="text-sm text-gray-600 mb-1">Current Payment</div>
              <div className="text-2xl font-bold text-blue-800">
                {formatCurrency(paymentData.amount)}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 text-center text-xs text-gray-600 border-t border-gray-200">
            <div className="font-semibold">This is a computer generated copy.</div>
            <div className="mt-1">
              Powered by <span className="font-semibold text-blue-600">EduLogix</span>
            </div>
            <div className="mt-1">
              Thank you for your payment! • {schoolData.website}
            </div>
            <div className="mt-1">
              {schoolData.phone} • {schoolData.email}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DualCopyReceipt;