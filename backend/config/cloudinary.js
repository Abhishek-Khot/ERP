const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const compressPdf = require('compress-pdf');

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Local file path to upload
 * @param {string} folder - Cloudinary folder path (e.g., 'profiles/SCHOOL001')
 * @param {string} publicId - Public ID for the image (e.g., 'STU001_1234567890')
 * @returns {Promise<Object>} - Cloudinary upload result with secure_url and public_id
 */
const uploadToCloudinary = async (filePath, folder, publicId) => {
  try {
    console.log(`☁️ Uploading to Cloudinary: ${filePath}`);
    console.log(`📁 Folder: ${folder}, Public ID: ${publicId}`);
    
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      public_id: publicId,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
    
    console.log(`✅ Uploaded to Cloudinary: ${result.secure_url}`);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error.message);
    throw error;
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Full public ID of the image to delete (e.g., 'profiles/SCHOOL001/STU001_1234567890')
 * @returns {Promise<Object>} - Cloudinary deletion result
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      console.warn('⚠️ No public ID provided for deletion');
      return null;
    }
    
    console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image'
    });
    
    console.log(`✅ Deleted from Cloudinary: ${publicId}`, result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary deletion error:', error.message);
    throw error;
  }
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} cloudinaryUrl - Full Cloudinary URL
 * @returns {string|null} - Extracted public ID or null
 */
const extractPublicId = (cloudinaryUrl) => {
  try {
    if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') return null;
    
    // Check if it's a Cloudinary URL
    if (!cloudinaryUrl.includes('cloudinary.com')) return null;
    
    // Extract public ID from URL
    // Format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{format}
    const parts = cloudinaryUrl.split('/upload/');
    if (parts.length < 2) return null;
    
    const pathParts = parts[1].split('/');
    // Remove version (v1234567890) if present
    const startIndex = pathParts[0].startsWith('v') && !isNaN(pathParts[0].substring(1)) ? 1 : 0;
    
    // Join remaining parts and remove file extension
    const publicIdWithExt = pathParts.slice(startIndex).join('/');
    const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public ID:', error.message);
    return null;
  }
};

/**
 * Delete local file safely
 * @param {string} filePath - Path to local file
 */
const deleteLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted local file: ${filePath}`);
    }
  } catch (error) {
    console.warn(`⚠️ Could not delete local file ${filePath}:`, error.message);
  }
};

/**
 * Compress PDF using compress-pdf
 * @param {string} inputPath - Input PDF file path
 * @param {string} outputPath - Output compressed PDF file path
 * @returns {Promise<void>}
 */
const compressPDF = async (inputPath, outputPath) => {
  try {
    console.log(`🔄 Compressing PDF: ${path.basename(inputPath)}`);
    
    const originalSize = fs.statSync(inputPath).size;
    console.log(`📄 Original PDF size: ${(originalSize / 1024).toFixed(2)}KB`);
    
    // Compress PDF with compress-pdf
    await compressPdf(inputPath, outputPath, {
      compressionLevel: 'ebook', // Options: 'screen', 'ebook', 'printer', 'prepress'
      gsModule: null // Auto-detect ghostscript
    });
    
    const compressedSize = fs.statSync(outputPath).size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    console.log(`✅ Compressed PDF size: ${(compressedSize / 1024).toFixed(2)}KB (${reduction}% reduction)`);
  } catch (error) {
    console.error('❌ PDF compression error:', error.message);
    // If compression fails, copy original file
    try {
      fs.copyFileSync(inputPath, outputPath);
      console.log('⚠️ Using original PDF (compression failed)');
    } catch (copyError) {
      throw copyError;
    }
  }
};

/**
 * Upload PDF to Cloudinary with compression
 * @param {string} filePath - Local file path to upload
 * @param {string} folder - Cloudinary folder path (e.g., 'assignments/SCHOOL001')
 * @param {string} publicId - Public ID for the PDF (e.g., 'assignment_123_1234567890')
 * @returns {Promise<Object>} - Cloudinary upload result with secure_url and public_id
 */
const uploadPDFToCloudinary = async (filePath, folder, publicId) => {
  let compressedPath = null;
  
  try {
    console.log(`☁️ Uploading PDF to Cloudinary: ${filePath}`);
    console.log(`📁 Folder: ${folder}, Public ID: ${publicId}`);
    
    const fileExt = path.extname(filePath).toLowerCase();
    
    // Only compress PDFs
    if (fileExt === '.pdf') {
      const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      compressedPath = path.join(tempDir, `compressed_${Date.now()}.pdf`);
      
      // Compress PDF
      await compressPDF(filePath, compressedPath);
      
      // Upload compressed PDF
      const result = await cloudinary.uploader.upload(compressedPath, {
        folder: folder,
        public_id: publicId,
        resource_type: 'raw',
        overwrite: true
      });
      
      // Clean up compressed file
      deleteLocalFile(compressedPath);
      
      console.log(`✅ Uploaded compressed PDF to Cloudinary: ${result.secure_url}`);
      return result;
    } else {
      // Upload non-PDF files directly
      const result = await cloudinary.uploader.upload(filePath, {
        folder: folder,
        public_id: publicId,
        resource_type: 'raw',
        overwrite: true
      });
      
      console.log(`✅ Uploaded file to Cloudinary: ${result.secure_url}`);
      return result;
    }
  } catch (error) {
    console.error('❌ Cloudinary PDF upload error:', error.message);
    // Clean up compressed file on error
    if (compressedPath) {
      deleteLocalFile(compressedPath);
    }
    throw error;
  }
};

/**
 * Delete PDF/document from Cloudinary (raw resource type)
 * @param {string} publicId - Full public ID of the document to delete
 * @returns {Promise<Object>} - Cloudinary deletion result
 */
const deletePDFFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      console.warn('⚠️ No public ID provided for PDF deletion');
      return null;
    }
    
    console.log(`🗑️ Deleting PDF from Cloudinary: ${publicId}`);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'raw' // Use 'raw' for PDFs and documents
    });
    
    console.log(`✅ Deleted PDF from Cloudinary: ${publicId}`, result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary PDF deletion error:', error.message);
    throw error;
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  uploadPDFToCloudinary,
  deleteFromCloudinary,
  deletePDFFromCloudinary,
  extractPublicId,
  deleteLocalFile
};