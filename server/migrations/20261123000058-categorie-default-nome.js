'use strict';

/**
 * Le predefinite si possono anche rinominare per sé: `categorie_default_icone`
 * diventa la personalizzazione completa (icona e/o nome). Una riga esiste
 * solo se almeno uno dei due è scelto; `null` significa "quello di catalogo".
 */
const TABELLA = 'categorie_default_icone';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.addColumn(TABELLA, 'nome', { type: S.STRING(80), allowNull: true }, { transaction });
      await q.changeColumn(TABELLA, 'icona', { type: S.STRING(50), allowNull: true }, { transaction });
      await q.sequelize.query(
        `ALTER TABLE ${TABELLA} ADD CONSTRAINT categorie_default_icone_qualcosa
         CHECK (icona IS NOT NULL OR nome IS NOT NULL)`,
        { transaction },
      );
    });
  },

  async down(q, S) {
    await q.sequelize.transaction(async transaction => {
      await q.sequelize.query(`ALTER TABLE ${TABELLA} DROP CONSTRAINT categorie_default_icone_qualcosa`, { transaction });
      await q.sequelize.query(`DELETE FROM ${TABELLA} WHERE icona IS NULL`, { transaction });
      await q.changeColumn(TABELLA, 'icona', { type: S.STRING(50), allowNull: false }, { transaction });
      await q.removeColumn(TABELLA, 'nome', { transaction });
    });
  },
};
