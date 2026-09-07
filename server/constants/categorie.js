const CATEGORIE_DEFAULT = require('./catalogoCategorie.json');
const CATEGORIE_USCITA_IDS = CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita').map(c => c.id);
const CATEGORIE_ENTRATA_IDS = CATEGORIE_DEFAULT.filter(c => c.tipo === 'entrata').map(c => c.id);
const CATEGORIE_USCITA_AI = CATEGORIE_USCITA_IDS;
const CATEGORIE_ENTRATA_AI = CATEGORIE_ENTRATA_IDS;
const CATEGORIA_USCITA_DISPLAY = Object.fromEntries(CATEGORIE_DEFAULT.filter(c => c.tipo === 'uscita').map(c => [c.id, c]));
module.exports = { CATEGORIE_DEFAULT, CATEGORIE_USCITA_IDS, CATEGORIE_ENTRATA_IDS, CATEGORIE_USCITA_AI, CATEGORIE_ENTRATA_AI, CATEGORIA_USCITA_DISPLAY };
