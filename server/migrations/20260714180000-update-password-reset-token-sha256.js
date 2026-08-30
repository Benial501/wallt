'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('password_reset_tokens', 'token_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
      comment: 'SHA-256 hex del token di reset',
    });

    try {
      await queryInterface.addIndex('password_reset_tokens', ['user_id', 'expires_at'], {
        name: 'idx_password_reset_tokens_user_expires',
      });
    } catch (e) {
      console.log('Indice idx_password_reset_tokens_user_expires già esistente, skip');
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeIndex('password_reset_tokens', 'idx_password_reset_tokens_user_expires');
    } catch (e) {
      // ignore
    }

    await queryInterface.changeColumn('password_reset_tokens', 'token_hash', {
      type: Sequelize.STRING(255),
      allowNull: false,
    });
  },
};
