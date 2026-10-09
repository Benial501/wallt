const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Movimento = sequelize.define('Movimento', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conto_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  conto_destinazione_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM('entrata', 'uscita', 'trasferimento'),
    allowNull: false,
  },
  importo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  descrizione: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  ricorrente: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  stato_ricorrenza: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'attiva',
  },
  natura_entrata: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'sconosciuto',
  },
  periodicita_entrata: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'sconosciuta',
  },
  ricorrente_frequenza: {
    type: DataTypes.ENUM('giornaliera', 'settimanale', 'mensile', 'annuale', 'una_tantum'),
    allowNull: true,
  },
  ricorrente_giorno: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ricorrente_mese: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Data dell'addebito per le spese programmate (ricorrente_frequenza =
  // 'una_tantum'). Per le altre frequenze resta null: la schedulazione
  // vive in ricorrente_giorno/ricorrente_mese.
  ricorrente_data: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  ricorrente_occorrenze_rimanenti: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ricorrenza_origine_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ricorrenza_periodo: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  categoria_fonte: { type: DataTypes.STRING(40), allowNull: true },
  categoria_automatica: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  categoria_confidenza: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  categoria_modificata: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // --- Provenienza del movimento (Bank Sync) ------------------------------
  // `origine` distingue una riga scritta a mano da una importata da file e da
  // una arrivata dalla banca. Serve a sapere quali movimenti ha prodotto una
  // connessione — senza di esso non si potrebbe offrire in modo onesto
  // "elimina anche i dati importati" — e a non trattare una riga della banca
  // come una correzione dell'utente.
  origine: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'manuale',
  },
  bank_connection_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // L'identificatore della transazione presso il provider. Con
  // `bank_connection_id` forma l'indice UNIQUE parziale che rende la
  // sincronizzazione idempotente a livello di database: il provider può
  // restituire la stessa transazione a ogni chiamata e non può essere
  // inserita due volte, nemmeno da due esecuzioni concorrenti.
  external_transaction_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Lo stato dichiarato dalla banca ('booked' / 'pending'). Nei movimenti
  // entrano solo le 'booked' (constants/bankSync.js, STATI_IMPORTABILI):
  // qui il valore viene registrato, non inferito.
  stato_banca: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  // "Non è un deposito di gioco": la decisione che spegne la richiesta di
  // conferma su una riga portata dal conto collegato, senza costringere a
  // falsarne la categoria.
  scommesse_proposta_archiviata: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'movimenti',
});

module.exports = Movimento;
