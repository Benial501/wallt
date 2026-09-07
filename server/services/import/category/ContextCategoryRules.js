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
];
function moneyMovement(description, bankType) {
  const text = normalizeText(description);
  if (/\b(?:giroconto|trasferimento interno|trasferimento tra conti|transfer between accounts)\b/.test(text)) return 'trasferimento';
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
