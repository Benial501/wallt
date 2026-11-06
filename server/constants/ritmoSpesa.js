/**
 * Le soglie del ritmo di spesa e della previsione di fine mese
 * (`services/ritmoSpesa.js`, `services/pianoSmartV2/currentSituation.service.js`).
 * Un modulo senza `require`, come `constants/pianoSmart.js`: i numeri stanno
 * in un posto solo e si leggono senza caricare Sequelize.
 *
 * Il ritmo misura la spesa che si ripete giorno dopo giorno, perché la
 * previsione la moltiplica per i giorni che restano. Un'uscita che capita
 * una volta al mese (affitto, bolletta, rata), un versamento o un acquisto
 * isolato è già fuori dal saldo: proiettarla la conterebbe di nuovo ogni
 * giorno. Il caso che ha reso necessario questo elenco: un affitto da 700 €
 * pagato il 1° diventava circa 2.900 € di «spese future» al 6 del mese.
 */

/** Sotto questi giorni osservati nel mese la previsione non si fa: il 1° del
 * mese una sola spesa da 50 € diventava 1.500 € proiettati. */
const GIORNI_MINIMI_PREVISIONE = 5;

/** Categorie di spese che arrivano una volta al mese o all'anno. Le loro
 * scadenze future, se l'utente le ha programmate, sono già fra gli impegni. */
const CATEGORIE_FISSE = [
  'affitto', 'mutuo', 'condominio', 'bollette', 'elettricita', 'gas', 'acqua',
  'internet', 'telefono', 'rate', 'prestiti', 'assicurazioni', 'assicurazione_auto',
  'assicurazione_sanitaria', 'bollo_auto', 'tasse', 'abbonamenti',
  'abbonamenti_digitali', 'streaming', 'musica',
];

/** Denaro spostato, non speso: resta nel patrimonio (Regola 12). */
const CATEGORIE_VERSAMENTO = ['investimento'];

/** Un'uscita sopra questi giorni di spesa variabile media è un acquisto una
 * tantum. La media è quella delle spese di tutti i giorni (senza fisse né
 * versamenti): con la media totale l'affitto alzava la soglia, e con 5 giorni
 * la spesa settimanale al supermercato risultava «una tantum». */
const UNA_TANTUM_GIORNI_DI_SPESA = 10;
/** Pavimento della soglia, perché chi spende poco non veda «una tantum» la spesa del sabato. */
const UNA_TANTUM_SOGLIA_MINIMA = 100;
/** Soglia quando non c'è ancora un mese completo da cui ricavare la media. */
const UNA_TANTUM_SOGLIA_SENZA_STORICO = 250;

/** Giorni medi di un mese civile, gli stessi della spesa media giornaliera. */
const GIORNI_MEDI_MESE = 30.4375;

module.exports = {
  GIORNI_MINIMI_PREVISIONE,
  CATEGORIE_FISSE,
  CATEGORIE_VERSAMENTO,
  UNA_TANTUM_GIORNI_DI_SPESA,
  UNA_TANTUM_SOGLIA_MINIMA,
  UNA_TANTUM_SOGLIA_SENZA_STORICO,
  GIORNI_MEDI_MESE,
};
