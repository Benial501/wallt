'use strict';

// La tabella delle schede «Abbonamenti» (CLAUDE.md Regola 28). Non tocca nessuna
// tabella finanziaria: un abbonamento è ciò che WALLT mostra, non denaro che si
// muove.
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      await q.createTable('abbonamenti', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        servizio_id: { type: S.STRING(60), allowNull: true },
        chiave: { type: S.STRING(120), allowNull: false },
        ordine: { type: S.SMALLINT, allowNull: false, defaultValue: 0 },
        nome: { type: S.STRING(100), allowNull: false },
        icona: { type: S.STRING(60), allowNull: true },
        costo: { type: S.DECIMAL(12, 2), allowNull: false },
        periodo_mesi: { type: S.SMALLINT, allowNull: false, defaultValue: 1 },
        durata_mesi: { type: S.SMALLINT, allowNull: true },
        data_inizio: { type: S.DATEONLY, allowNull: true },
        stato: { type: S.STRING(12), allowNull: false, defaultValue: 'attivo' },
        origine: { type: S.STRING(12), allowNull: false, defaultValue: 'manuale' },
        da_verificare: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        riattivato_da_addebito: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
        annullato_il: { type: S.DATEONLY, allowNull: true },
        ultimo_addebito_data: { type: S.DATEONLY, allowNull: true },
        ultimo_addebito_importo: { type: S.DECIMAL(12, 2), allowNull: true },
        modificato_utente_il: { type: S.DATE, allowNull: true },
        // Senza chiave esterna di proposito: un ON DELETE SET NULL cancellerebbe
        // proprio il segnale che la programmazione è stata eliminata.
        movimento_ricorrente_id: { type: S.INTEGER, allowNull: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      // Due letture simultanee non possono creare due righe per lo stesso
      // rilevamento (Coding Rule 22). `ordine` lascia spazio ai due abbonamenti
      // distinti che possono stare sullo stesso addebito, come quelli Apple.
      await q.addConstraint('abbonamenti', {
        fields: ['user_id', 'chiave', 'ordine'],
        type: 'unique',
        name: 'abbonamenti_user_chiave_ordine',
        transaction,
      });
      await q.addIndex('abbonamenti', ['user_id', 'stato'], { name: 'abbonamenti_user_stato', transaction });
      await q.sequelize.query("ALTER TABLE abbonamenti ADD CONSTRAINT abbonamenti_stato CHECK (stato IN ('attivo','annullato','escluso'))", { transaction });
      await q.sequelize.query("ALTER TABLE abbonamenti ADD CONSTRAINT abbonamenti_origine CHECK (origine IN ('manuale','rilevato'))", { transaction });
      await q.sequelize.query('ALTER TABLE abbonamenti ADD CONSTRAINT abbonamenti_periodo CHECK (periodo_mesi IN (1,3,6,12))', { transaction });

      await q.sequelize.query('ALTER TABLE public.abbonamenti ENABLE ROW LEVEL SECURITY', { transaction });
      await q.sequelize.query(`DO $$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.abbonamenti FROM %I', role_name); END IF; END LOOP; END $$;`, { transaction });
    });
  },
  async down(q) { await q.dropTable('abbonamenti'); },
};
