/**
 * Quale voce del budget (Bisogni, Desideri, Futuro) conta un movimento.
 *
 * È l'unica regola: la usano lo stato del mese, gli avvisi e le Analisi
 * passando da services/budgetStato.service.js, così «quanto ho speso nei
 * Desideri» ha una sola definizione (CLAUDE.md, Regola 20).
 *
 * Modulo puro. Il chiamante esclude prima i movimenti per cui `muoveSaldo` è
 * falso (l'origine di una ricorrenza è una regola, non una spesa avvenuta:
 * Regola 11) e fornisce il tipo dei conti e l'essenzialità delle categorie
 * dell'utente, già con le sue personalizzazioni.
 */
const { VOCI, TIPI_CONTO_FUTURO, CATEGORIE_VOCE_FISSA } = require('../constants/budget');

const centesimi = (importo) => Math.round((parseFloat(importo) || 0) * 100);

/**
 * Voce di una categoria di uscita. Le voci fisse vincono sull'essenzialità;
 * poi `essenziale` è Bisogni, e tutto il resto — semi-essenziale,
 * discrezionale, non classificata o sconosciuta — è Desideri.
 */
const voceDellaCategoria = (categoriaId, essenzialitaPerCategoria) => {
  if (CATEGORIE_VOCE_FISSA[categoriaId]) return CATEGORIE_VOCE_FISSA[categoriaId];
  return essenzialitaPerCategoria.get(categoriaId) === 'essenziale' ? 'bisogni' : 'desideri';
};

const isContoFuturo = (contoId, tipoConto) => TIPI_CONTO_FUTURO.includes(tipoConto.get(contoId));

/**
 * @returns {{voce: string, centesimi: number, contoId: number}|null} `centesimi`
 *   ha il segno: un prelievo da un conto di risparmio riduce il Futuro.
 *   `contoId` è il conto dal lato della voce. `null` se il movimento non conta.
 */
const contributo = (movimento, { tipoConto, essenzialitaPerCategoria }) => {
  const importo = centesimi(movimento.importo);

  if (movimento.tipo === 'uscita') {
    return {
      voce: voceDellaCategoria(movimento.categoria, essenzialitaPerCategoria),
      centesimi: importo,
      contoId: movimento.conto_id,
    };
  }

  if (movimento.tipo !== 'trasferimento') return null;

  // Caricare denaro su una piattaforma di gioco non è una spesa (resta tuo,
  // su un altro conto), ma il budget serve proprio a limitare quanto si mette
  // in gioco: è un Desiderio.
  if (CATEGORIE_VOCE_FISSA[movimento.categoria] === 'desideri') {
    return { voce: 'desideri', centesimi: importo, contoId: movimento.conto_id };
  }

  const daFuturo = isContoFuturo(movimento.conto_id, tipoConto);
  const versoFuturo = isContoFuturo(movimento.conto_destinazione_id, tipoConto);
  if (versoFuturo && !daFuturo) {
    return { voce: 'futuro', centesimi: importo, contoId: movimento.conto_destinazione_id };
  }
  if (daFuturo && !versoFuturo) {
    return { voce: 'futuro', centesimi: -importo, contoId: movimento.conto_id };
  }
  return null;
};

/** Come `contributo`, nella forma esposta: voce e centesimi con segno. */
const contributoMovimento = (movimento, contesto) => {
  const esito = contributo(movimento, contesto);
  return esito ? { voce: esito.voce, centesimi: esito.centesimi } : null;
};

/**
 * Somma i movimenti per voce. Bisogni e Desideri tengono il totale per
 * categoria (il dettaglio «dove sono andati»), il Futuro l'elenco dei singoli
 * versamenti e prelievi.
 */
const aggregaPerVoce = (movimenti, contesto) => {
  const esito = VOCI.reduce((acc, voce) => ({
    ...acc,
    [voce]: voce === 'futuro' ? { centesimi: 0, movimenti: [] } : { centesimi: 0, perCategoria: new Map() },
  }), {});

  movimenti.forEach((movimento) => {
    const c = contributo(movimento, contesto);
    if (!c) return;
    const voce = esito[c.voce];
    voce.centesimi += c.centesimi;
    if (c.voce === 'futuro') {
      voce.movimenti.push({
        id: movimento.id,
        data: movimento.data,
        descrizione: movimento.descrizione,
        centesimi: c.centesimi,
        conto_id: c.contoId,
      });
      return;
    }
    const categoria = movimento.categoria || 'altro_uscita';
    voce.perCategoria.set(categoria, (voce.perCategoria.get(categoria) || 0) + c.centesimi);
  });

  return esito;
};

module.exports = { voceDellaCategoria, contributoMovimento, aggregaPerVoce };
