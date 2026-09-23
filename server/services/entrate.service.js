const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { giornoLocale, sommaGiorni } = require('./notifiche/notificheTime');
const { classificaFinestra } = require('./finestraMesi.service');

const round2 = (value) => Math.round(value * 100) / 100;
const NATURE_ENTRATA = ['stipendio', 'pensione', 'compenso', 'bonus', 'regalo', 'rimborso', 'vendita', 'altro', 'sconosciuto'];
const PERIODICITA_ENTRATA = ['ricorrente', 'occasionale', 'sconosciuta'];
const nextMonth = (month) => sommaGiorni(`${month}-01`, 32).slice(0, 7);
const validMonth = (month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

/**
 * La finestra [da,a] contiene mesi civili interi. Ogni mese senza entrate è
 * uno zero osservato. Il coefficiente di variazione è deviazione standard
 * della popolazione / media; servono almeno tre mesi, inclusi quelli a zero.
 * Soglia di stabilità: CV <= 0.25. Se la media è zero, CV non è definito.
 *
 * Mese corrente e medie. Ogni mese porta `parziale: true` solo se è il mese
 * in corso a Roma: è l'unico ancora incompleto della finestra. Due medie
 * dichiarate, non una ambigua:
 * - `media_mensile`: sull'intera finestra, mese in corso compreso. Resta
 *   invariata perché è già consumata dall'endpoint entrate.
 * - `media_mensile_mesi_completi`: sui soli mesi civili completi, la stessa
 *   base che spese.service.js usa per la sua `media_mensile`. È questa — non
 *   la precedente — quella confrontabile con le spese e usabile nel cash
 *   flow. `null` quando nella finestra non c'è nessun mese completo: dato
 *   insufficiente, non zero.
 *
 * `stabilita` e `variabilita` usano invece i mesi civili completi osservati:
 * il mese corrente e il primo mese parziale non possono dimostrare stabilità.
 */
const riepilogoEntrateDaMovimenti = (movimenti, {
  da, a, now = new Date(), primoMovimento = null,
}) => {
  if (!validMonth(da) || !validMonth(a) || da > a) throw new Error('Periodo non valido');
  if (a > giornoLocale(now, 'Europe/Rome').slice(0, 7)) throw new Error('Periodo futuro non osservato');
  const meseCorrente = giornoLocale(now, 'Europe/Rome').slice(0, 7);
  const mesi = [];
  for (let month = da; month <= a; month = nextMonth(month)) {
    if (mesi.length >= 120) throw new Error('Periodo troppo lungo');
    mesi.push({
      mese: month,
      totale: 0,
      parziale: month === meseCorrente,
      // Scomposizione per periodicità del singolo mese: serve a chi calcola
      // una media della sola quota ricorrente sui mesi completi, senza
      // mescolarla con il mese in corso (vedi financialContext.service.js).
      quote: { ricorrente: 0, occasionale: 0, sconosciuta: 0 },
    });
  }

  const quote = { ricorrente: 0, occasionale: 0, sconosciuta: 0 };
  for (const movimento of movimenti) {
    if (movimento.tipo !== 'entrata') continue;
    const month = String(movimento.data).slice(0, 7);
    const bucket = mesi.find((entry) => entry.mese === month);
    if (!bucket) continue;
    const amount = Number(movimento.importo);
    if (!Number.isFinite(amount)) continue;
    bucket.totale += amount;
    const periodicita = ['ricorrente', 'occasionale'].includes(movimento.periodicita_entrata)
      ? movimento.periodicita_entrata : 'sconosciuta';
    quote[periodicita] += amount;
    bucket.quote[periodicita] += amount;
  }
  mesi.forEach((entry) => {
    entry.totale = round2(entry.totale);
    Object.keys(entry.quote).forEach((key) => { entry.quote[key] = round2(entry.quote[key]); });
  });
  Object.keys(quote).forEach((key) => { quote[key] = round2(quote[key]); });
  const totale = round2(mesi.reduce((sum, entry) => sum + entry.totale, 0));
  const media = totale / mesi.length;
  const finestra = classificaFinestra({
    mesiRichiesti: mesi.map((entry) => entry.mese),
    meseCorrente,
    primoMovimento: primoMovimento || `${da}-01`,
  });
  const mesiStabilita = mesi.filter((entry) => finestra.completi.includes(entry.mese));
  const totaleStabilita = mesiStabilita.reduce((sum, entry) => sum + entry.totale, 0);
  const mediaStabilita = mesiStabilita.length > 0 ? totaleStabilita / mesiStabilita.length : 0;
  const variabilita = mesiStabilita.length >= 3 && mediaStabilita > 0
    ? Math.sqrt(mesiStabilita.reduce((sum, entry) => sum + (entry.totale - mediaStabilita) ** 2, 0) / mesiStabilita.length) / mediaStabilita
    : null;

  const mesiCompleti = mesi.filter((entry) => !entry.parziale);
  const totaleCompleti = round2(mesiCompleti.reduce((sum, entry) => sum + entry.totale, 0));

  return {
    periodo: { da, a },
    totale,
    media_mensile: round2(media),
    mesi_completi: mesiCompleti.length,
    totale_mesi_completi: totaleCompleti,
    media_mensile_mesi_completi: mesiCompleti.length > 0
      ? round2(totaleCompleti / mesiCompleti.length) : null,
    quote,
    quote_percentuali: Object.fromEntries(Object.entries(quote).map(([key, value]) => [
      key, totale > 0 ? round2(value * 100 / totale) : 0,
    ])),
    mesi,
    periodo_stabilita: finestra.mesiPerLeMedie,
    mesi_stabilita: mesiStabilita.length,
    variabilita: variabilita === null ? null : round2(variabilita),
    stabilita: mesiStabilita.length < 3 ? 'insufficiente'
      : totaleStabilita === 0 ? 'nessuna_entrata'
        : variabilita <= 0.25 ? 'stabile' : 'variabile',
  };
};

const calcolaEntrate = async (userId, { da, a, now = new Date(), primoMovimento = null }) => {
  if (!Number.isInteger(Number(userId))) throw new Error('Utente non valido');
  if (!validMonth(da) || !validMonth(a) || da > a) throw new Error('Periodo non valido');
  if (a > giornoLocale(now, 'Europe/Rome').slice(0, 7)) throw new Error('Periodo futuro non osservato');
  const fine = sommaGiorni(`${nextMonth(a)}-01`, -1);
  const movimenti = await Movimento.findAll({
    where: { user_id: userId, tipo: 'entrata', data: { [Op.between]: [`${da}-01`, fine] } },
    attributes: ['tipo', 'importo', 'data', 'periodicita_entrata'],
  });
  return riepilogoEntrateDaMovimenti(movimenti, { da, a, now, primoMovimento });
};

module.exports = { NATURE_ENTRATA, PERIODICITA_ENTRATA, riepilogoEntrateDaMovimenti, calcolaEntrate };
