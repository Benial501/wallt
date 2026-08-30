const { User } = require('../models');

const getUserAiCategorizationEnabled = async (userId) => {
  if (!userId) return false;

  const user = await User.findByPk(userId, {
    attributes: ['use_ai_categorization'],
  });

  return user?.use_ai_categorization === true;
};

module.exports = {
  getUserAiCategorizationEnabled,
};
