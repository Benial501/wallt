// Genera l'asset frontend dal catalogo ufficiale. Le due app Vercel vengono
// pubblicate da root separate: non devono importare file esterni al progetto.
//
// Non è una copia grezza del JSON: esporta il catalogo già arricchito con il
// flag `sistema`, così l'elenco delle categorie non eliminabili resta definito
// una volta sola in server/constants/categorie.js.
const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIE_DEFAULT } = require('../constants/categorie');
const destination = path.resolve(__dirname, '../../client/src/data/categorie.generated.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(CATEGORIE_DEFAULT, null, 2)}\n`);
