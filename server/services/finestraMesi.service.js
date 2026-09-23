/**
 * La finestra di mesi civili su cui si calcolano le medie confrontabili di
 * entrate, spese e cash flow — un solo punto sorgente, sul modello della
 * Regola 20 di CLAUDE.md.
 *
 * Tre finestre distinte, che prima di questo modulo venivano confuse:
 *
 * - RICHIESTA: gli N mesi che il chiamante ha chiesto (`historyMonths`).
 *   Esiste sempre, anche per un utente senza un solo movimento.
 * - OSSERVATA: la parte della richiesta in cui l'utente ha davvero uno
 *   storico, cioè dal mese del suo primo movimento in poi. I mesi di
 *   calendario precedenti non sono "storico a zero": non esistono per lui, e
 *   riempirli di zeri abbassa qualunque media.
 * - MESI PER LE MEDIE: i soli mesi civili COMPLETI dentro la finestra
 *   osservata. Esclude il mese corrente (ancora in corso) e il primo mese di
 *   storico quando le registrazioni non partono dal suo giorno 1.
 *
 * Perché il primo mese è sospetto: se il primo movimento in assoluto è datato
 * 15 luglio, dei primi quattordici giorni di luglio non si sa niente —
 * potevano esserci spese non registrate. Contare luglio come mese completo
 * significherebbe dividere per 1 un mese osservato a metà. Il giorno 1 è
 * l'unico indizio disponibile che le registrazioni coprano il mese intero.
 *
 * LIMITE DICHIARATO: nemmeno con il primo movimento al giorno 1 si può
 * sapere se l'utente abbia registrato *tutto* ciò che ha speso in quel mese.
 * WALLT non ha collegamento bancario: la completezza delle registrazioni non
 * è osservabile, solo la loro presenza. Quello che questo modulo garantisce è
 * che nessun mese venga contato come completo senza almeno un indizio che lo
 * sia; non che i mesi completi siano esaustivi.
 *
 * Volutamente NON si usa la data di registrazione dell'account come prova di
 * copertura: un account aperto a gennaio e usato da marzo produrrebbe due
 * mesi "completi" a zero spese — esattamente gli zeri fittizi che questo
 * modulo esiste per eliminare.
 */

const validMese = (mese) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mese));

/** Mese civile precedente a 'YYYY-MM', aritmetica di calendario pura. */
const mesePrecedente = (mese) => {
  const [anno, m] = String(mese).split('-').map(Number);
  return m === 1 ? `${anno - 1}-12` : `${anno}-${String(m - 1).padStart(2, '0')}`;
};

/**
 * Gli `numMesi` mesi civili consecutivi che terminano in `meseFinale`
 * ('YYYY-MM'), dal più vecchio al più recente.
 */
const elencoMesi = (meseFinale, numMesi) => {
  if (!validMese(meseFinale)) throw new Error(`Mese non valido: ${meseFinale}`);
  if (!Number.isInteger(numMesi) || numMesi < 1) throw new Error('numMesi deve essere un intero >= 1');
  const mesi = [];
  let corrente = String(meseFinale);
  for (let i = 0; i < numMesi; i += 1) {
    mesi.unshift(corrente);
    corrente = mesePrecedente(corrente);
  }
  return mesi;
};

const intervallo = (mesi) => (mesi.length
  ? { da: mesi[0], a: mesi[mesi.length - 1] }
  : null);

/**
 * @param {Object} params
 * @param {string[]} params.mesiRichiesti - mesi 'YYYY-MM' ordinati (vedi elencoMesi)
 * @param {string} params.meseCorrente - 'YYYY-MM' del mese in corso a Roma
 * @param {?string} params.primoMovimento - 'YYYY-MM-DD' del primo movimento
 *   mai registrato dall'utente, `null` se non ne ha nessuno
 * @returns {{osservati:string[], completi:string[], primoMeseParziale:boolean,
 *   richiesta:{da:string,a:string}, osservata:?{da:string,a:string},
 *   mesiPerLeMedie:{da:?string,a:?string,quantita:number}}}
 */
const classificaFinestra = ({ mesiRichiesti, meseCorrente, primoMovimento }) => {
  if (!Array.isArray(mesiRichiesti) || mesiRichiesti.length === 0) {
    throw new Error('mesiRichiesti non può essere vuoto');
  }
  if (!validMese(meseCorrente)) throw new Error(`meseCorrente non valido: ${meseCorrente}`);

  const primoMese = primoMovimento ? String(primoMovimento).slice(0, 7) : null;
  const osservati = primoMese
    ? mesiRichiesti.filter((m) => m >= primoMese)
    : [];

  // Il primo mese di storico è parziale solo quando cade DENTRO la finestra
  // richiesta: se le registrazioni cominciano prima, il primo mese richiesto
  // è già coperto da movimenti precedenti e non è troncato all'inizio.
  const primoMeseNellaFinestra = primoMese !== null && primoMese >= mesiRichiesti[0];
  const giornoPrimoMovimento = primoMovimento ? Number(String(primoMovimento).slice(8, 10)) : null;
  const primoMeseParziale = primoMeseNellaFinestra && giornoPrimoMovimento !== 1;

  const completi = osservati.filter((m) => {
    if (m >= meseCorrente) return false;
    if (primoMeseParziale && m === primoMese) return false;
    return true;
  });

  const perLeMedie = intervallo(completi);
  return {
    osservati,
    completi,
    primoMeseParziale,
    meseCorrente,
    richiesta: { da: mesiRichiesti[0], a: mesiRichiesti[mesiRichiesti.length - 1] },
    osservata: intervallo(osservati),
    mesiPerLeMedie: {
      da: perLeMedie ? perLeMedie.da : null,
      a: perLeMedie ? perLeMedie.a : null,
      quantita: completi.length,
    },
  };
};

module.exports = { elencoMesi, classificaFinestra, mesePrecedente };
