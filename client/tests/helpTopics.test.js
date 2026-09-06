import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_TOPICS,
  HELP_TOPIC_LIST,
  HELP_SECTIONS,
  getHelpTopic,
} from '../src/content/helpTopics.js';

const testi = (topic) => [
  topic.title,
  topic.summary,
  ...(topic.paragraphs || []),
  ...(topic.bullets || []),
  topic.link?.label,
].filter(Boolean);

test('gli id degli argomenti sono unici e coerenti con la mappa', () => {
  const ids = HELP_TOPIC_LIST.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.equal(HELP_TOPICS[id].id, id));
});

test('ogni sezione della guida punta solo ad argomenti esistenti', () => {
  assert.ok(HELP_SECTIONS.length > 0);
  HELP_SECTIONS.forEach((sezione) => {
    assert.ok(sezione.topics.length > 0, `sezione vuota: ${sezione.id}`);
    sezione.topics.forEach((id) => {
      assert.ok(getHelpTopic(id), `argomento mancante: ${id} (sezione ${sezione.id})`);
    });
  });
});

test('i riferimenti incrociati puntano ad argomenti esistenti', () => {
  HELP_TOPIC_LIST.forEach((topic) => {
    (topic.related || []).forEach((id) => {
      assert.ok(getHelpTopic(id), `related mancante: ${id} (in ${topic.id})`);
    });
  });
});

test('ogni argomento ha titolo, sintesi e almeno un paragrafo', () => {
  HELP_TOPIC_LIST.forEach((topic) => {
    assert.ok(topic.title?.trim(), `titolo mancante: ${topic.id}`);
    assert.ok(topic.summary?.trim(), `sintesi mancante: ${topic.id}`);
    assert.ok(topic.paragraphs?.length, `paragrafi mancanti: ${topic.id}`);
  });
});

test('i contenuti sono testo semplice, senza markup', () => {
  HELP_TOPIC_LIST.forEach((topic) => {
    testi(topic).forEach((testo) => {
      assert.equal(typeof testo, 'string');
      assert.ok(!/<[a-z/!]/i.test(testo), `markup non ammesso in ${topic.id}: ${testo}`);
    });
  });
});

test('i link della guida restano interni all\'app', () => {
  HELP_TOPIC_LIST.forEach((topic) => {
    if (!topic.link) return;
    assert.ok(topic.link.to.startsWith('/'), `link non interno in ${topic.id}`);
    assert.ok(topic.link.label?.trim(), `etichetta link mancante in ${topic.id}`);
  });
});

test('getHelpTopic ignora id sconosciuti', () => {
  assert.equal(getHelpTopic('non-esiste'), null);
  assert.equal(getHelpTopic(''), null);
  assert.equal(getHelpTopic(null), null);
  assert.equal(getHelpTopic(undefined), null);
});
