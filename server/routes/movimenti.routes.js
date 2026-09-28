const express = require('express');
const {
  getMovimenti, createMovimento, updateMovimento, deleteMovimento,
  getBilancioMese, getRicorrenti, getEntrateRiepilogo, updateStatoRicorrenza,
} = require('../controllers/movimenti.controller');
const authMiddleware = require('../middleware/auth.middleware');
const scheduledPayments = require('../controllers/scheduledPayments.controller');
const {
  validateMovimento,
  validateUpdateMovimento,
  validateDeleteMovimento,
  validateMovimentiQuery,
  validateStatoRicorrenza,
  validateCreateScheduledPayment,
  validateCreateInstallmentPlan,
  validateScheduledPaymentId,
} = require('../middleware/validation.middleware');

const router = express.Router();

router.get('/bilancio', authMiddleware, getBilancioMese);
router.get('/ricorrenti', authMiddleware, getRicorrenti);
router.get('/programmate', authMiddleware, scheduledPayments.listScheduledPayments);
router.post('/programmate', authMiddleware, validateCreateScheduledPayment, scheduledPayments.createScheduledPayment);
router.post('/installment-plans', authMiddleware, validateCreateInstallmentPlan, scheduledPayments.createInstallmentPlan);
router.post('/programmate/:id/conferma', authMiddleware, validateScheduledPaymentId, scheduledPayments.confirmScheduledPayment);
router.patch('/programmate/:id/ritardo', authMiddleware, validateScheduledPaymentId, scheduledPayments.markScheduledIncomeLate);
router.patch('/programmate/:id/annulla', authMiddleware, validateScheduledPaymentId, scheduledPayments.cancelScheduledPayment);
router.patch('/installment-plans/:id/annulla', authMiddleware, validateScheduledPaymentId, scheduledPayments.cancelInstallmentPlan);
router.get('/entrate/riepilogo', authMiddleware, getEntrateRiepilogo);
router.get('/', authMiddleware, validateMovimentiQuery, getMovimenti);
router.post('/', authMiddleware, validateMovimento, createMovimento);
router.patch('/:id/ricorrenza/stato', authMiddleware, validateStatoRicorrenza, updateStatoRicorrenza);
router.put('/:id', authMiddleware, validateUpdateMovimento, updateMovimento);
router.delete('/:id', authMiddleware, validateDeleteMovimento, deleteMovimento);

module.exports = router;
