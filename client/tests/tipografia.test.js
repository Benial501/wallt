import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Pavimento tipografico.
 *
 * Alla scrittura di questo file c'erano 155 dichiarazioni di `font-size`
 * sotto 14px, e la maggior parte erano informazioni operative: importi,
 * date, nomi di categoria. Il pavimento è `--text-xs` (0.875rem); sotto si
 * scende solo con `--text-micro` (0.75rem) e solo con una deroga motivata
 * sulla riga o su quella precedente.
 *
 * AREE_NON_ANCORA_MIGRATE è temporanea: ogni task di sweep ne toglie una
 * voce, e a fine blocco 5 deve essere vuota.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const PAVIMENTO_REM = 0.875;

/** Svuotata dai task 4a, 4b e 4c, in quest'ordine. */
const AREE_NON_ANCORA_MIGRATE = [];

const sorgenti = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return sorgenti(percorso);
  return /\.(vue|css)$/.test(nome) ? [percorso] : [];
});

const inAreaNonMigrata = (relativo) => AREE_NON_ANCORA_MIGRATE.some(
  (area) => relativo === area || relativo.startsWith(area + sep),
);

/** Valore in rem, oppure null se la riga non dichiara una dimensione fissa. */
const remDellaRiga = (riga) => {
  const m = riga.match(/font-size:\s*(\d*\.?\d+)(rem|px)/);
  if (!m) return null;
  return m[2] === 'px' ? Number(m[1]) / 16 : Number(m[1]);
};

test('nessun font-size scende sotto il pavimento senza deroga', () => {
  const colpevoli = [];

  for (const percorso of sorgenti(SRC)) {
    const relativo = relative(SRC, percorso);
    if (inAreaNonMigrata(relativo)) continue;

    const righe = readFileSync(percorso, 'utf8').split('\n');
    righe.forEach((riga, i) => {
      const rem = remDellaRiga(riga);
      if (rem === null || rem >= PAVIMENTO_REM) return;
      const deroga = /deroga:/.test(riga) || /deroga:/.test(righe[i - 1] || '');
      if (!deroga) colpevoli.push(`${relativo}:${i + 1} → ${riga.trim()}`);
    });
  }

  assert.deepEqual(
    colpevoli, [],
    'Sotto il pavimento senza deroga. Usare var(--text-xs), oppure\n'
    + 'var(--text-micro) con un commento `deroga: <perché non è informativo>`.\n'
    + `Punti trovati:\n${colpevoli.join('\n')}`,
  );
});

test('la deroga sulla riga precedente vale, e sotto --text-micro non si scende', () => {
  // Blindaggio: il rilevatore deve riconoscere entrambe le forme.
  assert.equal(remDellaRiga('  font-size: 0.6875rem;'), 0.6875);
  assert.equal(remDellaRiga('  font-size: 11px;'), 0.6875);
  assert.equal(remDellaRiga('  font-size: var(--text-xs);'), null);
  assert.ok(remDellaRiga('  font-size: 0.75rem;') < PAVIMENTO_REM);
});

test('a blocco 5 concluso nessuna area resta da migrare', { skip: AREE_NON_ANCORA_MIGRATE.length > 0 }, () => {
  assert.deepEqual(AREE_NON_ANCORA_MIGRATE, []);
});
