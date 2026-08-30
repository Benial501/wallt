/**
 * Pseudonimizza descrizioni transazione prima dell'invio a servizi AI esterni.
 */
function pseudonymizeDescription(text) {
  if (!text) return '';

  let sanitized = String(text);

  // Numeri lunghi (IBAN parziali, carte, conti)
  sanitized = sanitized.replace(/\d{4,}/g, '[NUM]');

  // Email
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]',
  );

  // Telefoni italiani (mobile +39/0039 e fissi)
  sanitized = sanitized.replace(
    /(?:\+39|0039)[\s.-]?\d{2,4}[\s.-]?\d{5,8}/g,
    '[TEL]',
  );
  sanitized = sanitized.replace(
    /\b3[\s.-]?\d{2}[\s.-]?\d{6,7}\b/g,
    '[TEL]',
  );
  sanitized = sanitized.replace(
    /\b0\d{1,4}[\s.-]?\d{5,8}\b/g,
    '[TEL]',
  );

  // Nomi propri (MAIUSCOLO o Title Case multi-parola)
  sanitized = sanitized.replace(
    /\b([A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ'-]+(?:\s+[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ'-]+)+)\b/g,
    '[NOME]',
  );
  sanitized = sanitized.replace(
    /\b([A-ZÀ-ÖØ-Þ]{2,}(?:\s+[A-ZÀ-ÖØ-Þ]{2,})+)\b/g,
    '[NOME]',
  );

  return sanitized.replace(/\s+/g, ' ').trim();
}

module.exports = {
  pseudonymizeDescription,
};
