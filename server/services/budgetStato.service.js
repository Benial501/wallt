const { Op } = require('sequelize');
const { ProfiloUtente, Movimento, Conto } = require('../models');
const { muoveSaldo } = require('./ricorrenti.service');
const { list: elencoCategorie } = require('./categorie.service');
const { CATEGORIE_DEFAULT, isCategoriaSistema } = require('../constants/categorie');
const { VOCI, CATEGORIE_VOCE_FISSA, MESI_SUGGERIMENTO_MODELLO } = require('../constants/budget');
const { obiettiviInCentesimi } = require('./budgetModello');
const { aggregaPerVoce, voceDellaCategoria } = require('./budgetMacro');
const { scegliConsiglio } = require('./budgetConsiglio');
const { elencoMesi, classificaFinestra } = require('./finestraMesi.service');
const { fineMese } = require('../utils/dateRome');

/**
 * Stato del mese del budget a tre voci (Bisogni, Desideri, Futuro).
 *
 * È l'unico calcolo: lo leggono l'API (`GET /api/budget/stato`), le notifiche
 * di budget e i suggerimenti delle Analisi. Due copie della stessa formula
 * finirebbero per divergere (CLAUDE.md, Regola 20). Quale voce conti un
 * movimento lo decide services/budgetMacro.js, la frase del consulente
 * services/budgetConsiglio.js: qui si leggono i dati e si mettono insieme.
 *
 * Sola lettura: il budget non scrive mai movimenti, saldi o trasferimenti.
 */

const euro = (centesimi) => Math.round(centesimi) / 100;

const ESSENZIALITA_CATALOGO = new Map(
  CATEGORIE_DEFAULT.filter((c) => c.tipo === 'uscita').map((c) => [c.id, c.essenzialita]),
);

const percentualeUsata = (usato, obiettivo) => (obiettivo > 0 ? Math.round((usato * 100) / obiettivo) : 0);

/** Movimenti che possono contare nel budget, in un intervallo di date. Una
 * ricorrenza è una regola, non una spesa avvenuta: conta solo quando il cron
 * ne genera l'occorrenza (`muoveSaldo`, Regola 11). */
const movimentiDelPeriodo = async (userId, da, a) => {
  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      data: { [Op.between]: [da, a] },
      tipo: { [Op.in]: ['uscita', 'trasferimento'] },
    },
    order: [['data', 'ASC'], ['id', 'ASC']],
  });
  return movimenti.filter(muoveSaldo).map((m) => m.get({ plain: true }));
};

/**
 * Vero se negli ultimi tre mesi completi i Bisogni hanno superato ogni volta
 * l'obiettivo di oggi. Un mese precedente al primo movimento non è uno zero
 * osservato (finestraMesi.service.js): con meno di tre mesi completi la
 * risposta è no.
 */
const bisogniOltreNeiMesiPrecedenti = async ({ userId, mese, obiettivoBisogni, contesto }) => {
  const primo = await Movimento.min('data', { where: { user_id: userId } });
  const mesiRichiesti = elencoMesi(mese, MESI_SUGGERIMENTO_MODELLO + 1).slice(0, MESI_SUGGERIMENTO_MODELLO);
  const { completi } = classificaFinestra({ mesiRichiesti, meseCorrente: mese, primoMovimento: primo || null });
  if (completi.length < MESI_SUGGERIMENTO_MODELLO) return false;

  const movimenti = await movimentiDelPeriodo(userId, `${completi[0]}-01`, fineMese(`${completi[completi.length - 1]}-01`));
  return completi.every((m) => {
    const delMese = movimenti.filter((mov) => String(mov.data).slice(0, 7) === m);
    return aggregaPerVoce(delMese, contesto).bisogni.centesimi > obiettivoBisogni;
  });
};

const dettaglioCategorie = (perCategoria, attive) => [...perCategoria.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([categoria, centesimi]) => {
    const predefinita = ESSENZIALITA_CATALOGO.has(categoria);
    return {
      categoria,
      importo: euro(centesimi),
      // Una categoria archiviata o nascosta non si sposta: la rotta delle
      // categorie la rifiuterebbe, e l'utente l'ha già tolta dalle sue.
      spostabile: !CATEGORIE_VOCE_FISSA[categoria] && attive.has(categoria),
      predefinita,
      essenzialita_catalogo: predefinita ? ESSENZIALITA_CATALOGO.get(categoria) : null,
    };
  });

/**
 * @param {{userId:number, oggi:string}} params - `oggi` nel formato
 *   'YYYY-MM-DD', già nel fuso giusto: decide il mese e i giorni rimanenti.
 * @returns {Promise<null|object>} null se l'utente non ha scelto un piano.
 */
const calcolaStatoBudget = async ({ userId, oggi }) => {
  const profilo = await ProfiloUtente.findOne({ where: { user_id: userId } });
  if (!profilo || !profilo.budget_modello) return null;

  const percentuali = {
    bisogni: profilo.budget_pct_bisogni,
    desideri: profilo.budget_pct_desideri,
    futuro: profilo.budget_pct_futuro,
  };
  const entrata = profilo.entrata_mensile === null ? null : parseFloat(profilo.entrata_mensile);
  const mese = oggi.slice(0, 7);
  const ultimoGiorno = fineMese(oggi);

  const [movimenti, conti, categorie] = await Promise.all([
    movimentiDelPeriodo(userId, `${mese}-01`, ultimoGiorno),
    Conto.findAll({ where: { user_id: userId }, attributes: ['id', 'tipo'] }),
    // Con le archiviate: una categoria eliminata con spese nel mese resta
    // nella voce della sua essenzialità, invece di finire fra i Desideri come
    // «non classificata».
    elencoCategorie(userId, { includeArchived: true }),
  ]);

  const uscite = categorie.filter((c) => c.tipo === 'uscita');
  const contesto = {
    tipoConto: new Map(conti.map((c) => [c.id, c.tipo])),
    essenzialitaPerCategoria: new Map(uscite.map((c) => [c.id, c.essenzialita])),
  };
  const attive = new Set(uscite.filter((c) => c.attiva !== false).map((c) => c.id));

  const aggregato = aggregaPerVoce(movimenti, contesto);
  const obiettivi = obiettiviInCentesimi(percentuali, entrata);
  const entrataCentesimi = VOCI.reduce((s, v) => s + obiettivi[v], 0);

  const bisogniOltre = entrataCentesimi > 0 && aggregato.bisogni.centesimi > obiettivi.bisogni;
  const bisogniOltreDaTreMesi = bisogniOltre
    ? await bisogniOltreNeiMesiPrecedenti({ userId, mese, obiettivoBisogni: obiettivi.bisogni, contesto })
    : false;

  const giorniRimanenti = Number(ultimoGiorno.slice(8, 10)) - Number(oggi.slice(8, 10));

  const consiglio = scegliConsiglio({
    entrataCentesimi,
    modello: profilo.budget_modello,
    giorniRimanenti,
    bisogniOltreDaTreMesi,
    voci: {
      bisogni: { obiettivo: obiettivi.bisogni, usato: aggregato.bisogni.centesimi },
      desideri: {
        obiettivo: obiettivi.desideri,
        usato: aggregato.desideri.centesimi,
        perCategoria: aggregato.desideri.perCategoria,
      },
      futuro: { obiettivo: obiettivi.futuro, usato: aggregato.futuro.centesimi },
    },
  });
  ['eccedenza', 'mancante', 'restante_desideri'].forEach((campo) => {
    if (campo in consiglio.dati) consiglio.dati[campo] = euro(consiglio.dati[campo]);
  });

  const riepilogo = (voce) => ({
    obiettivo: euro(obiettivi[voce]),
    usato: euro(aggregato[voce].centesimi),
    restante: euro(obiettivi[voce] - aggregato[voce].centesimi),
    percentuale_usata: percentualeUsata(aggregato[voce].centesimi, obiettivi[voce]),
  });

  // Ciò che spiega «cosa racchiude» una voce: le categorie attive della voce
  // senza movimenti nel mese. Restano fuori quelle di sistema (WALLT le
  // scrive da sé) e quelle a voce fissa, che non dipendono dall'essenzialità.
  const senzaSpese = (voce) => uscite
    .filter((c) => c.attiva !== false
      && !isCategoriaSistema(c.id)
      && !CATEGORIE_VOCE_FISSA[c.id]
      && !aggregato[voce].perCategoria.has(c.id)
      && voceDellaCategoria(c.id, contesto.essenzialitaPerCategoria) === voce)
    .map((c) => c.id);

  return {
    modello: profilo.budget_modello,
    percentuali,
    entrata,
    mese,
    giorni_rimanenti: giorniRimanenti,
    voci: {
      bisogni: {
        ...riepilogo('bisogni'),
        categorie: dettaglioCategorie(aggregato.bisogni.perCategoria, attive),
        categorie_senza_spese: senzaSpese('bisogni'),
      },
      desideri: {
        ...riepilogo('desideri'),
        categorie: dettaglioCategorie(aggregato.desideri.perCategoria, attive),
        categorie_senza_spese: senzaSpese('desideri'),
      },
      futuro: {
        ...riepilogo('futuro'),
        movimenti: aggregato.futuro.movimenti.map(({ centesimi, ...m }) => ({ ...m, importo: euro(centesimi) })),
      },
    },
    consiglio,
  };
};

module.exports = { calcolaStatoBudget };
