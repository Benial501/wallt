import dayjs from 'dayjs';
import 'dayjs/locale/it';

dayjs.locale('it');

export const formatValuta = (importo, valuta = 'EUR') => {
  const num = parseFloat(importo) || 0;
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: valuta,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
};

export const formatData = (data, formato = 'lungo') => {
  if (!data) return '';
  const d = dayjs(data);

  switch (formato) {
    case 'corto':
      return d.format('DD/MM/YY');
    case 'medio':
      return d.format('DD MMM YYYY');
    case 'completo':
      return d.format('dddd D MMMM YYYY');
    case 'lungo':
    default:
      return d.format('D MMMM YYYY');
  }
};

export const formatPercentuale = (valore) => {
  const num = parseFloat(valore) || 0;
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(num / 100);
};

export const formatVariazione = (valore) => {
  const num = parseFloat(valore) || 0;
  const segno = num > 0 ? '+' : '';
  return `${segno}${num.toFixed(1)}%`;
};
