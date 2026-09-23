const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { giornoLocale, sommaGiorni } = require('./notifiche/notificheTime');

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
 */
const riepilogoEntrateDaMovimenti = (movimenti, { da, a, now = new Date() }) => {
  if (!validMonth(da) || !validMonth(a) || da > a) throw new Error('Periodo non valido');
  if (a > giornoLocale(now, 'Europe/Rome').slice(0, 7)) throw new Error('Periodo futuro non osservato');
  const mesi = [];
  for (let month = da; month <= a; month = nextMonth(month)) {
    if (mesi.length >= 120) throw new Error('Periodo troppo lungo');
    mesi.push({ mese: month, totale: 0 });
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
  }
  mesi.forEach((entry) => { entry.totale = round2(entry.totale); });
  Object.keys(quote).forEach((key) => { quote[key] = round2(quote[key]); });
  const totale = round2(mesi.reduce((sum, entry) => sum + entry.totale, 0));
  const media = totale / mesi.length;
  const variabilita = mesi.length >= 3 && media > 0
    ? Math.sqrt(mesi.reduce((sum, entry) => sum + (entry.totale - media) ** 2, 0) / mesi.length) / media
    : null;

  return {
    periodo: { da, a },
    totale,
    media_mensile: round2(media),
    quote,
    quote_percentuali: Object.fromEntries(Object.entries(quote).map(([key, value]) => [
      key, totale > 0 ? round2(value * 100 / totale) : 0,
    ])),
    mesi,
    variabilita: variabilita === null ? null : round2(variabilita),
    stabilita: mesi.length < 3 ? 'insufficiente'
      : totale === 0 ? 'nessuna_entrata'
        : variabilita <= 0.25 ? 'stabile' : 'variabile',
  };
};

const calcolaEntrate = async (userId, { da, a, now = new Date() }) => {
  if (!Number.isInteger(Number(userId))) throw new Error('Utente non valido');
  if (!validMonth(da) || !validMonth(a) || da > a) throw new Error('Periodo non valido');
  if (a > giornoLocale(now, 'Europe/Rome').slice(0, 7)) throw new Error('Periodo futuro non osservato');
  const fine = sommaGiorni(`${nextMonth(a)}-01`, -1);
  const movimenti = await Movimento.findAll({
    where: { user_id: userId, tipo: 'entrata', data: { [Op.between]: [`${da}-01`, fine] } },
    attributes: ['tipo', 'importo', 'data', 'periodicita_entrata'],
  });
  return riepilogoEntrateDaMovimenti(movimenti, { da, a, now });
};

module.exports = { NATURE_ENTRATA, PERIODICITA_ENTRATA, riepilogoEntrateDaMovimenti, calcolaEntrate };
