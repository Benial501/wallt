const { Op } = require('sequelize');
const { Conto, PiattaformaScommesse } = require('../models');

const SCOMMESSE_CONTO_ICON = '🎰';
const SCOMMESSE_CONTO_COLOR = '#E17055';

const toNumber = (val) => parseFloat(val) || 0;

const nextContoOrdine = async (userId, transaction) => {
  const maxOrdine = await Conto.max('ordine', {
    where: { user_id: userId },
    transaction,
  });
  return (maxOrdine || 0) + 1;
};

const syncContoSaldoFromPiattaforma = async (piattaforma, transaction) => {
  if (!piattaforma?.conto_id) return;
  await Conto.update(
    { saldo: toNumber(piattaforma.saldo) },
    { where: { id: piattaforma.conto_id, user_id: piattaforma.user_id }, transaction },
  );
};

const findLinkedPiattaforma = async (userId, contoId, transaction) => {
  if (!contoId) return null;
  return PiattaformaScommesse.findOne({
    where: { user_id: userId, conto_id: contoId, attiva: true },
    transaction,
  });
};

const findLinkedConto = async (userId, contoId, transaction) => {
  if (!contoId) return null;
  return Conto.findOne({
    where: { id: contoId, user_id: userId, attivo: true },
    transaction,
  });
};

const findOrphanPiattaformaByName = async (userId, nome, transaction) => PiattaformaScommesse.findOne({
  where: {
    user_id: userId,
    nome,
    attiva: true,
    conto_id: { [Op.is]: null },
  },
  transaction,
});

const findOrphanContoScommesseByName = async (userId, nome, transaction) => {
  const conti = await Conto.findAll({
    where: { user_id: userId, tipo: 'scommesse', nome, attivo: true },
    transaction,
  });
  if (!conti.length) return null;

  const linkedIds = await PiattaformaScommesse.findAll({
    where: {
      user_id: userId,
      conto_id: { [Op.in]: conti.map((c) => c.id) },
      attiva: true,
    },
    attributes: ['conto_id'],
    transaction,
  });
  const linkedSet = new Set(linkedIds.map((p) => p.conto_id));
  return conti.find((c) => !linkedSet.has(c.id)) || null;
};

/**
 * Crea o collega una piattaforma scommesse al conto tipo "scommesse".
 */
const ensurePiattaformaForConto = async (conto, transaction, options = {}) => {
  if (!conto || conto.tipo !== 'scommesse') return null;

  const existing = await findLinkedPiattaforma(conto.user_id, conto.id, transaction);
  if (existing) {
    await existing.update({
      nome: conto.nome,
      saldo: toNumber(conto.saldo),
    }, { transaction });
    return existing;
  }

  const orphan = await findOrphanPiattaformaByName(conto.user_id, conto.nome, transaction);
  if (orphan) {
    await orphan.update({
      conto_id: conto.id,
      saldo: toNumber(conto.saldo),
      ...(options.limite_mensile !== undefined ? { limite_mensile: options.limite_mensile } : {}),
    }, { transaction });
    return orphan;
  }

  return PiattaformaScommesse.create({
    user_id: conto.user_id,
    nome: conto.nome,
    saldo: toNumber(conto.saldo),
    limite_mensile: options.limite_mensile ?? null,
    conto_id: conto.id,
    attiva: true,
  }, { transaction });
};

/**
 * Crea o collega un conto tipo "scommesse" alla piattaforma.
 */
const ensureContoForPiattaforma = async (piattaforma, transaction, options = {}) => {
  if (!piattaforma) return null;

  const linked = await findLinkedConto(piattaforma.user_id, piattaforma.conto_id, transaction);
  if (linked) {
    await linked.update({
      nome: piattaforma.nome,
      saldo: toNumber(piattaforma.saldo),
    }, { transaction });
    return linked;
  }

  const orphan = await findOrphanContoScommesseByName(
    piattaforma.user_id,
    piattaforma.nome,
    transaction,
  );
  if (orphan) {
    await orphan.update({
      saldo: toNumber(piattaforma.saldo),
      icona: options.icona || orphan.icona || SCOMMESSE_CONTO_ICON,
      colore: options.colore || orphan.colore || SCOMMESSE_CONTO_COLOR,
    }, { transaction });
    await piattaforma.update({ conto_id: orphan.id }, { transaction });
    return orphan;
  }

  const conto = await Conto.create({
    user_id: piattaforma.user_id,
    nome: piattaforma.nome,
    tipo: 'scommesse',
    saldo: toNumber(piattaforma.saldo),
    icona: options.icona || SCOMMESSE_CONTO_ICON,
    colore: options.colore || SCOMMESSE_CONTO_COLOR,
    ordine: await nextContoOrdine(piattaforma.user_id, transaction),
    attivo: true,
  }, { transaction });

  await piattaforma.update({ conto_id: conto.id }, { transaction });
  return conto;
};

const syncContoFromPiattaformaMeta = async (piattaforma, updateData, transaction) => {
  if (!piattaforma?.conto_id) return;
  const contoUpdate = {};
  if (updateData.nome !== undefined) contoUpdate.nome = updateData.nome;
  if (updateData.saldo !== undefined) contoUpdate.saldo = updateData.saldo;
  if (!Object.keys(contoUpdate).length) return;
  await Conto.update(contoUpdate, {
    where: { id: piattaforma.conto_id, user_id: piattaforma.user_id },
    transaction,
  });
};

const syncPiattaformaFromContoMeta = async (conto, updateData, transaction) => {
  if (!conto || conto.tipo !== 'scommesse') return;
  const piattaforma = await findLinkedPiattaforma(conto.user_id, conto.id, transaction);
  if (!piattaforma) return;
  const piattaformaUpdate = {};
  if (updateData.nome !== undefined) piattaformaUpdate.nome = updateData.nome;
  if (updateData.saldo !== undefined) piattaformaUpdate.saldo = updateData.saldo;
  if (!Object.keys(piattaformaUpdate).length) return;
  await piattaforma.update(piattaformaUpdate, { transaction });
};

const deactivateLinkedPiattaforma = async (conto, transaction) => {
  if (!conto || conto.tipo !== 'scommesse') return;
  const piattaforma = await findLinkedPiattaforma(conto.user_id, conto.id, transaction);
  if (piattaforma) {
    await piattaforma.update({ attiva: false, conto_id: null }, { transaction });
  }
};

const deactivateLinkedConto = async (piattaforma, transaction) => {
  if (!piattaforma?.conto_id) return;
  await Conto.update(
    { attivo: false },
    { where: { id: piattaforma.conto_id, user_id: piattaforma.user_id }, transaction },
  );
};

/**
 * Collega record esistenti non ancora associati (utile dopo migration o dati legacy).
 */
const backfillUserLinks = async (userId, transaction = null) => {
  const queryOpts = transaction ? { transaction } : {};

  const piattaformeOrfane = await PiattaformaScommesse.findAll({
    where: { user_id: userId, attiva: true, conto_id: { [Op.is]: null } },
    ...queryOpts,
  });

  for (const piattaforma of piattaformeOrfane) {
    await ensureContoForPiattaforma(piattaforma, transaction);
  }

  const contiScommesse = await Conto.findAll({
    where: { user_id: userId, tipo: 'scommesse', attivo: true },
    ...queryOpts,
  });

  for (const conto of contiScommesse) {
    const linked = await findLinkedPiattaforma(userId, conto.id, transaction);
    if (!linked) {
      await ensurePiattaformaForConto(conto, transaction);
    }
  }
};

module.exports = {
  SCOMMESSE_CONTO_ICON,
  SCOMMESSE_CONTO_COLOR,
  ensurePiattaformaForConto,
  ensureContoForPiattaforma,
  syncContoSaldoFromPiattaforma,
  syncContoFromPiattaformaMeta,
  syncPiattaformaFromContoMeta,
  deactivateLinkedPiattaforma,
  deactivateLinkedConto,
  backfillUserLinks,
};
