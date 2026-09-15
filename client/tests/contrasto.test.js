import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Contrasto WCAG dei token, calcolato invece che ispezionato.
 *
 * Nessun test automatico copriva il contrasto, e il risultato era che il
 * tema chiaro stava peggio dello scuro senza che nessuno lo sapesse: il
 * testo del pulsante primario sull'accento verde faceva 3.03:1.
 *
 * Il valore di questo file non è la formula — è la lista COPPIE: la
 * dichiarazione, verificabile, di quale testo finisce su quale superficie.
 * Aggiungere un token di testo significa aggiungerlo lì.
 */

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'styles', 'variables.css'),
  'utf8',
);

/** Token dichiarati dentro un blocco. Le regole chiudono con `}` a inizio riga. */
const leggiBlocco = (selettore) => {
  const inizio = CSS.indexOf(selettore);
  assert.notEqual(inizio, -1, `blocco non trovato: ${selettore}`);
  const apertura = CSS.indexOf('{', inizio);
  const chiusura = CSS.indexOf('\n}', apertura);
  const token = {};
  for (const [, nome, valore] of CSS.slice(apertura, chiusura).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    token[nome] = valore.trim();
  }
  return token;
};

const SCURO = leggiBlocco('html.dark {');
const CHIARO = leggiBlocco('html.light {');

const aColore = (valore) => {
  if (typeof valore !== 'string') return null;
  const esa = valore.match(/^#([0-9a-fA-F]{6})$/);
  if (esa) return { rgb: [0, 2, 4].map((i) => parseInt(esa[1].slice(i, i + 2), 16)), alpha: 1 };
  const rgba = valore.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) {
    return {
      rgb: [1, 2, 3].map((i) => Number(rgba[i])),
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  return null;
};

/** Sovrapposizione alfa: un token al 5% di bianco non ha un contrasto proprio. */
const componi = (sopra, sotto) => sopra.rgb.map(
  (c, i) => Math.round(c * sopra.alpha + sotto[i] * (1 - sopra.alpha)),
);

const lineare = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanza = (rgb) => 0.2126 * lineare(rgb[0]) + 0.7152 * lineare(rgb[1]) + 0.0722 * lineare(rgb[2]);
const rapporto = (a, b) => {
  const [alta, bassa] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
  return (alta + 0.05) / (bassa + 0.05);
};

/**
 * Una superficie è una pila di token, dal più in alto al più in basso.
 * L'ultimo deve essere opaco.
 */
const SUPERFICI = {
  pagina: ['--bg-primary'],
  card: ['--glass-primary-bg', '--bg-primary'],
  chrome: ['--glass-chrome-bg', '--bg-primary'],
  elevata: ['--glass-elevated-bg', '--bg-primary'],
  accento: ['--accent-green'],
  cta: ['--cta-bg'],
  positivo: ['--positive'],
};

const risolviSuperficie = (nome, tema) => SUPERFICI[nome].reduceRight((sotto, token) => {
  const colore = aColore(tema[token]);
  assert.ok(colore, `token non interpretabile: ${token} = ${tema[token]}`);
  return sotto === null ? colore.rgb : componi(colore, sotto);
}, null);

/** min 4.5 per il testo normale, 3 per i bordi che delimitano un controllo. */
const COPPIE = [
  { testo: '--text-primary', su: 'pagina', min: 4.5 },
  { testo: '--text-secondary', su: 'pagina', min: 4.5 },
  { testo: '--text-muted', su: 'pagina', min: 4.5 },
  { testo: '--text-subtle', su: 'pagina', min: 4.5 },
  { testo: '--text-link', su: 'pagina', min: 4.5 },
  { testo: '--positive', su: 'pagina', min: 4.5 },
  { testo: '--negative', su: 'pagina', min: 4.5 },
  { testo: '--warning', su: 'pagina', min: 4.5 },

  { testo: '--text-primary', su: 'card', min: 4.5 },
  { testo: '--text-secondary', su: 'card', min: 4.5 },
  { testo: '--text-muted', su: 'card', min: 4.5 },
  { testo: '--text-subtle', su: 'card', min: 4.5 },
  { testo: '--positive', su: 'card', min: 4.5 },
  { testo: '--negative', su: 'card', min: 4.5 },
  { testo: '--warning', su: 'card', min: 4.5 },

  { testo: '--text-primary', su: 'elevata', min: 4.5 },
  { testo: '--text-secondary', su: 'elevata', min: 4.5 },

  { testo: '--nav-item', su: 'chrome', min: 4.5 },
  { testo: '--text-primary', su: 'chrome', min: 4.5 },

  // Testo su una superficie piena: qui il colore di sfondo è il pulsante.
  { testo: '--accent-on', su: 'accento', min: 4.5 },
  { testo: '--cta-text', su: 'cta', min: 4.5 },

  // Testo dentro un badge riempito di --positive. La coppia esiste perché
  // scurire --positive e --accent-on separatamente li aveva portati a 3.00:1
  // insieme: due token corretti singolarmente possono essere sbagliati
  // accostati, e solo una coppia dichiarata se ne accorge.
  { testo: '--positive-on', su: 'positivo', min: 4.5 },

  // Il bordo di checkbox e radio. Con `appearance: none` quel bordo è
  // l'unica cosa che identifica il controllo, quindi ricade sotto WCAG
  // 1.4.11 e servono 3:1. Il caso peggiore si inverte fra i temi: card
  // nello scuro (3.28), pagina nel chiaro (3.26). Servono entrambe.
  //
  // `--border-strong` NON è in questa lista di proposito: serve a stati
  // hover e alla maniglia del foglio dal basso, che non identificano nulla
  // da soli. Portarlo a 3:1 significherebbe alzarne l'alfa da 0.16 a 0.36
  // nello scuro e oltre 0.5 nel chiaro, trasformando ogni filo del sistema
  // del vetro in una linea dura.
  { testo: '--control-border', su: 'card', min: 3 },
  { testo: '--control-border', su: 'pagina', min: 3 },
];

for (const [nomeTema, tema] of [['scuro', SCURO], ['chiaro', CHIARO]]) {
  test(`contrasto dei token — tema ${nomeTema}`, () => {
    const sotto = [];

    for (const { testo, su, min } of COPPIE) {
      const primoPiano = aColore(tema[testo]);
      assert.ok(primoPiano, `token non interpretabile: ${testo} = ${tema[testo]}`);
      const sfondo = risolviSuperficie(su, tema);
      const composto = primoPiano.alpha < 1 ? componi(primoPiano, sfondo) : primoPiano.rgb;
      const valore = rapporto(composto, sfondo);

      if (valore < min) {
        sotto.push(`${testo} su ${su}: ${valore.toFixed(2)} (serve ${min})`);
      }
    }

    assert.deepEqual(sotto, [], `Sotto soglia nel tema ${nomeTema}:\n${sotto.join('\n')}`);
  });
}

test('ogni token di testo dichiarato compare in almeno una coppia', () => {
  // Impedisce che un token nuovo entri nel tema senza essere mai verificato.
  const daVerificare = Object.keys(SCURO).filter(
    (t) => /^--(text|nav-item|positive|negative|warning|accent-on|cta-text)/.test(t)
      && !['--text-on-glass'].includes(t),
  );
  const coperti = new Set(COPPIE.map((c) => c.testo));
  const scoperti = daVerificare.filter((t) => !coperti.has(t));
  assert.deepEqual(scoperti, [], `token di testo mai verificati: ${scoperti.join(', ')}`);
});
