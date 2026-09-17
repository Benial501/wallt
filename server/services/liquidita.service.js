const { Conto, Obiettivo, Movimento } = require('../models');
const { getRomeDateParts } = require('./ricorrenti.service');

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

/**
 * Overlay di sola lettura: nessun euro viene spostato, nessun sottoconto
 * viene creato. Serve solo a rispondere "quanto è davvero libero" senza far
 * contare due volte lo stesso importo.
 *
 * - liquidita_allocata: somma di Obiettivo.importo_attuale per gli obiettivi
 *   NON completati. Oggi un obiettivo non ha conto_id e il suo
 *   importo_attuale non viene mai sottratto dal saldo dei conti (verificato
 *   in obiettivi.controller.js#addContributo) — senza questo overlay lo
 *   stesso denaro risulterebbe libero due volte: una volta sul conto, una
 *   volta come progresso dell'obiettivo. Un obiettivo completato non blocca
 *   più liquidità: il suo scopo è stato raggiunto.
 * - impegni_pertinenti: somma degli importi dei Movimento ricorrenti mensili
 *   di tipo 'uscita' il cui addebito per il periodo corrente non è ancora
 *   avvenuto (nessun Movimento con ricorrenza_origine_id=<id> e
 *   ricorrenza_periodo=<periodo corrente>). Il saldo del conto non riflette
 *   ancora quell'uscita, quindi non è denaro davvero disponibile.
 */
async function calcolaLiquidita(userId, { data = new Date().toISOString().split('T')[0], transaction } = {}) {
  const dataDate = new Date(data);
  const romeDateParts = getRomeDateParts(dataDate);
  const periodoCorrente = romeDateParts.period;

  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));

  const obiettiviAttivi = await Obiettivo.findAll({
    where: { user_id: userId, completato: false },
    transaction,
  });
  const liquidita_allocata = round2(obiettiviAttivi.reduce((sum, o) => sum + toNumber(o.importo_attuale), 0));
  const obiettivi_allocati = obiettiviAttivi.map((o) => ({
    id: o.id,
    nome: o.nome,
    importo_attuale: round2(toNumber(o.importo_attuale)),
  }));

  const ricorrenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      ricorrente: true,
      ricorrente_frequenza: 'mensile',
    },
    transaction,
  });

  const impegni = [];
  for (const r of ricorrenti) {
    // eslint-disable-next-line no-await-in-loop
    const eseguitoQuestoPeriodo = await Movimento.findOne({
      where: { ricorrenza_origine_id: r.id, ricorrenza_periodo: periodoCorrente },
      transaction,
    });
    if (!eseguitoQuestoPeriodo) {
      impegni.push({
        movimento_id: r.id,
        categoria: r.categoria,
        importo: round2(toNumber(r.importo)),
        giorno: r.ricorrente_giorno || 1,
      });
    }
  }
  const impegni_pertinenti = round2(impegni.reduce((sum, i) => sum + i.importo, 0));

  const liquidita_libera = round2(saldo_conti - liquidita_allocata - impegni_pertinenti);

  return {
    saldo_conti,
    liquidita_allocata,
    impegni_pertinenti,
    liquidita_libera,
    obiettivi_allocati,
    impegni,
  };
}

module.exports = { calcolaLiquidita };
