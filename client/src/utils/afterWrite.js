/**
 * Aggiornamenti della vista da eseguire DOPO una scrittura già andata a buon fine.
 *
 * Il punto: una volta che il server ha confermato la scrittura, l'operazione
 * è avvenuta. Se poi fallisce una delle richieste di aggiornamento — saldi,
 * elenco movimenti, patrimonio — quel fallimento riguarda solo ciò che si vede
 * a schermo, non il dato. Lasciarlo risalire fino al `catch` del salvataggio
 * faceva comparire un messaggio di errore per un'operazione riuscita: l'utente
 * credeva che non fosse stata registrata e la rifaceva, salvo poi trovarla.
 *
 * Questi aggiornamenti quindi non propagano mai un errore; segnalano soltanto
 * se sono riusciti tutti, così chi chiama può avvisare che i numeri a schermo
 * potrebbero non essere aggiornati.
 *
 * @param {...(Promise|Function)} tasks
 * @returns {Promise<boolean>} true se ogni aggiornamento è riuscito.
 */
export const refreshAfterWrite = async (...tasks) => {
  const results = await Promise.allSettled(
    tasks.map((task) => {
      try {
        return typeof task === 'function' ? task() : task;
      } catch (error) {
        return Promise.reject(error);
      }
    }),
  );

  return results.every((result) => result.status === 'fulfilled');
};

/** Messaggio unico per quando la scrittura è riuscita ma la vista è rimasta indietro. */
export const VISTA_NON_AGGIORNATA = 'Operazione salvata. I dati a schermo potrebbero non essere aggiornati: ricarica la pagina.';
