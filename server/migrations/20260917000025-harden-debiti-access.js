'use strict';

/**
 * La migrazione di creazione `20260917000024-create-debiti` è stata estesa con
 * l'hardening Supabase dopo essere già stata applicata su alcuni database.
 * Sequelize non riesegue una migrazione registrata: questa migrazione additiva
 * porta anche quegli schemi allo stato sicuro atteso.
 *
 * L'API usa il proprietario della tabella. I ruoli `anon` e `authenticated`
 * sono invece raggiungibili dalla Data API Supabase e non devono accedere
 * direttamente ai debiti degli utenti.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        DO $$
        DECLARE role_name text;
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'debiti'
          ) THEN
            EXECUTE format(
              'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
              'public', 'debiti'
            );

            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
            LOOP
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format(
                  'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                  'public', 'debiti', role_name
                );
              END IF;
            END LOOP;
          END IF;
        END
        $$;
      `, { transaction });
    });
  },

  async down() {
    // Non disabilitare RLS e non ripristinare privilegi pubblici: un rollback
    // non deve riaprire l'accesso diretto a dati finanziari personali.
  },
};
