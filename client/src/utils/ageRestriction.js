export const MINOR_ETA_FASCIA = 'under_18';

export const isMinor = (profiloOrFascia) => {
  if (!profiloOrFascia) return false;
  if (typeof profiloOrFascia === 'string') {
    return profiloOrFascia === MINOR_ETA_FASCIA;
  }
  return profiloOrFascia.fascia_eta === MINOR_ETA_FASCIA;
};
