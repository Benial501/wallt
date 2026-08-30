const CATEGORIE_USCITA_IDS = [
  'cibo_spesa', 'casa', 'bollette', 'benzina_trasporti', 'mezzi_pubblici',
  'abbigliamento', 'svago', 'deposito_scommesse', 'investimento', 'salute',
  'abbonamenti', 'regali', 'acquisti_vari', 'trasferimento_denaro',
  'altro_uscita', 'da_verificare',
];

const CATEGORIE_ENTRATA_IDS = [
  'stipendio', 'entrata_extra', 'regalo_ricevuto', 'prelievo_scommesse',
  'rendimento_investimenti', 'altro_entrata', 'da_verificare',
];

const CATEGORIE_USCITA_AI = CATEGORIE_USCITA_IDS.filter((id) => id !== 'da_verificare');
const CATEGORIE_ENTRATA_AI = CATEGORIE_ENTRATA_IDS.filter((id) => id !== 'da_verificare');

const CATEGORIA_USCITA_DISPLAY = {
  cibo_spesa: { nome: 'Cibo e spesa', emoji: '🍕' },
  casa: { nome: 'Casa', emoji: '🏠' },
  bollette: { nome: 'Bollette', emoji: '💡' },
  benzina_trasporti: { nome: 'Benzina', emoji: '⛽' },
  mezzi_pubblici: { nome: 'Mezzi pubblici', emoji: '🚌' },
  abbigliamento: { nome: 'Abbigliamento', emoji: '👕' },
  svago: { nome: 'Svago', emoji: '🎉' },
  deposito_scommesse: { nome: 'Scommesse', emoji: '🎲' },
  investimento: { nome: 'Investimenti', emoji: '📊' },
  salute: { nome: 'Salute', emoji: '🏥' },
  abbonamenti: { nome: 'Abbonamenti', emoji: '📱' },
  regali: { nome: 'Regali', emoji: '🎁' },
  acquisti_vari: { nome: 'Acquisti', emoji: '🛍️' },
  trasferimento_denaro: { nome: 'Trasferimento denaro', emoji: '↔️' },
  altro_uscita: { nome: 'Altro', emoji: '📤' },
};

module.exports = {
  CATEGORIE_USCITA_IDS,
  CATEGORIE_ENTRATA_IDS,
  CATEGORIE_USCITA_AI,
  CATEGORIE_ENTRATA_AI,
  CATEGORIA_USCITA_DISPLAY,
};
