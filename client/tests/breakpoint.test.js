import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

const file = (dir) => readdirSync(dir).flatMap((nome) => {
  const percorso = join(dir, nome);
  if (statSync(percorso).isDirectory()) return file(percorso);
  return /\.(vue|css)$/.test(nome) ? [percorso] : [];
});

/** Ogni soglia usata in una `@media`, con il file in cui compare. */
const soglieUsate = () => {
  const trovate = new Map();
  for (const percorso of file(SRC)) {
    const testo = readFileSync(percorso, 'utf8');
    for (const query of testo.match(/@media[^{]+/g) || []) {
      for (const larghezza of query.match(/(?:min|max)-width:\s*(\d+)px/g) || []) {
        const px = Number(larghezza.match(/(\d+)/)[1]);
        if (!trovate.has(px)) trovate.set(px, new Set());
        trovate.get(px).add(relative(SRC, percorso));
      }
    }
  }
  return trovate;
};

/** La scala dichiarata in variables.css, più la forma complementare. */
const SCALA = [380, 480, 768, 1024];
const AMMESSE = new Set([...SCALA, ...SCALA.map((v) => v - 1)]);

/**
 * Soglie già presenti quando la scala è stata introdotta. Non sono corrette:
 * sono debito dichiarato. Il test non pretende di ripararle tutte in un colpo
 * — accorpare una soglia cambia un layout, e va fatto guardando la pagina —
 * ma impedisce che l'elenco si allunghi.
 */
const DEBITO = new Set([360, 370, 390, 400, 420, 520, 560, 600, 640, 680, 700, 720]);

test('nessuna soglia nuova fuori dalla scala dichiarata', () => {
  const fuoriScala = [...soglieUsate().entries()]
    .filter(([px]) => !AMMESSE.has(px) && !DEBITO.has(px));

  assert.deepEqual(
    fuoriScala.map(([px, file]) => `${px}px (${[...file].join(', ')})`),
    [],
    'usa --bp-xs/sm/md/lg di variables.css, oppure aggiungi la soglia a DEBITO spiegando perché',
  );
});

test('il debito si accorcia, non si allunga', () => {
  const usate = soglieUsate();
  const ancoraVive = [...DEBITO].filter((px) => usate.has(px));

  assert.ok(
    ancoraVive.length <= DEBITO.size,
    'il debito non può crescere',
  );

  // Quando una soglia sparisce dal codice va tolta anche da qui, altrimenti
  // l'elenco resta un permesso aperto per reintrodurla.
  const risolte = [...DEBITO].filter((px) => !usate.has(px));
  assert.deepEqual(
    risolte,
    [],
    `soglie non più usate: rimuovile da DEBITO in questo file (${risolte.join(', ')})`,
  );
});

test('la scala è davvero dichiarata nei token', () => {
  const variables = readFileSync(join(SRC, 'assets/styles/variables.css'), 'utf8');
  for (const [nome, px] of [['xs', 380], ['sm', 480], ['md', 768], ['lg', 1024]]) {
    assert.match(
      variables,
      new RegExp(`--bp-${nome}:\\s*${px}px`),
      `manca --bp-${nome} nei token`,
    );
  }
});
