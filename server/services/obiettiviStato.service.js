const { giornoLocale, sommaGiorni } = require('./notifiche/notificheTime');

const round2 = (value) => Math.round(value * 100) / 100;
const validDate = (date) => typeof date === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && sommaGiorni(date, 0) === date;

/** Conta i cambi di mese civile, non intervalli di 30 giorni. */
const calcolaProgressoObiettivo = (obiettivo, now = new Date()) => {
  const target = obiettivo.importo_target === null || obiettivo.importo_target === undefined
    ? null : Number(obiettivo.importo_target);
  const attuale = obiettivo.importo_attuale === null || obiettivo.importo_attuale === undefined
    ? null : Number(obiettivo.importo_attuale);
  const oggi = giornoLocale(now, 'Europe/Rome');
  const scadenza = obiettivo.deadline || null;
  const result = {
    tipo_obiettivo: obiettivo.tipo_obiettivo || 'generico',
    importo_target: Number.isFinite(target) ? target : null,
    importo_attuale: Number.isFinite(attuale) ? attuale : null,
    importo_restante: null,
    scadenza,
    mesi_rimanenti: null,
    contributo_mensile_richiesto: null,
    stato: 'dati_mancanti',
  };
  if (target === null || !Number.isFinite(target) || attuale === null || !Number.isFinite(attuale) || attuale < 0) return result;
  if (target <= 0) return { ...result, stato: 'target_non_valido' };

  result.importo_restante = round2(Math.max(target - attuale, 0));
  if (result.importo_restante === 0) return { ...result, stato: 'completato', mesi_rimanenti: 0 };
  if (!scadenza) return { ...result, stato: 'senza_scadenza' };
  if (!validDate(scadenza)) return result;

  const [annoOggi, meseOggi] = oggi.split('-').map(Number);
  const [annoScadenza, meseScadenza] = scadenza.split('-').map(Number);
  const mesi = (annoScadenza - annoOggi) * 12 + meseScadenza - meseOggi;
  result.mesi_rimanenti = Math.max(mesi, 0);
  if (scadenza < oggi) result.stato = 'scaduto';
  else if (scadenza === oggi) result.stato = 'scadenza_oggi';
  else if (mesi === 0) result.stato = 'scadenza_mese_corrente';
  else {
    result.stato = 'in_corso';
    result.contributo_mensile_richiesto = round2(result.importo_restante / mesi);
  }
  return result;
};

module.exports = { calcolaProgressoObiettivo };
