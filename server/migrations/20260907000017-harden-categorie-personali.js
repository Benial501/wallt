'use strict';

/**
 * `categorie_personali` era l'unica tabella WALLT creata senza l'hardening
 * Supabase applicato a tutte le altre (vedi 20260830000010 e 20260906000014):
 * RLS disattivata e privilegi ancora concessi ai ruoli `anon`/`authenticated`.
 *
 * Su Supabase quei ruoli sono raggiungibili con la chiave anon, che è
 * pubblica per definizione (viaggia nei client): senza questa migrazione
 * chiunque potrebbe leggere e modificare le categorie personali di qualsiasi
 * utente, scavalcando del tutto l'API.
 *
 * L'API di WALLT non usa quei ruoli — si connette con il ruolo proprietario
 * del database — quindi attivare RLS senza policy è esattamente il
 * comportamento voluto: nessun accesso pubblico, applicazione invariata.
 */
const TABELLA = 'categorie_personali';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE role_name text;
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = '${TABELLA}'
        ) THEN
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
        END IF;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    // Come in 20260830000010: il rollback non ripristina i privilegi
    // pubblici, sarebbe un peggioramento silenzioso della sicurezza.
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = '${TABELLA}'
        ) THEN
          EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', 'public', '${TABELLA}');
        END IF;
      END
      $$;
    `);
  },
};
