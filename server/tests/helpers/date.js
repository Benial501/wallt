/**
 * Date relative a «oggi» per le suite di test.
 *
 * Le medie finanziarie contano solo i mesi civili completi e decidono qual è il
 * mese in corso nel fuso applicativo (vedi services/finestraMesi.service.js):
 * una spesa datata nel mese sbagliato non fa fallire la propria riga, cambia la
 * media e fa fallire un'asserzione lontana, e solo in certi giorni dell'anno.
 */
const { oggiLocale, sommaMesi, inizioMese } = require('../../utils/dateRome');

/**
 * 'YYYY-MM-01' del mese civile precedente a quello in corso a Roma.
 *
 * Non con `d.setMonth(d.getMonth() - 1)`: il 31 ottobre diventa «31 settembre»,
 * cioè il 1° ottobre, e la spesa finisce nel mese in corso. `toISOString()` ci
 * aggiungeva un secondo scarto, perché legge il mese in UTC anche nelle ore in
 * cui a Roma è già cominciato quello nuovo.
 */
const primoGiornoMeseScorso = () => inizioMese(sommaMesi(oggiLocale(), -1));

/**
 * Ferma il solo `Date` all'istante dato: i timer restano veri, altrimenti il
 * driver di Postgres non risponde più. A fine test serve `jest.useRealTimers()`.
 */
const fermaOrologio = (istante) => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'setTimeout', 'clearImmediate', 'clearInterval', 'clearTimeout'],
  }).setSystemTime(new Date(istante));
};

module.exports = { primoGiornoMeseScorso, fermaOrologio };
