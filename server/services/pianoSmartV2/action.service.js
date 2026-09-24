const createActions = ({ scenario }) => (scenario.allocations || [])
  .filter((item) => item.amountCents > 0)
  .sort((a, b) => b.amountCents - a.amountCents)
  .slice(0, 5)
  .map((item, index) => ({
    actionKey: `${item.destinationType || item.category}-${item.destinationId || 'none'}`,
    title: item.destinationType === 'fondo_sicurezza'
      ? `Alimenta il fondo sicurezza di ${item.amountCents} centesimi`
      : item.destinationType === 'obiettivo'
        ? `Destina ${item.amountCents} centesimi all'obiettivo`
        : `Lascia ${item.amountCents} centesimi disponibili`,
    amountCents: item.amountCents,
    destinationType: item.destinationType || item.category,
    destinationId: item.destinationId || null,
    reason: 'Quota generata dallo scenario selezionato.',
    riskIfIgnored: 'La distribuzione scelta potrebbe non essere applicata.',
    priority: index + 1,
    status: 'da_fare',
  }));

module.exports = { createActions };
