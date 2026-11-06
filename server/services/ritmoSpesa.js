/**
 * Quali uscite del mese misurano il ritmo di spesa. Puro: riceve i movimenti
 * già filtrati (uscite del mese corrente fino a oggi, non ricorrenti) e
 * restituisce quanto entra nel ritmo e cosa resta fuori, con il motivo.
 *
 * Restare fuori dal ritmo non toglie un'uscita da nessun saldo: è già
 * avvenuta e il saldo la riporta. Significa solo che la previsione non la
 * moltiplica per i giorni che restano (vedi `constants/ritmoSpesa.js`).
 */
const {
  CATEGORIE_FISSE, CATEGORIE_VERSAMENTO, UNA_TANTUM_GIORNI_DI_SPESA,
  UNA_TANTUM_SOGLIA_MINIMA, UNA_TANTUM_SOGLIA_SENZA_STORICO, GIORNI_MEDI_MESE,
} = require('../constants/ritmoSpesa');

const FISSE = new Set(CATEGORIE_FISSE);
const VERSAMENTI = new Set(CATEGORIE_VERSAMENTO);
const centesimi = (v) => Math.round((parseFloat(v) || 0) * 100);

/** Fuori dal ritmo per categoria: un versamento o una spesa fissa. */
const categoriaFuoriDalRitmo = (categoria) => VERSAMENTI.has(categoria) || FISSE.has(categoria);

/**
 * La spesa variabile media dei mesi completi: per ogni mese la somma delle
 * categorie che entrano nel ritmo. `null` senza mesi completi.
 */
function mediaVariabileMensile(mesiCompleti) {
  if (!mesiCompleti.length) return null;
  const totale = mesiCompleti.reduce((somma, mese) => somma + (mese.categorie || [])
    .filter((c) => !categoriaFuoriDalRitmo(c.categoria))
    .reduce((s, c) => s + centesimi(c.importo), 0), 0);
  return Math.round(totale / mesiCompleti.length) / 100;
}

/** La soglia in euro sopra la quale un'uscita è una spesa una tantum. */
function sogliaUnaTantum(mediaVariabile) {
  if (mediaVariabile === null || mediaVariabile === undefined) return UNA_TANTUM_SOGLIA_SENZA_STORICO;
  const soglia = Math.round((mediaVariabile / GIORNI_MEDI_MESE) * UNA_TANTUM_GIORNI_DI_SPESA * 100) / 100;
  return Math.max(soglia, UNA_TANTUM_SOGLIA_MINIMA);
}

// L'ordine conta: un affitto programmato è prima di tutto un pagamento
// programmato, e una spesa fissa grande non è una spesa una tantum.
const motivoEsclusione = (m, { movimentiProgrammati, sogliaCentesimi }) => {
  if (movimentiProgrammati.has(m.id)) return 'pagamento_programmato';
  if (VERSAMENTI.has(m.categoria)) return 'versamento';
  if (FISSE.has(m.categoria)) return 'spesa_fissa';
  if (centesimi(m.importo) > sogliaCentesimi) return 'una_tantum';
  return null;
};

function classificaSpeseDelMese(movimenti, { soglia, movimentiProgrammati = new Set() }) {
  const sogliaCentesimi = centesimi(soglia);
  let totale = 0;
  let totaleEscluse = 0;
  const escluse = [];
  movimenti.forEach((m) => {
    const importo = centesimi(m.importo);
    const motivo = motivoEsclusione(m, { movimentiProgrammati, sogliaCentesimi });
    if (!motivo) {
      totale += importo;
      return;
    }
    totaleEscluse += importo;
    escluse.push({
      id: m.id,
      motivo,
      descrizione: m.descrizione || null,
      categoria: m.categoria || null,
      importo: importo / 100,
      data: String(m.data).slice(0, 10),
    });
  });
  return { totale: totale / 100, totaleEscluse: totaleEscluse / 100, escluse };
}

module.exports = { classificaSpeseDelMese, sogliaUnaTantum, mediaVariabileMensile };
