/**
 * Colore di ogni voce del budget, dai token del tema: lo stesso nella pagina,
 * nel dettaglio, nella scelta del modello e nella home.
 */
const COLORI = {
  bisogni: 'var(--accent-blue)',
  desideri: 'var(--accent-purple)',
  futuro: 'var(--accent-green)',
};

export const coloreVoce = (voce) => COLORI[voce] || 'var(--text-muted)';
