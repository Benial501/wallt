const {
  registerUser,
  Conto,
  Movimento,
} = require('./setup');

const DuplicateChecker = require('../services/import/DuplicateChecker');
const ImportService = require('../services/import/ImportService');

describe('Import estratto conto', () => {
  let app;
  let userId;
  let contoId;

  beforeEach(async () => {
    // registerUser usa supertest/app solo per creare l'utente; qui serve solo l'id.
    const { createApp } = require('./setup');
    app = createApp({ enableRateLimit: false });
    const { res } = await registerUser(app);
    userId = res.body.user.id;

    const conto = await Conto.create({
      user_id: userId,
      nome: 'Conto Test Import',
      tipo: 'banca',
      saldo: 0,
      attivo: true,
    });
    contoId = conto.id;
  });

  describe('DuplicateChecker', () => {
    let duplicateChecker;
    beforeEach(() => { duplicateChecker = new DuplicateChecker(); });

    it('marca come duplicato un movimento già presente con la stessa data/importo/descrizione/conto', async () => {
      await Movimento.create({
        user_id: userId,
        conto_id: contoId,
        tipo: 'uscita',
        importo: 25.50,
        categoria: 'cibo_spesa',
        descrizione: 'PAGAMENTO POS ESSELUNGA VIA ROMA',
        data: '2026-08-10',
        ricorrente: false,
      });

      const result = await duplicateChecker.check(userId, [{
        clientTxId: 'tx1',
        data: '2026-08-10',
        importo: 25.50,
        descrizione: 'PAGAMENTO POS ESSELUNGA VIA ROMA',
        tipo: 'uscita',
        conto_id: contoId,
      }]);

      expect(result[0].isDuplicate).toBe(true);
    });

    it('NON marca come duplicato un movimento nuovo con data diversa (mese successivo)', async () => {
      await Movimento.create({
        user_id: userId,
        conto_id: contoId,
        tipo: 'uscita',
        importo: 25.50,
        categoria: 'cibo_spesa',
        descrizione: 'PAGAMENTO POS ESSELUNGA VIA ROMA',
        data: '2026-08-10',
        ricorrente: false,
      });

      const result = await duplicateChecker.check(userId, [{
        clientTxId: 'tx1',
        data: '2026-09-10',
        importo: 25.50,
        descrizione: 'PAGAMENTO POS ESSELUNGA VIA ROMA',
        tipo: 'uscita',
        conto_id: contoId,
      }]);

      expect(result[0].isDuplicate).toBe(false);
    });

    it('riconosce come duplicato lo stesso movimento riesportato con formattazione leggermente diversa (fallback per similarità)', async () => {
      await Movimento.create({
        user_id: userId,
        conto_id: contoId,
        tipo: 'uscita',
        importo: 42.00,
        categoria: 'cibo_spesa',
        descrizione: 'PAGAMENTO POS 12/08 CARTA*1234 ESSELUNGA VIA ROMA MILANO IT',
        data: '2026-08-12',
        ricorrente: false,
      });

      // Stesso acquisto, ma il nuovo export della banca formatta la riga in modo
      // leggermente diverso (es. codice carta o città troncati diversamente).
      const result = await duplicateChecker.check(userId, [{
        clientTxId: 'tx1',
        data: '2026-08-12',
        importo: 42.00,
        descrizione: 'PAGAMENTO POS ESSELUNGA VIA ROMA MI',
        tipo: 'uscita',
        conto_id: contoId,
      }]);

      expect(result[0].isDuplicate).toBe(true);
    });

    it('NON marca come duplicato una transazione diversa nello stesso giorno, stesso importo, stesso conto', async () => {
      await Movimento.create({
        user_id: userId,
        conto_id: contoId,
        tipo: 'uscita',
        importo: 4.50,
        categoria: 'svago',
        descrizione: 'BAR ROSSI MILANO',
        data: '2026-08-12',
        ricorrente: false,
      });

      // Due caffè da 4,50€ in due bar diversi lo stesso giorno: NON è un duplicato.
      const result = await duplicateChecker.check(userId, [{
        clientTxId: 'tx1',
        data: '2026-08-12',
        importo: 4.50,
        descrizione: 'BAR VERDI TORINO',
        tipo: 'uscita',
        conto_id: contoId,
      }]);

      expect(result[0].isDuplicate).toBe(false);
    });
  });

  describe('ImportService — riesportazione mensile con transazioni sovrapposte', () => {
    it('al secondo import dello stesso estratto (con transazioni vecchie + nuove), le vecchie vengono saltate e solo le nuove create', async () => {
      const importService = new ImportService();

      // Primo import: un mese di transazioni.
      const primoGiro = await importService.previewImport(userId, [
        { data: '2026-08-01', descrizione: 'ESSELUNGA VIA ROMA', importo: '-25.50' },
        { data: '2026-08-05', descrizione: 'STIPENDIO AGOSTO', importo: '1500.00' },
      ]);

      const primoImportabili = primoGiro.items
        .filter((i) => !i.isDuplicate)
        .map((i) => ({ ...i, conto_id: contoId, categoria_finale: i.categoria_suggerita }));

      const confermaUno = await importService.confirmImport(userId, primoImportabili, { aggiornaSaldo: false });
      expect(confermaUno.importati).toBe(2);

      // Secondo import, un mese dopo: la banca riesporta anche le due righe di
      // agosto (stesso range di date) insieme a due transazioni nuove di settembre.
      const secondoGiro = await importService.previewImport(userId, [
        { data: '2026-08-01', descrizione: 'ESSELUNGA VIA ROMA', importo: '-25.50' },
        { data: '2026-08-05', descrizione: 'STIPENDIO AGOSTO', importo: '1500.00' },
        { data: '2026-09-01', descrizione: 'ESSELUNGA VIA ROMA', importo: '-30.00' },
        { data: '2026-09-05', descrizione: 'STIPENDIO SETTEMBRE', importo: '1500.00' },
      ]);

      const vecchie = secondoGiro.items.filter((i) => i.data === '2026-08-01' || i.data === '2026-08-05');
      const nuove = secondoGiro.items.filter((i) => i.data === '2026-09-01' || i.data === '2026-09-05');

      expect(vecchie.every((i) => i.isDuplicate)).toBe(true);
      expect(nuove.every((i) => !i.isDuplicate)).toBe(true);

      const secondoImportabili = secondoGiro.items
        .filter((i) => !i.isDuplicate)
        .map((i) => ({ ...i, conto_id: contoId, categoria_finale: i.categoria_suggerita }));

      const confermaDue = await importService.confirmImport(userId, secondoImportabili, { aggiornaSaldo: false });

      // Solo le 2 transazioni di settembre devono essere state create.
      expect(confermaDue.importati).toBe(2);
      expect(confermaDue.duplicateSaltati).toBe(0); // già filtrate lato preview/duplicateChecker interno

      const tuttiIMovimenti = await Movimento.findAll({ where: { user_id: userId, conto_id: contoId } });
      expect(tuttiIMovimenti).toHaveLength(4); // 2 di agosto + 2 di settembre, MAI duplicati
    });
  });
});
