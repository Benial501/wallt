import { reactive } from 'vue';
// Asset generato da server/scripts/sync-category-catalog.js.
import defaults from '../data/categorie.generated.json';

// Un unico catalogo reattivo mantiene compatibili tutti i consumer esistenti.
export const CATEGORIE_ENTRATA = reactive(defaults.filter(c => c.tipo === 'entrata'));
export const CATEGORIE_USCITA = reactive(defaults.filter(c => c.tipo === 'uscita'));
export const CATEGORIE_ARCHIVIATE = reactive([]);
let generation = 0;
export function resetCategorie() {
  generation += 1;
  CATEGORIE_ENTRATA.splice(0, Infinity, ...defaults.filter(c => c.tipo === 'entrata'));
  CATEGORIE_USCITA.splice(0, Infinity, ...defaults.filter(c => c.tipo === 'uscita'));
  CATEGORIE_ARCHIVIATE.splice(0);
}
export async function loadCategorie() {
  const requestGeneration = generation;
  const token = localStorage.getItem('wallt_token');
  const { default: api } = await import('./axios');
  const { data } = await api.get('/categorie', { params: { archiviate: true } });
  if (requestGeneration !== generation || token !== localStorage.getItem('wallt_token')) return;
  CATEGORIE_ENTRATA.splice(0, Infinity, ...data.categorie.filter(c => c.tipo === 'entrata' && c.attiva));
  CATEGORIE_USCITA.splice(0, Infinity, ...data.categorie.filter(c => c.tipo === 'uscita' && c.attiva));
  CATEGORIE_ARCHIVIATE.splice(0, Infinity, ...data.categorie.filter(c => !c.attiva));
  return data;
}
export const getCategoriaEntrata = id => CATEGORIE_ENTRATA.find(c => c.id === id) || CATEGORIE_ARCHIVIATE.find(c => c.id === id && c.tipo === 'entrata');
export const getCategoriaUscita = id => CATEGORIE_USCITA.find(c => c.id === id) || CATEGORIE_ARCHIVIATE.find(c => c.id === id && c.tipo === 'uscita');
