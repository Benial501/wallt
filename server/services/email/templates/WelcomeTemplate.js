const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

/**
 * Il rapporto fra testo e immagini non è un dettaglio estetico: con poco testo
 * SpamAssassin fa scattare HTML_IMAGE_ONLY_* e il messaggio perde oltre un
 * punto pieno di reputazione (misurato su mail-tester: 22% di testo, -1.282).
 * Le voci dell'elenco sono quindi frasi intere e non etichette di due parole.
 */
const buildWelcomeEmail = ({ userName, appUrl }) => {
  const name = typeof userName === 'string' ? userName.trim() : '';
  const greeting = name ? `Ciao ${name},` : 'Ciao,';
  const url = escapeHtml(appUrl);
  const logo = escapeHtml(new URL('/brand/wallt-logo-horizontal.png', appUrl).href);

  const intro = 'Wallt raccoglie in un posto solo conti, spese, entrate e risparmi, così sai sempre quanto hai da parte e dove stanno finendo i tuoi soldi. Non si collega alla tua banca e non ti chiede nessuna credenziale bancaria: i dati li inserisci o li importi tu, e restano tuoi.';

  const passi = [
    ['Aggiungi i tuoi conti.', 'Conto corrente, contanti, carte e conti deposito, ognuno con il suo saldo di partenza. Da quel momento Wallt aggiorna il totale del tuo patrimonio a ogni movimento che registri.'],
    ['Registra entrate e uscite.', "Puoi inserirle a mano in pochi secondi oppure importare l'estratto conto della banca in CSV, Excel o PDF: le operazioni vengono riconosciute e assegnate a una categoria in automatico, e ti resta solo da controllare quelle incerte."],
    ['Imposta un budget mensile.', 'Decidi quanto vuoi spendere per ogni categoria e ricevi un avviso quando ti stai avvicinando al limite, non il mese dopo averlo superato.'],
    ['Dai un obiettivo ai tuoi risparmi.', 'Stabilisci quanto vuoi mettere da parte ed entro quando: la dashboard ti mostra a che punto sei insieme al resto delle tue finanze.'],
  ];

  const chiusura = 'La configurazione iniziale richiede pochi minuti. Da lì in poi ti basta aggiungere i movimenti man mano che li fai, e dopo qualche settimana la sezione Analisi inizia a mostrarti come si distribuiscono le spese e come cambiano nel tempo: di solito è lì che saltano fuori gli abbonamenti che non ricordavi di avere.';

  return {
    text: [
      greeting, '',
      'Benvenuto su Wallt. Il tuo account è pronto.', '',
      intro, '',
      'Per iniziare:', '',
      ...passi.flatMap(([titolo, corpo]) => [`- ${titolo} ${corpo}`, '']),
      chiusura, '',
      `Apri Wallt: ${appUrl}`, '',
      'A presto,', 'Wallt', '',
      'Ricevi questa email perché hai creato un account Wallt.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Benvenuto su Wallt</title></head>
<body style="margin:0;padding:0;background:#f3f5f6;font-family:Arial,Helvetica,sans-serif;color:#18252b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f6;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 24px 12px;"><img src="${logo}" width="112" alt="Wallt" style="display:block;max-width:100%;height:auto;border:0;"></td></tr>
<tr><td style="padding:12px 24px 28px;font-size:16px;line-height:1.6;">
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#18252b;">Benvenuto su Wallt 👋</h1>
<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;">Il tuo account è pronto.</p>
<p style="margin:0 0 20px;">${escapeHtml(intro)}</p>
<p style="margin:0 0 12px;font-weight:bold;">Per iniziare:</p>
<ul style="padding-left:22px;margin:0 0 20px;">${passi.map(([titolo, corpo]) => `<li style="margin:0 0 12px;"><strong>${escapeHtml(titolo)}</strong> ${escapeHtml(corpo)}</li>`).join('')}</ul>
<p style="margin:0 0 24px;">${escapeHtml(chiusura)}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#00d4aa" style="border-radius:8px;"><a href="${url}" style="display:inline-block;padding:14px 26px;color:#102b25;font-weight:bold;text-decoration:none;">Apri Wallt</a></td></tr></table>
<p style="margin:24px 0 0;">A presto,<br>Wallt</p></td></tr>
<tr><td style="padding:20px 24px;border-top:1px solid #e5eaed;font-size:12px;line-height:1.5;color:#56666e;">Ricevi questa email perché hai creato un account Wallt con questo indirizzo. Se non sei stato tu, puoi ignorare il messaggio: senza conferma da parte tua l'account resta vuoto.<br><br>Wallt · Gestione finanziaria personale</td></tr>
</table></td></tr></table></body></html>`,
  };
};

module.exports = { buildWelcomeEmail };
