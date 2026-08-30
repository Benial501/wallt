/**
 * Normalizza indirizzi Gmail per confronto (punti e +tag ignorati).
 */
const gmailCanonical = (email) => {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.lastIndexOf('@');
  if (atIndex === -1) {
    return normalized;
  }

  let local = normalized.slice(0, atIndex);
  let domain = normalized.slice(atIndex + 1);

  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  if (domain !== 'gmail.com') {
    return `${local}@${domain}`;
  }

  local = local.split('+')[0].replace(/\./g, '');
  return `${local}@${domain}`;
};

const areGmailEquivalent = (a, b) => {
  const canonicalA = gmailCanonical(a);
  const canonicalB = gmailCanonical(b);
  if (!canonicalA.endsWith('@gmail.com') || !canonicalB.endsWith('@gmail.com')) {
    return false;
  }
  return canonicalA === canonicalB;
};

module.exports = {
  gmailCanonical,
  areGmailEquivalent,
};
