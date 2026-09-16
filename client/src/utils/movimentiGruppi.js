/**
 * Fusione dei gruppi di movimenti fra pagine successive dell'API.
 *
 * Modulo puro e separato dallo store perché è l'unica forma testabile senza
 * Pinia/axios (stesso motivo di filtriMovimenti.js): `movimenti.store.js`
 * importa `@/utils/axios`, che `node --test` non sa risolvere.
 */

/**
 * Gli ordini per cui GET /api/movimenti risponde con gruppi unitari (un
 * gruppo per movimento, vedi movimenti.controller.js): unire quei gruppi per
 * data qui annullerebbe l'ordine globale che l'utente ha chiesto.
 */
export const ORDINI_PER_IMPORTO = ['importo_desc', 'importo_asc'];

export const ordinePerImporto = (ordine) => ORDINI_PER_IMPORTO.includes(ordine);

/**
 * Unisce una pagina di gruppi a quelli già accumulati.
 *
 * `preservaOrdine: true` (ordinamento per importo) concatena e basta: i
 * gruppi sono già unitari e già nell'ordine giusto, riaccorparli per data
 * mescolerebbe le pagine. Senza, i gruppi della stessa data si fondono e il
 * risultato torna a essere ordinato per data.
 */
export const mergeGruppi = (existing, incoming, { preservaOrdine = false } = {}) => {
  if (preservaOrdine) return [...existing, ...incoming];

  const map = new Map(
    existing.map((g) => [g.data, {
      ...g,
      movimenti: [...g.movimenti],
    }]),
  );

  incoming.forEach((g) => {
    const current = map.get(g.data);
    if (current) {
      current.movimenti.push(...g.movimenti);
      current.totale_entrate_giorno = Math.round((current.totale_entrate_giorno + g.totale_entrate_giorno) * 100) / 100;
      current.totale_uscite_giorno = Math.round((current.totale_uscite_giorno + g.totale_uscite_giorno) * 100) / 100;
    } else {
      map.set(g.data, { ...g, movimenti: [...g.movimenti] });
    }
  });

  return Array.from(map.values()).sort((a, b) => b.data.localeCompare(a.data));
};
