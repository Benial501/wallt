#!/usr/bin/env node
/**
 * Concede o revoca il ruolo di amministratore.
 *
 *   node scripts/concedi-ruolo-admin.js utente@example.com
 *   node scripts/concedi-ruolo-admin.js utente@example.com --revoca
 *   node scripts/concedi-ruolo-admin.js --elenca
 *
 * ── Perché uno script e non una rotta ───────────────────────────────────
 * Il primo amministratore non può essere creato da un'API: servirebbe già un
 * amministratore per autorizzare la chiamata. E una rotta che promuove
 * amministratori sarebbe la superficie più preziosa dell'intera applicazione.
 *
 * Qui il privilegio richiede l'accesso al database — cioè le credenziali di
 * produzione, che stanno solo sulla macchina di chi amministra. Non è
 * un'email cablata nel codice (chiunque possa cambiare quell'email
 * diventerebbe amministratore) e non è un claim nel JWT (revocarlo non
 * avrebbe effetto fino alla scadenza del token).
 *
 * Su Supabase si lancia con la connection string delle migrazioni:
 *   NODE_ENV=migration node scripts/concedi-ruolo-admin.js io@example.com
 */

require('dotenv').config();

const { User, sequelize } = require('../models');
const { RUOLO_ADMIN, RUOLO_UTENTE } = require('../constants/entitlements');

const argomenti = process.argv.slice(2);
const revoca = argomenti.includes('--revoca');
const elenca = argomenti.includes('--elenca');
const email = argomenti.find((a) => !a.startsWith('--'));

const esci = (messaggio, codice = 1) => {
  // eslint-disable-next-line no-console
  console.error(messaggio);
  process.exitCode = codice;
};

const main = async () => {
  await sequelize.authenticate();

  const database = sequelize.config?.database ?? '(sconosciuto)';
  // eslint-disable-next-line no-console
  console.log(`Database: ${database}`);

  if (elenca) {
    const admin = await User.findAll({
      where: { ruolo: RUOLO_ADMIN },
      attributes: ['id', 'nome', 'email', 'last_login_at'],
      order: [['id', 'ASC']],
    });
    if (admin.length === 0) {
      // eslint-disable-next-line no-console
      console.log('Nessun amministratore configurato.');
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`Amministratori (${admin.length}):`);
    admin.forEach((u) => {
      // eslint-disable-next-line no-console
      console.log(`  #${u.id}  ${u.email}  (${u.nome})`);
    });
    return;
  }

  if (!email) {
    esci('Uso: node scripts/concedi-ruolo-admin.js <email> [--revoca] | --elenca');
    return;
  }

  const utente = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!utente) {
    esci(`Nessun utente con email ${email}.`);
    return;
  }

  const nuovoRuolo = revoca ? RUOLO_UTENTE : RUOLO_ADMIN;
  if (utente.ruolo === nuovoRuolo) {
    // eslint-disable-next-line no-console
    console.log(`Nessuna modifica: #${utente.id} ha già ruolo "${nuovoRuolo}".`);
    return;
  }

  const precedente = utente.ruolo;
  await utente.update({ ruolo: nuovoRuolo });

  // eslint-disable-next-line no-console
  console.log(`Utente #${utente.id} (${utente.email}): ruolo "${precedente}" → "${nuovoRuolo}".`);
};

main()
  .catch((errore) => {
    esci(`Errore: ${errore.message}`);
  })
  .finally(() => sequelize.close());
