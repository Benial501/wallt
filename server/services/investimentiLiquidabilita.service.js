const LIQUIDABILITA = ['liquidabile', 'vincolato', 'sconosciuto'];

/** Un investimento rappresenta un portafoglio/piattaforma, non un acquisto. */
const descriviLiquidabilita = (investimento) => {
  const value = investimento.saldo_attuale;
  const numero = value === null || value === undefined ? null : Number(value);
  return {
    valore: Number.isFinite(numero) ? Math.round(numero * 100) / 100 : null,
    liquidabilita: LIQUIDABILITA.includes(investimento.liquidabilita)
      ? investimento.liquidabilita : 'sconosciuto',
    giorni_disponibilita: investimento.giorni_disponibilita ?? null,
    condizioni_disponibilita: investimento.condizioni_disponibilita ?? null,
    data_apertura: investimento.data_apertura ?? null,
  };
};

module.exports = { LIQUIDABILITA, descriviLiquidabilita };
