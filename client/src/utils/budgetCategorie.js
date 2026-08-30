import { CATEGORIE_USCITA } from './categorie';

const BUDGET_CAT_MAP = {
  cibo: 'cibo_spesa',
  svago: 'svago',
  abbigliamento: 'abbigliamento',
  risparmio: 'risparmio',
  investimento: 'investimento',
  acquisti: 'acquisti_vari',
  salute: 'salute',
  scommesse: 'deposito_scommesse',
  casa: 'casa',
  bollette: 'bollette',
  benzina: 'benzina_trasporti',
};

export const getCategoriaBudgetInfo = (id) => {
  const movId = BUDGET_CAT_MAP[id] || id;
  const cat = CATEGORIE_USCITA.find((c) => c.id === movId);
  if (cat) return cat;
  return { id, nome: id, emoji: '📊', colore: '#95A5A6' };
};

export const getCategorieBudgetPerProfilo = (profilo) => {
  const cats = [
    { id: 'cibo_spesa', always: true },
    { id: 'svago', always: true },
    { id: 'abbigliamento', always: true },
    { id: 'investimento', always: true },
    { id: 'acquisti_vari', always: true },
    { id: 'salute', always: true },
    { id: 'abbonamenti', always: false },
  ];

  if (profilo && !['vivo_con_genitori'].includes(profilo.situazione_abitativa)) {
    cats.push({ id: 'casa', always: false });
    cats.push({ id: 'bollette', always: false });
  }

  if (profilo && (profilo.ha_auto || profilo.ha_moto)) {
    cats.push({ id: 'benzina_trasporti', always: false });
  }

  if (profilo && profilo.usa_mezzi_pubblici) {
    cats.push({ id: 'mezzi_pubblici', always: false });
  }

  if (profilo && profilo.fa_scommesse && profilo.fa_scommesse !== 'no') {
    cats.push({ id: 'deposito_scommesse', always: false });
  }

  return cats.map((c) => {
    const info = CATEGORIE_USCITA.find((x) => x.id === c.id);
    return { ...info, ...c };
  });
};

export const getBarColor = (percentuale) => {
  if (percentuale > 100) return 'var(--negative)';
  if (percentuale > 85) return '#FF9F43';
  if (percentuale > 60) return 'var(--warning)';
  return 'var(--positive)';
};
