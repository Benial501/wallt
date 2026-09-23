const { Op } = require('sequelize');
const { Conto, Obiettivo, Movimento } = require('../models');
const {
  getRomeDateParts, FREQUENZE_SUPPORTATE, periodoPerFrequenza, whereRicorrenzaAttiva,
} = require('./ricorrenti.service');

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
 * - impegni_pertinenti: somma degli importi dei Movimento ricorrenti ATTIVI
 *   (mensili, settimanali o annuali) di tipo 'uscita' il cui addebito per il
 *   periodo corrente non è ancora avvenuto (nessun Movimento con
 *   ricorrenza_origine_id=<id> e ricorrenza_periodo=<periodo corrente per
 *   quella frequenza — vedi periodoPerFrequenza in ricorrenti.service.js,
 *   stessa chiave usata dal cron per l'idempotenza). Il saldo del conto non
 *   riflette ancora quell'uscita, quindi non è denaro davvero disponibile.
 *   Il filtro sullo stato viene da whereRicorrenzaAttiva() — la stessa
 *   clausola con cui il cron sceglie cosa addebitare: una ricorrenza sospesa
 *   o terminata non produrrà nessun movimento, quindi sottrarla dalla
 *   liquidità significherebbe bloccare denaro per un'uscita che non arriverà
 *   mai.
 *
 * saldo_conti resta la somma di TUTTI i conti attivi (compresi quelli di
 * tipo 'scommesse': restano nel patrimonio, CLAUDE.md Regola 12) — significato
 * invariato per chi già lo consuma. saldo_ordinario e saldo_conti_speciali lo
 * scompongono senza sostituirlo: campi aggiuntivi, non una ridefinizione.
 *
 * liquidita_allocabile è più conservativo di liquidita_libera: sottrae
 * allocata+impegni dal solo saldo_ordinario, non dal totale. Motivo:
 * Obiettivo non ha conto_id (nessuna riga viene mai scritta per legarlo a un
 * conto specifico), quindi non è possibile sapere con certezza se il
 * progresso di un obiettivo "vive" su un conto ordinario o su un conto
 * scommesse — un'ambiguità reale, non un dettaglio. Attribuire comunque
 * l'allocazione al saldo ordinario è la scelta esplicita qui: proporre di
 * allocare un obiettivo di risparmio usando il saldo di un conto scommesse
 * non avrebbe senso senza un prelievo di mezzo. Può risultare negativo: non
 * viene troncato a zero, perché un negativo è il segnale reale che
 * l'allocato+impegnato supera quanto siede sui conti ordinari (es. il
 * progresso di un obiettivo è di fatto maturato su un conto scommesse).
 */
async function calcolaLiquidita(userId, { data, transaction } = {}) {
  const riferimento = data ? new Date(data) : new Date();
  const current = getRomeDateParts(riferimento);

  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));
  const saldo_conti_speciali = round2(
    conti.filter((c) => c.tipo === 'scommesse').reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_ordinario = round2(saldo_conti - saldo_conti_speciali);

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
      ...whereRicorrenzaAttiva(),
      ricorrente_frequenza: { [Op.in]: FREQUENZE_SUPPORTATE },
    },
    transaction,
  });

  const impegni = [];
  for (const r of ricorrenti) {
    const periodoCorrente = periodoPerFrequenza(r.ricorrente_frequenza, current);
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
  const liquidita_allocabile = round2(saldo_ordinario - liquidita_allocata - impegni_pertinenti);

  return {
    saldo_conti,
    saldo_ordinario,
    saldo_conti_speciali,
    liquidita_allocata,
    impegni_pertinenti,
    liquidita_libera,
    liquidita_allocabile,
    obiettivi_allocati,
    impegni,
  };
}

module.exports = { calcolaLiquidita };
