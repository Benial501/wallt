const { Movimento, ScheduledPayment } = require('../models');
const { riepilogoRicorrenti } = require('../services/financialContext.service');

describe('flussi ricorrenti previsti', () => {
  test('conteggia una sola volta la ricorrenza mensile dopo la scadenza', async () => {
    const originalMovimenti = Movimento.findAll;
    const originalProgrammate = ScheduledPayment.findAll;
    Movimento.findAll = jest.fn()
      .mockResolvedValueOnce([{
        id: 27, descrizione: 'Affitto', data: '2026-09-01', stato_ricorrenza: 'attiva',
        ricorrente_frequenza: 'mensile', ricorrente_giorno: 27, tipo: 'uscita', importo: 800,
      }])
      .mockResolvedValueOnce([]);
    ScheduledPayment.findAll = jest.fn().mockResolvedValue([]);
    try {
      const result = await riepilogoRicorrenti(42, new Date('2026-10-27T12:00:00Z'));
      expect(result.cashFlowItems.map(({ id, dueDate, occurrenceKey }) => [id, dueDate, occurrenceKey])).toEqual([
        [27, '2026-10-27', '27:2026-10'],
      ]);
    } finally {
      Movimento.findAll = originalMovimenti;
      ScheduledPayment.findAll = originalProgrammate;
    }
  });

  test('include eventi attivi futuri fino a 30 giorni e conserva gli impegni mensili', async () => {
    const original = Movimento.findAll;
    const originalProgrammate = ScheduledPayment.findAll;
    ScheduledPayment.findAll = jest.fn().mockResolvedValue([]);
    Movimento.findAll = jest.fn()
      .mockResolvedValueOnce([
        { id: 1, descrizione: 'Stipendio', data: '2026-09-01', stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 30, tipo: 'entrata', importo: 1200 },
        { id: 2, descrizione: 'Palestra', data: '2026-09-01', stato_ricorrenza: 'attiva', ricorrente_frequenza: 'settimanale', ricorrente_giorno: 1, tipo: 'uscita', importo: 35 },
        { id: 3, descrizione: 'Pausa', data: '2026-09-01', stato_ricorrenza: 'sospesa', ricorrente_frequenza: 'mensile', ricorrente_giorno: 26, tipo: 'uscita', importo: 20 },
        { id: 4, descrizione: 'Canone', data: '2026-09-01', stato_ricorrenza: 'attiva', ricorrente_frequenza: 'mensile', ricorrente_giorno: 28, tipo: 'uscita', importo: 50 },
      ])
      .mockResolvedValueOnce([{ ricorrenza_origine_id: 4, ricorrenza_periodo: '2026-09' }]);
    try {
      const result = await riepilogoRicorrenti(42, new Date('2026-09-25T12:00:00Z'));
      expect(result.cashFlowItems.map((item) => [item.id, item.dueDate, item.direction])).toEqual([
        [2, '2026-09-28', 'uscita'],
        [1, '2026-09-30', 'entrata'],
        [2, '2026-10-05', 'uscita'],
        [2, '2026-10-12', 'uscita'],
        [2, '2026-10-19', 'uscita'],
      ]);
      expect(result.cashFlowItems.every((item) => item.dueDate <= '2026-10-25')).toBe(true);
      expect(result.items.map((item) => item.id)).toEqual([2]);
      expect(result.commitments).toBe(201.67);
    } finally {
      Movimento.findAll = original;
      ScheduledPayment.findAll = originalProgrammate;
    }
  });

  test('marca come già protette le spese singole incluse nella liquidità a 30 giorni', async () => {
    const originalMovimenti = Movimento.findAll;
    const originalProgrammate = ScheduledPayment.findAll;
    Movimento.findAll = jest.fn()
      .mockResolvedValueOnce([{
        id: 5, descrizione: 'Assicurazione', data: '2026-09-01', stato_ricorrenza: 'attiva',
        ricorrente_frequenza: 'una_tantum', ricorrente_data: '2026-10-10', tipo: 'uscita', importo: 180,
      }])
      .mockResolvedValueOnce([]);
    ScheduledPayment.findAll = jest.fn().mockResolvedValue([{
      id: 31, descrizione: 'Visita', importo: 180, data_scadenza: '2026-10-12', tipo: 'uscita',
    }]);
    try {
      const result = await riepilogoRicorrenti(42, new Date('2026-09-25T12:00:00Z'));
      expect(Movimento.findAll.mock.calls[0][0].attributes).toContain('ricorrente_data');
      expect(result.cashFlowItems).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 5, dueDate: '2026-10-10', amount: 180, reserved: true }),
        expect.objectContaining({ id: 31, dueDate: '2026-10-12', amount: 180, reserved: true }),
      ]));
    } finally {
      Movimento.findAll = originalMovimenti;
      ScheduledPayment.findAll = originalProgrammate;
    }
  });
});
