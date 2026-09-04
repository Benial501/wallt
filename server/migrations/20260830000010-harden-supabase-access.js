'use strict';

const WALLT_TABLES = [
  'users',
  'profili_utente',
  'conti',
  'movimenti',
  'budget_mensili',
  'budget_categorie',
  'obiettivi',
  'obiettivo_contributi',
  'piattaforme_scommesse',
  'movimenti_scommesse',
  'investimenti',
  'movimenti_investimento',
  'password_reset_tokens',
  'categorie_regole',
  'regole_personali_merchant',
];

const sqlArray = (values) => values.map((value) => `'${value}'`).join(', ');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        table_name text;
        role_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[${sqlArray(WALLT_TABLES)}]
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
            'public', table_name
          );

          FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
          LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format(
                'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                'public', table_name, role_name
              );
            END IF;
          END LOOP;
        END LOOP;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    // Non ripristiniamo privilegi pubblici durante il rollback: sarebbe un
    // peggioramento silenzioso della sicurezza. Disabilitiamo soltanto RLS.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOREACH table_name IN ARRAY ARRAY[${sqlArray(WALLT_TABLES)}]
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY',
            'public', table_name
          );
        END LOOP;
      END
      $$;
    `);
  },
};
