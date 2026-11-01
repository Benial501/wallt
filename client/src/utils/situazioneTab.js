// Le aree del cruscotto stanno nell'indirizzo: un collegamento o il tasto indietro
// riportano dove si era, anche tornando da Programmate / Abbonamenti.
const TAB_SITUAZIONE = Object.freeze(['today', 'upcoming', 'analysis']);

export const tabSituazione = (query) => (TAB_SITUAZIONE.includes(query?.tab) ? query.tab : 'today');
