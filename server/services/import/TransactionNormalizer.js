const { Conto } = require('../../models');

const normalizeDescription = (value) => (
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
);

const parseDateFlexible = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const str = String(value).trim();
  if (!str) return null;

  // ISO: 2026-07-08
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // IT/Europe: DD/MM/YYYY o DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, '0');
    const mm = String(dmy[2]).padStart(2, '0');
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // US: MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, '0');
    const dd = String(mdy[2]).padStart(2, '0');
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: prova a parsare come Date
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
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

