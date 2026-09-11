// Logica del gesto di swipe sulle righe dei movimenti, isolata dal componente
// per poter essere verificata: e' qui che stava il bug per cui scorrendo la
// lista le righe si trascinavano dietro il dito.

/** Sotto questa distanza il gesto non e' ancora interpretabile. */
export const SOGLIA_DIREZIONE = 10;
/**
 * Lo scorrimento verticale vince a parita': in una lista si scorre molto piu'
 * spesso di quanto si trascini una riga, e il pollice devia sempre un po'.
 */
export const RAPPORTO_ORIZZONTALE = 1.4;
export const REVEAL = 80;
export const MAX_DRAG = 96;

/**
 * Decide l'asse del gesto. Va chiamata finche' restituisce null; una volta
 * deciso, l'asse non cambia piu' per tutta la durata del gesto.
 * @returns {'x'|'y'|null} null se il movimento e' ancora troppo piccolo.
 */
export const decidiAsse = (dx, dy, {
  soglia = SOGLIA_DIREZIONE,
  rapporto = RAPPORTO_ORIZZONTALE,
} = {}) => {
  if (Math.abs(dx) < soglia && Math.abs(dy) < soglia) return null;
  return Math.abs(dx) > Math.abs(dy) * rapporto ? 'x' : 'y';
};

/**
 * Posizione della riga durante il trascinamento. Parte dall'offset corrente,
 * cosi' riprendendo il gesto su una riga gia' aperta non salta a zero.
 */
export const calcolaOffset = (offsetIniziale, dx, max = MAX_DRAG) => (
  Math.min(0, Math.max(offsetIniziale + dx, -max))
);

/** Posizione finale al rilascio: aperta a REVEAL o richiusa. */
export const assestaOffset = (offset, reveal = REVEAL) => {
  const aperta = offset <= -reveal / 2;
  return { offset: aperta ? -reveal : 0, aperta };
};
