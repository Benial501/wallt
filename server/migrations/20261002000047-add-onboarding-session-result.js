'use strict';

module.exports = {
  async up(q, S) { await q.addColumn('onboarding_sessions', 'result', { type: S.JSONB, allowNull: true }); },
  async down(q) { await q.removeColumn('onboarding_sessions', 'result'); },
};
