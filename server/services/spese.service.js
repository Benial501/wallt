/**
 * Aggregazioni centralizzate sulle uscite: totale, media mensile, storico
 * mensile, distribuzione per livello di necessità. Riusa buildPeriodi
 * (confrontoPeriodi.service.js, già corretto per il fuso Europe/Rome) e
 * aggregaPerEssenzialita (essenzialita.service.js) invece di reimplementarli.
 *
 * I trasferimenti (`tipo: 'trasferimento'`) sono sempre fuori per
 * costruzione: ogni query qui filtra `tipo: 'uscita'`, un trasferimento non
 * ha mai quel tipo (CLAUDE.md Regola 2).
 */
const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { list: listCategories } = require('./categorie.service');
const { aggregaPerEssenzialita } = require('./essenzialita.service');
const { ultimiNMesi } = require('./confrontoPeriodi.service');
const { finestraGiorni, oggiLocale, FUSO_DEFAULT } = require('../utils/dateRome');

const round2 = (v) => Math.round(v * 100) / 100;
const toNumber = (v) => parseFloat(v) || 0;

const GIORNI_STANDARD = new Set([30, 90, 180]);

/**
 * Finestra standard [da, a], giorni civili inclusivi che terminano oggi
 * (Europe/Rome). Niente "media mensile" per queste finestre: 30/90/180
 * giorni non sono mesi di calendario, dividerle per un multiplo di 30
 * inventerebbe un mese che non esiste (vedi aggregaSpeseGiorni).
 */
const finestraGiorniStandard = (giorni, riferimento = oggiLocale(FUSO_DEFAULT)) => {
  if (!GIORNI_STANDARD.has(giorni)) {
    throw Object.assign(new Error(`Finestra non supportata: ${giorni} giorni`), { statusCode: 400 });
  }
  return finestraGiorni(riferimento, giorni);
};

const totaliPerCategoriaESomma = (movimenti) => {
  const totaliPerCategoria = {};
  movimenti.forEach((m) => {
    const cat = m.categoria || 'altro_uscita';
    totaliPerCategoria[cat] = (totaliPerCategoria[cat] || 0) + toNumber(m.importo);
  });
  const totale = round2(Object.values(totaliPerCategoria).reduce((s, v) => s + v, 0));
  return { totaliPerCategoria, totale };
};

/**
 * Aggregazione spese su una finestra a giorni fissi (30/90/180). Nessuna
 * media mensile per il motivo sopra: solo totale e distribuzione per
 * necessità. Zero osservato (nessun movimento) è distinto da un errore: la
 * risposta è comunque `totale: 0`, mai un'eccezione o un valore inventato.
 */
async function aggregaSpeseGiorni(userId, giorni, riferimento) {
  const { da, a } = finestraGiorniStandard(giorni, riferimento);
  const movimenti = await Movimento.findAll({
    where: { user_id: userId, tipo: 'uscita', data: { [Op.between]: [da, a] } },
    attributes: ['categoria', 'importo'],
  });
  const { totaliPerCategoria, totale } = totaliPerCategoriaESomma(movimenti);

  const categorie = await listCategories(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const byNecessity = aggregaPerEssenzialita(totaliPerCategoria, categorieUscita);

  return {
    da, a, giorni, totale, byNecessity,
  };
}

/**
 * Storico mensile + aggregazioni su N mesi solari (mese corrente incluso,
 * parziale). Una sola query sull'intero arco (stesso pattern di
 * getConfrontoMesi in analisi.controller.js: N round-trip singoli sarebbero
 * uno spreco).
 *
 * `media_mensile` usa solo i mesi COMPLETI (esclude il mese corrente
 * parziale, come già fa fondoSicurezza.service.js per lo stesso motivo: un
 * mese a metà farebbe apparire la spesa media più bassa di quanto sia
 * davvero). `null` se non c'è nessun mese completo nella finestra —
 * "storico insufficiente", non zero.
 */
async function aggregaSpeseMesi(userId, numMesi, riferimento = new Date()) {
  const periodi = ultimiNMesi(numMesi, riferimento);
  const meseCorrente = oggiLocale(FUSO_DEFAULT, riferimento).slice(0, 7);

  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      data: { [Op.between]: [periodi[0].da, periodi[periodi.length - 1].a] },
    },
    attributes: ['data', 'categoria', 'importo'],
  });

  const totaliPerPeriodo = new Map(periodi.map((p) => [p.chiave, {}]));
  movimenti.forEach((m) => {
    const giorno = String(m.data).slice(0, 10);
    const periodo = periodi.find((p) => giorno >= p.da && giorno <= p.a);
    if (!periodo) return;
    const cat = m.categoria || 'altro_uscita';
    const bucket = totaliPerPeriodo.get(periodo.chiave);
    bucket[cat] = (bucket[cat] || 0) + toNumber(m.importo);
  });

  const storico = periodi.map((p) => {
    const { totale } = totaliPerCategoriaESomma(
      Object.entries(totaliPerPeriodo.get(p.chiave)).map(([categoria, importo]) => ({ categoria, importo })),
    );
    return {
      periodo: p.chiave, da: p.da, a: p.a, totale, parziale: p.chiave === meseCorrente,
    };
  });

  const mesiCompleti = storico.filter((m) => !m.parziale);
  const totaleCompleti = round2(mesiCompleti.reduce((s, m) => s + m.totale, 0));
  const media_mensile = mesiCompleti.length > 0 ? round2(totaleCompleti / mesiCompleti.length) : null;
  const totale = round2(storico.reduce((s, m) => s + m.totale, 0));

  const totaliPerCategoriaGlobale = {};
  Object.values(Object.fromEntries(totaliPerPeriodo)).forEach((bucket) => {
    Object.entries(bucket).forEach(([cat, importo]) => {
      totaliPerCategoriaGlobale[cat] = (totaliPerCategoriaGlobale[cat] || 0) + importo;
    });
  });
  const categorie = await listCategories(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const byNecessity = aggregaPerEssenzialita(totaliPerCategoriaGlobale, categorieUscita);

  return {
    storico,
    totale,
    media_mensile,
    mesi_completi: mesiCompleti.length,
    byNecessity,
  };
}

module.exports = { aggregaSpeseGiorni, aggregaSpeseMesi, finestraGiorniStandard };
