// Genera l'asset frontend dal catalogo ufficiale. Le due app Vercel vengono
// pubblicate da root separate: non devono importare file esterni al progetto.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../constants/catalogoCategorie.json');
const destination = path.resolve(__dirname, '../../client/src/data/categorie.generated.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
