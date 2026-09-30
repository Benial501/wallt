import {
  Landmark,
  CreditCard,
  Banknote,
  TrendingUp,
  Dices,
  Smartphone,
  PiggyBank,
  Wallet,
  Building2,
  Gem,
  House,
  Car,
  Plane,
  ShoppingCart,
  Gamepad2,
  Coffee,
  Gift,
  Briefcase,
  Coins,
  Lock,
} from 'lucide-vue-next';

/**
 * Simboli selezionabili per un conto.
 *
 * Prima erano emoji. Il problema non era il gusto: un'emoji la disegna il
 * sistema operativo di chi guarda, quindi lo stesso conto appariva con tre
 * illustrazioni diverse su iPhone, Android e Windows, e ne' il colore ne' lo
 * spessore erano governabili dal tema. Con lucide il simbolo e' lo stesso
 * ovunque e segue i token dell'app, come ogni altra icona.
 *
 * `legacyEmoji` tiene in piedi i conti gia' creati: nel database il campo
 * `icona` contiene ancora l'emoji scelta a suo tempo, e va continuata a
 * leggere. Stesso schema di `obiettivoIcons.js`, che aveva gia' risolto
 * esattamente questo problema.
 */
export const CONTO_ICON_OPTIONS = [
  { id: 'banca', label: 'Banca', icon: Landmark, legacyEmoji: '🏦' },
  { id: 'carta', label: 'Carta', icon: CreditCard, legacyEmoji: '💳' },
  { id: 'contanti', label: 'Contanti', icon: Banknote, legacyEmoji: '💵' },
  { id: 'investimenti', label: 'Investimenti', icon: TrendingUp, legacyEmoji: '📈' },
  { id: 'scommesse', label: 'Scommesse', icon: Dices, legacyEmoji: '🎰' },
  { id: 'telefono', label: 'App di pagamento', icon: Smartphone, legacyEmoji: '📱' },
  { id: 'risparmio', label: 'Risparmio', icon: PiggyBank, legacyEmoji: '🐷' },
  { id: 'portafoglio', label: 'Portafoglio', icon: Wallet, legacyEmoji: '💰' },
  { id: 'sportello', label: 'Sportello', icon: Building2, legacyEmoji: '🏧' },
  { id: 'prezioso', label: 'Bene prezioso', icon: Gem, legacyEmoji: '💎' },
  { id: 'casa', label: 'Casa', icon: House, legacyEmoji: '🏠' },
  { id: 'auto', label: 'Auto', icon: Car, legacyEmoji: '🚗' },
  { id: 'viaggio', label: 'Viaggi', icon: Plane, legacyEmoji: '✈️' },
  { id: 'spesa', label: 'Spesa', icon: ShoppingCart, legacyEmoji: '🛒' },
  { id: 'giochi', label: 'Tempo libero', icon: Gamepad2, legacyEmoji: '🎮' },
  { id: 'bar', label: 'Bar', icon: Coffee, legacyEmoji: '☕' },
  { id: 'regalo', label: 'Regali', icon: Gift, legacyEmoji: '🎁' },
  { id: 'lavoro', label: 'Lavoro', icon: Briefcase, legacyEmoji: '💼' },
  { id: 'monete', label: 'Monete', icon: Coins, legacyEmoji: '🪙' },
  { id: 'vincolato', label: 'Vincolato', icon: Lock, legacyEmoji: '🔒' },
];

/** Simbolo proposto quando si sceglie il tipo di conto, prima di personalizzarlo. */
export const DEFAULT_ICON_BY_TIPO = {
  banca: 'banca',
  app_pagamento: 'carta',
  contanti: 'contanti',
  investimento: 'investimenti',
  scommesse: 'scommesse',
  wallet: 'telefono',
  risparmio: 'risparmio',
  emergenza: 'vincolato',
};

const perId = Object.fromEntries(CONTO_ICON_OPTIONS.map(({ id, icon }) => [id, icon]));
const idPerEmoji = Object.fromEntries(
  CONTO_ICON_OPTIONS.map(({ id, legacyEmoji }) => [legacyEmoji, id]),
);

/** Traduce qualunque valore salvato (id nuovo o emoji storica) in un id valido. */
export const normalizeContoIconId = (valore) => {
  if (valore && perId[valore]) return valore;
  return idPerEmoji[valore] || 'banca';
};

/** Il componente icona da rendere per un conto. Non restituisce mai `undefined`. */
export const resolveContoIcon = (valore) => perId[normalizeContoIconId(valore)] || Landmark;
