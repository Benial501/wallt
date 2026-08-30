const {
  CATEGORIE_ENTRATA_AI,
  CATEGORIE_USCITA_AI,
} = require('../../../constants/categorie');

const ENTRATA_CATEGORIE = CATEGORIE_ENTRATA_AI;
const USCITA_CATEGORIE = CATEGORIE_USCITA_AI;

const getAllowedCategories = (tipo) => (
  tipo === 'entrata' ? ENTRATA_CATEGORIE : USCITA_CATEGORIE
);

const normalizeCategory = (categoria, tipo) => {
  const allowed = getAllowedCategories(tipo);
  if (allowed.includes(categoria)) return categoria;
  return tipo === 'entrata' ? 'altro_entrata' : 'altro_uscita';
};

module.exports = {
  ENTRATA_CATEGORIE,
  USCITA_CATEGORIE,
  getAllowedCategories,
  normalizeCategory,
};
