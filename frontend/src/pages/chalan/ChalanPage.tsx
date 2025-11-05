import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactDOMServer from 'react-dom/server';
import { Chalan } from '../../types/chalan';
import ChalanList from '../../components/chalan/ChalanList';
import ChalanGenerationForm from '../../components/chalan/ChalanGenerationForm';
import ViewChalan from '../../components/fees/ViewChalan';
import PrintableChallan from '../../components/fees/PrintableChallan';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { PlusIcon, PrinterIcon, XIcon } from '@heroicons/react/outline';

const ChalanPage: React.FC = () => {
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [viewChalan, setViewChalan] = useState<Chalan | null>(null);
  const [printMode, setPrintMode] = useState(false);
  const navigate = useNavigate();

  // Mock data - replace with actual data from your API
  const classes = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const sections = ['A', 'B', 'C'];
  const installments = ['1st Installment', '2nd Installment', '3rd Installment', '4th Installment'];

  const handleGenerateSuccess = () => {
    setIsGenerateModalOpen(false);
    // Refresh the chalan list or show success message
  };

  const handleViewChalan = (chalan: Chalan) => {
    console.log('Viewing chalan:', chalan);
    setViewChalan(chalan);
    setPrintMode(false);
  };

  // Helper function to format dates
  const formatDate = (dateString: string | Date) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handlePrintChalan = (chalan: Chalan) => {
    console.log('Printing chalan:', chalan);
    console.log('Chalan number:', chalan.chalanNumber);
    
    // Get school info from chalan or use defaults
    const schoolData = chalan.schoolData || {};
    const bankDetails = chalan.bankDetails || {
      bankName: 'State Bank of India',
      accountNumber: '12345678901234',
      ifscCode: 'SBIN0001234',
      branch: 'Main Branch',
      accountHolderName: schoolData.name || 'KENDRIYA VIDYALAYA'
    };

    // Get student info
    const studentName = typeof chalan.studentId === 'object' 
      ? (chalan.studentId as any)?.name 
      : chalan.studentName || 'N/A';
    
    const studentId = typeof chalan.studentId === 'object'
      ? (chalan.studentId as any)?._id
      : chalan.studentId || 'N/A';
    
    // Format amount with Indian Rupee symbol
    const formattedAmount = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(chalan.amount || 0);

    // Create the template with dynamic data
    const getChallanTemplate = (copyType: string) => `

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fee Payment Challan - ${chalan.chalanNumber || 'Print'}</title>
    <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          @page { size: A4 portrait; margin: 0; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .challan-container {
            width: 210mm;
            min-height: 297mm;
            display: flex;
            flex-direction: row;
            padding: 10mm;
            gap: 4mm;
            page-break-after: avoid;
          }
          .challan-copy {
            flex: 1;
            border: 2px solid #333;
            padding: 8px;
            background: white;
            display: flex;
            flex-direction: column;
            height: fit-content;
            max-height: 240mm;
          }
          .header { text-align: center; padding-bottom: 6px; border-bottom: 2px solid #333; margin-bottom: 8px; }
          .institute-name { font-size: 11px; font-weight: bold; color: #2c3e50; margin-bottom: 3px; }
          .institute-details { font-size: 7px; color: #555; line-height: 1.4; }
          .challan-title { font-size: 10px; font-weight: bold; color: #2c3e50; margin: 5px 0 2px 0; }
          .academic-year { font-size: 8px; color: #666; margin-bottom: 4px; }
          .copy-type {
            display: inline-block; padding: 2px 8px; font-size: 7px; font-weight: bold;
            border-radius: 2px; color: white; margin-top: 3px;
          }
          .student-copy .copy-type { background: #3498db; }
          .office-copy .copy-type { background: #e74c3c; }
          .admin-copy .copy-type { background: #27ae60; }
          .challan-number {
            font-weight: bold; font-size: 8px; color: #2c3e50;
            text-align: left; margin-top: 4px; padding-left: 4px;
          }
          .content-section { display: flex; flex-direction: column; gap: 6px; }
          .info-group { margin-bottom: 6px; }
          .info-title {
            font-size: 8px; font-weight: bold; color: #2c3e50;
            margin-bottom: 3px; border-bottom: 1px solid #ddd; padding-bottom: 2px;
          }
          .info-row { display: flex; padding: 1px 0; font-size: 7px; line-height: 1.3; }
          .info-label { font-weight: 600; color: #555; min-width: 60px; }
          .info-value { color: #333; flex: 1; word-break: break-word; }
          .payment-status {
            margin-top: 8px; padding: 5px; border: 1px dashed #95a5a6;
            text-align: center; font-weight: bold; color: #7f8c8d; font-size: 7px;
          }
          .branding {
            text-align: center; font-size: 6px; color: #95a5a6;
            margin-top: 4px; padding-top: 3px; border-top: 1px solid #ecf0f1;
          }
          @media print {
            body { margin: 0; padding: 0; }
            .challan-container { page-break-after: avoid; }
            .challan-copy { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="challan-container">
          <!-- STUDENT COPY -->
          <div class="challan-copy student-copy">
            <div class="header">
              <div class="institute-name">${schoolData.name || 'Your School'}</div>
              <div class="institute-details">
                ${schoolData.address || 'School Address'}<br>
                ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : ''}
                ${schoolData.email || ''}
              </div>
              <div class="challan-title">FEE PAYMENT CHALAN</div>
              <div class="academic-year">Academic Year: ${chalan.academicYear || new Date().getFullYear()}</div>
              <span class="copy-type">STUDENT COPY</span>
              <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
            </div>
            <div class="content-section">
              <div class="info-group">
                <div class="info-title">Bank Details:</div>
                <div class="info-row"><span class="info-label">Bank Name:</span><span class="info-value">${bankDetails.bankName}</span></div>
                <div class="info-row"><span class="info-label">Account Holder:</span><span class="info-value">${bankDetails.accountHolderName}</span></div>
                <div class="info-row"><span class="info-label">A/c No:</span><span class="info-value">${bankDetails.accountNumber}</span></div>
                <div class="info-row"><span class="info-label">IFSC Code:</span><span class="info-value">${bankDetails.ifscCode}</span></div>
                <div class="info-row"><span class="info-label">Branch:</span><span class="info-value">${bankDetails.branch}</span></div>
                <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Student Details</div>
                <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${studentName}</span></div>
                <div class="info-row"><span class="info-label">Student ID:</span><span class="info-value">${studentId}</span></div>
                <div class="info-row"><span class="info-label">Class & Sec:</span><span class="info-value">${chalan.class || 'N/A'}-${chalan.section || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Academic Year:</span><span class="info-value">${chalan.academicYear || new Date().getFullYear()}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Payment Details:</div>
                <div class="info-row"><span class="info-label">Installment:</span><span class="info-value">${chalan.installmentName || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Amount:</span><span class="info-value">₹${(chalan.amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="info-row"><span class="info-label">Due Date:</span><span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span></div>
              </div>
            </div>
            <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
            <div class="branding">EduLogix - Institute Management System</div>
          </div>

          <!-- OFFICE COPY -->
          <div class="challan-copy office-copy">
            <!-- Same content as STUDENT COPY but with OFFICE COPY header -->
            <div class="header">
              <div class="institute-name">${schoolData.name || 'Your School'}</div>
              <div class="institute-details">
                ${schoolData.address || 'School Address'}<br>
                ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : ''}
                ${schoolData.email || ''}
              </div>
              <div class="challan-title">FEE PAYMENT CHALAN</div>
              <div class="academic-year">Academic Year: ${chalan.academicYear || new Date().getFullYear()}</div>
              <span class="copy-type">OFFICE COPY</span>
              <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
            </div>
            <div class="content-section">
              <div class="info-group">
                <div class="info-title">Bank Details:</div>
                <div class="info-row"><span class="info-label">Bank Name:</span><span class="info-value">${bankDetails.bankName}</span></div>
                <div class="info-row"><span class="info-label">Account Holder:</span><span class="info-value">${bankDetails.accountHolderName}</span></div>
                <div class="info-row"><span class="info-label">A/c No:</span><span class="info-value">${bankDetails.accountNumber}</span></div>
                <div class="info-row"><span class="info-label">IFSC Code:</span><span class="info-value">${bankDetails.ifscCode}</span></div>
                <div class="info-row"><span class="info-label">Branch:</span><span class="info-value">${bankDetails.branch}</span></div>
                <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Student Details</div>
                <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${studentName}</span></div>
                <div class="info-row"><span class="info-label">Student ID:</span><span class="info-value">${studentId}</span></div>
                <div class="info-row"><span class="info-label">Class & Sec:</span><span class="info-value">${chalan.class || 'N/A'}-${chalan.section || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Academic Year:</span><span class="info-value">${chalan.academicYear || new Date().getFullYear()}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Payment Details:</div>
                <div class="info-row"><span class="info-label">Installment:</span><span class="info-value">${chalan.installmentName || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Amount:</span><span class="info-value">₹${(chalan.amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="info-row"><span class="info-label">Due Date:</span><span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span></div>
              </div>
            </div>
            <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
            <div class="branding">EduLogix - Institute Management System</div>
          </div>

          <!-- ADMIN COPY -->
          <div class="challan-copy admin-copy">
            <!-- Same content as STUDENT COPY but with ADMIN COPY header -->
            <div class="header">
              <div class="institute-name">${schoolData.name || 'Your School'}</div>
              <div class="institute-details">
                ${schoolData.address || 'School Address'}<br>
                ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : ''}
                ${schoolData.email || ''}
              </div>
              <div class="challan-title">FEE PAYMENT CHALAN</div>
              <div class="academic-year">Academic Year: ${chalan.academicYear || new Date().getFullYear()}</div>
              <span class="copy-type">ADMIN COPY</span>
              <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
            </div>
            <div class="content-section">
              <div class="info-group">
                <div class="info-title">Bank Details:</div>
                <div class="info-row"><span class="info-label">Bank Name:</span><span class="info-value">${bankDetails.bankName}</span></div>
                <div class="info-row"><span class="info-label">Account Holder:</span><span class="info-value">${bankDetails.accountHolderName}</span></div>
                <div class="info-row"><span class="info-label">A/c No:</span><span class="info-value">${bankDetails.accountNumber}</span></div>
                <div class="info-row"><span class="info-label">IFSC Code:</span><span class="info-value">${bankDetails.ifscCode}</span></div>
                <div class="info-row"><span class="info-label">Branch:</span><span class="info-value">${bankDetails.branch}</span></div>
                <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Student Details</div>
                <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${studentName}</span></div>
                <div class="info-row"><span class="info-label">Student ID:</span><span class="info-value">${studentId}</span></div>
                <div class="info-row"><span class="info-label">Class & Sec:</span><span class="info-value">${chalan.class || 'N/A'}-${chalan.section || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Academic Year:</span><span class="info-value">${chalan.academicYear || new Date().getFullYear()}</span></div>
              </div>
              <div class="info-group">
                <div class="info-title">Payment Details:</div>
                <div class="info-row"><span class="info-label">Installment:</span><span class="info-value">${chalan.installmentName || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Amount:</span><span class="info-value">₹${(chalan.amount || 0).toLocaleString('en-IN')}</span></div>
                <div class="info-row"><span class="info-label">Due Date:</span><span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span></div>
              </div>
            </div>
            <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
            <div class="branding">EduLogix - Institute Management System</div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create the full print content with all three copies - Updated v2
    const printContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Fee Payment Challan - ${chalan.chalanNumber || 'Print'}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            @page {
                size: A4 portrait;
                margin: 0;
            }

            body {
                font-family: Arial, sans-serif;
                background-color: white;
                margin: 0;
                padding: 0;
            }

            .challan-container {
                width: 210mm;
                min-height: 297mm;
                display: flex;
                flex-direction: row;
                padding: 10mm;
                gap: 4mm;
                page-break-after: avoid;
            }

            .challan-copy {
                flex: 1;
                border: 2px solid #333;
                padding: 8px;
                background: white;
                display: flex;
                flex-direction: column;
                height: fit-content;
                max-height: 240mm;
            }

            .header {
                text-align: center;
                padding-bottom: 6px;
                border-bottom: 2px solid #333;
                margin-bottom: 8px;
            }

            .institute-name {
                font-size: 11px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 3px;
            }

            .institute-details {
                font-size: 7px;
                color: #555;
                line-height: 1.4;
            }

            .challan-title {
                font-size: 10px;
                font-weight: bold;
                color: #2c3e50;
                margin: 5px 0 2px 0;
            }

            .academic-year {
                font-size: 8px;
                color: #666;
                margin-bottom: 4px;
            }

            .copy-type {
                display: inline-block;
                padding: 2px 8px;
                font-size: 7px;
                font-weight: bold;
                border-radius: 2px;
                color: white;
                margin-top: 3px;
            }

            .student-copy .copy-type {
                background: #3498db;
            }

            .office-copy .copy-type {
                background: #e74c3c;
            }

            .admin-copy .copy-type {
                background: #27ae60;
            }

            .challan-number {
                font-weight: bold;
                font-size: 8px;
                color: #2c3e50;
                text-align: left;
                margin-top: 4px;
                padding-left: 4px;
            }

            .content-section {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .info-group {
                margin-bottom: 6px;
            }

            .info-title {
                font-size: 8px;
                font-weight: bold;
                color: #2c3e50;
                margin-bottom: 3px;
                border-bottom: 1px solid #ddd;
                padding-bottom: 2px;
            }

            .info-row {
                display: flex;
                padding: 1px 0;
                font-size: 7px;
                line-height: 1.3;
            }

            .info-label {
                font-weight: 600;
                color: #555;
                min-width: 60px;
            }

            .info-value {
                color: #333;
                flex: 1;
                word-break: break-word;
            }

            .payment-status {
                margin-top: 8px;
                padding: 5px;
                border: 1px dashed #95a5a6;
                text-align: center;
                font-weight: bold;
                color: #7f8c8d;
                font-size: 7px;
            }

            .branding {
                text-align: center;
                font-size: 6px;
                color: #95a5a6;
                margin-top: 4px;
                padding-top: 3px;
                border-top: 1px solid #ecf0f1;
            }

            @media print {
                body {
                    margin: 0;
                    padding: 0;
                }

                .challan-container {
                    page-break-after: avoid;
                }

                .challan-copy {
                    page-break-inside: avoid;
                }
            }
        </style>
    </head>
    <body>
        <div class="challan-container">
            <!-- STUDENT COPY -->
            <div class="challan-copy student-copy">
                <div class="header">
                    <div class="institute-name">${schoolData.name || 'hello'}</div>
                    <div class="institute-details">
                        ${schoolData.address || 'fdafsdf, Maharashtra'}<br>
                        ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : 'Phone: 6292320376<br>'}
                        ${schoolData.email || 'test@gmail.com'}
                    </div>
                    <div class="challan-title">FEE PAYMENT CHALAN</div>
                    <div class="academic-year">Academic Year: ${chalan.academicYear || '2024-25'}</div>
                    <span class="copy-type">STUDENT COPY</span>
                    <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
                </div>

                <div class="content-section">
                    <div class="info-group">
                        <div class="info-title">Bank Details:</div>
                        <div class="info-row">
                            <span class="info-label">Bank Name:</span>
                            <span class="info-value">${bankDetails.bankName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Account Holder:</span>
                            <span class="info-value">${bankDetails.accountHolderName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">A/c No:</span>
                            <span class="info-value">${bankDetails.accountNumber}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">IFSC Code:</span>
                            <span class="info-value">${bankDetails.ifscCode}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Branch:</span>
                            <span class="info-value">${bankDetails.branch}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Student Details</div>
                        <div class="info-row">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${studentName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Student ID:</span>
                            <span class="info-value">${studentId}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Class & Sec:</span>
                            <span class="info-value">${chalan.class || '1'}-${chalan.section || 'A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Academic Year:</span>
                            <span class="info-value">${chalan.academicYear || '2024-25'}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Payment Details:</div>
                        <div class="info-row">
                            <span class="info-label">Installment:</span>
                            <span class="info-value">${chalan.installmentName || 'Installment 1'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Amount:</span>
                            <span class="info-value">${formattedAmount}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Due Date:</span>
                            <span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span>
                        </div>
                    </div>
                </div>

                <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
                <div class="branding">EduLogix - Institute Management System</div>
            </div>

            <!-- OFFICE COPY -->
            <div class="challan-copy office-copy">
                <div class="header">
                    <div class="institute-name">${schoolData.name || 'hello'}</div>
                    <div class="institute-details">
                        ${schoolData.address || 'fdafsdf, Maharashtra'}<br>
                        ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : 'Phone: 6292320376<br>'}
                        ${schoolData.email || 'test@gmail.com'}
                    </div>
                    <div class="challan-title">FEE PAYMENT CHALAN</div>
                    <div class="academic-year">Academic Year: ${chalan.academicYear || '2024-25'}</div>
                    <span class="copy-type">OFFICE COPY</span>
                    <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
                </div>

                <div class="content-section">
                    <div class="info-group">
                        <div class="info-title">Bank Details:</div>
                        <div class="info-row">
                            <span class="info-label">Bank Name:</span>
                            <span class="info-value">${bankDetails.bankName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Account Holder:</span>
                            <span class="info-value">${bankDetails.accountHolderName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">A/c No:</span>
                            <span class="info-value">${bankDetails.accountNumber}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">IFSC Code:</span>
                            <span class="info-value">${bankDetails.ifscCode}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Branch:</span>
                            <span class="info-value">${bankDetails.branch}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Student Details</div>
                        <div class="info-row">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${studentName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Student ID:</span>
                            <span class="info-value">${studentId}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Class & Sec:</span>
                            <span class="info-value">${chalan.class || '1'}-${chalan.section || 'A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Academic Year:</span>
                            <span class="info-value">${chalan.academicYear || '2024-25'}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Payment Details:</div>
                        <div class="info-row">
                            <span class="info-label">Installment:</span>
                            <span class="info-value">${chalan.installmentName || 'Installment 1'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Amount:</span>
                            <span class="info-value">${formattedAmount}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Due Date:</span>
                            <span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span>
                        </div>
                    </div>
                </div>

                <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
                <div class="branding">EduLogix - Institute Management System</div>
            </div>

            <!-- ADMIN COPY -->
            <div class="challan-copy admin-copy">
                <div class="header">
                    <div class="institute-name">${schoolData.name || 'hello'}</div>
                    <div class="institute-details">
                        ${schoolData.address || 'fdafsdf, Maharashtra'}<br>
                        ${schoolData.phone ? `Phone: ${schoolData.phone}<br>` : 'Phone: 6292320376<br>'}
                        ${schoolData.email || 'test@gmail.com'}
                    </div>
                    <div class="challan-title">FEE PAYMENT CHALAN</div>
                    <div class="academic-year">Academic Year: ${chalan.academicYear || '2024-25'}</div>
                    <span class="copy-type">ADMIN COPY</span>
                    <div class="challan-number">Chalan: ${chalan.chalanNumber || 'N/A'}</div>
                </div>

                <div class="content-section">
                    <div class="info-group">
                        <div class="info-title">Bank Details:</div>
                        <div class="info-row">
                            <span class="info-label">Bank Name:</span>
                            <span class="info-value">${bankDetails.bankName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Account Holder:</span>
                            <span class="info-value">${bankDetails.accountHolderName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">A/c No:</span>
                            <span class="info-value">${bankDetails.accountNumber}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">IFSC Code:</span>
                            <span class="info-value">${bankDetails.ifscCode}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Branch:</span>
                            <span class="info-value">${bankDetails.branch}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Date:</span>
                            <span class="info-value">${formatDate(chalan.chalanDate || new Date().toISOString())}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Student Details</div>
                        <div class="info-row">
                            <span class="info-label">Name:</span>
                            <span class="info-value">${studentName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Student ID:</span>
                            <span class="info-value">${studentId}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Class & Sec:</span>
                            <span class="info-value">${chalan.class || '1'}-${chalan.section || 'A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Academic Year:</span>
                            <span class="info-value">${chalan.academicYear || '2024-25'}</span>
                        </div>
                    </div>

                    <div class="info-group">
                        <div class="info-title">Payment Details:</div>
                        <div class="info-row">
                            <span class="info-label">Installment:</span>
                            <span class="info-value">${chalan.installmentName || 'Installment 1'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Amount:</span>
                            <span class="info-value">${formattedAmount}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Due Date:</span>
                            <span class="info-value">${formatDate(chalan.dueDate || new Date().toISOString())}</span>
                        </div>
                    </div>
                </div>

                <div class="payment-status">PAYMENT STATUS: ${chalan.status?.toUpperCase() || 'UNPAID'}</div>
                <div class="branding">EduLogix - Institute Management System</div>
            </div>
        </div>
    </body>
    </html>`;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printContent);
      
      // Set a fallback in case onload doesn't fire - increased timeout for better rendering
      const printTimeout = setTimeout(() => {
        if (printWindow.document.readyState === 'complete') {
          printWindow.focus();
          printWindow.print();
        }
      }, 1500);
      
      // Handle the print dialog when content is loaded
      printWindow.document.addEventListener('DOMContentLoaded', () => {
        clearTimeout(printTimeout);
        printWindow.focus();
        printWindow.print();
      }, { once: true });
      
      // Fallback for browsers that don't support DOMContentLoaded on document
      printWindow.onload = () => {
        clearTimeout(printTimeout);
        printWindow.focus();
        printWindow.print();
      };
      
      printWindow.document.close();
    }
  };

  const handleCloseView = () => {
    setViewChalan(null);
    setPrintMode(false);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Fee Chalans</h1>
          <p className="text-sm text-gray-600">Manage and generate fee payment chalans</p>
        </div>
        <Button
          onClick={() => setIsGenerateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Generate Chalan
        </Button>
      </div>

      {/* Chalan List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <ChalanList 
          onViewChalan={handleViewChalan}
          onPrintChalan={handlePrintChalan}
        />
      </div>

      {/* Generate Chalan Modal */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate Fee Chalans"
        size="3xl"
      >
        <ChalanGenerationForm
          onSuccess={handleGenerateSuccess}
          onCancel={() => setIsGenerateModalOpen(false)}
          classes={classes}
          sections={sections}
          installments={installments}
        />
      </Modal>

      {/* View Chalan Modal */}
      <ViewChalan
        isOpen={!!viewChalan}
        onClose={handleCloseView}
        printMode={printMode}
        chalan={{
          chalanNumber: viewChalan?.chalanNumber || 'N/A',
          chalanDate: viewChalan?.createdAt 
            ? new Date(viewChalan.createdAt).toISOString() 
            : new Date().toISOString(),
          chalanStatus: viewChalan?.status || 'unpaid',
          installmentName: viewChalan?.installmentName || 'Fee Payment',
          amount: viewChalan?.amount || 0,
          totalAmount: viewChalan?.totalAmount || viewChalan?.amount || 0,
          dueDate: viewChalan?.dueDate 
            ? new Date(viewChalan.dueDate).toISOString() 
            : new Date().toISOString(),
          studentName: (typeof viewChalan?.studentId === 'object' 
            ? viewChalan.studentId.name 
            : viewChalan?.studentName) || 'N/A',
          studentId: typeof viewChalan?.studentId === 'object' 
            ? viewChalan.studentId._id 
            : viewChalan?.studentId || '',
          admissionNumber: viewChalan?.admissionNumber || 
            (typeof viewChalan?.studentId === 'object' ? viewChalan.studentId.admissionNo : '') || 'N/A',
          className: viewChalan?.class || 'N/A',
          section: viewChalan?.section || 'N/A',
          schoolId: viewChalan?.schoolId || '',
          academicYear: (viewChalan as any)?.academicYear || new Date().getFullYear().toString(),
          schoolName: 'Your School Name',
          schoolAddress: 'School Address',
          schoolPhone: '',
          schoolEmail: '',
          schoolLogo: '',
          bankDetails: {
            bankName: 'Your Bank',
            accountNumber: '1234567890',
            ifscCode: 'ABCD0123456',
            branch: 'Main Branch',
            accountHolderName: 'School Name'
          },
          schoolData: {
            name: 'Your School Name',
            address: 'School Address',
            phone: '',
            email: ''
          }
        }}
      />

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\:block, .print-chalan, .print-chalan * {
            visibility: visible;
          }
          .print-chalan {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
          }
          .break-after-page {
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
};

export default ChalanPage;
