module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('piani_smart_azioni', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      plan_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'piani_smart', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE', onUpdate: 'CASCADE',
      },
      action_key: { type: Sequelize.STRING(80), allowNull: false },
      title: { type: Sequelize.STRING(160), allowNull: false },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      destination_type: { type: Sequelize.STRING(30), allowNull: false },
      destination_id: { type: Sequelize.INTEGER, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: false },
      risk_if_ignored: { type: Sequelize.TEXT, allowNull: true },
      priority: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'da_fare' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('piani_smart_azioni', ['user_id', 'plan_id']);
    await queryInterface.addIndex('piani_smart_azioni', ['plan_id', 'status']);
    await queryInterface.sequelize.query(
      "ALTER TABLE piani_smart_azioni ADD CONSTRAINT piani_smart_azioni_status_check CHECK (status IN ('da_fare', 'completata', 'ignorata'))",
    );
  },
  async down(queryInterface) { await queryInterface.dropTable('piani_smart_azioni'); },
};
