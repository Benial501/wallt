'use strict';

/**
 * `20260924000032-create-piano-smart-azioni` è l'unica migrazione di creazione
 * del progetto che ha dimenticato l'hardening Supabase applicato a ogni altra
 * tabella WALLT (vedi 20260830000010, 20260907000017, 20260917000024/25 e la
 * gemella 20260924000031-create-piani-smart): `piani_smart_azioni` è rimasta
 * con RLS disattiva e tutti i privilegi ai ruoli `anon` e `authenticated`,
 * raggiungibili dalla Data API Supabase con la chiave anon — che è pubblica per
 * definizione. Il security advisor Supabase l'ha segnalata come
 * `rls_disabled_in_public` (livello ERROR).
 *
 * Sequelize non riesegue una migrazione già registrata: come per i debiti,
 * questa migrazione additiva porta allo stato sicuro anche gli schemi dove la
 * creazione è già passata, produzione inclusa. È idempotente.
 *
 * L'API si connette con il ruolo proprietario della tabella, che non è soggetto
 * a RLS: l'applicazione non è toccata.
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
            WHERE table_schema = 'public' AND table_name = 'piani_smart_azioni'
          ) THEN
            EXECUTE format(
              'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
              'public', 'piani_smart_azioni'
            );

            FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
            LOOP
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format(
                  'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
                  'public', 'piani_smart_azioni', role_name
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
    // non deve riaprire l'accesso diretto ai dati finanziari degli utenti.
  },
};
