/**
 * Unica fonte delle funzioni finanziarie mostrate nella navigazione.
 *
 * Le icone restano identificatori serializzabili: AppLayout le risolve tramite
 * NAV_ICON_MAP. Le regole di accesso ricevono solo booleani gia' calcolati
 * dall'auth store, quindi questo modulo resta puro e testabile senza Pinia.
 */
export const FUNCTIONALITY_ITEMS = Object.freeze([
  {
    id: 'budget', label: 'Budget', description: 'Pianifica le spese', icon: 'budget',
    route: '/budget', placements: ['sidebar', 'sheet'], order: { sidebar: 10, sheet: 20 }, active: true,
  },
  {
    id: 'obiettivi', label: 'Obiettivi', description: 'Risparmi e traguardi', icon: 'obiettivi',
    route: '/obiettivi', placements: ['sidebar', 'sheet'], order: { sidebar: 40, sheet: 10 }, active: true,
  },
  {
    id: 'ricorrenti', label: 'Ricorrenti', description: 'Entrate e uscite mensili', icon: 'ricorrenti',
    route: '/ricorrenti', placements: ['sidebar', 'sheet'], order: { sidebar: 50, sheet: 30 }, active: true,
  },
  {
    id: 'scommesse', label: 'Scommesse', description: 'Piattaforme e movimenti', icon: 'scommesse',
    route: '/scommesse', placements: ['sidebar', 'sheet'], order: { sidebar: 20, sheet: 40 },
    featureFlag: 'mostraScommesse', restriction: 'canAccessScommesseFeature', active: true,
  },
  {
    id: 'investimenti', label: 'Investimenti', description: 'Portafoglio e rendimenti', icon: 'investimenti',
    route: '/investimenti', placements: ['sidebar', 'sheet'], order: { sidebar: 30, sheet: 50 },
    featureFlag: 'mostraInvestimenti', restriction: 'canAccessInvestimentiFeature', active: true,
  },
  {
    id: 'analisi', label: 'Analisi', description: 'Andamento delle finanze', icon: 'analisi',
    route: '/analisi', placements: ['sidebar'], order: { sidebar: 60 }, active: true,
  },
]);

export const getFunctionalityItems = (
  context = {},
  placement = 'sheet',
  items = FUNCTIONALITY_ITEMS,
) => items
  .filter((item) => item.active && item.placements.includes(placement))
  .filter((item) => !item.featureFlag || context[item.featureFlag] === true)
  .filter((item) => !item.restriction || context[item.restriction] === true)
  .sort((a, b) => (a.order?.[placement] ?? 999) - (b.order?.[placement] ?? 999));
