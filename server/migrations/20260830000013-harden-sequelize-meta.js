'use strict';

/**
 * La migrazione 20260830000010 protegge le 16 tabelle applicative ma dimentica
 * `SequelizeMeta`, creata da sequelize-cli stessa. Su Supabase restava quindi
 * leggibile e scrivibile dai ruoli `anon` e `authenticated`: chi possiede la
 * chiave anon pubblica del progetto poteva svuotarla, facendo rieseguire tutte
 * le migrazioni al deploy successivo e rompendolo.
 *
 * Non contiene dati personali, solo nomi di file di migrazione: il rischio è
 * di integrità e disponibilità, non di riservatezza.
 *
 * L'applicazione si connette come proprietario della tabella e ignora RLS,
 * quindi sequelize-cli continua a funzionare normalmente.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE public."SequelizeMeta" ENABLE ROW LEVEL SECURITY;
      DO $$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
        LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format(
              'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
              'public', 'SequelizeMeta', role_name
            );
          END IF;
        END LOOP;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    // Come per 20260830000010: il rollback non ripristina privilegi pubblici,
    // sarebbe un peggioramento silenzioso della sicurezza.
    await queryInterface.sequelize.query(
      'ALTER TABLE public."SequelizeMeta" DISABLE ROW LEVEL SECURITY;',
    );
  },
};
