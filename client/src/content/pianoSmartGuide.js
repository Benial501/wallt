export const GUIDA_ESEMPIO = Object.freeze({
  totale: 2000,
  allocazioni: Object.freeze({ needs: 500, safety: 300, goals: 400, future: 300, freedom: 500 }),
});

export const calcolaTotaleEsempio = (allocazioni) => Object.values(allocazioni)
  .reduce((totale, valore) => totale + (Number(valore) || 0), 0);

export const GUIDA_PIANO_SMART = Object.freeze([
  {
    id: 'cos-e',
    titolo: 'Prima di iniziare',
    sottotitolo: 'Piano Smart organizza una nuova somma in base alla tua situazione.',
    paragraphs: [
      'Inserisci una somma che hai appena ricevuto o che stai per ricevere. WALLT la confronta con i dati che hai già registrato e propone come dividerla.',
      'La proposta cambia in base a entrate, spese, liquidità, sicurezza e obiettivi. Non è una percentuale fissa uguale per tutti.',
      'Piano Smart non sposta denaro, non crea movimenti e non modifica i saldi: è uno strumento per decidere come organizzare la somma.',
    ],
  },
  {
    id: 'esempio',
    titolo: 'Guardiamo un esempio',
    sottotitolo: 'Prova a cambiare le quote: l’esempio non tocca i tuoi dati reali.',
    paragraphs: ['Immagina di aver ricevuto 2.000 €. Questa è una possibile distribuzione iniziale. Puoi modificarla per capire come funziona il totale.'],
  },
  {
    id: 'passaggi',
    titolo: 'Come si usa, passo dopo passo',
    sottotitolo: 'Il percorso reale dentro Piano Smart.',
    steps: [
      ['1', 'Inserisci l’importo', 'Indica la somma che vuoi organizzare, con due decimali al massimo.'],
      ['2', 'Indica l’origine', 'Scegli se arriva da stipendio, bonus, rimborso, regalo o altro.'],
      ['3', 'Rispondi sulla ricorrenza', 'Una somma ricorrente richiede una distribuzione più orientata al mese che comincia.'],
      ['4', 'Coprì le spese obbligatorie', 'Inserisci ciò che deve essere pagato con quella somma. WALLT può proporti le ricorrenze non ancora addebitate.'],
      ['5', 'Completa il contesto', 'Se manca un dato importante, WALLT fa solo le domande necessarie per questo piano.'],
      ['6', 'Controlla e personalizza', 'Leggi la proposta, confronta i motivi e modifica le quote se vuoi.'],
      ['7', 'Salva il piano', 'Il piano resta nello storico come riferimento. I soldi restano dove sono.'],
    ],
  },
  {
    id: 'categorie',
    titolo: 'Che cosa significano le cinque categorie',
    sottotitolo: 'Ogni quota ha uno scopo diverso.',
    items: [
      { id: 'needs', titolo: 'Necessità', testo: 'Spese importanti e imminenti: casa, bollette, rate e impegni da coprire.' },
      { id: 'safety', titolo: 'Sicurezza', testo: 'Fondo di sicurezza per affrontare imprevisti e mesi difficili.' },
      { id: 'goals', titolo: 'Obiettivi', testo: 'Contributi di pianificazione agli obiettivi che hai creato in WALLT.' },
      { id: 'future', titolo: 'Futuro', testo: 'Risorse da destinare alla crescita patrimoniale o agli investimenti.' },
      { id: 'freedom', titolo: 'Libertà', testo: 'La parte non vincolata: puoi conservarla o usarla secondo le tue priorità.' },
    ],
  },
  {
    id: 'dati-limiti',
    titolo: 'Da dove arriva la proposta',
    sottotitolo: 'WALLT ragiona solo su ciò che hai registrato.',
    paragraphs: [
      'Può usare medie di entrate e spese, liquidità disponibile, fondo di sicurezza, obiettivi attivi, debiti e impegni ricorrenti.',
      'Se lo storico è breve o incompleto, il piano può essere più prudente. Le informazioni che aggiungi nelle domande valgono per quel piano e non modificano i tuoi movimenti.',
      'WALLT non vede il tuo conto bancario e non può sapere ciò che non hai inserito. Per questo controlla sempre la proposta prima di salvarla.',
    ],
    limits: ['Non sposta soldi e non aggiorna i saldi.', 'Non versa automaticamente contributi sugli obiettivi.', 'Non è una consulenza finanziaria e non decide al posto tuo.'],
  },
]);
