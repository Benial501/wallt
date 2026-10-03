const PAUSA_RITENTATIVO_MS = 300;

const erroreRitentabile = (errore) => {
  const stato = errore?.response?.status;
  return !errore?.response || stato === 408 || stato === 429 || stato >= 500;
};

/** Ripete una sola volta una lettura HTTP fallita per rete o errore temporaneo. */
export const getWithOneRetry = async (request) => {
  try {
    return await request();
  } catch (errore) {
    if (!erroreRitentabile(errore)) throw errore;
    await new Promise((resolve) => setTimeout(resolve, PAUSA_RITENTATIVO_MS));
    return request();
  }
};
