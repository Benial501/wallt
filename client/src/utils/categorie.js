export const CATEGORIE_ENTRATA = [
  { id: 'stipendio', nome: 'Stipendio', emoji: '💼', colore: '#00D4AA' },
  { id: 'entrata_extra', nome: 'Entrata extra', emoji: '💵', colore: '#3498DB' },
  { id: 'regalo_ricevuto', nome: 'Regalo ricevuto', emoji: '🎁', colore: '#9B59B6' },
  { id: 'prelievo_scommesse', nome: 'Prelievo scommesse', emoji: '🎰', colore: '#E67E22' },
  { id: 'rendimento_investimenti', nome: 'Rendimento investimenti', emoji: '📈', colore: '#2ECC71' },
  { id: 'altro_entrata', nome: 'Altro', emoji: '📥', colore: '#95A5A6' },
  { id: 'da_verificare', nome: 'Da verificare', emoji: '❓', colore: '#FDCB6E' },
];

export const CATEGORIE_USCITA = [
  { id: 'cibo_spesa', nome: 'Cibo e spesa', emoji: '🍕', colore: '#FF6B6B' },
  { id: 'casa', nome: 'Casa', emoji: '🏠', colore: '#4ECDC4' },
  { id: 'bollette', nome: 'Bollette', emoji: '💡', colore: '#FFE66D' },
  { id: 'benzina_trasporti', nome: 'Benzina e trasporti', emoji: '⛽', colore: '#FF8C42' },
  { id: 'mezzi_pubblici', nome: 'Mezzi pubblici', emoji: '🚌', colore: '#6C5CE7' },
  { id: 'abbigliamento', nome: 'Abbigliamento', emoji: '👕', colore: '#FD79A8' },
  { id: 'svago', nome: 'Svago', emoji: '🎉', colore: '#A29BFE' },
  { id: 'deposito_scommesse', nome: 'Deposito scommesse', emoji: '🎲', colore: '#E17055' },
  { id: 'investimento', nome: 'Investimenti', emoji: '📊', colore: '#00B894' },
  { id: 'salute', nome: 'Salute', emoji: '🏥', colore: '#74B9FF' },
  { id: 'abbonamenti', nome: 'Abbonamenti', emoji: '📱', colore: '#636E72' },
  { id: 'regali', nome: 'Regali', emoji: '🎁', colore: '#FDCB6E' },
  { id: 'acquisti_vari', nome: 'Acquisti vari', emoji: '🛍️', colore: '#E84393' },
  { id: 'trasferimento_denaro', nome: 'Trasferimento denaro', emoji: '↔️', colore: '#3498DB' },
  { id: 'altro_uscita', nome: 'Altro', emoji: '📤', colore: '#B2BEC3' },
  { id: 'da_verificare', nome: 'Da verificare', emoji: '❓', colore: '#FDCB6E' },
];

export const getCategoriaEntrata = (id) =>
  CATEGORIE_ENTRATA.find((c) => c.id === id);

export const getCategoriaUscita = (id) =>
  CATEGORIE_USCITA.find((c) => c.id === id);
