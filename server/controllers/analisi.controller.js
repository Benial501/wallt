const { list: listCategories } = require('../services/categorie.service');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const {
  Movimento, Conto, BudgetMensile, BudgetCategoria,
  Obiettivo, ObiettivoContributo, MovimentoScommesse, Investimento,
} = require('../models');

const toNumber = (val) => parseFloat(val) || 0;

const MESI_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const CATEGORIA_DISPLAY = {
  cibo_spesa: { nome: 'Cibo e spesa', emoji: '🍕' },
  casa: { nome: 'Casa', emoji: '🏠' },
  bollette: { nome: 'Bollette', emoji: '💡' },
  benzina_trasporti: { nome: 'Benzina', emoji: '⛽' },
  mezzi_pubblici: { nome: 'Mezzi pubblici', emoji: '🚌' },
  abbigliamento: { nome: 'Abbigliamento', emoji: '👕' },
  svago: { nome: 'Svago', emoji: '🎉' },
  deposito_scommesse: { nome: 'Scommesse', emoji: '🎲' },
  investimento: { nome: 'Investimenti', emoji: '📊' },
  salute: { nome: 'Salute', emoji: '🏥' },
  abbonamenti: { nome: 'Abbonamenti', emoji: '📱' },
  regali: { nome: 'Regali', emoji: '🎁' },
  acquisti_vari: { nome: 'Acquisti', emoji: '🛍️' },
  trasferimento_denaro: { nome: 'Trasferimento denaro', emoji: '↔️' },
  altro_uscita: { nome: 'Altro', emoji: '📤' },
  cibo: { nome: 'Cibo', emoji: '🍕' },
  acquisti: { nome: 'Acquisti', emoji: '🛍️' },
};


const getDistribuzioneSpese = async (req, res) => {
  try {
    const categories = await listCategories(req.userId, { includeArchived: true });
    const getCatDisplay = id => categories.find(c => c.id === id && c.tipo === 'uscita') || CATEGORIA_DISPLAY[id] || { nome: id, emoji: '📊' };
    const { da, a } = req.query;
    const where = { user_id: req.userId, tipo: 'uscita' };
    if (da || a) {
      where.data = {};
      if (da) where.data[Op.gte] = da;
      if (a) where.data[Op.lte] = a;
    }

    const movimenti = await Movimento.findAll({ where, attributes: ['categoria', 'importo'] });
    const map = {};
    movimenti.forEach((m) => {
      const cat = m.categoria || 'altro_uscita';
      map[cat] = (map[cat] || 0) + toNumber(m.importo);
    });

    const totale = Object.values(map).reduce((s, v) => s + v, 0);
    const risultato = Object.entries(map)
      .map(([categoria, importo]) => {
        const display = getCatDisplay(categoria);
        return {
          categoria,
          nome_display: display.nome,
          emoji: display.emoji,
          importo: Math.round(importo * 100) / 100,
          percentuale: totale > 0 ? Math.round((importo / totale) * 10000) / 100 : 0,
        };
      })
      .sort((x, y) => y.importo - x.importo);

    res.json({ distribuzione: risultato, totale: Math.round(totale * 100) / 100 });
  } catch (error) {
    logger.error('Errore getDistribuzioneSpese', { err: error });
    res.status(500).json({ message: 'Errore nel calcolo distribuzione spese' });
  }
};

const getConfrontoMesi = async (req, res) => {
  try {
    const mesi = parseInt(req.query.mesi, 10) || 6;
    const now = new Date();
    const risultato = [];

    for (let i = mesi - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mese = d.getMonth() + 1;
      const anno = d.getFullYear();
      const ultimo = new Date(anno, mese, 0).getDate();
      const da = `${anno}-${String(mese).padStart(2, '0')}-01`;
      const a = `${anno}-${String(mese).padStart(2, '0')}-${ultimo}`;

      const movimenti = await Movimento.findAll({
        where: {
          user_id: req.userId,
          data: { [Op.between]: [da, a] },
          tipo: { [Op.in]: ['entrata', 'uscita'] },
        },
      });

      let entrate = 0;
      let uscite = 0;
      movimenti.forEach((m) => {
        if (m.tipo === 'entrata') entrate += toNumber(m.importo);
        else uscite += toNumber(m.importo);
      });

      risultato.push({
        mese,
        anno,
        label: `${MESI_SHORT[mese - 1]} ${String(anno).slice(2)}`,
        entrate: Math.round(entrate * 100) / 100,
        uscite: Math.round(uscite * 100) / 100,
        saldo: Math.round((entrate - uscite) * 100) / 100,
      });
    }

    res.json({ mesi: risultato });
  } catch (error) {
    logger.error('Errore getConfrontoMesi', { err: error });
    res.status(500).json({ message: 'Errore nel confronto mesi' });
  }
};

const getAndamentoPatrimonio = async (req, res) => {
  try {
    const periodo = req.query.periodo || '6m';
    const now = new Date();
    let startDate = new Date(now);

    switch (periodo) {
      case '3m': startDate.setMonth(startDate.getMonth() - 3); break;
      case '6m': startDate.setMonth(startDate.getMonth() - 6); break;
      case '1a': startDate.setFullYear(startDate.getFullYear() - 1); break;
      case 'tutto': startDate = new Date(2020, 0, 1); break;
      default: startDate.setMonth(startDate.getMonth() - 6);
    }

    const conti = await Conto.findAll({ where: { user_id: req.userId, attivo: true } });
    const investimenti = await Investimento.findAll({ where: { user_id: req.userId, attivo: true } });
    const patrimonioConti = conti.reduce((s, c) => s + toNumber(c.saldo), 0);
    const patrimonioInvestimenti = investimenti.reduce((s, i) => s + toNumber(i.saldo_attuale), 0);
    const patrimonioAttuale = patrimonioConti + patrimonioInvestimenti;

    const movimenti = await Movimento.findAll({
      where: {
        user_id: req.userId,
        data: { [Op.gte]: startDate.toISOString().split('T')[0] },
        tipo: { [Op.in]: ['entrata', 'uscita'] },
      },
      order: [['data', 'ASC']],
    });

    const punti = [];
    let current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= now) {
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const dataStr = current.toISOString().split('T')[0];

      let delta = 0;
      movimenti.forEach((m) => {
        const md = new Date(m.data);
        if (md >= current && md < weekEnd) {
          delta += m.tipo === 'entrata' ? toNumber(m.importo) : -toNumber(m.importo);
        }
      });

      punti.push({ data: dataStr, delta });
      current = weekEnd;
    }

    let running = patrimonioAttuale;
    for (let i = punti.length - 1; i >= 0; i--) {
      punti[i].patrimonio = Math.round(running * 100) / 100;
      running -= punti[i].delta;
    }

    const patrimoni = punti.map((p) => p.patrimonio);
    const inizio = patrimoni[0] || patrimonioAttuale;
    const fine = patrimoni[patrimoni.length - 1] || patrimonioAttuale;
    const min = Math.min(...patrimoni);
    const max = Math.max(...patrimoni);
    const variazioneImporto = Math.round((fine - inizio) * 100) / 100;
    const variazionePercentuale = inizio !== 0
      ? Math.round((variazioneImporto / Math.abs(inizio)) * 10000) / 100
      : 0;

    res.json({
      punti,
      min,
      max,
      inizio,
      fine,
      variazione_importo: variazioneImporto,
      variazione_percentuale: variazionePercentuale,
    });
  } catch (error) {
    logger.error('Errore getAndamentoPatrimonio', { err: error });
    res.status(500).json({ message: 'Errore nell\'andamento patrimonio' });
  }
};

const getStatoBudgetMese = async (userId, mese, anno) => {
  const result = await require('../services/budgetStato.service').calcolaStatoBudget({ userId, mese, anno });
  return result?.stato || [];
};

const getSuggerimenti = async (req, res) => {
  try {
    const categories = await listCategories(req.userId, { includeArchived: true });
    const getCatDisplay = id => categories.find(c => c.id === id && c.tipo === 'uscita') || CATEGORIA_DISPLAY[id] || { nome: id, emoji: '📊' };
    const suggerimenti = [];
    const now = new Date();
    const meseCorrente = now.getMonth() + 1;
    const annoCorrente = now.getFullYear();
    const mesePrec = meseCorrente === 1 ? 12 : meseCorrente - 1;
    const annoPrec = meseCorrente === 1 ? annoCorrente - 1 : annoCorrente;

    const getUscitePerCat = async (m, a) => {
      const ultimo = new Date(a, m, 0).getDate();
      const da = `${a}-${String(m).padStart(2, '0')}-01`;
      const fine = `${a}-${String(m).padStart(2, '0')}-${ultimo}`;
      const movs = await Movimento.findAll({
        where: { user_id: req.userId, tipo: 'uscita', data: { [Op.between]: [da, fine] } },
      });
      const map = {};
      let tot = 0;
      movs.forEach((mv) => {
        const c = mv.categoria || 'altro_uscita';
        map[c] = (map[c] || 0) + toNumber(mv.importo);
        tot += toNumber(mv.importo);
      });
      return { map, tot };
    };

    const corrente = await getUscitePerCat(meseCorrente, annoCorrente);
    const precedente = await getUscitePerCat(mesePrec, annoPrec);

    Object.keys({ ...corrente.map, ...precedente.map }).forEach((cat) => {
      const curr = corrente.map[cat] || 0;
      const prev = precedente.map[cat] || 0;
      if (prev === 0) return;
      const varPct = ((curr - prev) / prev) * 100;
      const display = getCatDisplay(cat);

      if (varPct > 50) {
        suggerimenti.push({
          tipo: 'alert', livello: 'alto', categoria: cat,
          messaggio: `${display.nome}: +${Math.round(varPct)}% rispetto al mese scorso`,
          dettaglio: `Hai speso ${curr.toFixed(0)}€ vs ${prev.toFixed(0)}€`,
        });
      } else if (varPct > 20) {
        suggerimenti.push({
          tipo: 'warning', livello: 'medio', categoria: cat,
          messaggio: `${display.nome}: aumentata del ${Math.round(varPct)}%`,
        });
      } else if (varPct < -15) {
        suggerimenti.push({
          tipo: 'positivo', categoria: cat,
          messaggio: `Ottimo! Hai ridotto ${display.nome} del ${Math.abs(Math.round(varPct))}%`,
        });
      }
    });

    const nonEssenziali = (corrente.map.svago || 0) + (corrente.map.acquisti_vari || 0) + (corrente.map.abbigliamento || 0);
    if (corrente.tot > 0) {
      const pct = (nonEssenziali / corrente.tot) * 100;
      if (pct > 30) {
        suggerimenti.push({
          tipo: 'info',
          messaggio: `Il ${Math.round(pct)}% delle uscite è non essenziale`,
          suggerimento: 'Riducendo €50/mese = €600/anno risparmiati',
        });
      }
    }

    const depositiCorrente = await MovimentoScommesse.sum('importo', {
      where: {
        user_id: req.userId, tipo: 'deposito',
        data: { [Op.gte]: `${annoCorrente}-${String(meseCorrente).padStart(2, '0')}-01` },
      },
    }) || 0;
    const depositiPrec = await MovimentoScommesse.sum('importo', {
      where: {
        user_id: req.userId, tipo: 'deposito',
        data: {
          [Op.between]: [
            `${annoPrec}-${String(mesePrec).padStart(2, '0')}-01`,
            `${annoPrec}-${String(mesePrec).padStart(2, '0')}-${new Date(annoPrec, mesePrec, 0).getDate()}`,
          ],
        },
      },
    }) || 0;

    if (depositiPrec > 0 && depositiCorrente > depositiPrec * 1.2) {
      const varPct = Math.round(((depositiCorrente - depositiPrec) / depositiPrec) * 100);
      suggerimenti.push({
        tipo: 'warning_scommesse',
        messaggio: `Depositi scommesse +${varPct}% questo mese`,
        dettaglio: `${toNumber(depositiCorrente).toFixed(0)}€ vs ${toNumber(depositiPrec).toFixed(0)}€ mese scorso`,
      });
    }

    const statoBudget = await getStatoBudgetMese(req.userId, meseCorrente, annoCorrente);
    statoBudget.forEach((s) => {
      if (s.percentuale_usata > 85) {
        const display = getCatDisplay(s.categoria);
        suggerimenti.push({
          tipo: 'budget_alert',
          messaggio: `${display.nome}: hai usato il ${Math.round(s.percentuale_usata)}% del budget`,
          dettaglio: `${s.speso.toFixed(0)}€ su ${s.budget_importo.toFixed(0)}€`,
        });
      }
    });

    const conti = await Conto.findAll({ where: { user_id: req.userId, attivo: true } });
    const patrimonio = conti.reduce((s, c) => s + toNumber(c.saldo), 0);
    const movimentiMese = await Movimento.findAll({
      where: {
        user_id: req.userId,
        data: { [Op.gte]: `${annoCorrente}-${String(meseCorrente).padStart(2, '0')}-01` },
        tipo: { [Op.in]: ['entrata', 'uscita'] },
      },
    });
    let delta = 0;
    movimentiMese.forEach((m) => { delta += m.tipo === 'entrata' ? toNumber(m.importo) : -toNumber(m.importo); });
    if (delta > 0) {
      suggerimenti.push({
        tipo: 'positivo',
        messaggio: `Patrimonio in crescita di ${delta.toFixed(0)}€ questo mese`,
        dettaglio: `Patrimonio attuale: ${patrimonio.toFixed(0)}€`,
      });
    }

    const obiettivi = await Obiettivo.findAll({
      where: { user_id: req.userId, completato: false },
      include: [{ model: ObiettivoContributo, as: 'contributi' }],
    });

    obiettivi.forEach((obj) => {
      if (!obj.deadline) return;
      const mancante = toNumber(obj.importo_target) - toNumber(obj.importo_attuale);
      if (mancante <= 0) return;

      const deadline = new Date(obj.deadline);
      const mesiRim = Math.max(1, Math.ceil((deadline - now) / (1000 * 60 * 60 * 24 * 30)));
      const rataNecessaria = mancante / mesiRim;

      const contributi = obj.contributi || [];
      const mediaContributi = contributi.length > 0
        ? contributi.reduce((s, c) => s + toNumber(c.importo), 0) / contributi.length
        : 0;

      if (rataNecessaria > mediaContributi * 1.2) {
        suggerimenti.push({
          tipo: 'obiettivo_rischio',
          messaggio: `Al ritmo attuale non raggiungerai "${obj.nome}" entro ${obj.deadline}`,
          azione: `Aumenta i contributi a ${Math.ceil(rataNecessaria)}€/mese`,
          dettaglio: `Mancano ${mancante.toFixed(0)}€ in ${mesiRim} mesi`,
        });
      }
    });

    const ordine = ['alert', 'warning', 'warning_scommesse', 'budget_alert', 'obiettivo_rischio', 'info', 'positivo'];
    suggerimenti.sort((a, b) => ordine.indexOf(a.tipo) - ordine.indexOf(b.tipo));

    res.json({ suggerimenti });
  } catch (error) {
    logger.error('Errore getSuggerimenti', { err: error });
    res.status(500).json({ message: 'Errore nella generazione suggerimenti' });
  }
};

module.exports = {
  getDistribuzioneSpese,
  getConfrontoMesi,
  getAndamentoPatrimonio,
  getSuggerimenti,
};
