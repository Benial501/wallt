'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.createTable('password_reset_tokens', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        token_hash: {
          type: Sequelize.STRING(255),
          allowNull: false,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        used_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      });
    } catch (e) {
      console.log('Tabella password_reset_tokens già esistente, skip create');
    }

    try {
      await queryInterface.addIndex('password_reset_tokens', ['token_hash'], {
        name: 'idx_password_reset_tokens_token_hash',
      });
    } catch (e) {
      console.log('Indice idx_password_reset_tokens_token_hash già esistente, skip');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.dropTable('password_reset_tokens');
    } catch (e) {
      // ignore
    }
  },
};
