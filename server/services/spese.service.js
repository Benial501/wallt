/**
 * Aggregazioni centralizzate sulle uscite: totale, media mensile, storico
 * mensile, distribuzione per livello di necessità. Riusa buildPeriodi
 * (confrontoPeriodi.service.js, già corretto per il fuso Europe/Rome) e
 * aggregaPerEssenzialita (essenzialita.service.js) invece di reimplementarli.
 *
 * I trasferimenti (`tipo: 'trasferimento'`) sono sempre fuori per
 * costruzione: ogni query qui filtra `tipo: 'uscita'`, un trasferimento non
 * ha mai quel tipo (CLAUDE.md Regola 2).
 */
const { Op } = require('sequelize');
const { Movimento } = require('../models');
const { list: listCategories } = require('./categorie.service');
const { aggregaPerEssenzialita } = require('./essenzialita.service');
const { ultimiNMesi } = require('./confrontoPeriodi.service');
const { classificaFinestra } = require('./finestraMesi.service');
const { finestraGiorni, oggiLocale, FUSO_DEFAULT } = require('../utils/dateRome');

const round2 = (v) => Math.round(v * 100) / 100;
const toNumber = (v) => parseFloat(v) || 0;

const GIORNI_STANDARD = new Set([30, 90, 180]);

/**
 * Finestra standard [da, a], giorni civili inclusivi che terminano oggi
 * (Europe/Rome). Niente "media mensile" per queste finestre: 30/90/180
 * giorni non sono mesi di calendario, dividerle per un multiplo di 30
 * inventerebbe un mese che non esiste (vedi aggregaSpeseGiorni).
 */
const finestraGiorniStandard = (giorni, riferimento = oggiLocale(FUSO_DEFAULT)) => {
  if (!GIORNI_STANDARD.has(giorni)) {
    throw Object.assign(new Error(`Finestra non supportata: ${giorni} giorni`), { statusCode: 400 });
  }
  return finestraGiorni(riferimento, giorni);
};

const totaliPerCategoriaESomma = (movimenti) => {
  const totaliPerCategoria = {};
  movimenti.forEach((m) => {
    const cat = m.categoria || 'altro_uscita';
    totaliPerCategoria[cat] = (totaliPerCategoria[cat] || 0) + toNumber(m.importo);
  });
  const totale = round2(Object.values(totaliPerCategoria).reduce((s, v) => s + v, 0));
  return { totaliPerCategoria, totale };
};

/**
 * Aggregazione spese su una finestra a giorni fissi (30/90/180). Nessuna
 * media mensile per il motivo sopra: solo totale e distribuzione per
 * necessità. Zero osservato (nessun movimento) è distinto da un errore: la
 * risposta è comunque `totale: 0`, mai un'eccezione o un valore inventato.
 */
async function aggregaSpeseGiorni(userId, giorni, riferimento) {
  const { da, a } = finestraGiorniStandard(giorni, riferimento);
  const movimenti = await Movimento.findAll({
    where: { user_id: userId, tipo: 'uscita', data: { [Op.between]: [da, a] } },
    attributes: ['categoria', 'importo'],
  });
  const { totaliPerCategoria, totale } = totaliPerCategoriaESomma(movimenti);

  const categorie = await listCategories(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const byNecessity = aggregaPerEssenzialita(totaliPerCategoria, categorieUscita);

  return {
    da, a, giorni, totale, byNecessity,
  };
}

/**
 * Storico mensile + aggregazioni su N mesi solari (mese corrente incluso,
 * parziale). Una sola query sull'intero arco (stesso pattern di
 * getConfrontoMesi in analisi.controller.js: N round-trip singoli sarebbero
 * uno spreco).
 *
 * `opzioni.primoMovimento` ('YYYY-MM-DD' del primo movimento mai registrato
 * dall'utente, o null) attiva il clipping della finestra osservata: senza di
 * esso lo storico resta l'intera finestra richiesta — comportamento storico,
 * conservato per i chiamanti che non sanno da dove comincia lo storico. Con
 * esso i mesi precedenti al primo movimento NON compaiono: non sono "spesa
 * zero", sono mesi che per quell'utente non esistono (vedi
 * finestraMesi.service.js).
 *
 * Tre grandezze distinte, tre denominatori dichiarati:
 * - `totale`: somma dell'intero storico restituito, mese corrente parziale
 *   compreso. Non divisibile per un numero di mesi: mescola mesi completi e
 *   uno in corso.
 * - `totale_mesi_completi` / `media_mensile`: solo i mesi civili COMPLETI
 *   (esclude il mese corrente e il primo mese quando le registrazioni non
 *   partono dal suo giorno 1). `media_mensile` è `null` se non c'è nessun
 *   mese completo — "dato insufficiente", mai zero.
 * - `mese_corrente`: il mese in corso, a parte.
 *
 * `byNecessity` resta la distribuzione sull'intero storico restituito e
 * riconcilia con `totale` (significato invariato per chi già la consuma).
 * `byNecessityMesiCompleti` è la stessa distribuzione sui soli mesi completi:
 * riconcilia con `totale_mesi_completi`, quindi ha lo STESSO denominatore di
 * `media_mensile` ed è l'unica da cui ricavare medie per classe.
 */
async function aggregaSpeseMesi(userId, numMesi, riferimento = new Date(), opzioni = {}) {
  const periodiRichiesti = ultimiNMesi(numMesi, riferimento);
  const meseCorrente = oggiLocale(FUSO_DEFAULT, riferimento).slice(0, 7);
  const clipAttivo = Object.prototype.hasOwnProperty.call(opzioni, 'primoMovimento');
  const finestra = classificaFinestra({
    mesiRichiesti: periodiRichiesti.map((p) => p.chiave),
    meseCorrente,
    // Senza informazione sul primo movimento si conserva il comportamento
    // storico: tutta la finestra è "osservata" e il primo mese non è sospetto.
    primoMovimento: clipAttivo ? opzioni.primoMovimento : `${periodiRichiesti[0].chiave}-01`,
  });
  const periodi = clipAttivo
    ? periodiRichiesti.filter((p) => finestra.osservati.includes(p.chiave))
    : periodiRichiesti;

  if (periodi.length === 0) {
    const vuoto = aggregaPerEssenzialita({}, []);
    return {
      storico: [],
      finestra,
      totale: 0,
      totale_mesi_completi: 0,
      media_mensile: null,
      mesi_completi: 0,
      mese_corrente: null,
      spese_non_ricorrenti_mese_corrente: 0,
      byNecessity: vuoto,
      byNecessityMesiCompleti: vuoto,
    };
  }

  const movimenti = await Movimento.findAll({
    where: {
      user_id: userId,
      tipo: 'uscita',
      data: { [Op.between]: [periodi[0].da, periodi[periodi.length - 1].a] },
    },
    attributes: ['data', 'categoria', 'importo', 'ricorrente', 'ricorrenza_origine_id'],
  });

  const totaliPerPeriodo = new Map(periodi.map((p) => [p.chiave, {}]));
  movimenti.forEach((m) => {
    const giorno = String(m.data).slice(0, 10);
    const periodo = periodi.find((p) => giorno >= p.da && giorno <= p.a);
    if (!periodo) return;
    const cat = m.categoria || 'altro_uscita';
    const bucket = totaliPerPeriodo.get(periodo.chiave);
    bucket[cat] = (bucket[cat] || 0) + toNumber(m.importo);
  });

  const storico = periodi.map((p) => {
    const { totale } = totaliPerCategoriaESomma(
      Object.entries(totaliPerPeriodo.get(p.chiave)).map(([categoria, importo]) => ({ categoria, importo })),
    );
    return {
      periodo: p.chiave, da: p.da, a: p.a, totale, parziale: p.chiave === meseCorrente,
    };
  });

  const mesiCompleti = storico.filter((m) => finestra.completi.includes(m.periodo));
  const totaleCompleti = round2(mesiCompleti.reduce((s, m) => s + m.totale, 0));
  const media_mensile = mesiCompleti.length > 0 ? round2(totaleCompleti / mesiCompleti.length) : null;
  const totale = round2(storico.reduce((s, m) => s + m.totale, 0));

  const sommaBucket = (chiavi) => {
    const totali = {};
    chiavi.forEach((chiave) => {
      Object.entries(totaliPerPeriodo.get(chiave) || {}).forEach(([cat, importo]) => {
        totali[cat] = (totali[cat] || 0) + importo;
      });
    });
    return totali;
  };

  const categorie = await listCategories(userId, { includeArchived: true });
  const categorieUscita = categorie.filter((c) => c.tipo === 'uscita');
  const byNecessity = aggregaPerEssenzialita(sommaBucket(periodi.map((p) => p.chiave)), categorieUscita);
  const byNecessityMesiCompleti = aggregaPerEssenzialita(
    sommaBucket(mesiCompleti.map((m) => m.periodo)), categorieUscita,
  );

  return {
    storico,
    finestra,
    totale,
    totale_mesi_completi: totaleCompleti,
    media_mensile,
    mesi_completi: mesiCompleti.length,
    // Il ritmo del mese considera solo uscite già datate, escluse le
    // ricorrenti (origini e addebiti): le loro scadenze si stimano a parte.
    spese_non_ricorrenti_mese_corrente: round2(movimenti
      .filter((m) => String(m.data).slice(0, 7) === meseCorrente
        && String(m.data).slice(0, 10) <= oggiLocale(FUSO_DEFAULT, riferimento)
        && !m.ricorrente && !m.ricorrenza_origine_id)
      .reduce((sum, m) => sum + toNumber(m.importo), 0)),
    mese_corrente: storico.find((m) => m.periodo === meseCorrente) || null,
    byNecessity,
    byNecessityMesiCompleti,
  };
}

module.exports = { aggregaSpeseGiorni, aggregaSpeseMesi, finestraGiorniStandard };
