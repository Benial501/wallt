const cron = require('node-cron');
const { Op } = require('sequelize');
const { Movimento, Conto, sequelize } = require('../models');
const logger = require('../utils/logger');

const ROME_TIME_ZONE = 'Europe/Rome';
const FREQUENZE_SUPPORTATE = ['mensile', 'settimanale', 'annuale', 'una_tantum'];
const STATI_RICORRENZA = ['attiva', 'sospesa', 'terminata'];
let activeRun = null;

const ricorrenzaAttiva = (movimento) => movimento.ricorrente === true
  && movimento.stato_ricorrenza === 'attiva';

/**
 * L'unica definizione di "ricorrenza che genererà davvero un addebito", in
 * forma di clausola Sequelize. La usano il cron (che crea i movimenti) e
 * liquidita.service.js (che li considera impegni non ancora addebitati):
 * devono concordare per costruzione, altrimenti la liquidità sottrae uscite
 * che nessuno addebiterà mai.
 *
 * `stato_ricorrenza` è NOT NULL DEFAULT 'attiva' dalla migrazione
 * 20260923000029: i record legacy creati prima della colonna sono già
 * 'attiva' a livello di schema, quindi qui non serve (e non va aggiunto) un
 * OR su NULL — sarebbe una tolleranza per uno stato che il database non può
 * contenere.
 */
const whereRicorrenzaAttiva = () => ({ ricorrente: true, stato_ricorrenza: 'attiva' });

/**
 * Se una riga di movimento muove davvero denaro sul conto.
 *
 * Una ricorrenza è una REGOLA, non un movimento avvenuto: il denaro resta sul
 * conto finché il cron non crea la sua occorrenza. Vale per ogni frequenza —
 * una spesa programmata ('una_tantum') è una promessa per la sua data, una
 * mensile lo è per ogni mese — ed è esattamente ciò che la UI dichiara:
 * «Crei una regola: WALLT registra da sola il movimento a ogni scadenza»
 * (client/src/components/ricorrenti/RicorrenteForm.vue).
 *
 * Sta qui, accanto alle altre definizioni della semantica delle ricorrenze,
 * perché la leggono sia chi scrive i saldi (movimenti.controller.js: create,
 * update e delete) sia chi li riepiloga (conti.controller.js, per la
 * variazione del mese): se divergessero, il patrimonio e la sua variazione
 * racconterebbero due storie diverse dello stesso euro. Il saldo effettivo
 * conta già ogni ricorrenza attiva una volta, come impegno non ancora
 * addebitato (liquidita.service.js): addebitarla anche al salvataggio
 * significava pagarla due volte e mostrarla tre.
 *
 * Le occorrenze che il cron genera hanno ricorrente: false, quindi muovono
 * denaro: sono loro il movimento vero.
 */
const muoveSaldo = (movimento) => !movimento.ricorrente;

/**
 * Stato di una ricorrenza letta da un record: qualunque valore fuori da
 * STATI_RICORRENZA viene ricondotto ad 'attiva', lo stesso default dello
 * schema. Serve ai conteggi che partono da una riga già letta, dove non c'è
 * una WHERE di mezzo (vedi financialContext.service.js#riepilogoRicorrenti).
 */
const normalizzaStatoRicorrenza = (valore) => (STATI_RICORRENZA.includes(valore) ? valore : 'attiva');

const cambiaStatoRicorrenza = (attuale, prossimo) => {
  if (!STATI_RICORRENZA.includes(prossimo)) throw new Error('Stato ricorrenza non valido');
  if (attuale === 'terminata' && prossimo !== 'terminata') {
    throw new Error('Una ricorrenza terminata non può essere riattivata');
  }
  return prossimo;
};

/** Settimana ISO-8601 (lun-dom) del giorno UTC dato. */
const getIsoWeekInfo = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = (date.getUTCDay() + 6) % 7; // 0=lun..6=dom
  date.setUTCDate(date.getUTCDate() - isoWeekday + 3); // giovedì della settimana ISO
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const isoWeek = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return { isoYear, isoWeek };
};

const getRomeDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);

  // Giorno della settimana ISO (1=lunedì..7=domenica), calcolato sulla data
  // civile di Roma già estratta sopra: usare un Date UTC "flat" evita che il
  // fuso del processo (UTC su Vercel) faccia slittare il giorno.
  const jsWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = jsWeekday === 0 ? 7 : jsWeekday;
  const { isoYear, isoWeek } = getIsoWeekInfo(year, month, day);

  return {
    day,
    month,
    year,
    weekday,
    date: `${values.year}-${values.month}-${values.day}`,
    // `period` (YYYY-MM) è il nome storico, già letto da liquidita.service.js
    // e fondoSicurezza.service.js: non rinominarlo senza aggiornare entrambi.
    period: `${values.year}-${values.month}`,
    periodoAnnuale: String(year),
    periodoSettimanale: `${isoYear}-W${String(isoWeek).padStart(2, '0')}`,
  };
};

const isUniqueConstraintError = (error) => error?.name === 'SequelizeUniqueConstraintError';

/** Chiave di deduplica del periodo corrente per una data frequenza. */
const periodoPerFrequenza = (frequenza, current) => {
  if (frequenza === 'mensile') return current.period;
  if (frequenza === 'annuale') return current.periodoAnnuale;
  if (frequenza === 'settimanale') return current.periodoSettimanale;
  return null;
};

/**
 * Chiave di deduplica di una singola ricorrenza. Per le frequenze
 * periodiche è il periodo corrente; per una spesa programmata è la sua
 * data, che è già una chiave unica di per sé (si addebita una volta sola).
 * Sta qui e non in liquidita.service.js perché il cron e la liquidità
 * devono usare la stessa chiave per costruzione: se divergessero, la
 * liquidità sottrarrebbe uscite già addebitate.
 */
const periodoPerRicorrenza = (movimento, current) => (
  movimento.ricorrente_frequenza === 'una_tantum'
    ? (movimento.ricorrente_data || null)
    : periodoPerFrequenza(movimento.ricorrente_frequenza, current)
);

/** Decide se oggi è il giorno giusto per un movimento ricorrente, e la chiave di deduplica del periodo. */
const valutaOccorrenza = (movimento, current) => {
  // La chiave di periodo viene da periodoPerRicorrenza: è l'unica
  // definizione condivisa con liquidita.service.js (vedi il suo commento),
  // così cron e liquidità non possono divergere su cosa identifica
  // un'occorrenza.
  const periodo = periodoPerRicorrenza(movimento, current);
  // Una spesa programmata è dovuta dal suo giorno in poi, non solo quel
  // giorno: se il cron non gira (deploy, downtime) viene recuperata al
  // passaggio successivo invece di sparire in silenzio. L'indice unico
  // (ricorrenza_origine_id, ricorrenza_periodo) garantisce che avvenga una
  // volta sola.
  if (movimento.ricorrente_frequenza === 'una_tantum') {
    return { dovuto: Boolean(periodo) && current.date >= periodo, periodo };
  }
  // Come una spesa programmata, una mensile è dovuta dal suo giorno in poi e
  // non solo quel giorno: il cron gira alle 09:00, quindi una regola creata
  // dopo (o un mese saltato per deploy, downtime o saldo insufficiente) non
  // avrebbe mai l'addebito del mese in corso. Il periodo (YYYY-MM) resta la
  // chiave che lo limita a uno: l'indice unico
  // (ricorrenza_origine_id, ricorrenza_periodo) non può lasciarne passare due.
  // Settimanale e annuale restano sull'uguaglianza: lì una finestra "dal
  // giorno in poi" non ha un significato altrettanto definito.
  if (movimento.ricorrente_frequenza === 'mensile') {
    const giornoTarget = movimento.ricorrente_giorno || 1;
    return { dovuto: current.day >= giornoTarget, periodo };
  }
  if (movimento.ricorrente_frequenza === 'annuale') {
    const giornoTarget = movimento.ricorrente_giorno || 1;
    const meseTarget = movimento.ricorrente_mese || 1;
    return { dovuto: current.day === giornoTarget && current.month === meseTarget, periodo };
  }
  if (movimento.ricorrente_frequenza === 'settimanale') {
    const giornoTarget = movimento.ricorrente_giorno || 1;
    return { dovuto: current.weekday === giornoTarget, periodo };
  }
  return { dovuto: false, periodo: null };
};

async function runProcessaRicorrenti(now) {
  const current = getRomeDateParts(now);
  const summary = { processed: 0, skipped: 0, failed: 0 };

  logger.info('Recurring transactions job started');

  const ricorrenti = await Movimento.findAll({
    where: {
      ...whereRicorrenzaAttiva(),
      ricorrente_frequenza: { [Op.in]: FREQUENZE_SUPPORTATE },
    },
  });

  for (const movimento of ricorrenti) {
    const { dovuto, periodo } = valutaOccorrenza(movimento, current);
    if (!dovuto || !['entrata', 'uscita'].includes(movimento.tipo)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const outcome = await sequelize.transaction(async (transaction) => {
        const origine = await Movimento.findByPk(movimento.id, {
          transaction, lock: transaction.LOCK.UPDATE,
        });
        if (!origine || !ricorrenzaAttiva(origine)) return 'skipped';
        const conto = await Conto.findByPk(movimento.conto_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!conto) return 'skipped';

        const existing = await Movimento.findOne({
          where: {
            ricorrenza_origine_id: movimento.id,
            ricorrenza_periodo: periodo,
          },
          transaction,
        });
        if (existing) return 'skipped';

        const saldo = Number(conto.saldo);
        const importo = Number(movimento.importo);
        if (movimento.tipo === 'uscita' && conto.tipo !== 'carta_credito' && saldo < importo) {
          logger.warn('Insufficient balance for recurring transaction', {
            userId: movimento.user_id,
            movimentoId: movimento.id,
          });
          return 'skipped';
        }

        conto.saldo = movimento.tipo === 'entrata' ? saldo + importo : saldo - importo;
        await conto.save({ transaction });

        await Movimento.create({
          user_id: movimento.user_id,
          conto_id: movimento.conto_id,
          tipo: movimento.tipo,
          importo: movimento.importo,
          categoria: movimento.categoria,
          descrizione: `${movimento.descrizione} (automatico)`,
          data: current.date,
          ricorrente: false,
          natura_entrata: movimento.natura_entrata,
          periodicita_entrata: movimento.periodicita_entrata,
          ricorrenza_origine_id: movimento.id,
          ricorrenza_periodo: periodo,
        }, { transaction });

        // Una spesa programmata si esegue una volta sola: chiuderla qui,
        // nella stessa transazione del movimento, la toglie dagli impegni
        // della liquidità (whereRicorrenzaAttiva la esclude) senza lasciare
        // una riga che continua a bloccare denaro già speso.
        if (origine.ricorrente_frequenza === 'una_tantum') {
          origine.stato_ricorrenza = 'terminata';
          await origine.save({ transaction });
        }

        return 'processed';
      });

      summary[outcome] += 1;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        logger.error('Recurring transaction failed', {
          err: error,
          userId: movimento.user_id,
          movimentoId: movimento.id,
        });
      }
    }
  }

  logger.info('Recurring transactions job completed', summary);
  return summary;
}

async function processaRicorrenti(now = new Date()) {
  if (activeRun) return activeRun;

  activeRun = runProcessaRicorrenti(now);
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

function avviaCronRicorrenti() {
  cron.schedule('0 9 * * *', () => {
    processaRicorrenti().catch((error) => {
      logger.error('Recurring transactions job failed', { err: error });
    });
  }, {
    timezone: 'Europe/Rome',
  });
  logger.info('Recurring transactions cron scheduled (daily 09:00 Europe/Rome)');
}

module.exports = {
  processaRicorrenti, avviaCronRicorrenti, getRomeDateParts, FREQUENZE_SUPPORTATE, periodoPerFrequenza,
  periodoPerRicorrenza,
  STATI_RICORRENZA, ricorrenzaAttiva, cambiaStatoRicorrenza,
  whereRicorrenzaAttiva, normalizzaStatoRicorrenza, muoveSaldo,
};
