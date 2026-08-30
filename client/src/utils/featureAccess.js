import { isMinor } from '@/utils/ageRestriction';

const toBool = (value, defaultValue = true) => {
  if (value === false || value === 0 || value === '0') return false;
  if (value === true || value === 1 || value === '1') return true;
  if (value === undefined || value === null) return defaultValue;
  return Boolean(value);
};

export const wantsScommesse = (profilo) => {
  if (!profilo) return false;
  return !!profilo.fa_scommesse && profilo.fa_scommesse !== 'no';
};

export const wantsInvestimenti = (profilo) => {
  if (!profilo) return false;
  return !!profilo.ha_investimenti && profilo.ha_investimenti !== 'no';
};

export const canAccessScommesse = (user) => {
  const profilo = user?.profilo;
  if (isMinor(profilo)) return false;
  return wantsScommesse(profilo);
};

export const canAccessInvestimenti = (user) => {
  const profilo = user?.profilo;
  if (isMinor(profilo)) return false;
  return wantsInvestimenti(profilo);
};

export const canShowScommesse = (user) => {
  if (!canAccessScommesse(user)) return false;
  return toBool(user?.mostra_scommesse, true);
};

export const canShowInvestimenti = (user) => {
  if (!canAccessInvestimenti(user)) return false;
  return toBool(user?.mostra_investimenti, true);
};
