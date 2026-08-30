/** Emoji selezionabili per i conti (creazione e modifica). */
export const CONTO_EMOJI = [
  '🏦', '💳', '💵', '📈', '🎰', '📱', '🐷', '💰', '🏧', '💎',
  '🏠', '🚗', '✈️', '🛒', '🎮', '☕', '🎁', '💼', '🪙', '🔒',
];

export const DEFAULT_EMOJI_BY_TIPO = {
  banca: '🏦',
  app_pagamento: '💳',
  contanti: '💵',
  investimento: '📈',
  scommesse: '🎰',
  wallet: '📱',
  risparmio: '🐷',
};

/** Include l'emoji corrente se non è nella lista predefinita. */
export const emojiOptionsFor = (current) => {
  if (current && !CONTO_EMOJI.includes(current)) {
    return [current, ...CONTO_EMOJI];
  }
  return CONTO_EMOJI;
};
