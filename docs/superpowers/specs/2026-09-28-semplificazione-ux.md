# Specifica UX: semplificazione della navigazione e delle azioni frequenti

## Obiettivo

Ridurre il tempo necessario per orientarsi e registrare un movimento, mantenendo riconoscibili i flussi finanziari esistenti. La prima tranche interessa navigazione, movimenti e dashboard; non cambia API, schema dati o regole di calcolo.

## Principi e vincoli

- Piano Smart resta la voce centrale della barra mobile a cinque elementi: Home, Transazioni, Piano Smart, Analisi, Altro.
- Il desktop rende Piano Smart visibile nella navigazione principale.
- Le modifiche riusano componenti, store e rotte esistenti.
- Nessuna azione suggerita deve sembrare un movimento finanziario già eseguito.
- Il tipo di movimento scelto dall’utente deve corrispondere al primo passaggio del modulo.
- Nessuna informazione economica o preferenza dell’account viene cambiata dall’interfaccia durante questa riprogettazione.

## Interventi inclusi

### Navigazione

- Aggiungere Piano Smart alla sidebar desktop come destinazione primaria.
- Inserire “I miei conti” tra le destinazioni facilmente raggiungibili dal menu mobile “Altro”, senza aggiungere voci alla barra inferiore.
- Conservare cinque elementi nella barra mobile e la posizione centrale di Piano Smart.
- Applicare stato attivo e nomi accessibili coerenti alle voci nuove e già presenti.

### Creazione movimenti

- Correggere l’azione mobile “+” in Movimenti: non deve aprire implicitamente il modulo Entrata.
- Mostrare una scelta compatta e chiara tra Entrata, Uscita e Trasferimento.
- Dopo la scelta, aprire il modulo direttamente al primo campo utile per quel tipo; il modulo deve continuare a consentire di cambiare tipo dove oggi è possibile.
- Usare gli stessi ingressi rapidi già presenti sulla dashboard o nei vuoti della lista, uniformando etichette e comportamento.
- Conservare validazione, conferme, aggiornamento saldi e salvataggio già implementati.

### Dashboard

- Rendere riconoscibili i controlli del carosello con etichette descrittive e indicazione della sezione attiva, mantenendo i contenuti e il comportamento di scorrimento attuale.
- Chiarire le azioni principali vicino al riepilogo, riusando i CTA esistenti e senza aggiungere nuovi dati finanziari o riorganizzare i calcoli.
- Mantenere card, ordine informativo e stati caricamento/errore salvo modifiche strettamente necessarie per le azioni sopra.

## Flussi attesi

### Nuovo movimento da “+” in Movimenti

Attuale: Movimenti → “+” → modulo Entrata → scelta del tipo nel modulo → dati → salva.

Proposto: Movimenti → “+” → scelta Entrata/Uscita/Trasferimento → dati del tipo scelto → salva.

La scelta esplicita elimina l’ambiguità e un passaggio ridondante del modulo. Il numero esatto di interazioni dipende dalla modalità con cui il modulo presenta i campi e non viene promesso come metrica assoluta.

### Accesso a Piano Smart e Conti

Mobile: Home / Transazioni / **Piano Smart** / Analisi / Altro → I miei conti.

Desktop: sidebar con Dashboard, I miei conti, Movimenti, Piano Smart e funzionalità già previste.

## Fuori ambito

- Ridisegno o accorpamento delle schermate di onboarding e budget.
- Modifiche al modello dati, alle API o alla logica contabile.
- Revisione generale di colori, tipografia o componenti di tutto il prodotto.
- Modifica di preferenze, transazioni o dati reali dell’account.

## Criteri di accettazione

- Piano Smart rimane sempre al centro della barra inferiore mobile.
- “I miei conti” è raggiungibile dal menu mobile Altro e Piano Smart dalla sidebar desktop.
- Il pulsante “+” non preseleziona Entrata senza consenso; i tre tipi aprono il modulo con il tipo corretto e senza chiedere nuovamente la stessa scelta.
- I CTA per l’inserimento hanno testo e comportamento coerenti.
- I controlli del carosello hanno nomi accessibili comprensibili e riflettono la sezione attiva.
- I salvataggi continuano a usare i flussi esistenti.

## Rischi e mitigazioni

- **Modifica del percorso di inserimento:** mantenere una scelta esplicita del tipo e verificare tutti gli ingressi al modulo.
- **Densità del menu mobile:** aggiungere Conti al foglio “Altro” senza toccare la barra a cinque elementi.
- **Controlli dashboard poco evidenti:** limitare l’intervento a etichette e stato accessibile, senza appesantire la scheda riepilogativa.

## File candidati

- `client/src/components/layout/AppLayout.vue`
- `client/src/config/functionalityItems.js` se serve estendere la configurazione dei collegamenti
- `client/src/views/MovimentiView.vue`
- `client/src/components/movimenti/MovimentoForm.vue`
- `client/src/views/DashboardView.vue` o `client/src/components/custom/WOverviewCarousel.vue`
