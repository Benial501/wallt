'use strict';
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable('debiti', {
        id: { type: S.INTEGER, primaryKey: true, autoIncrement: true },
        user_id: { type: S.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
        nome: { type: S.STRING(200), allowNull: false },
        tipo: { type: S.STRING(30), allowNull: false, defaultValue: 'altro' },
        saldo_residuo: { type: S.DECIMAL(12, 2), allowNull: false },
        rata_periodica: { type: S.DECIMAL(12, 2), allowNull: true },
        tasso_interesse: { type: S.DECIMAL(5, 2), allowNull: true },
        taeg: { type: S.DECIMAL(5, 2), allowNull: true },
        frequenza: { type: S.STRING(20), allowNull: true, defaultValue: 'mensile' },
        prossima_scadenza: { type: S.DATEONLY, allowNull: true },
        data_fine: { type: S.DATEONLY, allowNull: true },
        conto_id: { type: S.INTEGER, allowNull: true, references: { model: 'conti', key: 'id' }, onDelete: 'SET NULL' },
        attivo: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });
      await q.sequelize.query(
        "ALTER TABLE debiti ADD CONSTRAINT debiti_tipo CHECK (tipo IN ('prestito','mutuo','finanziamento','revolving','debito_personale','altro'))",
        { transaction },
      );
      await q.sequelize.query(
        "ALTER TABLE debiti ADD CONSTRAINT debiti_frequenza CHECK (frequenza IS NULL OR frequenza IN ('mensile','settimanale','annuale','unica'))",
        { transaction },
      );
      await q.addIndex('debiti', ['user_id', 'attivo'], { transaction });
      // Come per ogni altra tabella WALLT su Supabase (vedi 20260830000010 e
      // 20260907000017): RLS attiva senza policy e nessun privilegio ai ruoli
      // raggiungibili con la chiave anon, che è pubblica per definizione.
      // L'API si connette con il ruolo proprietario, quindi resta invariata.
      await q.sequelize.query(`
        DO $$
        DECLARE role_name text;
        BEGIN
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', 'debiti');
          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', 'debiti', role_name
              );
            END IF;
          END LOOP;
        END
        $$;
      `, { transaction });
    });
  },
  async down(q) {
    await q.dropTable('debiti');
  },
};
