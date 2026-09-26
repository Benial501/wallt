const { Conto } = require('../models');
const { calcolaMesiCopertura } = require('./fondoSicurezza.service');

/**
 * Punto sorgente unico del fondo di emergenza (CLAUDE.md Regola 20): chi deve
 * sapere "qual è il fondo, quanto contiene, quanti mesi copre, quanto manca"
 * chiama questo file e non ricalcola niente per conto proprio.
 *
 * Il fondo è un CONTO, non un obiettivo. Un Conto con tipo 'emergenza' e
 * nascosto = true: da `nascosto` arriva gratis tutto il comportamento
 * richiesto — il conto resta nel patrimonio totale (Regola 12) ma esce dal
 * saldo effettivo mostrato in home e dal capitale allocabile di Piano Smart,
 * perché liquidita.service.js tratta così ogni conto nascosto. Per questo
 * l'introduzione del fondo non ha richiesto nessuna modifica al calcolo dei
 * saldi.
 *
 * Perché NON c'è anche un Obiettivo accanto al conto: `Obiettivo.importo_attuale`
 * entra in `liquidita_allocata`, quindi conto nascosto + obiettivo avrebbero
 * sottratto lo stesso euro due volte dal saldo effettivo. È esattamente il
 * difetto che la Regola 20 esiste per prevenire. Fino a settembre 2026 il fondo
 * era modellato come Obiettivo con tipo_obiettivo 'fondo_sicurezza', mai
 * raggiungibile dall'interfaccia: vedi
 * docs/superpowers/specs/2026-09-26-fondo-emergenza-design.md.
 */

// Il discriminante del fondo. Segue la convenzione già in uso per i conti
// 'scommesse' (Regola 5) invece di aggiungere una colonna booleana.
const TIPO_CONTO_FONDO = 'emergenza';

// Le soglie proponibili, in mesi di spese essenziali. Un elenco chiuso: sono
// le uniche scelte offerte dall'interfaccia, e la validazione non ne accetta
// altre.
const MESI_TARGET_AMMESSI = [3, 6, 12];
const MESI_TARGET_DEFAULT = 3;

const NOME_DEFAULT = 'Fondo di emergenza';

const toNumber = (val) => parseFloat(val) || 0;
const round2 = (val) => Math.round(val * 100) / 100;

/** Vero se questo conto è il fondo di emergenza. Unico predicato: chi deve
 * applicare i vincoli del fondo (niente entrate/uscite dirette, `nascosto`
 * non disattivabile) lo interroga invece di confrontare la stringa a mano. */
const isContoFondo = (conto) => !!conto && conto.tipo === TIPO_CONTO_FONDO;

/** Il conto fondo dell'utente, o null. Solo fra i conti attivi: un fondo
 * soft-eliminato (attivo: false) non è più il fondo, e non deve impedire di
 * crearne uno nuovo. */
const trovaContoFondo = (userId, { transaction } = {}) => Conto.findOne({
  where: { user_id: userId, tipo: TIPO_CONTO_FONDO, attivo: true },
  order: [['id', 'ASC']],
  transaction,
});

/**
 * Lo stato completo del fondo, in una forma sola, usata sia dall'API sia dal
 * contesto finanziario di Piano Smart.
 *
 * Risponde anche quando il fondo NON esiste (`esiste: false`): in quel caso
 * l'importo è 0 e la copertura viene comunque calcolata, così la card in home
 * può dire quanto costerebbe un mese di sicurezza prima che il conto esista,
 * senza una seconda chiamata.
 *
 * `soglia_euro` non è mai un dato salvato: è mesi_target × spese essenziali
 * mensili, ricalcolato qui a ogni lettura. Se le spese essenziali non sono
 * calcolabili (storico assente o categorie non classificate) resta null, e
 * `mancante` con lei: meglio nessun numero che un numero inventato.
 */
async function descriviFondo(userId, { riferimento = new Date(), transaction } = {}) {
  const conto = await trovaContoFondo(userId, { transaction });
  const importo = conto ? round2(toNumber(conto.saldo)) : 0;
  const mesiTarget = conto && conto.mesi_sicurezza_target !== null
    ? Number(conto.mesi_sicurezza_target)
    : null;

  const copertura = await calcolaMesiCopertura({ userId, importoFondo: importo, riferimento });
  const speseEssenziali = copertura.spese_essenziali_mensili;
  const sogliaEuro = mesiTarget !== null && speseEssenziali
    ? round2(mesiTarget * speseEssenziali)
    : null;

  return {
    esiste: !!conto,
    conto: conto ? {
      id: conto.id,
      nome: conto.nome,
      saldo: importo,
      nascosto: conto.nascosto,
      icona: conto.icona,
      colore: conto.colore,
    } : null,
    importo,
    mesi_target: mesiTarget,
    soglia_euro: sogliaEuro,
    // Quanto manca per raggiungere la soglia. Mai negativo: superata la soglia
    // il fondo non "manca" di nulla.
    mancante: sogliaEuro === null ? null : round2(Math.max(sogliaEuro - importo, 0)),
    copertura,
  };
}

module.exports = {
  TIPO_CONTO_FONDO,
  MESI_TARGET_AMMESSI,
  MESI_TARGET_DEFAULT,
  NOME_DEFAULT,
  isContoFondo,
  trovaContoFondo,
  descriviFondo,
};
