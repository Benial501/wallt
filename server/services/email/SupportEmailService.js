const nodemailer = require('nodemailer');
const tls = require('tls');
const { Validator: { isEmail } } = require('sequelize');
const { version } = require('../../package.json');

const isSafeEmail = value => typeof value === 'string'
  && !/[\x00-\x20\x7f]/.test(value) && isEmail(value);

const getConfig = () => {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: pass, SUPPORT_EMAIL: to } = process.env;
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || port !== '465'
    || !isSafeEmail(user) || !isSafeEmail(to) || !pass) {
    throw new Error('Configurazione supporto non disponibile');
  }
  return { host, user, pass, to };
};

// Due invii entro i 60s Vercel. Ogni connessione viene chiusa prima del ritorno.
const send = async (config, mail) => {
  let socket;
  const transport = nodemailer.createTransport({
    host: config.host, port: 465, secure: true,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 5000, greetingTimeout: 5000,
    socketTimeout: 10000, dnsTimeout: 5000,
    disableFileAccess: true, disableUrlAccess: true,
    // Conserviamo il socket: close() di Nodemailer non interrompe da solo
    // una connessione SMTP non pooled ancora attiva allo scadere del timeout.
    getSocket: (_options, callback) => {
      socket = tls.connect({
        host: config.host, port: 465, servername: config.host,
        rejectUnauthorized: true, minVersion: 'TLSv1.2',
      });
      const onError = error => callback(error);
      socket.once('error', onError);
      socket.once('secureConnect', () => {
        socket.removeListener('error', onError);
        callback(null, { connection: socket, secured: true });
      });
    },
  });
  let timer;
  try {
    const result = await Promise.race([
      transport.sendMail(mail),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Invio supporto scaduto')), 20000);
      }),
    ]);
    if (!result.accepted?.some(address => address.toLowerCase() === mail.to.address.toLowerCase())) {
      throw new Error('Destinatario supporto non accettato');
    }
  } finally {
    clearTimeout(timer);
    socket?.destroy();
    transport.close();
  }
};

const sendSupportRequest = async ({ user, category, subject, message }) => {
  const config = getConfig();
  if (!isSafeEmail(user.email) || /[\r\n\x00]/.test(subject) || /[\r\n\x00]/.test(category)) {
    throw new Error('Dati supporto non validi');
  }
  const from = { name: 'Wallt Support', address: config.user };
  await send(config, {
    from, to: { address: config.to }, replyTo: { address: user.email },
    subject: `[Wallt Support] ${category} - ${subject}`,
    // Solo testo: il contenuto utente non viene interpretato come HTML.
    text: [
      'Nuova richiesta di assistenza WALLT', '',
      `Email utente: ${user.email}`, `User ID: ${user.id}`,
      `Categoria: ${category}`, `Oggetto: ${subject}`,
      `Data e ora (UTC): ${new Date().toISOString()}`, `Versione API: ${version}`,
      `Ambiente: ${process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'}`,
      '', 'Messaggio:', message,
    ].join('\n'),
  });
  // Un errore della sola conferma non deve indurre a duplicare la richiesta.
  try {
    await send(config, {
      from, to: { address: user.email }, replyTo: { address: config.to },
      subject: `[Wallt Support] Richiesta ricevuta - ${subject}`,
      text: [
        'Ciao,', '', 'abbiamo ricevuto la tua richiesta di assistenza.', '',
        'Oggetto:', subject, '',
        "Il team Wallt la esaminerà e potrai ricevere una risposta all'indirizzo email associato al tuo account.",
        '', 'Grazie,', 'Supporto Wallt',
      ].join('\n'),
    });
    return { confirmationSent: true };
  } catch {
    return { confirmationSent: false };
  }
};

module.exports = { sendSupportRequest };
