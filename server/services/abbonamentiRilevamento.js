/**
 * Dai movimenti agli abbonamenti (CLAUDE.md Regola 28).
 *
 * Tutto puro, senza database: `pianifica` riceve movimenti, programmazioni e righe
 * già salvate, e restituisce cosa creare e cosa aggiornare. Chiamarla due volte
 * sugli stessi dati non produce modifiche: è ciò che permette di rileggere le
 * transazioni a ogni apertura della pagina.
 */
const MerchantNormalizer = require('./merchant/MerchantNormalizer');
const { CATEGORIA_USCITA_DISPLAY } = require('../constants/categorie');
const {
  ADDEBITI_CUMULATIVI,
  CATALOGO_SERVIZI,
  CATEGORIE_ABBONAMENTO,
  CATEGORIE_DA_DESCRIZIONE,
  GIORNI_ADDEBITO_MENSILE_MAX,
  GIORNI_ADDEBITO_MENSILE_MIN,
  ORIGINI,
  PAROLE_NON_ABBONAMENTO,
  SCARTO_MASSIMO_RINCARO,
  STATI,
} = require('../constants/abbonamenti');
const { aCentesimi } = require('../utils/abbonamentiCosti');

const normalizer = new MerchantNormalizer();

const PERIODO_DA_FREQUENZA = Object.freeze({ mensile: 1, annuale: 12 });

const entroScarto = (costo, importo) => Math.abs(costo - importo) <= costo * SCARTO_MASSIMO_RINCARO;

// Il cron scrive le occorrenze come «Palestra Fit (automatico)»: è lo stesso servizio.
const senzaSuffissoCron = (descrizione) => String(descrizione ?? '').replace(/\s*\(automatico\)\s*$/i, '');

const testoDi = (descrizione) => senzaSuffissoCron(descrizione).toLowerCase().replace(/\s+/g, ' ').trim();

const MS_GIORNO = 86400000;

const alfanumerico = (carattere) => carattere !== undefined && /[a-z0-9]/.test(carattere);

const contieneAlias = (testo, alias) => {
  let indice = testo.indexOf(alias);
  while (indice !== -1) {
    if (!alfanumerico(testo[indice - 1]) && !alfanumerico(testo[indice + alias.length])) return true;
    indice = testo.indexOf(alias, indice + 1);
  }
  return false;
};

const identificaServizio = (descrizione) => {
  const testo = testoDi(descrizione);
  if (!testo) return null;
  // Il nome esatto prima di tutto: «now» è un servizio solo quando è tutta la
  // descrizione, non quando compare in una frase.
  return CATALOGO_SERVIZI.find((voce) => voce.nome_esatto !== false && voce.nome.toLowerCase() === testo)
    || CATALOGO_SERVIZI.find((voce) => voce.alias.some((alias) => contieneAlias(testo, alias)))
    || null;
};

const inMaiuscole = (testo) => testo.replace(/(^|\s)(\S)/g, (_, spazio, lettera) => spazio + lettera.toUpperCase());

/** Chiave che identifica un abbonamento fuori catalogo a partire dal suo nome. */
const chiaveDaTesto = (testo) => normalizer.normalize(senzaSuffissoCron(testo)).cleaned.slice(0, 120);

const haParolaEsclusa = (descrizione) => {
  const testo = testoDi(descrizione);
  return PAROLE_NON_ABBONAMENTO.some((parola) => contieneAlias(testo, parola));
};

const nelCatalogo = (chiave) => CATALOGO_SERVIZI.some((voce) => voce.id === chiave);

// Senza descrizione (`categoria:`) non si può dire che due addebiti siano lo stesso
// servizio. «Apple Music» è un servizio del catalogo, non un addebito cumulativo,
// anche quando è scritto a mano e la sua chiave è il testo.
const chiaveCumulativa = (chiave) => chiave.startsWith('categoria:')
  || (
    !nelCatalogo(chiave)
    && !identificaServizio(chiave)
    && ADDEBITI_CUMULATIVI.some((alias) => contieneAlias(chiave, alias))
  );

/**
 * Il servizio di una riga, che può avere una chiave diversa da quella dei movimenti:
 * «Anthropic» scritto a mano e «Claude» trovato negli addebiti sono lo stesso abbonamento.
 */
const chiaveServizio = ({ chiave, nome, servizio_id: servizioId }) => {
  if (nelCatalogo(chiave) || chiaveCumulativa(chiave)) return chiave;
  return servizioId || identificaServizio(nome)?.id || identificaServizio(chiave)?.id || chiave;
};

const descriviMovimento = ({ categoria, descrizione }) => {
  const servizio = identificaServizio(descrizione);
  const categoriaAbbonamento = CATEGORIE_ABBONAMENTO.includes(categoria);

  if (servizio) {
    if (!categoriaAbbonamento) {
      const ammessa = !categoria
        || CATEGORIE_DA_DESCRIZIONE.includes(categoria)
        || servizio.categorie_ammesse?.includes(categoria);
      if (!ammessa || haParolaEsclusa(descrizione)) return null;
    }
    return {
      chiave: servizio.id, servizio_id: servizio.id, nome: servizio.nome, icona: servizio.id,
    };
  }
  if (!categoriaAbbonamento) return null;

  const chiave = chiaveDaTesto(descrizione);
  return chiave
    ? { chiave, servizio_id: null, nome: inMaiuscole(chiave).slice(0, 100), icona: null }
    : {
      chiave: `categoria:${categoria}`,
      servizio_id: null,
      nome: CATEGORIA_USCITA_DISPLAY[categoria]?.nome || 'Abbonamento',
      icona: null,
    };
};

const aggiungiMesi = (dataIso, mesi) => {
  const [anno, mese, giorno] = dataIso.split('-').map(Number);
  const risultato = new Date(Date.UTC(anno, mese - 1 + mesi, 1));
  const ultimoGiorno = new Date(Date.UTC(risultato.getUTCFullYear(), risultato.getUTCMonth() + 1, 0)).getUTCDate();
  risultato.setUTCDate(Math.min(giorno, ultimoGiorno));
  return risultato.toISOString().slice(0, 10);
};

const dataFine = ({ durata_mesi: durata, data_inizio: inizio }) => (
  durata && inizio ? aggiungiMesi(inizio, durata) : null
);

const giornoDi = (valore) => {
  if (!valore) return null;
  return valore instanceof Date ? valore.toISOString().slice(0, 10) : String(valore).slice(0, 10);
};

const euro = (centesimi) => (centesimi / 100).toFixed(2);

const regolaAttiva = (regola) => (
  (regola.stato_ricorrenza || 'attiva') === 'attiva' && Boolean(PERIODO_DA_FREQUENZA[regola.ricorrente_frequenza])
);

// Due importi molto diversi a un mese di distanza non dimostrano nulla: possono
// essere due acquisti qualunque.
const mensileDimostrato = (addebiti) => addebiti.some((addebito, i) => {
  if (i === 0 || !entroScarto(addebiti[i - 1].centesimi, addebito.centesimi)) return false;
  const giorni = (Date.parse(addebito.data) - Date.parse(addebiti[i - 1].data)) / MS_GIORNO;
  return giorni >= GIORNI_ADDEBITO_MENSILE_MIN && giorni <= GIORNI_ADDEBITO_MENSILE_MAX;
});

const ultimiDueUguali = (addebiti) => addebiti.length >= 2
  && addebiti[addebiti.length - 1].centesimi === addebiti[addebiti.length - 2].centesimi;

/**
 * Solo per gli addebiti cumulativi. Il numero di flussi è il massimo di importi
 * distinti in uno stesso mese: due importi in mesi diversi sono un rincaro, due nello
 * stesso mese sono due abbonamenti sulla stessa voce, come spesso accade con Apple.
 */
const costruisciFlussi = (addebiti) => {
  const perMese = new Map();
  addebiti.forEach(({ data, centesimi }) => {
    const mese = data.slice(0, 7);
    if (!perMese.has(mese)) perMese.set(mese, new Set());
    perMese.get(mese).add(centesimi);
  });
  let riferimento = new Set();
  [...perMese.keys()].sort().forEach((mese) => {
    if (perMese.get(mese).size >= riferimento.size) riferimento = perMese.get(mese);
  });
  if (riferimento.size <= 1) return [{ addebiti }];

  const flussi = [...riferimento].map((importo) => ({ importo, addebiti: [] }));
  addebiti.forEach((addebito) => {
    const vicino = flussi.reduce((migliore, flusso) => (
      Math.abs(flusso.importo - addebito.centesimi) < Math.abs(migliore.importo - addebito.centesimi) ? flusso : migliore
    ));
    vicino.addebiti.push(addebito);
  });
  return flussi.filter((flusso) => flusso.addebiti.length > 0);
};

const ultimoDi = (flusso) => flusso.addebiti[flusso.addebiti.length - 1];

const ORDINE_STATI = [STATI.ATTIVO, STATI.ANNULLATO, STATI.ESCLUSO];

const rigaConCosto = (importo, righe, occupate) => ORDINE_STATI
  .map((stato) => righe.find((r) => r.stato === stato && r.centesimi === importo && !occupate.has(r)))
  .find(Boolean) || null;

const rigaVicina = (importo, righe, occupate) => {
  const libere = righe.filter((r) => r.stato !== STATI.ESCLUSO && !occupate.has(r));
  if (righe.length === 1 && libere.length === 1) return libere[0];
  const vicine = libere.filter((r) => entroScarto(r.centesimi, importo));
  if (!vicine.length) return null;
  return vicine.reduce((migliore, r) => (
    Math.abs(r.centesimi - importo) < Math.abs(migliore.centesimi - importo) ? r : migliore
  ));
};

/**
 * Un servizio è un abbonamento solo: se è già attivo l'addebito è suo a qualunque
 * importo, e non riapre una riga annullata né si perde su una esclusa con lo stesso costo.
 */
const righeDelServizio = (righe) => {
  const attive = righe.filter((r) => r.stato === STATI.ATTIVO);
  return attive.length ? attive : righe.filter((r) => r.stato !== STATI.ESCLUSO);
};

const applicaAddebiti = (riga, flusso, oggi) => {
  if (riga.stato === STATI.ESCLUSO) return;
  const ultimo = ultimoDi(flusso);

  if (riga.stato === STATI.ANNULLATO) {
    if (!riga.annullato_il || ultimo.data <= riga.annullato_il) return;
    riga.stato = STATI.ATTIVO;
    riga.riattivato_da_addebito = true;
  }

  const fine = dataFine(riga);
  if (fine && oggi >= fine && ultimo.data >= fine) {
    riga.durata_mesi = null;
    riga.data_inizio = null;
    riga.da_verificare = true;
    riga.riattivato_da_addebito = true;
    riga.annullato_il = fine;
  }

  if (!riga.ultimo_addebito_data || ultimo.data > riga.ultimo_addebito_data) {
    riga.ultimo_addebito_data = ultimo.data;
    riga.ultimo_addebito_importo = euro(ultimo.centesimi);
    if (!riga.modificataIl || ultimo.data > riga.modificataIl) {
      // Un importo molto diverso non cambia il costo da solo: un acquisto da 799 €
      // farebbe 9.588 € all'anno senza che nessuno lo veda. Due addebiti uguali
      // confermano invece il prezzo nuovo, se l'utente non ha mai toccato la riga.
      const confermato = !riga.modificataIl && ultimiDueUguali(flusso.addebiti);
      if (entroScarto(riga.centesimi, ultimo.centesimi) || confermato) riga.centesimi = ultimo.centesimi;
      else riga.da_verificare = true;
    }
  }

  if (
    riga.da_verificare
    && riga.origine === ORIGINI.RILEVATO
    && !riga.modificataIl
    && !riga.riattivato_da_addebito
    && riga.periodo_mesi === 1
    && entroScarto(riga.centesimi, ultimo.centesimi)
    && mensileDimostrato(flusso.addebiti)
  ) riga.da_verificare = false;
};

const applicaRegola = (riga, regola, oggi) => {
  const importo = aCentesimi(regola.importo);
  riga.movimento_ricorrente_id = regola.id;
  if (riga.nuova || !riga.modificataIl) {
    riga.periodo_mesi = PERIODO_DA_FREQUENZA[regola.ricorrente_frequenza];
    if (!riga.riattivato_da_addebito) riga.da_verificare = false;
  }
  // Le scadenze rimanenti si leggono solo qui: rilette a ogni apertura, «In
  // totale» calerebbe ogni mese e la fine si anticiperebbe.
  if (riga.nuova && regola.ricorrente_occorrenze_rimanenti) {
    riga.durata_mesi = regola.ricorrente_occorrenze_rimanenti;
    riga.data_inizio = oggi;
  }
  const aggiornataIl = giornoDi(regola.updatedAt);
  if (
    importo !== riga.centesimi
    && (!riga.ultimo_addebito_data || aggiornataIl > riga.ultimo_addebito_data)
    && (!riga.modificataIl || aggiornataIl > riga.modificataIl)
  ) riga.centesimi = importo;
};

const prossimoOrdine = (righe) => righe.reduce((massimo, r) => Math.max(massimo, r.ordine + 1), 0);

const nuovaRiga = (descrizione, righe, centesimi) => ({
  ...descrizione,
  nuova: true,
  ordine: prossimoOrdine(righe),
  centesimi,
  stato: STATI.ATTIVO,
  origine: ORIGINI.RILEVATO,
  periodo_mesi: 1,
  durata_mesi: null,
  data_inizio: null,
  da_verificare: true,
  riattivato_da_addebito: false,
  annullato_il: null,
  ultimo_addebito_data: null,
  ultimo_addebito_importo: null,
  modificataIl: null,
  movimento_ricorrente_id: null,
});

const pianificaChiave = ({ descrizione, addebiti, regole }, righe, oggi) => {
  const haEsclusa = () => righe.some((r) => r.stato === STATI.ESCLUSO);
  const cumulativa = chiaveCumulativa(descrizione.chiave);
  const candidate = () => (cumulativa ? righe : righeDelServizio(righe));

  if (addebiti.length) {
    addebiti.sort((a, b) => a.data.localeCompare(b.data));
    const flussi = cumulativa ? costruisciFlussi(addebiti) : [{ addebiti }];
    const occupate = new Set();
    const assegna = (flusso, riga) => {
      occupate.add(riga);
      applicaAddebiti(riga, flusso, oggi);
    };

    // Prima gli importi identici: altrimenti un altro importo potrebbe
    // prendersi la riga che spetta a questo.
    const restanti = flussi.filter((flusso) => {
      const riga = rigaConCosto(ultimoDi(flusso).centesimi, candidate(), occupate);
      if (riga) assegna(flusso, riga);
      return !riga;
    });
    restanti.forEach((flusso) => {
      const { centesimi } = ultimoDi(flusso);
      const riga = rigaVicina(centesimi, candidate(), occupate);
      if (riga) {
        assegna(flusso, riga);
      } else if (!haEsclusa() && (righe.length === 0 || flussi.length > 1)) {
        const nuova = nuovaRiga(descrizione, righe, centesimi);
        righe.push(nuova);
        assegna(flusso, nuova);
      }
    });
  }

  const occupateDaRegole = new Set();
  const legata = (regola) => righe.some((r) => r.movimento_ricorrente_id === regola.id);
  // Prima quella già legata: se due programmazioni si contendono l'unica riga del
  // servizio, il legame non deve cambiare a ogni lettura.
  [...regole].sort((a, b) => legata(b) - legata(a)).forEach((regola) => {
    const importo = aCentesimi(regola.importo);
    let riga = righe.find((r) => r.movimento_ricorrente_id === regola.id)
      || rigaConCosto(importo, candidate(), occupateDaRegole)
      || rigaVicina(importo, candidate(), occupateDaRegole);
    if (!riga) {
      if (haEsclusa() || (!cumulativa && righe.length)) return;
      riga = nuovaRiga(descrizione, righe, importo);
      righe.push(riga);
    }
    occupateDaRegole.add(riga);
    // Una programmazione attiva non riattiva nulla: quello lo fa un addebito.
    if (riga.stato === STATI.ATTIVO) applicaRegola(riga, regola, oggi);
  });
};

const CAMPI_CONFRONTATI = [
  'stato', 'annullato_il', 'riattivato_da_addebito', 'da_verificare', 'periodo_mesi', 'durata_mesi',
  'data_inizio', 'ultimo_addebito_data', 'ultimo_addebito_importo', 'movimento_ricorrente_id',
];

const differenze = (riga, originale) => {
  const campi = {};
  CAMPI_CONFRONTATI.forEach((campo) => {
    const prima = campo === 'ultimo_addebito_importo' && originale[campo] != null
      ? euro(aCentesimi(originale[campo]))
      : originale[campo];
    if (riga[campo] !== prima) campi[campo] = riga[campo];
  });
  if (riga.centesimi !== aCentesimi(originale.costo)) campi.costo = euro(riga.centesimi);
  return campi;
};

const pianifica = ({
  movimenti = [], regole = [], righe = [], oggi,
}) => {
  const regolePerId = new Map(regole.map((regola) => [regola.id, regola]));
  const lavoro = righe.map((riga) => ({
    ...riga,
    originale: riga,
    centesimi: aCentesimi(riga.costo),
    modificataIl: giornoDi(riga.modificato_utente_il),
  }));

  // Prima dei movimenti: un addebito successivo deve poter riattivare una riga
  // che ha appena perso la sua programmazione, senza che venga riannullata.
  lavoro.forEach((riga) => {
    if (!riga.movimento_ricorrente_id) return;
    const regola = regolePerId.get(riga.movimento_ricorrente_id);
    if (regola && regolaAttiva(regola)) return;
    riga.movimento_ricorrente_id = null;
    if (riga.stato === STATI.ATTIVO) {
      riga.stato = STATI.ANNULLATO;
      riga.annullato_il = oggi;
    }
  });

  // Una riga già legata a una programmazione resta la sua identità anche se la
  // programmazione cambia nome, altrimenti rinominarla duplicherebbe l'abbonamento.
  const descriviRegola = (regola) => {
    const legata = lavoro.find((riga) => riga.movimento_ricorrente_id === regola.id);
    return legata
      ? {
        chiave: legata.chiave, servizio_id: legata.servizio_id, nome: legata.nome, icona: legata.icona,
      }
      : descriviMovimento(regola);
  };

  // Una riga rinominata continua a ricevere gli addebiti della sua chiave.
  const chiaviRighe = new Map(lavoro.map((riga) => [riga.chiave, chiaveServizio(riga)]));

  const perChiave = new Map();
  const voce = (descrizione) => {
    const chiave = chiaviRighe.get(descrizione.chiave) ?? descrizione.chiave;
    if (!perChiave.has(chiave)) perChiave.set(chiave, { descrizione, addebiti: [], regole: [] });
    return perChiave.get(chiave);
  };

  movimenti.forEach((movimento) => {
    const centesimi = aCentesimi(movimento.importo);
    if (!(centesimi > 0)) return;
    const origine = regolePerId.get(movimento.ricorrenza_origine_id);
    // L'occorrenza di una spesa una tantum è un pagamento singolo, e quella di una
    // programmazione fermata non deve far nascere un abbonamento attivo.
    if (origine && !regolaAttiva(origine)) return;
    const descrizione = origine ? descriviRegola(origine) : descriviMovimento(movimento);
    if (descrizione) voce(descrizione).addebiti.push({ data: movimento.data, centesimi });
  });

  regole.filter(regolaAttiva).forEach((regola) => {
    const descrizione = descriviRegola(regola);
    if (descrizione) voce(descrizione).regole.push(regola);
  });

  perChiave.forEach((dati, chiave) => {
    const righeChiave = lavoro.filter((riga) => chiaveServizio(riga) === chiave);
    const prima = righeChiave.length;
    pianificaChiave(dati, righeChiave, oggi);
    lavoro.push(...righeChiave.slice(prima));
  });

  const crea = lavoro.filter((riga) => riga.nuova).map(({
    centesimi, nuova, modificataIl, ...campi
  }) => ({ ...campi, costo: euro(centesimi) }));

  const aggiorna = lavoro
    .filter((riga) => !riga.nuova)
    .map((riga) => ({ id: riga.id, campi: differenze(riga, riga.originale) }))
    .filter(({ campi }) => Object.keys(campi).length > 0);

  return { crea, aggiorna };
};

const piuAutorevole = (a, b) => (
  String(b.modificato_utente_il ?? '').localeCompare(String(a.modificato_utente_il ?? ''))
  || String(b.ultimo_addebito_data ?? '').localeCompare(String(a.ultimo_addebito_data ?? ''))
  || a.ordine - b.ordine
);

/**
 * Le righe di troppo su uno stesso servizio attivo. Resta quella che l'utente ha
 * toccato per ultimo, poi quella con l'addebito più recente, che è anche il costo che
 * la lettura successiva confermerebbe. Una riga scritta a mano non si cancella mai:
 * due Netflix dichiarati dall'utente restano due, e accanto a loro una riga trovata
 * nei movimenti è di troppo. Annullate ed escluse sono scelte dell'utente, e nei totali
 * non pesano.
 */
const righeDoppie = (righe) => {
  const perServizio = new Map();
  righe
    .filter((riga) => riga.stato === STATI.ATTIVO && !chiaveCumulativa(riga.chiave))
    .forEach((riga) => {
      const chiave = chiaveServizio(riga);
      perServizio.set(chiave, [...(perServizio.get(chiave) || []), riga]);
    });
  return [...perServizio.values()].flatMap((gruppo) => {
    const rilevate = gruppo.filter((riga) => riga.origine === ORIGINI.RILEVATO).sort(piuAutorevole);
    return rilevate.length === gruppo.length ? rilevate.slice(1) : rilevate;
  });
};

module.exports = {
  identificaServizio,
  descriviMovimento,
  chiaveDaTesto,
  aggiungiMesi,
  dataFine,
  pianifica,
  righeDoppie,
};
