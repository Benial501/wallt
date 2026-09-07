import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decidiAsse, calcolaOffset, assestaOffset, REVEAL, MAX_DRAG,
} from '../src/components/movimenti/swipeGesture.js';

test('un movimento troppo piccolo non decide ancora la direzione', () => {
  assert.equal(decidiAsse(0, 0), null);
  assert.equal(decidiAsse(9, 9), null);
  assert.equal(decidiAsse(-9, 4), null);
});

// Il bug: scorrendo la lista il pollice devia sempre di qualche pixel in
// orizzontale, e ogni deriva superiore a 10px trascinava la riga.
test('lo scorrimento verticale con deriva orizzontale resta scroll', () => {
  for (const [dx, dy] of [[-12, 40], [-20, 60], [15, -50], [-30, 45]]) {
    assert.equal(decidiAsse(dx, dy), 'y', `dx=${dx} dy=${dy}`);
  }
});

test('un trascinamento chiaramente orizzontale apre la riga', () => {
  for (const [dx, dy] of [[-40, 5], [-60, 0], [-30, -10]]) {
    assert.equal(decidiAsse(dx, dy), 'x', `dx=${dx} dy=${dy}`);
  }
});

test('a parita di spostamento vince lo scroll verticale', () => {
  assert.equal(decidiAsse(-30, 30), 'y');
});

test('il trascinamento riparte dalla posizione corrente, senza salti', () => {
  // Riga gia' aperta: riprendendo il gesto non deve saltare a zero.
  assert.equal(calcolaOffset(-REVEAL, 0), -REVEAL);
  assert.equal(calcolaOffset(-REVEAL, 30), -50);
  assert.equal(calcolaOffset(0, -40), -40);
});

test('il trascinamento e limitato e non va mai verso destra', () => {
  assert.equal(calcolaOffset(0, -500), -MAX_DRAG);
  assert.equal(calcolaOffset(0, 200), 0);
  assert.equal(calcolaOffset(-REVEAL, 500), 0);
});

test('al rilascio la riga si assesta aperta o chiusa, mai a meta', () => {
  assert.deepEqual(assestaOffset(-10), { offset: 0, aperta: false });
  assert.deepEqual(assestaOffset(-39), { offset: 0, aperta: false });
  assert.deepEqual(assestaOffset(-40), { offset: -REVEAL, aperta: true });
  assert.deepEqual(assestaOffset(-96), { offset: -REVEAL, aperta: true });
  assert.deepEqual(assestaOffset(0), { offset: 0, aperta: false });
});
