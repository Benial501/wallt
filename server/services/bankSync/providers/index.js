const { PROVIDER_GOCARDLESS, PROVIDER_SANDBOX, ERR_CONFIG } = require('../../../constants/bankSync');
const { BANK_SYNC_PROVIDER } = require('../../../constants/appConfig');
const { getConfig } = require('../../appConfig.service');
const { BankProviderError } = require('./BankProvider');
const GoCardlessBankProvider = require('./GoCardlessBankProvider');
const SandboxBankProvider = require('./SandboxBankProvider');

/**
 * La fabbrica degli adapter Open Banking.
 *
 * Unico punto in cui WALLT decide *quale* provider usare. Il resto del codice
 * riceve un `BankProvider` e non sa quale sia: è ciò che rende sostituibile
 * il fornitore senza riscrivere il motore di sincronizzazione.
 *
 * ── Il sandbox non entra in produzione ───────────────────────────────────
 * Non è una convenzione, è un errore lanciato. Se qualcuno impostasse
 * `bank_sync_provider = 'sandbox'` sul database di produzione, qui la
 * richiesta fallirebbe invece di scrivere movimenti inventati nei dati
 * finanziari reali di una persona. È la regola "nessun mock in produzione,
 * nessun dato finanziario fittizio nel database reale" resa impossibile da
 * violare per distrazione.
 */

const costruttori = {
  [PROVIDER_GOCARDLESS]: () => new GoCardlessBankProvider(),
  [PROVIDER_SANDBOX]: () => new SandboxBankProvider(),
};

const inProduzione = () => process.env.NODE_ENV === 'production';

/**
 * L'adapter configurato.
 *
 * @param {{nome?: string}} [opzioni] forza un provider (solo per i test, che
 *   normalmente iniettano direttamente l'istanza).
 * @returns {import('./BankProvider').BankProvider}
 */
const getBankProvider = async ({ nome = null } = {}) => {
  const scelto = nome || await getConfig(BANK_SYNC_PROVIDER);

  if (scelto === PROVIDER_SANDBOX && inProduzione()) {
    throw new BankProviderError(
      ERR_CONFIG,
      'Il provider sandbox non è utilizzabile in produzione',
      { statusCode: 500 },
    );
  }

  const costruttore = costruttori[scelto];
  if (!costruttore) {
    throw new BankProviderError(
      ERR_CONFIG,
      `Provider Open Banking non riconosciuto: ${scelto}`,
      { statusCode: 500 },
    );
  }

  return costruttore();
};

module.exports = {
  getBankProvider,
  GoCardlessBankProvider,
  SandboxBankProvider,
};
