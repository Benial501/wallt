const { descriviMovimento, prossimoRinnovo } = require('./abbonamentiRilevamento');
const { STATI } = require('../constants/abbonamenti');

/**
 * Quali rinnovi di abbonamento pesano sul saldo effettivo (CLAUDE.md Regola 28,
 * novembre 2026). Puro: riceve righe e movimenti, restituisce impegni nella
 * stessa forma di `calcolaLiquidita`.
 *
 * Un rinnovo conta solo se nessun'altra strada lo conta già:
 * - l'abbonamento ha una programmazione legata (`movimento_ricorrente_id`):
 *   pesa già come ricorrenza, contarlo qui lo sottrarrebbe due volte;
 * - l'addebito è già arrivato (un movimento dello stesso servizio, o
 *   `ultimo_addebito_data`, da `GIORNI_ANTICIPO` prima del rinnovo in poi):
 *   il saldo del conto l'ha già scalato;
 * - l'utente ha saltato proprio quel rinnovo (`rinnovo_saltato`).
 * Senza giorno del rinnovo non sappiamo quando arriva, quindi non lo contiamo.
 */
const GIORNI_ANTICIPO = 5;

const sommaGiorni = (iso, giorni) => {
  const data = new Date(`${iso}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + giorni);
  return data.toISOString().slice(0, 10);
};

const servizioDi = (riga) => riga.servizio_id || riga.chiave;

const rinnoviDaCoprire = (righe, movimenti, oggi, limite) => {
  const addebiti = movimenti
    .map((m) => ({ data: String(m.data).slice(0, 10), descritto: descriviMovimento(m) }))
    .filter((m) => m.descritto);
  return righe.flatMap((riga) => {
    if (riga.stato !== STATI.ATTIVO || !riga.giorno_rinnovo || riga.movimento_ricorrente_id) return [];
    const rinnovo = prossimoRinnovo(riga, oggi);
    if (!rinnovo || rinnovo > limite) return [];
    if (riga.rinnovo_saltato && String(riga.rinnovo_saltato).slice(0, 10) === rinnovo) return [];
    const da = sommaGiorni(rinnovo, -GIORNI_ANTICIPO);
    if (riga.ultimo_addebito_data && String(riga.ultimo_addebito_data).slice(0, 10) >= da) return [];
    const servizio = servizioDi(riga);
    if (addebiti.some((m) => m.data >= da
      && (m.descritto.servizio_id || m.descritto.chiave) === servizio)) return [];
    return [{
      movimento_id: null,
      abbonamento_id: riga.id,
      conto_id: riga.conto_id ?? null,
      categoria: 'abbonamenti',
      descrizione: riga.nome,
      importo: Math.round(Number(riga.costo) * 100) / 100,
      giorno: Number(rinnovo.slice(8, 10)),
      tipo: 'abbonamento',
      data: rinnovo,
    }];
  });
};

module.exports = { rinnoviDaCoprire, GIORNI_ANTICIPO };
