const buildPasswordResetHtml = ({ resetUrl, userName }) => {
  const displayName = userName || 'utente';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reimposta password — WALLT</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0A0A0F;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#1C1C28;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px 28px;">
          <tr>
            <td style="text-align:center;padding-bottom:24px;">
              <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:rgba(0,212,170,0.15);font-size:24px;font-weight:800;color:#00D4AA;">W</div>
              <h1 style="margin:16px 0 0;font-size:22px;color:#FFFFFF;font-weight:700;">Reimposta la password</h1>
            </td>
          </tr>
          <tr>
            <td style="color:#8E8EA0;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 16px;">Ciao ${displayName},</p>
              <p style="margin:0 0 16px;">
                Hai richiesto di reimpostare la password del tuo account WALLT.
                Clicca il pulsante qui sotto per procedere:
              </p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${resetUrl}" style="display:inline-block;background:#00D4AA;color:#0A0A0F;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">
                  Reimposta password
                </a>
              </p>
              <p style="margin:0 0 16px;font-size:13px;color:#5A5A6E;">
                Il link scade tra <strong style="color:#8E8EA0;">30 minuti</strong>.
                Se non hai richiesto tu il reset, puoi ignorare questa email in tutta sicurezza.
              </p>
              <p style="margin:0;font-size:12px;color:#5A5A6E;word-break:break-all;">
                Link alternativo:<br>
                <a href="${resetUrl}" style="color:#00D4AA;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;border-top:1px solid rgba(255,255,255,0.06);color:#5A5A6E;font-size:12px;text-align:center;">
              © WALLT — Gestione finanziaria personale
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildPasswordResetText = ({ resetUrl, userName }) => {
  const displayName = userName || 'utente';

  return [
    `Ciao ${displayName},`,
    '',
    'Hai richiesto di reimpostare la password del tuo account WALLT.',
    'Clicca sul link seguente per scegliere una nuova password:',
    '',
    resetUrl,
    '',
    'Il link scade tra 30 minuti. Se non hai richiesto tu il reset, ignora questa email.',
    '',
    '— Il team WALLT',
  ].join('\n');
};

module.exports = {
  buildPasswordResetHtml,
  buildPasswordResetText,
};
