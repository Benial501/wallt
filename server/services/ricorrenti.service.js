const cron = require('node-cron');
const { Op } = require('sequelize');
const { Movimento, Conto, sequelize } = require('../models');
const logger = require('../utils/logger');

// Guardia di rientranza: impedisce che due esecuzioni sovrapposte del job
// (es. un secondo tick di node-cron mentre la precedente esecuzione è ancora
// in corso, o un trigger manuale mentre gira già quello schedulato) processino
// in parallelo lo stesso movimento ricorrente, rischiando un doppio addebito
// prima che la prima esecuzione abbia fatto il commit che il controllo "già
// creato" si aspetta di trovare.
let isRunning = false;

async function processaRicorrenti() {
  if (isRunning) {
    logger.warn('Recurring transactions job già in esecuzione: esecuzione sovrapposta ignorata');
    return;
  }
  isRunning = true;
  try {
    await runProcessaRicorrenti();
  } finally {
    isRunning = false;
  }
}

async function runProcessaRicorrenti() {
  const oggi = new Date();
  const giornoOggi = oggi.getDate();
  const meseOggi = oggi.getMonth() + 1;
  const annoOggi = oggi.getFullYear();

  logger.info('Recurring transactions job started');

  const processedByUser = new Map();

  try {
    const ricorrenti = await Movimento.findAll({
      where: {
        ricorrente: true,
        ricorrente_frequenza: 'mensile',
      },
    });

    for (const movimento of ricorrenti) {
      const giornoTarget = movimento.ricorrente_giorno || 1;

      if (giornoOggi !== giornoTarget) continue;

      // Il movimento generato ha descrizione `${descrizione} (automatico)`
      // (vedi Movimento.create più sotto): il controllo di duplicazione deve
      // cercare ESATTAMENTE quella stringa, non la descrizione originale del
      // ricorrente (bug precedente: confrontava la descrizione sbagliata,
      // quindi non trovava mai un "già creato" e il job duplicava il
      // movimento — con saldo scalato due volte — a ogni riesecuzione nello
      // stesso giorno).
      const descrizioneGenerata = `${movimento.descrizione} (automatico)`;
      const giaCreato = await Movimento.findOne({
        where: {
          user_id: movimento.user_id,
          categoria: movimento.categoria,
          descrizione: descrizioneGenerata,
          conto_id: movimento.conto_id,
          ricorrente: false,
          data: {
            [Op.between]: [
              new Date(annoOggi, meseOggi - 1, 1),
              new Date(annoOggi, meseOggi, 0),
            ],
          },
        },
      });

      if (giaCreato) continue;

      const t = await sequelize.transaction();
      try {
        const conto = await Conto.findByPk(movimento.conto_id, { transaction: t });

        if (!conto) {
          await t.rollback();
          continue;
        }

        if (movimento.tipo === 'uscita' && conto.tipo !== 'carta_credito') {
          if (parseFloat(conto.saldo) < parseFloat(movimento.importo)) {
            await t.rollback();
            logger.warn('Insufficient balance for recurring transaction', {
              userId: movimento.user_id,
              movimentoId: movimento.id,
            });
            continue;
          }
          conto.saldo = parseFloat(conto.saldo) - parseFloat(movimento.importo);
        } else if (movimento.tipo === 'entrata') {
          conto.saldo = parseFloat(conto.saldo) + parseFloat(movimento.importo);
        } else if (movimento.tipo === 'uscita') {
          conto.saldo = parseFloat(conto.saldo) - parseFloat(movimento.importo);
        }

        await conto.save({ transaction: t });

        await Movimento.create({
          user_id: movimento.user_id,
          conto_id: movimento.conto_id,
          tipo: movimento.tipo,
          importo: movimento.importo,
          categoria: movimento.categoria,
          descrizione: `${movimento.descrizione} (automatico)`,
          data: new Date(),
          ricorrente: false,
        }, { transaction: t });

        await t.commit();
        processedByUser.set(
          movimento.user_id,
          (processedByUser.get(movimento.user_id) || 0) + 1,
        );
      } catch (err) {
        await t.rollback();
        logger.error('Recurring transaction failed', {
          err,
          userId: movimento.user_id,
          movimentoId: movimento.id,
        });
      }
    }

    if (processedByUser.size === 0) {
      logger.info('Processed 0 recurring transactions');
    } else {
      for (const [userId, count] of processedByUser.entries()) {
        logger.info(`Processed ${count} recurring transactions for user ${userId}`);
      }
    }
  } catch (err) {
    logger.error('Recurring transactions job failed', { err });
  }
}

function avviaCronRicorrenti() {
  cron.schedule('0 9 * * *', () => {
    processaRicorrenti();
  }, {
    timezone: 'Europe/Rome',
  });
  logger.info('Recurring transactions cron scheduled (daily 09:00 Europe/Rome)');
}

module.exports = { processaRicorrenti, avviaCronRicorrenti };
