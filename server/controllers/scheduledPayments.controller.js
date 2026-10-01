const paymentsService = require('../services/paymentPlans.service');
const { oggiLocale } = require('../utils/dateRome');
const { valutaBudgetDopoMovimento } = require('../services/notifiche/NotificheGenerator');

const listScheduledPayments = async (req, res, next) => {
  try {
    const payments = await paymentsService.listScheduledPayments(req.userId);
    return res.json({ payments });
  } catch (error) { return next(error); }
};

const createScheduledPayment = async (req, res, next) => {
  try {
    const payment = await paymentsService.createScheduledPayment({ userId: req.userId, data: req.body });
    return res.status(201).json({ payment });
  } catch (error) { return next(error); }
};

const createInstallmentPlan = async (req, res, next) => {
  try {
    const result = await paymentsService.createInstallmentPlan({ userId: req.userId, data: req.body });
    if (Number(result.initialMovement?.importo) > 0) {
      await valutaBudgetDopoMovimento(req.userId);
    }
    return res.status(201).json({ plan: result.plan, payments: result.payments, account: result.account });
  } catch (error) { return next(error); }
};

const confirmScheduledPayment = async (req, res, next) => {
  try {
    const result = await paymentsService.confirmScheduledPayment({
      userId: req.userId, paymentId: req.params.id, paymentDate: oggiLocale(),
    });
    if (result.payment.tipo === 'uscita') await valutaBudgetDopoMovimento(req.userId);
    return res.json(result);
  } catch (error) { return next(error); }
};

const markScheduledIncomeLate = async (req, res, next) => {
  try {
    const payment = await paymentsService.markScheduledIncomeLate({ userId: req.userId, paymentId: req.params.id });
    return res.json({ payment });
  } catch (error) { return next(error); }
};

const cancelScheduledPayment = async (req, res, next) => {
  try {
    const payment = await paymentsService.cancelScheduledPayment({ userId: req.userId, paymentId: req.params.id });
    return res.json({ payment });
  } catch (error) { return next(error); }
};

const cancelInstallmentPlan = async (req, res, next) => {
  try {
    const plan = await paymentsService.cancelInstallmentPlan({ userId: req.userId, planId: req.params.id });
    return res.json({ plan });
  } catch (error) { return next(error); }
};

const listScheduledPaymentContributions = async (req, res, next) => {
  try {
    const result = await paymentsService.listScheduledPaymentContributions({
      userId: req.userId, paymentId: req.params.id,
    });
    return res.json(result);
  } catch (error) { return next(error); }
};

const addScheduledPaymentContribution = async (req, res, next) => {
  try {
    const result = await paymentsService.addScheduledPaymentContribution({
      userId: req.userId,
      paymentId: req.params.id,
      amount: req.body.amount,
      date: req.body.date,
    });
    return res.status(201).json(result);
  } catch (error) { return next(error); }
};

module.exports = {
  listScheduledPayments,
  createScheduledPayment,
  createInstallmentPlan,
  confirmScheduledPayment,
  markScheduledIncomeLate,
  cancelScheduledPayment,
  cancelInstallmentPlan,
  listScheduledPaymentContributions,
  addScheduledPaymentContribution,
};
