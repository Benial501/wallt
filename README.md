# 💳 WALLT — Personal Finance Manager

![Status](https://img.shields.io/badge/Status-Beta-yellow)
![Vue.js](https://img.shields.io/badge/Vue.js-3-4FC08D?logo=vue.js)
![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?logo=postgresql)
![License](https://img.shields.io/badge/License-MIT-blue)
![Language](https://img.shields.io/badge/Lingua-Italiano-green)

> Gestisci il tuo patrimonio, traccia le spese,
> imposta budget intelligenti e raggiungi i tuoi
> obiettivi finanziari. Tutto in italiano,
> tutto sotto controllo.

## 🚀 Cos'è WALLT

WALLT è un'applicazione web di gestione
finanziaria personale pensata per il mercato
italiano. Permette di avere una visione
completa e in tempo reale di tutta la propria
situazione finanziaria: conti bancari,
contanti, investimenti, wallet digitali
e molto altro.

A differenza delle app simili, WALLT:
- Non richiede collegamento bancario automatico
- Genera un budget personalizzato basato
  sul profilo reale dell'utente
- Include sezione dedicata al controllo
  delle scommesse sportive
- Traccia gli investimenti nel tempo con ROI
- Si adatta alle abitudini dell'utente
- È completamente in italiano e gratuita

## ✨ Funzionalità principali

### 💰 Patrimonio totale
Visione unificata di tutti i conti,
contanti, investimenti e wallet digitali.

### 💼 Gestione multi-conto
Banca, Revolut, N26, contanti, eToro,
PayPal, Satispay, risparmi e altro.
Trasferimenti tra conti senza contarli
come spesa o entrata.

### 💸 Tracciamento movimenti
Registra entrate e uscite per categoria,
conto, data e note. Gestisci spese
ricorrenti automatiche mensili.

### 💡 Budget mensile intelligente
Budget su misura basato sul profilo utente:
età, lavoro, abitazione, trasporti.
Si adatta nel tempo alle abitudini reali.

### 🎯 Obiettivi di risparmio
Crea obiettivi con importo target e deadline.
Monitora il progresso con animazioni.
Ricevi la rata mensile necessaria calcolata.

### 📈 Investimenti
Traccia investimenti su eToro, Degiro,
crypto e altro. Registra versamenti,
prelievi, rendimenti e perdite.
Analisi ROI completa nel tempo.

### 🎰 Controllo scommesse
Sezione dedicata per Snai, Bet365, Goldbet.
Registra depositi, prelievi, vincite e perdite.
Limite mensile autoimposto con alert.

### 📊 Analisi e report
Grafici interattivi: distribuzione spese,
confronto mesi, andamento patrimonio.
Suggerimenti automatici dai tuoi dati.

## 🛠️ Tech Stack

### Frontend
| Tecnologia   | Utilizzo                    |
|--------------|-----------------------------|
| Vue.js 3     | Framework (Composition API) |
| Vite         | Build tool                  |
| Vue Router   | Navigazione SPA             |
| Pinia        | State management            |
| Tailwind CSS | Styling base                |
| Chart.js     | Grafici interattivi         |
| Axios        | Chiamate HTTP               |
| dayjs        | Gestione date italiano      |

### Backend
| Tecnologia        | Utilizzo            |
|-------------------|---------------------|
| Node.js           | Runtime             |
| Express.js        | Web framework       |
| Sequelize         | ORM                 |
| PostgreSQL        | Database (Supabase) |
| JWT               | Autenticazione      |
| bcrypt            | Hash password       |
| express-validator | Validazione input   |
| helmet            | Sicurezza headers   |
| node-cron         | Task automatici     |

## 📁 Struttura progetto

```
wallt/
├── client/                 # Frontend Vue 3 + Vite
│   ├── src/
│   │   ├── components/     # Componenti UI riutilizzabili
│   │   ├── views/          # Pagine dell'applicazione
│   │   ├── stores/         # Pinia stores
│   │   ├── composables/    # Logica riutilizzabile Vue
│   │   └── router/         # Configurazione rotte
│   └── package.json
├── server/                 # Backend Node.js + Express
│   ├── config/             # Configurazione database
│   ├── controllers/        # Logica API
│   ├── models/             # Modelli Sequelize
│   ├── routes/             # Endpoint REST
│   ├── .env.example        # Template variabili ambiente
│   └── package.json
├── .gitignore
└── README.md
```

## ⚙️ Installazione

### Prerequisiti
- Node.js 22+
- PostgreSQL 15+ oppure un progetto Supabase
- npm

### Setup

```bash
# Clona il repository
git clone https://github.com/christianmaiolo/wallt.git
cd wallt

# Backend
cd server
cp .env.example .env
# Modifica .env con le credenziali PostgreSQL locali
npm install
npm start

# Frontend (in un altro terminale)
cd client
npm install
npm run dev
```

L'app sarà disponibile su `http://localhost:5173` e l'API su `http://localhost:3000`.

Per pubblicare il progetto con Vercel e Supabase, segui [la guida passo passo](docs/DEPLOY_VERCEL_SUPABASE.md).

## 📄 Licenza

MIT License — vedi il file LICENSE per i dettagli.
