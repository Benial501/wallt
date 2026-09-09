'use strict';

/**
 * Una riga = "questo utente ha eliminato questa categoria predefinita".
 *
 * Le predefinite vivono in un catalogo statico condiviso da tutti gli utenti
 * (`server/constants/catalogoCategorie.json`): non sono cancellabili, e devono
 * restare risolvibili per sempre perché i movimenti storici le referenziano
 * per id. L'eliminazione è quindi per-utente e reversibile, e riusa la stessa
 * semantica `attiva: false` già applicata alle categorie personali archiviate.
 *
 * La chiave comprende `tipo` perché lo stesso id può esistere su entrambi i
 * versi: `da_verificare` è sia entrata sia uscita.
 */
const TABELLA = 'categorie_default_nascoste';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.createTable(TABELLA, {
        user_id: {
          type: S.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        categoria_id: { type: S.STRING(50), allowNull: false, primaryKey: true },
        tipo: { type: S.STRING(10), allowNull: false, primaryKey: true },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT categorie_default_nascoste_tipo CHECK (tipo IN ('entrata','uscita'))`,
        { transaction },
      );

      // Come per ogni altra tabella WALLT su Supabase (vedi 20260830000010 e
      // 20260907000017): RLS attiva senza policy e nessun privilegio ai ruoli
      // raggiungibili con la chiave anon, che è pubblica per definizione.
      // L'API si connette con il ruolo proprietario, quindi resta invariata.
      await q.sequelize.query(`
        DO $$
        DECLARE role_name text;
        BEGIN
          EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', '${TABELLA}');
          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', '${TABELLA}', role_name
              );
            END IF;
          END LOOP;
        END
        $$;
      `, { transaction });
    });
  },

  async down(q) {
    // Il rollback non perde dati finanziari: rende di nuovo visibili a tutti
    // le predefinite che erano state nascoste. Nessun movimento viene toccato.
    await q.dropTable(TABELLA);
  },
};
