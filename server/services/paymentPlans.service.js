const {
  sequelize, Conto, Movimento, PaymentPlan, ScheduledPayment, ScheduledPaymentContribution,
} = require('../models');
const { Op } = require('sequelize');
const { assertCategory } = require('./categorie.service');
const { aggiornaSaldoConto } = require('./scommesseContoSync.service');
const { isContoFondo } = require('./fondoEmergenza.service');
const { oggiLocale, sommaMesi } = require('../utils/dateRome');
const { BadRequestError, NotFoundError, AppError } = require('../utils/AppError');
const { MAX_CENTESIMI, toCents, fromCents } = require('./pianoSmart/money');
const { buildExpenseFundingPlan } = require('./pianoSmartV2/expenseFundingPlan.service');

const numero = (value) => Number(value);
const euro = (cents) => fromCents(cents);
const centsOf = (amount) => {
  const cents = toCents(amount);
  if (cents === null) throw new BadRequestError('Gli importi devono avere al massimo due decimali');
  return cents;
};

function calculateInstallmentPlan({ purchaseAmount, initialPayment = 0, paymentCount, annualRate = 0 }) {
  const purchaseCents = centsOf(purchaseAmount);
  const initialCents = centsOf(initialPayment);
  const count = Number(paymentCount);
  const rate = Number(annualRate);
  if (!Number.isSafeInteger(purchaseCents) || purchaseCents <= 0
    || !Number.isSafeInteger(initialCents) || initialCents < 0 || initialCents > purchaseCents
    || !Number.isInteger(count) || count < 1 || !Number.isFinite(rate) || rate < 0) {
    throw new BadRequestError('I dati del piano di pagamento non sono validi');
  }

  const futureCount = initialCents > 0 ? count - 1 : count;
  if (futureCount < 0 || (futureCount === 0 && initialCents !== purchaseCents)) {
    throw new BadRequestError('Il numero dei pagamenti non copre l’importo dell’acquisto');
  }
  const principalCents = purchaseCents - initialCents;
  if (futureCount === 0) {
    return {
      payments: [], initialPayment: euro(initialCents), purchaseAmount: euro(purchaseCents),
      totalRepayment: euro(initialCents), interestTotal: '0.00', futureCount,
    };
  }
  if (principalCents <= 0) throw new BadRequestError('L’importo delle rate deve essere maggiore di zero');

  const monthlyRate = rate / 1200;
  const rawPayment = monthlyRate === 0
    ? principalCents / futureCount
    : principalCents * monthlyRate / (1 - ((1 + monthlyRate) ** -futureCount));
  const regularPaymentCents = Math.round(rawPayment);
  let balanceCents = principalCents;
  let totalFutureCents = 0;
  const payments = [];
  for (let index = 0; index < futureCount; index += 1) {
    const interestCents = monthlyRate === 0 ? 0 : Math.round(balanceCents * monthlyRate);
    const dueCents = index === futureCount - 1
      ? balanceCents + interestCents
      : Math.min(regularPaymentCents, balanceCents + interestCents);
    if (dueCents <= 0) throw new BadRequestError('Il numero di rate è troppo alto per questo importo');
    balanceCents = Math.max(0, balanceCents + interestCents - dueCents);
    totalFutureCents += dueCents;
    payments.push(euro(dueCents));
  }
  const totalCents = initialCents + totalFutureCents;
  if (totalCents > MAX_CENTESIMI) throw new BadRequestError('Il totale del piano supera l’importo massimo consentito');
  return {
    payments,
    initialPayment: euro(initialCents),
    purchaseAmount: euro(purchaseCents),
    totalRepayment: euro(totalCents),
    interestTotal: euro(Math.max(0, totalCents - purchaseCents)),
    futureCount,
  };
}

async function getActiveAccount(userId, accountId, transaction) {
  const account = await Conto.findOne({
    where: { id: accountId, user_id: userId, attivo: true },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!account) throw new NotFoundError('Conto non trovato');
  if (isContoFondo(account)) throw new BadRequestError('Il fondo di emergenza non accetta pagamenti diretti');
  return account;
}

async function createMovement({ userId, account, type, amount, category, description, date, transaction }) {
  const amountNumber = numero(amount);
  if (type === 'uscita' && account.tipo !== 'carta_credito' && numero(account.saldo) < amountNumber) {
    throw new AppError(`Saldo insufficiente. Disponibile: €${numero(account.saldo).toFixed(2)}.`, 400);
  }
  const movement = await Movimento.create({
    user_id: userId,
    conto_id: account.id,
    tipo: type,
    importo: amountNumber,
    categoria: category,
    descrizione: description,
    data: date,
    ricorrente: false,
    natura_entrata: 'sconosciuto',
    periodicita_entrata: 'sconosciuta',
  }, { transaction });
  const delta = type === 'entrata' ? amountNumber : -amountNumber;
  await aggiornaSaldoConto(account, numero(account.saldo) + delta, transaction);
  return movement;
}

async function createScheduledPayment({ userId, data }) {
  return sequelize.transaction(async (transaction) => {
    await assertCategory(userId, data.category, data.type, { transaction });
    const account = await getActiveAccount(userId, data.account_id, transaction);
    return ScheduledPayment.create({
      user_id: userId,
      conto_id: account.id,
      tipo: data.type,
      importo: data.amount,
      categoria: data.category,
      descrizione: data.description || null,
      data_scadenza: data.due_date,
    }, { transaction });
  });
}

async function createInstallmentPlan({ userId, data }) {
  const schedule = calculateInstallmentPlan({
    purchaseAmount: data.purchase_amount,
    initialPayment: data.initial_payment,
    paymentCount: data.payment_count,
    annualRate: data.annual_rate,
  });
  return sequelize.transaction(async (transaction) => {
    await assertCategory(userId, data.category, 'uscita', { transaction });
    const account = await getActiveAccount(userId, data.account_id, transaction);
    const initialAmount = Number(schedule.initialPayment);
    let initialMovement = null;
    if (initialAmount > 0) {
      initialMovement = await createMovement({
        userId, account, type: 'uscita', amount: initialAmount, category: data.category,
        description: data.description, date: oggiLocale(), transaction,
      });
    }
    const plan = await PaymentPlan.create({
      user_id: userId,
      conto_id: account.id,
      categoria: data.category,
      descrizione: data.description || null,
      importo_acquisto: data.purchase_amount,
      importo_iniziale: schedule.initialPayment,
      numero_pagamenti: data.payment_count,
      tasso_annuo: data.annual_rate,
      totale_da_restituire: schedule.totalRepayment,
      interessi_stimati: schedule.interestTotal,
      movimento_iniziale_id: initialMovement?.id || null,
      stato: schedule.payments.length ? 'attivo' : 'completato',
    }, { transaction });
    const rows = [];
    for (let index = 0; index < schedule.payments.length; index += 1) {
      const dueDate = sommaMesi(data.first_due_date, index);
      rows.push(await ScheduledPayment.create({
        user_id: userId,
        piano_id: plan.id,
        conto_id: account.id,
        tipo: 'uscita',
        importo: schedule.payments[index],
        categoria: data.category,
        descrizione: data.description || null,
        data_scadenza: dueDate,
      }, { transaction }));
    }
    return { plan, payments: rows, initialMovement, account };
  });
}

async function listScheduledPayments(userId) {
  return ScheduledPayment.findAll({
    where: { user_id: userId, stato: { [Op.in]: ['in_attesa', 'in_ritardo'] } },
    include: [
      { model: Conto, as: 'conto', attributes: ['id', 'nome', 'tipo'] },
      { model: PaymentPlan, as: 'piano', attributes: ['id', 'numero_pagamenti', 'tasso_annuo', 'totale_da_restituire', 'interessi_stimati'] },
    ],
    order: [['data_scadenza', 'ASC'], ['id', 'ASC']],
  });
}

async function markScheduledIncomeLate({ userId, paymentId }) {
  return sequelize.transaction(async (transaction) => {
    const payment = await ScheduledPayment.findOne({
      where: { id: paymentId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new NotFoundError('Entrata programmata non trovata');
    if (payment.tipo !== 'entrata' || payment.stato !== 'in_attesa') {
      throw new AppError('È possibile segnalare solo un’entrata in attesa', 409);
    }
    await payment.update({ stato: 'in_ritardo' }, { transaction });
    return payment;
  });
}

async function confirmScheduledPayment({ userId, paymentId, paymentDate = oggiLocale() }) {
  return sequelize.transaction(async (transaction) => {
    const payment = await ScheduledPayment.findOne({
      where: { id: paymentId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new NotFoundError('Pagamento programmato non trovato');
    const inAttesaDiConferma = payment.stato === 'in_attesa'
      || (payment.tipo === 'entrata' && payment.stato === 'in_ritardo');
    if (!inAttesaDiConferma) throw new AppError('Questo pagamento non è più in attesa', 409);
    const account = await getActiveAccount(userId, payment.conto_id, transaction);
    const movement = await createMovement({
      userId, account, type: payment.tipo, amount: payment.importo,
      category: payment.categoria, description: payment.descrizione,
      date: paymentDate, transaction,
    });
    await payment.update({ stato: 'pagato', pagato_il: paymentDate, movimento_id: movement.id }, { transaction });
    if (payment.piano_id) {
      const remaining = await ScheduledPayment.count({
        where: { piano_id: payment.piano_id, stato: 'in_attesa' }, transaction,
      });
      if (remaining === 0) await PaymentPlan.update({ stato: 'completato' }, {
        where: { id: payment.piano_id, user_id: userId }, transaction,
      });
    }
    return { payment, movement, account };
  });
}

async function cancelScheduledPayment({ userId, paymentId }) {
  return sequelize.transaction(async (transaction) => {
    const payment = await ScheduledPayment.findOne({
      where: { id: paymentId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new NotFoundError('Pagamento programmato non trovato');
    if (!['in_attesa', 'in_ritardo'].includes(payment.stato)) {
      throw new AppError('È possibile annullare solo una scadenza ancora da gestire', 409);
    }
    if (payment.piano_id) throw new AppError('Per annullare una rata, annulla l’intero piano di pagamento', 409);
    await payment.update({ stato: 'annullato' }, { transaction });
    return payment;
  });
}

async function cancelInstallmentPlan({ userId, planId }) {
  return sequelize.transaction(async (transaction) => {
    const plan = await PaymentPlan.findOne({
      where: { id: planId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!plan) throw new NotFoundError('Piano di pagamento non trovato');
    if (plan.stato !== 'attivo') throw new AppError('Questo piano non è più attivo', 409);
    await ScheduledPayment.update({ stato: 'annullato' }, {
      where: { piano_id: plan.id, user_id: userId, stato: 'in_attesa' }, transaction,
    });
    await plan.update({ stato: 'annullato' }, { transaction });
    return plan;
  });
}

async function listScheduledPaymentContributions({ userId, paymentId }) {
  const payment = await ScheduledPayment.findOne({ where: { id: paymentId, user_id: userId } });
  if (!payment) throw new NotFoundError('Pagamento programmato non trovato');
  const contributions = await ScheduledPaymentContribution.findAll({
    where: { user_id: userId, pagamento_programmato_id: paymentId },
    order: [['data_contributo', 'ASC'], ['id', 'ASC']],
  });
  const contributedCents = contributions.reduce((sum, contribution) => (
    sum + centsOf(contribution.importo)
  ), 0);
  const plan = buildExpenseFundingPlan({
    payment,
    contributedCents,
    referenceDate: oggiLocale(),
  });
  return {
    paymentId: payment.id,
    contributed: plan.contributed,
    remaining: plan.remaining,
    writesAccountBalance: false,
    writesMovement: false,
    contributions: contributions.map((contribution) => ({
      id: contribution.id,
      amount: String(contribution.importo),
      date: contribution.data_contributo,
    })),
  };
}

async function addScheduledPaymentContribution({ userId, paymentId, amount, date }) {
  const amountCents = centsOf(amount);
  if (amountCents <= 0) throw new BadRequestError('L’importo da accantonare deve essere maggiore di zero');

  return sequelize.transaction(async (transaction) => {
    const payment = await ScheduledPayment.findOne({
      where: { id: paymentId, user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new NotFoundError('Pagamento programmato non trovato');
    if (payment.tipo !== 'uscita') throw new AppError('Puoi accantonare solo per una spesa programmata', 409);
    if (payment.stato !== 'in_attesa') throw new AppError('Questa spesa non è più in attesa', 409);
    if (payment.piano_id) throw new AppError('Gli accantonamenti sono disponibili solo per spese singole', 409);

    const contributions = await ScheduledPaymentContribution.findAll({
      where: { user_id: userId, pagamento_programmato_id: payment.id },
      transaction,
    });
    const contributedCents = contributions.reduce((sum, contribution) => (
      sum + centsOf(contribution.importo)
    ), 0);
    const remainingCents = Math.max(centsOf(payment.importo) - contributedCents, 0);
    if (amountCents > remainingCents) {
      throw new BadRequestError(`L’importo supera il residuo di €${fromCents(remainingCents)}`);
    }

    const contribution = await ScheduledPaymentContribution.create({
      user_id: userId,
      pagamento_programmato_id: payment.id,
      importo: fromCents(amountCents),
      data_contributo: date,
    }, { transaction });
    const totalContributedCents = contributedCents + amountCents;
    const plan = buildExpenseFundingPlan({
      payment,
      contributedCents: totalContributedCents,
      referenceDate: oggiLocale(),
    });
    return {
      paymentId: payment.id,
      contributed: plan.contributed,
      remaining: plan.remaining,
      writesAccountBalance: false,
      writesMovement: false,
      contribution: { id: contribution.id, amount: fromCents(amountCents), date: date },
    };
  });
}

module.exports = {
  calculateInstallmentPlan,
  createScheduledPayment,
  createInstallmentPlan,
  listScheduledPayments,
  confirmScheduledPayment,
  markScheduledIncomeLate,
  cancelScheduledPayment,
  cancelInstallmentPlan,
  listScheduledPaymentContributions,
  addScheduledPaymentContribution,
};
