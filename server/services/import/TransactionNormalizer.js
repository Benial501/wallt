const { Conto } = require('../../models');

const normalizeDescription = (value) => (
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
);

const pad2 = (n) => String(n).padStart(2, '0');

const toLocalIso = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

/**
 * Anni a due cifre: un estratto conto non contiene date del secolo scorso,
 * quindi 00-79 => 2000-2079 e 80-99 => 1980-1999.
 */
const expandYear = (raw) => {
  const n = Number(raw);
  if (String(raw).length === 4) return n;
  return n <= 79 ? 2000 + n : 1900 + n;
};

/** Scarta il 31 febbraio e simili, invece di lasciarli traboccare al mese dopo. */
const isRealDate = (y, m, d) => {
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
};

/**
 * Le banche italiane scrivono le date come GG/MM/AAAA, ma con separatori e
 * lunghezze dell'anno diverse (`01-09-2026`, `01.09.2026`, `01/09/26`).
 * Affidarsi a `new Date()` significa farle leggere all'americana: "01/09/2026"
 * diventerebbe il 9 gennaio, e per gli oggetti Date `toISOString()` sposterebbe
 * il giorno indietro nei fusi a est di UTC. Qui i formati sono espliciti.
 */
const parseDateFlexible = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toLocalIso(value);
  }

  const str = String(value).trim();
  if (!str) return null;

  // ISO: 2026-09-01, 2026/09/01, 2026-09-01T10:30:00Z
  const iso = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isRealDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Europeo: GG/MM/AAAA e varianti. Se il secondo numero non può essere un
  // mese ma il primo sì, il file usa l'ordine americano (MM/GG).
  const parts = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (parts) {
    let d = Number(parts[1]);
    let m = Number(parts[2]);
    const y = expandYear(parts[3]);

    if (m > 12 && d <= 12) {
      const swap = d;
      d = m;
      m = swap;
    }

    return isRealDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Ultima risorsa solo per le date scritte a parole ("Sep 1, 2026"): sulle
  // stringhe di soli numeri e separatori decidono le regole esplicite qui
  // sopra, non l'euristica di JavaScript.
  if (/[a-z]/i.test(str)) {
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) return toLocalIso(parsed);
  }

  return null;
};

/**
 * Parse importo con supporto a:
 * - simboli valuta (€,$)
 * - separatori migliaia/decimali (es: 1.234,56 oppure 1,234.56)
 * Mantiene il segno (se presente).
 */
const parseMoneySigned = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Rimuove caratteri non significativi, preservando cifra, separatori e segno
  const cleaned = raw
    .replace(/[€$£¥]/g, '')
    .replace(/\s/g, '');

  const parenthesesNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  const hasMinus = cleaned.includes('-') || parenthesesNegative;
  const unsigned = cleaned
    .replace(/-/g, '')
    .replace(/^\(/, '')
    .replace(/\)$/, '');

  // Identifica separatore decimale: usa quello presente come “ultimo” tra ',' e '.'
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');

  let normalized = unsigned;
  if (lastComma > lastDot) {
    // 1.234,56 => decimale comma
    normalized = unsigned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // 1,234.56 => decimale dot
    normalized = unsigned.replace(/,/g, '');
  } else {
    // Nessun separatore “tipico”, prova diretto
    normalized = unsigned.replace(/,/g, '').replace(/\./g, '');
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return hasMinus ? -Math.abs(num) : num;
};

const normalizeContoHint = (value) => normalizeDescription(value).toLowerCase();

/**
 * Responsabilità: trasformare qualunque raw-format di banca in un formato interno unico.
 * - normalizza data, descrizione, importo (e sign->tipo)
 * - risolve conto_id tramite auto-match su `contoHint` contro conti dell'utente
 */
class TransactionNormalizer {
  async normalize({ userId, rawTransactions }) {
    const conti = await Conto.findAll({
      where: { user_id: userId, attivo: true },
      attributes: ['id', 'nome'],
      order: [['ordine', 'ASC'], ['id', 'ASC']],
    });

    const contiHints = conti.map((c) => ({
      id: c.id,
      nomeLower: normalizeContoHint(c.nome),
    }));

    const onlyOneConto = conti.length === 1 ? conti[0] : null;

    const normalized = [];
    const warnings = [];

    rawTransactions.forEach((raw, idx) => {
      const descrizione = normalizeDescription(raw.descrizione || raw.description || raw.narration);
      const data = parseDateFlexible(raw.data);
      const importoSigned = parseMoneySigned(raw.importo);

      if (!data || !descrizione || importoSigned === null || importoSigned === undefined) {
        warnings.push({
          row: raw.rowIndex ?? idx,
          message: 'Riga ignorata: dati non sufficienti (data/descrizione/importo).',
        });
        return;
      }

      if (importoSigned === 0) {
        warnings.push({ row: raw.rowIndex ?? idx, message: 'Riga ignorata: importo pari a 0.' });
        return;
      }

      const tipo = importoSigned < 0 ? 'uscita' : 'entrata';
      const importo = Math.round(Math.abs(importoSigned) * 100) / 100;

      // Auto-match conto
      let conto_id = null;
      let conto_nome = null;

      const contoHint = raw.contoHint ? normalizeContoHint(raw.contoHint) : null;
      if (contoHint) {
        // match best-effort: contiene o viceversa, scegliendo il nome più “specifico”.
        let best = null;
        for (const c of contiHints) {
          if (!c.nomeLower) continue;
          const match =
            contoHint.includes(c.nomeLower)
            || c.nomeLower.includes(contoHint)
            || (c.nomeLower && contoHint.replace(/\W/g, '').includes(c.nomeLower.replace(/\W/g, '')));

          if (match) {
            const score = c.nomeLower.length;
            if (!best || score > best.score) {
              best = { id: c.id, nomeLower: c.nomeLower, score };
            }
          }
        }

        if (best) {
          conto_id = best.id;
          conto_nome = conti.find((c) => c.id === conto_id)?.nome || null;
        }
      } else if (onlyOneConto) {
        conto_id = onlyOneConto.id;
        conto_nome = onlyOneConto.nome;
      } else if (conti.length > 0) {
        // Con più conti, usa il primo come default editabile in anteprima.
        conto_id = conti[0].id;
        conto_nome = conti[0].nome;
      }

      normalized.push({
        clientTxId: `tx_${raw.rowIndex ?? idx}_${Math.random().toString(36).slice(2, 8)}`,
        data,
        descrizione,
        importo,
        tipo,
        conto_id,
        conto_nome,
        categoria: null,
        conto: conto_id ? { id: conto_id, nome: conto_nome } : null,
        balance: raw.balance ?? null,
        revolutType: raw.revolutType ?? null,
        revolutCategory: raw.revolutCategory ?? null,
      });
    });

    return { normalizedTransactions: normalized, warnings };
  }
}

module.exports = TransactionNormalizer;
// Esposti per i test: sono le due conversioni che decidono se una riga
// dell'estratto conto viene importata o scartata.
module.exports.parseDateFlexible = parseDateFlexible;
module.exports.parseMoneySigned = parseMoneySigned;

