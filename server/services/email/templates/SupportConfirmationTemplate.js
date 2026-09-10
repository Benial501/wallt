const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

/**
 * Conferma di ricezione di una richiesta di assistenza.
 *
 * Categoria e oggetto sono scritti dall'utente e qui finiscono dentro HTML:
 * vanno escapati sempre. Con la versione a solo testo il problema non esisteva.
 *
 * Come per il benvenuto, il testo visibile deve restare abbondante rispetto al
 * markup: un messaggio quasi vuoto fa scattare le regole antispam sul rapporto
 * testo/HTML, e questa email parte da un dominio giovane.
 */
const buildSupportConfirmationEmail = ({ category, subject, appUrl }) => {
  const url = new URL(appUrl || 'https://wallt.it');
  const logo = escapeHtml(new URL('/brand/wallt-logo-horizontal.png', url).href);
  const aiuto = escapeHtml(new URL('/aiuto', url).href);

  const apertura = 'Abbiamo ricevuto la tua richiesta di assistenza: è già in coda al team di Wallt e non devi rimandarla.';
  const tempi = 'Ti risponderemo all’indirizzo email associato al tuo account, lo stesso da cui hai inviato la richiesta. I tempi dipendono dalla complessità della segnalazione: per le domande sull’uso dell’app di solito bastano poche ore, mentre per un problema tecnico da riprodurre può servire qualche giorno.';
  const intanto = 'Nel frattempo, la sezione Aiuto dell’app raccoglie le domande più frequenti organizzate per attività: conti, movimenti, budget, obiettivi e importazione degli estratti conto. Spesso la risposta è già lì.';
  const sicurezza = 'Un promemoria di sicurezza: nessuno del team Wallt ti chiederà mai la password del tuo account, un codice di accesso o le credenziali della tua banca. Se ricevi un messaggio che te li chiede, non rispondere.';

  const dettagli = [['Categoria', category], ['Oggetto', subject]];

  return {
    text: [
      'Ciao,', '',
      apertura, '',
      'Riepilogo della richiesta:', '',
      ...dettagli.map(([etichetta, valore]) => `- ${etichetta}: ${valore}`), '',
      tempi, '',
      intanto, `Aprila qui: ${aiuto}`, '',
      sicurezza, '',
      'Grazie,', 'Supporto Wallt', '',
      'Ricevi questa email perché hai inviato una richiesta di assistenza dal tuo account Wallt.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Richiesta ricevuta</title></head>
<body style="margin:0;padding:0;background:#f3f5f6;font-family:Arial,Helvetica,sans-serif;color:#18252b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 24px 12px;"><img src="${logo}" width="112" alt="Wallt" style="display:block;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:12px 24px 28px;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#18252b;">Richiesta ricevuta</h1>
<p style="margin:0 0 16px;">Ciao,</p>
<p style="margin:0 0 20px;">${escapeHtml(apertura)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f3f5f6;border-radius:12px;">
<tr><td style="padding:16px 18px;font-size:15px;line-height:1.6;">
${dettagli.map(([etichetta, valore]) => `<div style="margin:0 0 6px;"><span style="color:#56666e;">${etichetta}:</span> <strong>${escapeHtml(valore)}</strong></div>`).join('')}
</td></tr></table>
<p style="margin:0 0 20px;">${escapeHtml(tempi)}</p>
<p style="margin:0 0 24px;">${escapeHtml(intanto)}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#00d4aa" style="border-radius:8px;"><a href="${aiuto}" style="display:inline-block;padding:14px 26px;color:#102b25;font-weight:bold;text-decoration:none;">Apri la sezione Aiuto</a></td></tr></table>
<p style="margin:24px 0 0;">${escapeHtml(sicurezza)}</p>
<p style="margin:20px 0 0;">Grazie,<br>Supporto Wallt</p></td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e5eaed;font-size:12px;line-height:1.5;color:#56666e;">Ricevi questa email perch&eacute; hai inviato una richiesta di assistenza dal tuo account Wallt. Se non sei stato tu, rispondi a questo messaggio e ce ne occupiamo.<br><br>Wallt &middot; Gestione finanziaria personale</td></tr>
</table></td></tr></table></body></html>`,
  };
};

module.exports = { buildSupportConfirmationEmail };
