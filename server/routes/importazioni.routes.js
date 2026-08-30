const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const {
  importUploadLimiter,
  importConfirmLimiter,
} = require('../middleware/rateLimit.middleware');
const { validateImportConferma } = require('../middleware/validation.middleware');
const {
  uploadFileMiddleware,
  validateUploadedFile,
  uploadPreview,
  conferma,
} = require('../controllers/importazioni.controller');

const router = express.Router();

router.post(
  '/upload',
  authMiddleware,
  importUploadLimiter,
  uploadFileMiddleware,
  validateUploadedFile,
  uploadPreview,
);

router.post(
  '/conferma',
  authMiddleware,
  importConfirmLimiter,
  validateImportConferma,
  conferma,
);

module.exports = router;
