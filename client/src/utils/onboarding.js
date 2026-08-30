/**
 * Verifica se l'onboarding è completato (gestisce boolean MySQL 0/1).
 */
export const isOnboardingComplete = (profilo) => {
  if (!profilo) return false;
  const value = profilo.onboarding_completato;
  return value === true || value === 1 || value === '1';
};
