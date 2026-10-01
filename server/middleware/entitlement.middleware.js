const logger = require('../utils/logger');
const { canUseFeature, MOTIVI } = require('../services/entitlements.service');

/**
 * La barriera che sta davanti a ogni rotta di una feature a permesso.
 *
 * Segue lo stile di `featureAccess.middleware.js` (scommesse/investimenti),
 * ma su una base diversa: lì il criterio è il profilo dell'utente, qui è un
 * entitlement. In entrambi i casi la regola vive nel server e il client non
 * può aggirarla cambiando qualcosa nel browser.
 *
 * Il messaggio dipende dal motivo, perché il motivo determina cosa l'utente
 * può fare: "attiva la beta" e "funzione temporaneamente sospesa" portano a
 * due schermate diverse, e un 403 generico le renderebbe indistinguibili.
 * Il `motivo` viaggia in chiaro nella risposta: non è un'informazione
 * riservata, ed è ciò che permette alla SPA di mostrare la schermata giusta
 * senza fare una seconda chiamata.
 */

const MESSAGGI = {
  [MOTIVI.FEATURE_DISATTIVATA]:
    'La sincronizzazione bancaria è momentaneamente sospesa. I tuoi dati non sono stati toccati.',
  [MOTIVI.NESSUN_ENTITLEMENT]:
    'La sincronizzazione bancaria è una funzione Premium.',
  [MOTIVI.REVOCATO]:
    'Il tuo accesso alla sincronizzazione bancaria non è più attivo. I movimenti già importati restano disponibili.',
  [MOTIVI.SCADUTO]:
    'Il tuo accesso alla sincronizzazione bancaria è scaduto. I movimenti già importati restano disponibili.',
  [MOTIVI.FEATURE_SCONOSCIUTA]:
    'Funzione non disponibile.',
};

/**
 * @param {string} featureKey una delle FEATURE_KEYS. È un valore letterale
 *   scritto nella definizione della rotta: non arriva mai dal client, che
 *   altrimenti potrebbe chiedere il controllo su una feature che possiede
 *   per passarne una che non possiede.
 */
const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    const esito = await canUseFeature(req.userId, featureKey);
    if (esito.consentito) {
      // Chi sta a valle può sapere PERCHÉ l'utente ha accesso senza
      // rinterrogare il database (serve, per esempio, all'audit della sync).
      req.entitlement = esito;
      return next();
    }

    return res.status(403).json({
      error: 'Funzione non disponibile',
      message: MESSAGGI[esito.motivo] ?? MESSAGGI[MOTIVI.NESSUN_ENTITLEMENT],
      motivo: esito.motivo,
      feature: featureKey,
    });
  } catch (error) {
    logger.error('Errore verifica entitlement', { feature: featureKey, err: error });
    // In caso di dubbio si nega: un errore nella verifica dei permessi non
    // deve diventare un permesso.
    return res.status(503).json({
      error: 'Verifica permessi non disponibile',
      message: 'Non è stato possibile verificare i tuoi permessi. Riprova fra poco.',
    });
  }
};

module.exports = { requireFeature, MESSAGGI };
