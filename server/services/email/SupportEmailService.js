const EmailService = require('./EmailService');
const { buildSupportConfirmationEmail } = require('./templates/SupportConfirmationTemplate');
const { Validator: { isEmail } } = require('sequelize');
const { version } = require('../../package.json');

const isSafeEmail = value => typeof value === 'string'
  && !/[\x00-\x20\x7f]/.test(value) && isEmail(value);

// Motivo del fallimento, sicuro da registrare: nome della variabile mancante
// oppure codice del provider. Il messaggio grezzo di Resend puo' contenere dati
// dell'utente o della chiave API, quindi non entra mai nel log.
const failure = (message, reason) => Object.assign(new Error(message), { reason });

const getSupportAddress = () => {
  const to = process.env.SUPPORT_EMAIL;
  if (!isSafeEmail(to)) {
    throw failure('Configurazione supporto non disponibile', 'config:SUPPORT_EMAIL');
  }
  return to;
};

// EmailService non lancia: restituisce { ok: false, reason } quando il servizio
// non e' pronto e { ok: false, error } quando il provider rifiuta. Solo `reason`
// e' un valore chiuso e sicuro; `error` resta fuori.
const deliver = async (mail) => {
  const result = await EmailService.sendEmail(mail);
  if (!result?.ok) {
    throw failure('Invio supporto non riuscito', `email:${result?.reason || 'send_failed'}`);
  }
  return result;
};

const sendSupportRequest = async ({ user, category, subject, message }) => {
  const to = getSupportAddress();
  if (!isSafeEmail(user.email) || /[\r\n\x00]/.test(subject) || /[\r\n\x00]/.test(category)) {
    throw failure('Dati supporto non validi', 'invalid_user_data');
  }

  // Solo testo: il contenuto scritto dall'utente non viene mai interpretato
  // come HTML. Reply-To porta la risposta all'indirizzo del suo account.
  await deliver({
    to,
    replyTo: user.email,
    subject: `[Wallt Support] ${category} - ${subject}`,
    text: [
      'Nuova richiesta di assistenza WALLT', '',
      `Email utente: ${user.email}`, `User ID: ${user.id}`,
      `Categoria: ${category}`, `Oggetto: ${subject}`,
      `Data e ora (UTC): ${new Date().toISOString()}`, `Versione API: ${version}`,
      `Ambiente: ${process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'}`,
      '', 'Messaggio:', message,
    ].join('\n'),
  });

  // Un errore della sola conferma non deve indurre a duplicare la richiesta:
  // il supporto l'ha gia' ricevuta.
  try {
    await deliver({
      to: user.email,
      replyTo: to,
      subject: `[Wallt Support] Richiesta ricevuta - ${subject}`,
      // Categoria e oggetto finiscono in HTML: il template li escapa.
      ...buildSupportConfirmationEmail({ category, subject, appUrl: process.env.APP_URL }),
    });
    return { confirmationSent: true };
  } catch {
    return { confirmationSent: false };
  }
};

/**
 * Contatto dal sito, senza login: l'indirizzo non e' verificato da nessuno.
 *
 * Per questo non parte nessuna conferma verso il mittente dichiarato: sarebbe
 * un amplificatore di spam, perche' chiunque potrebbe far recapitare posta di
 * Wallt a un indirizzo altrui. La ricevuta la da' l'interfaccia, non l'email.
 */
const sendPublicContactRequest = async ({ email, category, subject, message }) => {
  const to = getSupportAddress();
  if (!isSafeEmail(email) || /[\r\n\x00]/.test(subject) || /[\r\n\x00]/.test(category)) {
    throw failure('Dati contatto non validi', 'invalid_user_data');
  }

  await deliver({
    to,
    replyTo: email,
    subject: `[Wallt Contatto] ${category} - ${subject}`,
    text: [
      'Nuovo messaggio dal modulo di contatto pubblico', '',
      'ATTENZIONE: mittente NON autenticato. L\'indirizzo qui sotto e\' stato',
      'dichiarato da chi ha compilato il modulo e non e\' stato verificato:',
      'non trattarlo come prova di identita\'.', '',
      `Email dichiarata: ${email}`,
      `Categoria: ${category}`, `Oggetto: ${subject}`,
      `Data e ora (UTC): ${new Date().toISOString()}`, `Versione API: ${version}`,
      `Ambiente: ${process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'}`,
      '', 'Messaggio:', message,
    ].join('\n'),
  });
  return { confirmationSent: false };
};

module.exports = { sendSupportRequest, sendPublicContactRequest };
