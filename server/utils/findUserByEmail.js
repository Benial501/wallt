const { Op } = require('sequelize');
const { gmailCanonical } = require('./gmailAddress');

const isGmailAddress = (email) => (
  typeof email === 'string'
  && (email.toLowerCase().endsWith('@gmail.com') || email.toLowerCase().endsWith('@googlemail.com'))
);

/**
 * Trova utente per email esatta o alias Gmail equivalente (punti ignorati).
 */
const findUserByEmail = async (User, email) => {
  if (!email) {
    return null;
  }

  const normalized = String(email).trim().toLowerCase();
  const directMatch = await User.findOne({ where: { email: normalized } });
  if (directMatch) {
    return directMatch;
  }

  if (!isGmailAddress(normalized)) {
    return null;
  }

  const target = gmailCanonical(normalized);
  const gmailUsers = await User.findAll({
    where: {
      [Op.or]: [
        { email: { [Op.like]: '%@gmail.com' } },
        { email: { [Op.like]: '%@googlemail.com' } },
      ],
    },
  });

  return gmailUsers.find((user) => gmailCanonical(user.email) === target) || null;
};

module.exports = {
  findUserByEmail,
  isGmailAddress,
};
