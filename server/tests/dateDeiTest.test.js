// Le date relative a «oggi» usate dalle altre suite. Un errore qui resta
// invisibile per quasi tutto il mese: il 31 ottobre 2026 ha mandato in rosso
// cinque test senza che nessun codice fosse cambiato.
const { primoGiornoMeseScorso, fermaOrologio } = require('./helpers/date');

const aDueCifre = (numero) => String(numero).padStart(2, '0');

describe('primoGiornoMeseScorso', () => {
  afterEach(() => jest.useRealTimers());

  // L'atteso viene dal solo scorrere del calendario, senza aritmetica sui mesi:
  // così non può ripetere l'errore che questo test deve scoprire.
  it('in ogni giorno di due anni, bisestile compreso, dà il mese civile precedente', () => {
    const errori = [];
    let precedente = '2026-12';

    [2027, 2028].forEach((anno) => {
      for (let mese = 1; mese <= 12; mese += 1) {
        const corrente = `${anno}-${aDueCifre(mese)}`;
        const giorni = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
        for (let giorno = 1; giorno <= giorni; giorno += 1) {
          const oggi = `${corrente}-${aDueCifre(giorno)}`;
          fermaOrologio(`${oggi}T10:00:00Z`);
          const ottenuto = primoGiornoMeseScorso();
          if (ottenuto !== `${precedente}-01`) errori.push(`${oggi} → ${ottenuto}`);
        }
        precedente = corrente;
      }
    });

    expect(errori).toEqual([]);
  });

  // Il mese in corso delle medie è quello di Roma: il confine sta lì, non in UTC.
  it.each([
    ['ora solare', '2026-11-30T23:30:00Z', '2026-11-01'],
    ['ora legale', '2027-06-30T22:30:00Z', '2027-06-01'],
  ])('passata la mezzanotte a Roma conta già il mese nuovo, anche se in UTC è il vecchio (%s)', (_ora, istante, atteso) => {
    fermaOrologio(istante);
    expect(primoGiornoMeseScorso()).toBe(atteso);
  });
});
