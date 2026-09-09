const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const buildWelcomeEmail = ({ userName, appUrl }) => {
  const name = typeof userName === 'string' ? userName.trim() : '';
  const greeting = name ? `Ciao ${name},` : 'Ciao,';
  const url = escapeHtml(appUrl);
  const logo = escapeHtml(new URL('/brand/wallt-logo-horizontal.png', appUrl).href);
  return {
    text: [greeting, '', 'Benvenuto su Wallt. Il tuo account è pronto.', '',
      'Con Wallt puoi tenere sotto controllo entrate, uscite e andamento delle tue finanze in modo semplice.', '',
      'Per iniziare:', '- Aggiungi la tua prima entrata.', '- Registra le tue spese.',
      '- Controlla la dashboard.', '- Imposta i tuoi obiettivi.', '', `Apri Wallt: ${appUrl}`, '',
      'A presto,', 'Wallt'].join('\n'),
    html: `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Benvenuto su Wallt</title></head>
<body style="margin:0;padding:0;background:#f3f5f6;font-family:Arial,Helvetica,sans-serif;color:#18252b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 24px 12px;"><img src="${logo}" width="132" alt="Wallt" style="display:block;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:12px 24px 28px;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#18252b;">Benvenuto su Wallt 👋</h1>
<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;">Il tuo account è pronto.</p>
<p style="margin:0 0 20px;">Con Wallt puoi tenere sotto controllo entrate, uscite e andamento delle tue finanze in modo semplice.</p>
<p style="margin:0 0 8px;font-weight:bold;">Per iniziare:</p>
<ul style="padding-left:22px;margin:0 0 24px;"><li>Aggiungi la tua prima entrata.</li><li>Registra le tue spese.</li><li>Controlla la dashboard.</li><li>Imposta i tuoi obiettivi.</li></ul>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#00d4aa" style="border-radius:8px;"><a href="${url}" style="display:inline-block;padding:14px 26px;color:#102b25;font-weight:bold;text-decoration:none;">Apri Wallt</a></td></tr></table>
<p style="margin:24px 0 0;">A presto,<br>Wallt</p></td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e5eaed;font-size:12px;line-height:1.5;color:#56666e;">Ricevi questa email perché hai creato un account Wallt.<br>Wallt · Gestione finanziaria personale</td></tr>
</table></td></tr></table></body></html>`,
  };
};

module.exports = { buildWelcomeEmail };
