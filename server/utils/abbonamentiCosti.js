/**
 * I conti degli abbonamenti, in centesimi interi come Piano Smart: una scheda e
 * un totale non possono differire di un centesimo per colpa della virgola mobile.
 *
 * Nessun `require`: la funzione è duplicata in `client/src/utils/abbonamenti.js`
 * per il riquadro del modulo, e `client/tests/abbonamentiContratto.test.js`
 * confronta le due versioni importando questo file.
 */

const aCentesimi = (valore) => Math.round(Number(valore) * 100);

const calcolaCosti = ({ costo, periodo_mesi: periodo, durata_mesi: durata }) => {
  const centesimi = aCentesimi(costo);
  // Sempre intero: i periodi ammessi dividono tutti 12.
  const inUnAnno = centesimi * (12 / periodo);
  const pagamenti = durata == null ? null : Math.ceil(durata / periodo);
  return {
    al_mese: Math.round(inUnAnno / 12),
    in_un_anno: inUnAnno,
    in_totale: pagamenti === null ? null : centesimi * pagamenti,
    // Un abbonamento di 24 mesi pesa sull'anno per 12 mesi, non per tutti e 24.
    peso_annuo: pagamenti === null ? inUnAnno : centesimi * Math.min(pagamenti, 12 / periodo),
  };
};

const calcolaTotali = (voci) => {
  const costi = voci.map(calcolaCosti);
  const inUnAnno = costi.reduce((somma, c) => somma + c.in_un_anno, 0);
  return {
    // Dalla somma annua e non dai valori mensili già arrotondati: tre annuali
    // da 10 € sono 2,50 € al mese, non 0,83 × 3 = 2,49 €.
    al_mese: Math.round(inUnAnno / 12),
    all_anno: costi.reduce((somma, c) => somma + c.peso_annuo, 0),
    se_tutti_12_mesi: costi.some((c) => c.in_totale !== null) ? inUnAnno : null,
  };
};

module.exports = { aCentesimi, calcolaCosti, calcolaTotali };
