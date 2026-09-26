const { FUSO_DEFAULT, oggiLocale, fineMese, sommaGiorni } = require('../utils/dateRome');
const { elencoMesi } = require('./finestraMesi.service');

const NUMERO_SETTIMANE = 12;
const NUMERO_MESI = 3;
const round2 = (value) => Math.round(value * 100) / 100;
const importoNumero = (value) => parseFloat(value) || 0;

const inizioSettimana = (data) => {
  const giorno = new Date(`${data}T12:00:00Z`).getUTCDay();
  return sommaGiorni(data, -((giorno + 6) % 7));
};

/** Crea finestre civili concluse, limitate allo storico effettivamente osservato. */
function costruisciPeriodiMedia({ riferimento = new Date(), primoMovimento }) {
  const oggi = oggiLocale(FUSO_DEFAULT, new Date(riferimento));
  if (!primoMovimento) {
    return { weekly: { periods: [] }, monthly: { periods: [] } };
  }

  const lunediCorrente = inizioSettimana(oggi);
  const periodiSettimanali = [];
  for (let index = NUMERO_SETTIMANE - 1; index >= 0; index -= 1) {
    const from = sommaGiorni(lunediCorrente, -(7 * (index + 1)));
    const to = sommaGiorni(from, 6);
    if (from >= primoMovimento) periodiSettimanali.push({ from, to });
  }

  const meseCorrente = oggi.slice(0, 7);
  const mesiCompletati = elencoMesi(meseCorrente, NUMERO_MESI + 1).slice(0, NUMERO_MESI);
  const primoMese = primoMovimento.slice(0, 7);
  const giornoPrimoMovimento = Number(primoMovimento.slice(8, 10));
  const periodiMensili = mesiCompletati
    .filter((key) => key >= primoMese && !(key === primoMese && giornoPrimoMovimento !== 1))
    .map((key) => ({ key, from: `${key}-01`, to: fineMese(`${key}-01`) }));

  return {
    weekly: { periods: periodiSettimanali },
    monthly: { periods: periodiMensili },
  };
}

/** Somma per categoria e divide per tutti i periodi osservabili, compresi quelli a zero. */
function aggregaPeriodi(periods, categories, categoryIds, movements) {
  const byCategory = new Map([...categoryIds].map((category) => [category, 0]));

  periods.forEach((period) => {
    movements.forEach((movement) => {
      if (movement.tipo !== 'uscita') return;
      const data = String(movement.data).slice(0, 10);
      if (data < period.from || data > period.to) return;
      const category = movement.categoria || 'altro_uscita';
      byCategory.set(category, (byCategory.get(category) || 0) + importoNumero(movement.importo));
    });
  });

  const categoriePerId = new Map(categories.map((category) => [category.id, category]));
  const items = [...byCategory.entries()]
    .filter(([, total]) => total > 0)
    .map(([categoryId, total]) => {
      const metadata = categoriePerId.get(categoryId);
      return {
        category: categoryId,
        name: metadata?.nome || (categoryId === 'altro_uscita' ? 'Altre uscite' : 'Categoria non disponibile'),
        emoji: metadata?.emoji || '🏷️',
        color: metadata?.colore || null,
        total: round2(total),
        average: periods.length ? round2(total / periods.length) : null,
      };
    })
    .sort((first, second) => (second.average ?? 0) - (first.average ?? 0)
      || first.name.localeCompare(second.name, 'it'));

  return {
    from: periods[0]?.from || null,
    to: periods.at(-1)?.to || null,
    periodCount: periods.length,
    items,
  };
}

function calcolaMediePerCategoria({ periodiSettimanali, periodiMensili, movimenti, categorie }) {
  const categoryIds = new Set(movimenti
    .filter((movement) => movement.tipo === 'uscita')
    .map((movement) => movement.categoria || 'altro_uscita'));
  return {
    weekly: aggregaPeriodi(periodiSettimanali, categorie, categoryIds, movimenti),
    monthly: aggregaPeriodi(periodiMensili, categorie, categoryIds, movimenti),
  };
}

module.exports = { costruisciPeriodiMedia, calcolaMediePerCategoria };
