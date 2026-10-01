const logger = require('../utils/logger');
const { FEATURE_BANK_SYNC } = require('../constants/entitlements');
const { descriviPiano, canUseFeature } = require('../services/entitlements.service');
const { statoSlot } = require('../services/betaSlots.service');
const { pagamentiDisponibili } = require('../services/billing/BillingProvider');

/**
 * `GET /api/piano` — cosa l'utente ha, e cosa può fare.
 *
 * Una sola chiamata risponde a tre domande che la SPA pone insieme
 * (impostazioni → Piano, pagina Conti, modale Premium), e le risponde in
 * modo coerente fra loro: con tre endpoint separati l'interfaccia potrebbe
 * mostrare "Premium Beta attivo" accanto a "Bank Sync non disponibile",
 * perché le due letture sarebbero di momenti diversi.
 *
 * ── Piano e permessi restano distinti ────────────────────────────────────
 * `piano` è il piano COMMERCIALE; `bank_sync.attiva` è il PERMESSO. Un utente
 * a cui lo staff ha concesso Bank Sync legge `piano: 'free'` e
 * `bank_sync: { attiva: true, source: 'admin' }` — ed è corretto: non ha
 * comprato niente e non occupa un posto beta. Fonderli renderebbe impossibile
 * sapere quanti posti sono davvero distribuiti.
 *
 * ── Cosa NON esce da qui ─────────────────────────────────────────────────
 * Nessun identificatore del fornitore di pagamento, nessun id di
 * entitlement altrui, nessun conteggio che riveli dati di altre persone
 * oltre al numero aggregato di posti occupati (che è un'informazione di
 * prodotto, non personale).
 */
const getPiano = async (req, res) => {
  try {
    const [piano, bankSync, slot] = await Promise.all([
      descriviPiano(req.userId),
      canUseFeature(req.userId, FEATURE_BANK_SYNC),
      statoSlot(FEATURE_BANK_SYNC),
    ]);

    res.json({
      ...piano,
      bank_sync: {
        attiva: bankSync.consentito,
        motivo: bankSync.motivo,
        source: bankSync.source,
        scade_il: bankSync.expires_at,
      },
      beta: {
        attiva: slot.beta_attiva,
        limite: slot.limite,
        occupati: slot.occupati,
        disponibili: slot.disponibili,
        // Offrire la beta a chi ce l'ha già sarebbe un invito senza senso.
        rivendicabile: slot.beta_attiva && slot.disponibili > 0 && !bankSync.consentito,
      },
      // Finché è false l'interfaccia mostra "Disponibile prossimamente" e
      // nessun pulsante che finga un pagamento.
      pagamenti_disponibili: pagamentiDisponibili(),
    });
  } catch (error) {
    logger.error('Errore getPiano', { err: error });
    res.status(500).json({ message: 'Errore nel recupero del piano' });
  }
};

module.exports = { getPiano };
