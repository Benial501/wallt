'use strict';

/**
 * Una riga = "questo utente ha personalizzato l'essenzialità di questa
 * categoria predefinita di uscita".
 *
 * Le predefinite vivono nel catalogo statico condiviso
 * (`server/constants/catalogoCategorie.json`): l'essenzialità di catalogo è
 * un'impostazione iniziale, non un giudizio universale (vedi CLAUDE.md § 6.1).
 * Questa tabella tiene la personalizzazione per-utente senza toccare il
 * catalogo globale, stesso pattern di `categorie_default_nascoste`
 * (20260909000019) per lo stesso motivo: le predefinite non sono file
 * per-utente, quindi qualunque override deve vivere altrove.
 *
 * Solo `tipo = 'uscita'`: l'essenzialità non è applicabile alle entrate
 * (vedi `essenzialita.service.js`), quindi non serve includere `tipo` nella
 * chiave come per le nascoste (dove serve a distinguere `da_verificare`
 * entrata da `da_verificare` uscita).
 */
const TABELLA = 'categorie_default_essenzialita';

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
        essenzialita: { type: S.STRING(20), allowNull: false },
        created_at: { type: S.DATE, allowNull: false },
        updated_at: { type: S.DATE, allowNull: false },
      }, { transaction });

      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT categorie_default_essenzialita_valore
         CHECK (essenzialita IN ('essenziale','semi_essenziale','discrezionale'))`,
        { transaction },
      );

      // Stesso hardening RLS di categorie_default_nascoste (20260909000019):
      // RLS attiva senza policy, nessun privilegio ai ruoli anon/authenticated.
      // L'API si connette col ruolo proprietario, quindi resta invariata.
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
    // Rollback non distruttivo per i dati finanziari: le predefinite tornano
    // a mostrare solo l'essenzialità di catalogo. Nessun movimento toccato.
    await q.dropTable(TABELLA);
  },
};
