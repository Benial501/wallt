# WALLT — Database

> Schema database basato su modelli Sequelize e migrazioni del repository.

## Database utilizzato

- **MySQL 8.x**
- ORM: **Sequelize 6.37**
- Driver: **mysql2 3.22**
- Configurazione: `server/config/database.js` (per env dev/test/prod) + `server/config/sequelize.js` (runtime)

## Configurazione

| Variabile | Default | Descrizione |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | Host MySQL |
| `DB_PORT` | `3306` | Porta |
| `DB_NAME` | `wallt_db` | Database produzione |
| `DB_NAME_TEST` | `wallt_test` | Database test (Jest) |
| `DB_USER` | `root` | Utente |
| `DB_PASSWORD` | (vuoto) | Password |

Migrazioni: `npm run migrate` o auto-run all'avvio (`server.js`).

## Tabelle e modelli

### `users`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `nome` | STRING(100) | Obbligatorio |
| `email` | STRING(255) UNIQUE | Obbligatorio |
| `password` | STRING(255) | Nullable (OAuth users) |
| `avatar` | STRING(500) | |
| `valuta` | STRING(3) | Default `EUR` |
| `tema` | ENUM dark/light | Default `dark` |
| `reminder` | BOOLEAN | Default true |
| `mostra_scommesse` | BOOLEAN | Feature flag UI |
| `mostra_investimenti` | BOOLEAN | Feature flag UI |
| `auth_provider` | STRING | `local` o `google` |
| `google_id` | STRING | |
| `privacy_accepted_at` | DATE | GDPR |
| `terms_accepted_at` | DATE | GDPR |
| `use_ai_categorization` | BOOLEAN | Consenso AI |
| `password_changed_at` | DATE | Invalidazione JWT |
| `last_login_at` | DATE | |

### `profili_utente`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER UNIQUE FK → users | |
| `fascia_eta` | STRING(50) | `under_18`, `18_24`, ecc. |
| `situazione_lavorativa` | STRING(100) | |
| `entrata_fissa` | BOOLEAN | |
| `entrata_mensile` | DECIMAL(12,2) | |
| `situazione_abitativa` | STRING(100) | |
| `costo_abitazione` | DECIMAL(12,2) | |
| `paga_bollette` | ENUM tutte/divise/no | |
| `stima_bollette` | DECIMAL(12,2) | |
| `ha_auto`, `ha_moto` | BOOLEAN | |
| `usa_mezzi_pubblici` | BOOLEAN | |
| `spesa_benzina`, `spesa_mezzi` | DECIMAL(12,2) | |
| `spese_fisse_extra` | DECIMAL(12,2) | |
| `risparmia` | STRING(50) | |
| `ha_investimenti` | STRING(50) | |
| `fa_scommesse` | STRING(50) | Default `no` |
| `onboarding_completato` | BOOLEAN | Default false |

### `conti`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `nome` | STRING(100) | |
| `tipo` | STRING(50) | banca, wallet, contanti, scommesse, investimento, ecc. |
| `saldo` | DECIMAL(12,2) | Default 0 |
| `icona` | STRING(50) | Emoji |
| `colore` | STRING(20) | Hex |
| `ordine` | INTEGER | |
| `attivo` | BOOLEAN | Soft-delete |

### `movimenti`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `conto_id` | INTEGER FK → conti | |
| `conto_destinazione_id` | INTEGER FK → conti | Solo trasferimenti |
| `tipo` | ENUM | `entrata`, `uscita`, `trasferimento` |
| `importo` | DECIMAL(12,2) | |
| `categoria` | STRING(100) | ID categoria (es. `cibo_spesa`) |
| `descrizione` | STRING(500) | |
| `data` | DATEONLY | Data transazione |
| `ricorrente` | BOOLEAN | |
| `ricorrente_frequenza` | ENUM | giornaliera/settimanale/mensile/annuale |
| `ricorrente_giorno` | INTEGER | Giorno del mese |
| `categoria_automatica` | BOOLEAN | |
| `categoria_confidenza` | INTEGER | 0-100 |
| `categoria_modificata` | BOOLEAN | Utente ha corretto |

### `budget_mensili`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `mese` | INTEGER | 1-12 |
| `anno` | INTEGER | |
| `importo_totale` | DECIMAL(12,2) | |
| `generato_da_ai` | BOOLEAN | |

### `budget_categorie`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `budget_id` | INTEGER FK → budget_mensili | |
| `categoria` | STRING(100) | |
| `percentuale` | DECIMAL(5,2) | |
| `importo` | DECIMAL(12,2) | |

### `obiettivi`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `nome` | STRING(200) | |
| `importo_target` | DECIMAL(12,2) | |
| `importo_attuale` | DECIMAL(12,2) | |
| `deadline` | DATEONLY | |
| `icona` | STRING(50) | |
| `completato` | BOOLEAN | |

### `obiettivo_contributi`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `obiettivo_id` | INTEGER FK → obiettivi | |
| `importo` | DECIMAL(12,2) | |
| `data` | DATEONLY | |
| `nota` | STRING(500) | |

### `piattaforme_scommesse`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `nome` | STRING(100) | |
| `saldo` | DECIMAL(12,2) | |
| `limite_mensile` | DECIMAL(12,2) | |
| `attiva` | BOOLEAN | |
| `conto_id` | INTEGER FK → conti | Sync bidirezionale |

### `movimenti_scommesse`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `piattaforma_id` | INTEGER FK → piattaforme_scommesse | |
| `user_id` | INTEGER FK → users | |
| `tipo` | ENUM | deposito/prelievo/vincita/perdita |
| `importo` | DECIMAL(12,2) | |
| `data` | DATEONLY | |
| `nota` | STRING(500) | |

### `investimenti`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `nome_piattaforma` | STRING(100) | |
| `tipo` | ENUM | azioni/etf/crypto/fondi/obbligazioni/altro |
| `saldo_attuale` | DECIMAL(12,2) | |
| `colore` | STRING(20) | |
| `attivo` | BOOLEAN | |
| `note` | STRING(500) | |

### `movimenti_investimento`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `investimento_id` | INTEGER FK → investimenti | |
| `user_id` | INTEGER FK → users | |
| `tipo` | ENUM | versamento/prelievo/rendimento/perdita |
| `importo` | DECIMAL(12,2) | |
| `data` | DATEONLY | |
| `nota` | STRING(500) | |
| `saldo_dopo` | DECIMAL(12,2) | Snapshot saldo post-movimento |

### `categorie_regole`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER | Nullable = regola globale |
| `pattern` | STRING | Pattern testuale |
| `categoria` | STRING(100) | |
| `priorita` | INTEGER | |
| `attiva` | BOOLEAN | |

**Nessuna associazione Sequelize definita** (usata direttamente dai services).

### `regole_personali_merchant`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `pattern` | STRING | |
| `merchant_name` | STRING | |
| `merchant_id` | STRING | |
| `categoria` | STRING(100) | |
| `priorita` | INTEGER | |
| `attiva` | BOOLEAN | |

### `password_reset_tokens`
| Campo | Tipo | Note |
|---|---|---|
| `id` | INTEGER PK AI | |
| `user_id` | INTEGER FK → users | |
| `token_hash` | STRING(64) | SHA-256 hex |
| `expires_at` | DATE | 30 min TTL |
| `used_at` | DATE | Single-use |
| `created_at` | DATE | No `updatedAt` |

## Relazioni testuali

```
User
├── ProfiloUtente (1:1)
├── Conto (1:N)
│   ├── Movimento (1:N) — come conto origine
│   ├── Movimento (1:N) — come conto destinazione (trasferimenti)
│   └── PiattaformaScommesse (1:1) — sync bidirezionale
├── Movimento (1:N)
├── BudgetMensile (1:N)
│   └── BudgetCategoria (1:N)
├── Obiettivo (1:N)
│   └── ObiettivoContributo (1:N)
├── PiattaformaScommesse (1:N)
│   └── MovimentoScommesse (1:N)
├── Investimento (1:N)
│   └── MovimentoInvestimento (1:N)
├── CategorieRegola (1:N) — regole personali
├── RegolaPersonaleMerchant (1:N)
└── PasswordResetToken (1:N)

CategorieRegola (globali, user_id = NULL) — nessuna FK
```

## Migrazioni

| File | Contenuto |
|---|---|
| `20250101000001-create-all-tables.js` | Tutte le tabelle core |
| `20250101000002-add-user-preferences.js` | mostra_scommesse, mostra_investimenti |
| `20250101000003-add-indexes.js` | Indici base |
| `20250101000004-add-social-auth.js` | auth_provider, google_id, password nullable |
| `20250714_add_auth_provider.js` | **Duplicato** di sopra + backfill |
| `20250714_add_last_login_at.js` | last_login_at |
| `20250714_add_password_changed_at.js` | password_changed_at |
| `20250714_add_privacy_terms_fields.js` | privacy/terms accepted |
| `20250714_add_use_ai_categorization.js` | use_ai_categorization |
| `20250714_create_password_reset_tokens.js` | Tabella reset tokens |
| `20260708000005-create-categorie-regole.js` | Tabella + seed regole globali |
| `20260708000006-add-categoria-auto-fields-to-movimenti.js` | categoria_automatica, confidenza, modificata |
| `20260713000007-create-regole-personali-merchant.js` | Tabella merchant rules |
| `20260713000008-add-performance-indexes.js` | Indici compositi |
| `20260714180000-update-password-reset-token-sha256.js` | token_hash VARCHAR(64) |
| `20260715000009-link-scommesse-conto.js` | piattaforme_scommesse.conto_id FK |

## Query importanti

- **Patrimonio totale**: somma `Conto.saldo` (attivi) + `Investimento.saldo_attuale` (attivi) per `user_id`.
- **Bilancio mese**: aggregazione `Movimento` per tipo (entrata/uscita) filtrato per mese/anno.
- **Movimenti recenti home**: `ORDER BY createdAt DESC` (non per data transazione).
- **Distribuzione spese**: `GROUP BY categoria` su movimenti tipo `uscita` nel periodo.
- **Andamento patrimonio**: calcolo storico basato su movimenti cumulativi.

## Database Risks

### DR-1: Migrazioni duplicate
- **Gravità**: Medium
- **File**: `20250101000004-add-social-auth.js`, `20250714_add_auth_provider.js`
- **Problema**: Due migrazioni modificano le stesse colonne. La seconda ha try/catch ma crea confusione.
- **Impatto**: Deploy su DB pulito potrebbe avere comportamento imprevisto.
- **Soluzione**: Consolidare in una migrazione, rimuovere duplicato.
- **Rischio modifica**: Medium

### DR-2: Auto-migrate in produzione
- **Gravità**: Medium
- **File**: `server/server.js`
- **Problema**: Migrazioni eseguite ad ogni avvio. Con più istanze PM2, race condition.
- **Impatto**: Corruzione schema o lock DB.
- **Soluzione**: Migrazioni come step deploy separato.
- **Rischio modifica**: Low

### DR-3: Nessun backup automatizzato
- **Gravità**: High
- **File**: Non presente nel repository
- **Problema**: Nessuno script o configurazione di backup DB.
- **Impatto**: Perdita dati in caso di crash DB.
- **Soluzione**: Cron mysqldump o backup managed del provider.
- **Rischio modifica**: Low (aggiunta, non modifica)

### DR-4: Soft-delete conti senza cascade
- **Gravità**: Low
- **File**: `conti.controller.js`
- **Problema**: Conto disattivato (`attivo: false`) mantiene movimenti associati. Query con `solo_conti_attivi` li esclude ma i dati restano.
- **Impatto**: Dati orfani, patrimonio potenzialmente impreciso se non filtrato.
- **Soluzione**: Documentare comportamento; opzionalmente archiviare movimenti.
- **Rischio modifica**: Medium

### DR-5: DECIMAL(12,2) per importi
- **Gravità**: Low
- **File**: Tutti i modelli finanziari
- **Problema**: Max ~9.999.999.999,99 — sufficiente per uso personale ma non validato esplicitamente.
- **Impatto**: Overflow silenzioso improbabile ma possibile.
- **Soluzione**: Validazione max importo nei controller.
- **Rischio modifica**: Low

### DR-6: Modelli senza associazioni Sequelize
- **Gravità**: Low
- **File**: `CategorieRegola`, `RegolaPersonaleMerchant`
- **Problema**: Non hanno `hasMany`/`belongsTo` in `models/index.js`. Query manuali nei services.
- **Impatto**: Nessun cascade delete automatico; dati orfani se utente eliminato (mitigato da `deleteAllUserData`).
- **Soluzione**: Aggiungere associazioni.
- **Rischio modifica**: Low
