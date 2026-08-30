const express = require('express');
const {
  forgotPassword,
  resetPassword,
  verifyResetToken,
} = require('../controllers/passwordReset.controller');
const {
  validateForgotPassword,
  validateResetPassword,
  validateVerifyResetToken,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password/verify', validateVerifyResetToken, verifyResetToken);
router.post('/reset-password', validateResetPassword, resetPassword);

module.exports = router;
