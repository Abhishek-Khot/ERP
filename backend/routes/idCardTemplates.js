const express = require('express');
const router = express.Router();
const {
  uploadTemplate,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setDefaultTemplate
} = require('../controllers/idCardTemplateController');
// Import in-memory controllers (no file storage)
const {
  previewIDCard,
  previewIDCardBase64,
  generateIDCards,
  generateAndDownloadIDCards: downloadIDCards,
  generateBulkPreview
} = require('../controllers/idCardGenerationController');
const { auth } = require('../middleware/auth');
const { setSchoolContext } = require('../middleware/schoolContext');

// Apply authentication and school context middleware
router.use(auth);
router.use(setSchoolContext);

// ID Card Generation Routes (In-Memory - No file storage)
router.post('/generate', generateIDCards);
router.post('/download', downloadIDCards);
router.get('/preview', previewIDCard);
router.get('/preview-base64', previewIDCardBase64);
router.post('/bulk-preview', generateBulkPreview);

// Get all templates for the school
router.get('/', getTemplates);

// Get a specific template
router.get('/:templateId', getTemplate);

// Create a new template
router.post('/', uploadTemplate, createTemplate);

// Update a template
router.put('/:templateId', updateTemplate);

// Delete a template (soft delete)
router.delete('/:templateId', deleteTemplate);

// Set default template
router.post('/:templateId/set-default', setDefaultTemplate);

module.exports = router;
