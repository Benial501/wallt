const { Op } = require('sequelize');
const { Conto, Obiettivo, Movimento } = require('../models');
const {
  getRomeDateParts, FREQUENZE_SUPPORTATE, periodoPerRicorrenza, whereRicorrenzaAttiva,
} = require('./ricorrenti.service');

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

// Orizzonte delle spese programmate (frequenza 'una_tantum'): quanto avanti
// nel tempo una data futura comincia già a pesare sul saldo effettivo. Non
// c'è un limite simmetrico all'indietro: una data già passata e mai
// addebitata è l'impegno più certo che esista (vedi calcolaLiquidita).
const GIORNI_ORIZZONTE_PROGRAMMATE = 30;

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
 *   (mensili, settimanali, annuali o una_tantum) di tipo 'uscita' il cui
 *   addebito non è ancora avvenuto (nessun Movimento con
 *   ricorrenza_origine_id=<id> e ricorrenza_periodo=<chiave di deduplica per
 *   quella frequenza — vedi periodoPerRicorrenza in ricorrenti.service.js,
 *   stessa chiave usata dal cron per l'idempotenza). Il saldo del conto non
 *   riflette ancora quell'uscita, quindi non è denaro davvero disponibile.
 *   Per 'una_tantum' (una spesa programmata con data fissa) la chiave è la
 *   data stessa e conta solo entro GIORNI_ORIZZONTE_PROGRAMMATE giorni da
 *   oggi (o già passata: una data scaduta e mai addebitata è l'impegno più
 *   certo che esista). Il filtro sullo stato viene da whereRicorrenzaAttiva()
 *   — la stessa clausola con cui il cron sceglie cosa addebitare: una
 *   ricorrenza sospesa o terminata non produrrà nessun movimento, quindi
 *   sottrarla dalla liquidità significherebbe bloccare denaro per un'uscita
 *   che non arriverà mai.
 *
 * saldo_conti resta la somma di TUTTI i conti attivi (compresi quelli di
 * tipo 'scommesse': restano nel patrimonio, CLAUDE.md Regola 12) e
 * liquidita_libera resta calcolata su quel totale — significato invariato per
 * chi già li consuma. saldo_ordinario, liquidita_allocabile e saldo_effettivo
 * invece partono dai soli conti visibili (saldo_conti_visibili): un conto
 * nascosto (Conto.nascosto) resta nel patrimonio ma esce da tutto ciò che
 * significa "spendibile". Nota: liquidita_allocabile alimenta
 * liquidity.allocatable in financialContext.service.js, quindi da qui in poi
 * Piano Smart non propone più di distribuire il denaro di un conto nascosto.
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
 *
 * saldo_effettivo è la stessa idea di liquidita_allocabile ma senza la
 * scomposizione ordinario/scommesse: parte da saldo_conti_visibili (tutti i
 * conti visibili, scommesse incluse) e sottrae lo stesso allocata+impegni.
 * È la risposta a "quanto posso davvero spendere", pensata per essere
 * mostrata in home accanto al patrimonio totale.
 */
async function calcolaLiquidita(userId, { data, transaction } = {}) {
  const riferimento = data ? new Date(data) : new Date();
  const current = getRomeDateParts(riferimento);

  const conti = await Conto.findAll({ where: { user_id: userId, attivo: true }, transaction });
  const saldo_conti = round2(conti.reduce((sum, c) => sum + toNumber(c.saldo), 0));

  // Un conto nascosto resta nel patrimonio (è denaro dell'utente) ma esce da
  // tutto ciò che significa "spendibile": è la sola differenza fra
  // saldo_conti e saldo_conti_visibili.
  const contiVisibili = conti.filter((c) => !c.nascosto);
  const saldo_conti_nascosti = round2(
    conti.filter((c) => c.nascosto).reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_conti_visibili = round2(saldo_conti - saldo_conti_nascosti);

  // I conti speciali si contano solo fra i visibili: un conto scommesse
  // nascosto è già stato tolto sopra, sottrarlo due volte falserebbe
  // saldo_ordinario.
  const saldo_conti_speciali = round2(
    contiVisibili.filter((c) => c.tipo === 'scommesse').reduce((sum, c) => sum + toNumber(c.saldo), 0),
  );
  const saldo_ordinario = round2(saldo_conti_visibili - saldo_conti_speciali);

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

  // Orizzonte delle spese programmate: 30 giorni avanti, nessun limite
  // indietro. Una data già passata e mai addebitata è l'impegno più certo
  // che esista, ed è il caso per cui il saldo effettivo è stato scritto.
  const limiteProgrammate = new Date(`${current.date}T00:00:00Z`);
  limiteProgrammate.setUTCDate(limiteProgrammate.getUTCDate() + GIORNI_ORIZZONTE_PROGRAMMATE);
  const limiteProgrammateISO = limiteProgrammate.toISOString().slice(0, 10);

  const candidati = ricorrenti
    .map((r) => ({ movimento: r, periodo: periodoPerRicorrenza(r, current) }))
    .filter(({ movimento, periodo }) => {
      if (!periodo) return false;
      if (movimento.ricorrente_frequenza !== 'una_tantum') return true;
      return movimento.ricorrente_data <= limiteProgrammateISO;
    });

  // Una sola query invece di una per ricorrenza: questo servizio entra in
  // GET /conti/patrimonio, che si apre a ogni visita della dashboard.
  // La coppia (origine, periodo) viene poi verificata esattamente sul Set:
  // il prodotto incrociato della IN non può produrre falsi positivi.
  const eseguiti = candidati.length
    ? await Movimento.findAll({
      where: {
        ricorrenza_origine_id: { [Op.in]: candidati.map((c) => c.movimento.id) },
        ricorrenza_periodo: { [Op.in]: candidati.map((c) => c.periodo) },
      },
      attributes: ['ricorrenza_origine_id', 'ricorrenza_periodo'],
      transaction,
    })
    : [];
  const giaEseguiti = new Set(
    eseguiti.map((e) => `${e.ricorrenza_origine_id}|${e.ricorrenza_periodo}`),
  );

  const impegni = candidati
    .filter(({ movimento, periodo }) => !giaEseguiti.has(`${movimento.id}|${periodo}`))
    .map(({ movimento }) => ({
      movimento_id: movimento.id,
      categoria: movimento.categoria,
      importo: round2(toNumber(movimento.importo)),
      giorno: movimento.ricorrente_giorno || 1,
      tipo: movimento.ricorrente_frequenza === 'una_tantum' ? 'programmata' : 'ricorrente',
      data: movimento.ricorrente_frequenza === 'una_tantum' ? movimento.ricorrente_data : null,
    }));
  const impegni_pertinenti = round2(impegni.reduce((sum, i) => sum + i.importo, 0));

  const liquidita_libera = round2(saldo_conti - liquidita_allocata - impegni_pertinenti);
  const liquidita_allocabile = round2(saldo_ordinario - liquidita_allocata - impegni_pertinenti);
  // Quanto l'utente può spendere davvero: i conti che considera spendibili,
  // meno il denaro già promesso a un obiettivo e le uscite già note.
  const saldo_effettivo = round2(saldo_conti_visibili - liquidita_allocata - impegni_pertinenti);

  return {
    saldo_conti,
    saldo_conti_nascosti,
    saldo_conti_visibili,
    saldo_ordinario,
    saldo_conti_speciali,
    liquidita_allocata,
    impegni_pertinenti,
    liquidita_libera,
    liquidita_allocabile,
    saldo_effettivo,
    obiettivi_allocati,
    impegni,
  };
}

module.exports = { calcolaLiquidita };
