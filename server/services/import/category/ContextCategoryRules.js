const { normalizeText } = require('../../merchant/textUtils');
// Le espressioni preservano il contesto del prodotto: ENI da sola non identifica
// carburante; Amazon Prime non è confuso con un acquisto sul marketplace.
const rules = [
  ['uscita', /\b(?:amazon|amzn)\s+(?:prime|digital)\b/, 'abbonamenti_digitali', 96],
  ['uscita', /\bnetflix\b/, 'streaming', 98],
  ['uscita', /\b(?:disney\s*plus|dazn)\b/, 'streaming', 96],
  ['uscita', /\bspotify\b/, 'musica', 98],
  ['uscita', /\b(?:esselunga|conad|coop|lidl|aldi|eurospin|carrefour|penny market)\b/, 'supermercato', 97],
  ['uscita', /\b(?:amazon(?:\s+(?:eu|it|payments|mktp))?|amzn)\b/, 'shopping_online', 90],
  ['uscita', /\b(?:tim|vodafone|iliad|windtre)\b/, 'telefono', 92],
  ['uscita', /\b(?:bolletta|fornitura|utenza|plenitude)\b.*\bgas\b|\bgas\b.*\b(?:bolletta|fornitura|utenza)\b/, 'gas', 94],
  ['uscita', /\b(?:bolletta|fornitura|utenza)\b.*\b(?:luce|elettricit[aà]|energia elettrica)\b/, 'elettricita', 94],
  ['uscita', /\b(?:diesel|gasolio)\b/, 'diesel', 94],
  ['uscita', /\b(?:eni|ip|q8|tamoil|esso)\b.*\b(?:stazione servizio|carburante|benzina|distributore)\b|\b(?:carburante|benzina)\b/, 'benzina', 95],
  ['uscita', /\b(?:telepass|autostrade per l italia)\b/, 'pedaggi', 96],
  ['uscita', /\b(?:trenitalia|italo|trenord)\b/, 'treni', 96],
  ['uscita', /\b(?:deliveroo|just eat|glovo|uber eats)\b/, 'delivery', 96],
  ['uscita', /\b(?:mcdonalds|mcdonald|burger king|kfc)\b/, 'fast_food', 96],
  ['uscita', /\b(?:farmacia|parafarmacia)\b/, 'farmacia', 90],
  ['uscita', /\bcanone\s+(?:di\s+)?affitto\b|\baffitto\s+(?:casa|mensile|abitazione)\b/, 'affitto', 93],
  ['uscita', /\brata\s+mutuo\b/, 'mutuo', 96],
  ['uscita', /\bcommission[ei]\s+(?:bancari[ae]|bonifico|gestione conto)\b/, 'commissioni_bancarie', 94],
  ['entrata', /\b(?:stipendio|emolumenti|retribuzione)\b/, 'stipendio', 96],
  ['entrata', /\bpensione\b/, 'pensione', 94],
  ['entrata', /\bcashback\b/, 'cashback', 96],
  ['entrata', /\bdividend[oi]\b/, 'dividendi', 96],
  ['entrata', /\brimborso\b/, 'rimborso', 90],

  // --- Marchi ricorrenti negli estratti conto italiani ---------------------
  // Un marchio corto ma inequivocabile (SNAI, Zara, Bolt) va riconosciuto qui:
  // la knowledge base pesa le keyword per lunghezza e non riuscirebbe mai a
  // portarli sopra la soglia di accettazione.
  ['uscita', /\b(?:snai|sisal|goldbet|bet365|eurobet|lottomatica|betflag|planetwin)\b/, 'deposito_scommesse', 95],
  ['entrata', /\b(?:snai|sisal|goldbet|bet365|eurobet|lottomatica)\b/, 'prelievo_scommesse', 93],
  ['uscita', /\b(?:playstation|nintendo|xbox|steam(?:games)?|epic games|riot games|supercell)\b/, 'videogiochi', 95],
  ['uscita', /\b(?:anthropic|claude|openai|chatgpt|cursor|github|midjourney|notion|figma)\b/, 'abbonamenti_digitali', 93],
  // I punti diventano spazi in normalizeText: "Aruba.it" arriva come "aruba it".
  ['uscita', /\baruba(?:\s+it)?\b|\b(?:namecheap|godaddy|hetzner|digitalocean|vercel|cloudflare)\b/, 'abbonamenti_digitali', 92],
  // "Apple" da solo negli export Revolut è App Store / iCloud, non l'acquisto
  // di un dispositivo: quello arriva come "Apple Store".
  ['uscita', /\bapple store\b/, 'elettronica', 92],
  ['uscita', /\b(?:apple|itunes|icloud|app store|google one|microsoft 365|adobe)\b/, 'abbonamenti_digitali', 94],
  ['uscita', /\b(?:vinted|subito\.?it|wallapop|depop)\b/, 'marketplace', 94],
  ['uscita', /\b(?:temu|shein|aliexpress|wish)\b/, 'marketplace', 93],
  ['uscita', /\b(?:zara|h&m|hm|ovs|primark|bershka|pull&bear|stradivarius|calzedonia|intimissimi|tezenis)\b/, 'abbigliamento', 94],
  ['uscita', /\b(?:decathlon|nike|adidas|foot ?locker|cisalfa)\b/, 'attrezzatura_sportiva', 92],
  ['uscita', /\b(?:myprotein|prozis|foodspring|bulk powders)\b/, 'benessere', 92],
  ['uscita', /\b(?:bolt(?:\.eu)?|uber(?! eats)|free ?now|lyft|cabify)\b/, 'taxi', 92],
  ['uscita', /\b(?:enjoy|car2go|share ?now|lime|bird|dott|tier)\b/, 'car_sharing', 92],
  ['uscita', /\b(?:uci cinemas?|the space cinema|cinepolis|multisala)\b/, 'cinema', 95],
  ['uscita', /\b(?:billa|caprabo|mercadona|dia %|pam panorama|pam|carrefour express|md discount|in's mercato|famila|despar|tigros|bennet)\b/, 'supermercato', 94],
  ['uscita', /\b(?:risparmio casa|tedi|action|kik|casa henkel|maxi di)\b/, 'prodotti_casa', 92],
  ['uscita', /\b(?:italiana petroli|ip plus|eni station|q8 easy|tamoil|keropetrol)\b/, 'benzina', 93],
  ['uscita', /\b(?:tmb|transports metropolitans|renfe|atac|atm milano|gtt|amat|cotral)\b/, 'mezzi_pubblici', 92],
  ['uscita', /\b(?:booking\.com|airbnb|trivago|expedia)\b/, 'hotel', 93],
  ['uscita', /\b(?:ryanair|easyjet|wizz ?air|vueling|ita airways|lufthansa)\b/, 'voli', 94],
  ['uscita', /\brevolut digital assets|\b(?:binance|coinbase|kraken|degiro|trade republic|scalable capital|directa)\b/, 'trading', 93],
  ['uscita', /\b(?:zooplus|arcaplanet|maxi zoo)\b/, 'animali', 93],

  // Locali notturni: l'insegna non dice il mestiere, quindi vanno elencati per
  // nome. La categoria è "svago", non "bar": è una serata fuori, non una
  // consumazione quotidiana.
  ['uscita', /\b(?:nivro|tsf|jmt|duplex|glass globe|mistic sf|g&s srls|central club)\b/, 'svago', 90],
  ['uscita', /\b(?:discotec[ae]|night ?club|dancing|club privé)\b/, 'svago', 88],

  // Pagamenti fra persone: è la voce più frequente negli export Revolut e
  // Satispay. Il nome della controparte cambia sempre, la formula no.
  ['uscita', /^pagamento a(?:\s+favore\s+di)?\s+\S/, 'trasferimento_denaro', 90],
  ['entrata', /^pagamento da(?:\s+parte\s+di)?\s+\S/, 'trasferimenti_ricevuti', 90],
  ['entrata', /\b(?:ricompensa|campagna di inviti|bonus benvenuto|referral)\b/, 'cashback', 90],

  // --- Parole generiche delle piccole attività italiane ---------------------
  // Coprono la coda lunga di esercenti che nessun elenco di marchi può
  // contenere: il nome proprio cambia, il tipo di attività no.
  ['uscita', /\b(?:gelateri[ae]|gelat\w*|yogurt\w*|cremeri[ae]|pasticceri[ae]|cornetteri[ae]|caffetteri[ae]|caffe|bar|pub|birreri[ae]|biergarten|enotec[ae]|paninotec[ae])\b/, 'bar', 88],
  ['uscita', /\b(?:pizzeri[ae]|pizzeria|pizz)\b/, 'pizzerie', 90],
  ['uscita', /\b(?:ristorant[ei]|trattori[ae]|osteri[ae]|tavern[ae]|braceri[ae]|sushi|ramen|kebab|steak ?house|agriturismo)\b/, 'ristoranti', 90],
  ['uscita', /\b(?:panetteri[ae]|panifici[o]|forno|forneri[ae]|macelleri[ae]|pescheri[ae]|ortofrutt[ae]|salumeri[ae]|alimentari|minimarket|mini market|supermercat[oi]|market|bottegh\w*|drogheri[ae])\b/, 'supermercato', 89],
  ['uscita', /\b(?:barber\w*|barbier[ei]|parrucchier[ei]|acconciature|hair ?(?:studio|style|salon))\b/, 'parrucchiere', 92],
  ['uscita', /\b(?:estetic[ae]|estetist[ae]|centro benessere|spa|massaggi|profumeri[ae]|erboristeri[ae])\b/, 'cura_personale', 90],
  ['uscita', /\b(?:piscin[ae]|palestr[ae]|fitness|crossfit|polisportiv[ae]|tennis|padel|calcetto)\b|\ba s d\b/, 'sport', 90],
  ['uscita', /\b(?:cinem[ae]|teatr[oi]|muse[oi]|discotec[ae]|concert[oi]|festival|live club)\b/, 'eventi', 88],
  ['uscita', /\b(?:otti[cs][ae]|occhiali|optometri)\b/, 'salute', 89],
  ['uscita', /\b(?:tabaccheri[ae]|edicol[ae]|cartoleri[ae]|libreri[ae])\b/, 'hobby', 86],
  ['uscita', /\b(?:ferrament[ae]|lavanderi[ae]|calzoleri[ae]|vetreri[ae])\b/, 'prodotti_casa', 86],

  // Giroconti verso una persona: gli export Revolut usano "To <Nome Cognome>".
  ['uscita', /^to\s+[a-z]+(?:\s+[a-z]+){1,2}$/, 'trasferimento_denaro', 88],
  ['entrata', /^from\s+[a-z]+(?:\s+[a-z]+){1,2}$/, 'trasferimenti_ricevuti', 88],
  ['entrata', /\bricarica\b.*\b(?:apple pay|google pay|carta|con)\b|\btop.?up\b/, 'trasferimenti_ricevuti', 90],
];
function moneyMovement(description, bankType) {
  const text = normalizeText(description);
  if (/\b(?:giroconto|trasferimento interno|trasferimento tra conti|transfer between accounts)\b/.test(text)) return 'trasferimento';
  // Il versamento su un conto deposito / salvadanaio è un movimento fra conti
  // dell'utente: non è né entrata né uscita. Ha un'etichetta propria perché in
  // revisione va riconosciuto a colpo d'occhio come deposito, non come un
  // generico giroconto.
  if (/\bconto deposito\b|\bsavings vault\b|\bsalvadanaio\b|\bdeposito senza vincoli\b/.test(text)) return 'deposito';
  if (/\b(?:prelievo (?:contanti|atm|bancomat)|cash withdrawal)\b/.test(text) || /^atm$/i.test(bankType || '')) return 'prelievo';
  if (/\b(?:versamento contanti|cash deposit)\b/.test(text)) return 'versamento';
  return null;
}
function matchContext(transaction) {
  const text = normalizeText(transaction.descrizione);
  const movement = moneyMovement(transaction.descrizione, transaction.revolutType);
  if (movement || transaction.tipo === 'trasferimento') return { categoria: 'da_verificare', confidenza: 0, source: 'transfer_review', requiresTransferReview: true, natura: movement || 'trasferimento' };
  const rule = rules.find(([tipo, pattern]) => tipo === transaction.tipo && pattern.test(text));
  if (!rule) return null;
  return { categoria: rule[2], confidenza: rule[3], source: 'merchant_rule', matchedPattern: text };
}
module.exports = { matchContext, moneyMovement };
