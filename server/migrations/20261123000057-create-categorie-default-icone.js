'use strict';

/**
 * Una riga = "questo utente ha scelto un'icona diversa per questa categoria
 * predefinita". Stesso pattern di `categorie_default_essenzialita`
 * (20260923000027): le predefinite vivono nel catalogo statico condiviso,
 * quindi la personalizzazione per-utente deve vivere altrove.
 *
 * `tipo` sta nella chiave come per `categorie_default_nascoste`: lo stesso id
 * esiste su entrambi i versi (`da_verificare`).
 */
const TABELLA = 'categorie_default_icone';

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
        icona: { type: S.STRING(50), allowNull: false },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT categorie_default_icone_tipo
         CHECK (tipo IN ('entrata','uscita'))`,
        { transaction },
      );

      // Hardening RLS: attiva senza policy, nessun privilegio ad anon/authenticated.
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
    // Le predefinite tornano a mostrare l'icona di catalogo. Nessun movimento toccato.
    await q.dropTable(TABELLA);
  },
};
