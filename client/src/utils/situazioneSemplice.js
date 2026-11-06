/**
 * Le frasi della versione semplice di «La tua situazione».
 *
 * Nessuna metrica nuova: ogni numero arriva già calcolato da
 * `GET /piano-smart-v2/current-situation`. Qui si sceglie soltanto quale dato
 * mostrare e con quali parole, in modo che chi apre la pagina per la prima
 * volta capisca cosa sta leggendo senza conoscere il vocabolario finanziario.
 * Le uniche operazioni sono somme e raggruppamenti di righe già presenti
 * nella risposta, fatte in centesimi interi.
 */
import { importoInCentesimi, centesimiInImporto } from './pianoSmart.js';

const numero = (valore) => {
  if (valore === null || valore === undefined || valore === '') return null;
  const n = Number(valore);
  return Number.isFinite(n) ? n : null;
};

/**
 * Chi non ha ancora registrato nessun movimento vede una pagina d'avvio
 * invece di zeri e trattini: sono quelli i «numeri messi lì a caso».
 */
export function situazioneVuota(situazione) {
  return !situazione?.dataQuality?.firstMovementDate;
}

/** I passi per far funzionare la pagina, con quelli già fatti spuntati. */
export function passiIniziali(situazione) {
  const liquidita = numero(situazione?.current?.liquidity);
  const haMovimenti = !situazioneVuota(situazione);
  const haSpeseFisse = (situazione?.cashFlowTimeline ?? []).some((item) => item.direction === 'uscita')
    || (situazione?.upcoming?.items ?? []).length > 0;
  return [
    { chiave: 'conto', testo: 'Aggiungi il tuo conto e quanto c’è sopra', fatto: (liquidita ?? 0) > 0, to: '/conti' },
    { chiave: 'spese', testo: 'Segna le tue spese, o importa l’estratto conto', fatto: haMovimenti, to: '/movimenti' },
    { chiave: 'fisse', testo: 'Aggiungi le spese fisse: affitto, bollette, abbonamenti', fatto: haSpeseFisse, to: '/funzionalita/situazione/programmate' },
  ];
}

/**
 * Lo stato di Oggi in una frase e un tono (`bene`, `attenzione`, `male`,
 * `neutro`). Lo stato vero lo decide il server (`horizon.stato`); la
 * previsione di fine mese aggiunge solo il «come finirai».
 */
export function statoOggi(situazione, { euro, data }) {
  const h = situazione?.horizon ?? {};
  const fineMese = numero(situazione?.forecast?.endOfMonthAvailable);
  const sopraRitmo = situazione?.current?.paceStatus === 'sopra_il_ritmo';

  if (h.stato === 'scaduto') return { tono: 'attenzione', testo: 'La data che avevi scelto è già passata. Scegline una nuova in «Vedi i dettagli».' };
  if (h.stato === 'scoperto') return { tono: 'male', testo: `Le spese già previste superano i soldi che hai: mancano ${euro(h.mancanti)}.` };
  if (h.stato === 'in_ritardo') return { tono: 'attenzione', testo: `Se continui a spendere così, i soldi bastano solo fino al ${data(h.dataRaggiungibile)}.` };
  if (h.stato === 'in_rotta') {
    if (h.tipo === 'data') return { tono: 'bene', testo: `Stai andando bene: i soldi ti bastano fino al ${data(h.dataFine)}.` };
    if (fineMese !== null && fineMese < 0) return { tono: 'male', testo: `Se continui a spendere così, a fine mese mancano circa ${euro(Math.abs(fineMese))}.` };
    if (sopraRitmo) {
      return {
        tono: 'attenzione',
        testo: fineMese === null
          ? 'Stai spendendo più del solito: rallenta un po’ fino a fine mese.'
          : `Stai spendendo più del solito. Se continui così, a fine mese ti restano circa ${euro(fineMese)}.`,
      };
    }
    return {
      tono: 'bene',
      testo: fineMese === null ? 'Stai andando bene.' : `Stai andando bene. Se continui così, a fine mese ti restano circa ${euro(fineMese)}.`,
    };
  }
  return { tono: 'neutro', testo: 'Segna ancora qualche spesa: dopo pochi giorni WALLT ti dirà come stai andando.' };
}

/** Il risultato del simulatore in una frase sola. */
export function rispostaSimulazione(simulazione, { euro }) {
  if (!simulazione) return null;
  const dopo = numero(simulazione.availableAfter);
  if (dopo !== null && dopo < 0) return { tono: 'male', titolo: 'Meglio di no', testo: `Questa spesa supera i soldi che puoi spendere di ${euro(Math.abs(dopo))}.` };
  if (simulazione.status === 'rischio') return { tono: 'male', titolo: 'Meglio di no', testo: `Ti resterebbero solo ${euro(dopo)} fino a fine mese.` };
  if (simulazione.status === 'attenzione') return { tono: 'attenzione', titolo: 'Sì, ma con attenzione', testo: `Dopo questa spesa potresti spendere ancora ${euro(dopo)}, circa ${euro(simulazione.dailyLimitAfter)} al giorno.` };
  if (simulazione.status === 'non_stimabile') return { tono: 'neutro', titolo: 'Non lo so ancora', testo: 'Servono altre spese registrate per rispondere.' };
  return { tono: 'bene', titolo: 'Sì, puoi', testo: `Dopo questa spesa potresti spendere ancora ${euro(dopo)}, circa ${euro(simulazione.dailyLimitAfter)} al giorno.` };
}

const giorniFra = (da, a) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${da}T12:00:00Z`)) / 86400000);

/**
 * Le scadenze dei prossimi 30 giorni raggruppate come le direbbe una
 * persona: questa settimana, la prossima, più avanti. Un calendario o una
 * data esatta costringono a contare i giorni.
 */
export function gruppiScadenze(items, oggi) {
  const gruppi = [
    { chiave: 'settimana', titolo: 'Questa settimana', righe: [] },
    { chiave: 'prossima', titolo: 'La settimana prossima', righe: [] },
    { chiave: 'avanti', titolo: 'Più avanti', righe: [] },
  ];
  (items ?? []).forEach((item) => {
    const giorni = oggi && item.dueDate ? giorniFra(oggi, item.dueDate) : 99;
    const indice = giorni < 7 ? 0 : giorni < 14 ? 1 : 2;
    gruppi[indice].righe.push(item);
  });
  return gruppi.filter((gruppo) => gruppo.righe.length);
}

/**
 * Il riepilogo dei prossimi 30 giorni: quanto esce (somma delle uscite già
 * elencate dal server) e quanto resta dopo l'ultima, che è il
 * `marginAfter` che il server ha già calcolato riga per riga.
 */
export function riepilogoProssimi(timeline) {
  const righe = timeline ?? [];
  let uscite = 0;
  let entrate = 0;
  righe.forEach((item) => {
    const c = importoInCentesimi(item.amount) ?? 0;
    if (item.direction === 'uscita') uscite += c;
    if (item.direction === 'entrata') entrate += c;
  });
  const ultima = righe.length ? numero(righe[righe.length - 1].marginAfter) : null;
  return {
    uscite: centesimiInImporto(uscite),
    entrate: centesimiInImporto(entrate),
    restaDopo: ultima,
    numeroUscite: righe.filter((item) => item.direction === 'uscita').length,
  };
}

/** Il punto a 30 giorni della timeline: ultimi 30 giorni contro i 30 prima. */
export function confrontoTrentaGiorni(changes) {
  const punto = (changes?.points ?? []).find((p) => p.days === 30);
  if (!punto || punto.quality !== 'storico_disponibile') return null;
  const delta = numero(punto.delta?.expenses);
  if (delta === null) return null;
  return { delta, categorie: punto.changedCategories ?? [] };
}

/**
 * Le tre voci in cui si spende di più, con la larghezza della barra rispetto
 * alla più grande. Il resto si riassume in una riga.
 */
export function vociPrincipali(frequentExpenses, quante = 3) {
  const voci = [...(frequentExpenses?.monthly?.items ?? [])]
    .map((item) => ({ ...item, valore: numero(item.average) ?? 0 }))
    .filter((item) => item.valore > 0)
    .sort((a, b) => b.valore - a.valore);
  const principali = voci.slice(0, quante);
  const massimo = principali[0]?.valore || 1;
  const resto = voci.slice(quante);
  const restoCentesimi = resto.reduce((somma, item) => somma + (importoInCentesimi(item.average) ?? 0), 0);
  return {
    principali: principali.map((item) => ({ ...item, percentuale: Math.max(Math.round((item.valore / massimo) * 100), 4) })),
    resto: resto.length ? { voci: resto.length, totale: centesimiInImporto(restoCentesimi) } : null,
  };
}
