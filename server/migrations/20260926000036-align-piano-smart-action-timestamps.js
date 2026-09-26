'use strict';

module.exports = {
  async up(queryInterface) {
    const columns = await queryInterface.describeTable('piani_smart_azioni');
    if (columns.createdAt && !columns.created_at) {
      await queryInterface.renameColumn('piani_smart_azioni', 'createdAt', 'created_at');
    }
    if (columns.updatedAt && !columns.updated_at) {
      await queryInterface.renameColumn('piani_smart_azioni', 'updatedAt', 'updated_at');
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('piani_smart_azioni');
    if (columns.created_at && !columns.createdAt) {
      await queryInterface.renameColumn('piani_smart_azioni', 'created_at', 'createdAt');
    }
    if (columns.updated_at && !columns.updatedAt) {
      await queryInterface.renameColumn('piani_smart_azioni', 'updated_at', 'updatedAt');
    }
  },
};
