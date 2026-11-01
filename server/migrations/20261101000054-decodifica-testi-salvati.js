'use strict';

/**
 * Riporta in chiaro i testi salvati con `.escape()`.
 *
 * Fino al novembre 2026 descrizioni, note e nome del profilo passavano da
 * `.escape()` prima di essere salvati, e nessuno li decodificava: «APPLE.COM/BILL»
 * si leggeva «APPLE.COM&#x2F;BILL», e ogni modifica di un movimento codificava di
 * nuovo ciò che era già codificato. Per questo si ripete fino a che non resta nulla.
 *
 * `&lt;` e `&gt;` restano: sono ciò che il server continua a scrivere al posto di
 * `<` e `>`, così nessun tag può entrare nel database neanche dopo questa riparazione.
 *
 * Tocca solo il testo: niente importi né saldi, e la scrittura in SQL lascia
 * `updated_at` e `modificato_utente_il` come sono.
 *
 * Il rilevamento degli abbonamenti e le regole imparate calcolano la loro chiave dal
 * testo. Una chiave ricavata dal testo codificato non corrisponderebbe più al testo
 * pulito: nascerebbe una seconda riga per lo stesso servizio, «Non è un abbonamento»
 * smetterebbe di valere e la regola non riconoscerebbe più il negozio. Quindi vanno
 * riparate anche loro.
 */

const COLONNE = [
  ['movimenti', 'descrizione'],
  ['users', 'nome'],
  ['investimenti', 'note'],
  ['investimenti', 'condizioni_disponibilita'],
  ['movimenti_investimento', 'nota'],
  ['movimenti_scommesse', 'nota'],
  ['obiettivo_contributi', 'nota'],
  ['regole_personali_merchant', 'merchant_name'],
];

const REGOLE = ['categorie_regole', 'regole_personali_merchant'];

const CODIFICATO = '&(amp|quot|#x27|#x2F|#x5C|#96);';

const decodificaSql = (colonna) => [
  ['&#x27;', "''"],
  ['&#x2F;', '/'],
  ['&#x5C;', '\\'],
  ['&#96;', '`'],
  ['&quot;', '"'],
  ['&amp;', '&'],
].reduce((espressione, [da, a]) => `replace(${espressione}, '${da}', '${a}')`, colonna);

const finoAStabile = (trasforma) => (testo) => {
  let attuale = testo;
  let precedente;
  do {
    precedente = attuale;
    attuale = trasforma(attuale);
  } while (attuale !== precedente);
  return attuale;
};

const decodifica = finoAStabile((testo) => testo
  .replace(/&#x27;/g, "'")
  .replace(/&#x2F;/g, '/')
  .replace(/&#x5C;/g, '\\')
  .replace(/&#96;/g, '`')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&'));

// Il normalizzatore ha già tolto il `#` e le cifre isolate: `&#x2F;` è arrivato qui
// come `& x2f;`, `&#96;` come `& ;`. La barra diventa uno spazio, come nel testo pulito.
const chiavePulita = (chiave) => finoAStabile((testo) => testo
  .replace(/&\s?x2f;/g, ' ')
  .replace(/&\s?x27;/g, "'")
  .replace(/&\s?x5c;/g, '\\')
  .replace(/&\s;/g, '')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&'))(chiave).replace(/\s+/g, ' ').trim();

// Stessa regola del rilevamento (`inMaiuscole`): serve a riconoscere un nome ricavato
// dalla chiave, che non è stato scritto dall'utente.
const nomeDaChiave = (chiave) => chiave
  .replace(/(^|\s)(\S)/g, (_, spazio, lettera) => spazio + lettera.toUpperCase())
  .slice(0, 100);

// `amp` può essere una parola vera («amp energia»): è un resto di codifica solo fra due
// parole, dove stava `&amp;`.
const patternPulito = (pattern) => {
  const parole = pattern.split(' ');
  return parole.filter((parola, indice) => {
    if (['x27', 'x2f', 'x5c', 'quot'].includes(parola)) return false;
    return !(parola === 'amp' && indice > 0 && indice < parole.length - 1);
  }).join(' ');
};

const riparaAbbonamenti = async (sequelize, transaction) => {
  const [righe] = await sequelize.query(
    "SELECT id, user_id, chiave, ordine, nome FROM abbonamenti WHERE chiave LIKE '%&%' OR nome LIKE '%&%' ORDER BY id",
    { transaction },
  );

  for (const riga of righe) {
    const chiave = chiavePulita(riga.chiave) || riga.chiave;
    const nome = riga.nome === nomeDaChiave(riga.chiave) ? nomeDaChiave(chiave) : decodifica(riga.nome);
    let { ordine } = riga;

    if (chiave !== riga.chiave) {
      // UNIQUE(user_id, chiave, ordine). Se il servizio ha già una riga pulita le due
      // convivono: alla prossima lettura `righeDoppie` le riunisce, quando può farlo.
      const [[{ massimo }]] = await sequelize.query(
        'SELECT MAX(ordine) AS massimo FROM abbonamenti WHERE user_id = :userId AND chiave = :chiave',
        { replacements: { userId: riga.user_id, chiave }, transaction },
      );
      if (massimo !== null) ordine = massimo + 1;
    }

    if (chiave !== riga.chiave || nome !== riga.nome) {
      await sequelize.query(
        'UPDATE abbonamenti SET chiave = :chiave, nome = :nome, ordine = :ordine WHERE id = :id',
        {
          replacements: {
            chiave, nome, ordine, id: riga.id,
          },
          transaction,
        },
      );
    }
  }
};

const riparaRegole = async (sequelize, tabella, transaction) => {
  const [righe] = await sequelize.query(
    `SELECT id, user_id, pattern FROM ${tabella}
     WHERE user_id IS NOT NULL AND pattern ~ '\\m(x27|x2f|x5c|quot|amp)\\M'
     ORDER BY id`,
    { transaction },
  );

  for (const riga of righe) {
    const pattern = patternPulito(riga.pattern);
    if (pattern === riga.pattern || pattern.length < 3) continue;

    // `categorie_regole` è UNIQUE su utente, pattern e tipo. Se la regola pulita esiste
    // già vince lei: quella codificata resta dov'è, e non può più riconoscere nulla.
    await sequelize.query(
      `UPDATE ${tabella} r SET pattern = :pattern
       WHERE r.id = :id AND NOT EXISTS (
         SELECT 1 FROM ${tabella} altra
         WHERE altra.user_id = r.user_id AND altra.pattern = :pattern AND altra.id <> r.id
           AND ${tabella === 'categorie_regole' ? 'altra.tipo IS NOT DISTINCT FROM r.tipo' : 'TRUE'}
       )`,
      { replacements: { pattern, id: riga.id }, transaction },
    );
  }
};

module.exports = {
  async up(q) {
    const { sequelize } = q;
    await sequelize.transaction(async (transaction) => {
      for (const [tabella, colonna] of COLONNE) {
        // Ogni giro accorcia le righe che trova, quindi il ciclo finisce.
        let modificate;
        do {
          const [, risultato] = await sequelize.query(
            `UPDATE ${tabella} SET ${colonna} = ${decodificaSql(colonna)} WHERE ${colonna} ~ '${CODIFICATO}'`,
            { transaction },
          );
          modificate = risultato.rowCount;
        } while (modificate > 0);
      }

      await riparaAbbonamenti(sequelize, transaction);
      for (const tabella of REGOLE) {
        await riparaRegole(sequelize, tabella, transaction);
      }
    });
  },

  // Non si torna indietro: rimettere i testi codificati ricreerebbe il difetto, e non
  // si può sapere quante volte ogni riga era stata codificata.
  async down() {},
};
