const cron = require('node-cron');
const { Movimento, Conto, sequelize } = require('../models');
const logger = require('../utils/logger');

const ROME_TIME_ZONE = 'Europe/Rome';
let activeRun = null;

const getRomeDateParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    day: Number(values.day),
    date: `${values.year}-${values.month}-${values.day}`,
    period: `${values.year}-${values.month}`,
  };
};

const isUniqueConstraintError = (error) => error?.name === 'SequelizeUniqueConstraintError';

async function runProcessaRicorrenti(now) {
  const current = getRomeDateParts(now);
  const summary = { processed: 0, skipped: 0, failed: 0 };

  logger.info('Recurring transactions job started');

  const ricorrenti = await Movimento.findAll({
    where: {
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
    },
  });

  for (const movimento of ricorrenti) {
    const giornoTarget = movimento.ricorrente_giorno || 1;
    if (current.day !== giornoTarget || !['entrata', 'uscita'].includes(movimento.tipo)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const outcome = await sequelize.transaction(async (transaction) => {
        const conto = await Conto.findByPk(movimento.conto_id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!conto) return 'skipped';

        const existing = await Movimento.findOne({
          where: {
            ricorrenza_origine_id: movimento.id,
            ricorrenza_periodo: current.period,
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
          ricorrenza_origine_id: movimento.id,
          ricorrenza_periodo: current.period,
        }, { transaction });

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

module.exports = { processaRicorrenti, avviaCronRicorrenti };
