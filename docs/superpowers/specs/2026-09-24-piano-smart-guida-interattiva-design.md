# Piano Smart — Guida interattiva

## Obiettivo

Rendere il Piano Smart comprensibile anche a chi lo apre per la prima volta,
spiegando scopo, dati usati, cinque categorie, passaggi operativi e limiti
attraverso un esempio modificabile ma completamente locale.

## Esperienza

Il link “Come funziona?” apre un dialogo ampio con navigazione a sezioni:

1. introduzione: organizza una nuova somma, non sposta denaro;
2. esempio: 2.000 € distribuiti nelle cinque categorie, con quote modificabili
   e totale sempre verificato;
3. percorso: i passaggi reali del wizard;
4. categorie: significato pratico di necessità, sicurezza, obiettivi, futuro e
   libertà;
5. dati e limiti: cosa usa WALLT e cosa non può sapere o fare.

La guida deve avere “Indietro”, “Continua”, indicatori di sezione, chiusura
accessibile e un’azione finale “Apri il Piano Smart”. L’esempio non usa lo
store, non chiama API e non viene salvato.

## Architettura

`PianoSmartGuide.vue` contiene l’esperienza interattiva e riceve `open` e
`close` dal genitore. I contenuti testuali e l’esempio sono definiti in un
modulo statico dedicato, così il catalogo Aiuto può riutilizzare gli stessi
concetti senza duplicare il vocabolario. `PianoSmartView.vue` sostituisce il
dialogo breve con la guida e mantiene il dettaglio piano invariato.

## Vincoli

- Italiano, tono concreto e non promozionale.
- Nessuna dipendenza nuova.
- Responsive e utilizzabile da tastiera.
- Rispetta tema chiaro/scuro, focus visibile e `prefers-reduced-motion`.
- Non promettere consulenza finanziaria né automazioni che Piano Smart non fa.
