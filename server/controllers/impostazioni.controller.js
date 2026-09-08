const logger = require('../utils/logger');
const bcrypt = require('bcrypt');
const {
  User, ProfiloUtente, Conto, Movimento, BudgetMensile, BudgetCategoria,
  Obiettivo, ObiettivoContributo, PiattaformaScommesse, MovimentoScommesse,
  Investimento, MovimentoInvestimento, CategorieRegola, RegolaPersonaleMerchant,
  Notifica, PreferenzeNotifiche, CategoriaPersonale,
  sequelize,
} = require('../models');
const { formatUser } = require('./auth.controller');
const { deleteAllTransactions, deleteUserAccountCompletely, isOAuthProvider } = require('../services/accountReset.service');
const { isMinorProfilo } = require('../utils/ageRestriction');
const { parseAvatarDataUrl } = require('../utils/avatarImage');
const {
  wantsScommesse,
  wantsInvestimenti,
  syncUserFeatureFlagsFromProfilo,
} = require('../utils/featureAccess');

const updateProfilo = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    const { nome, email, avatar } = req.body;
    const updateData = {};
    if (nome !== undefined) updateData.nome = nome;
    if (email !== undefined) updateData.email = email;
    if (avatar !== undefined) updateData.avatar = avatar;

    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(409).json({ message: 'Email già in uso' });
    }

    await user.update(updateData);
    const { password, ...safeUser } = user.toJSON();
    res.json({ user: safeUser, message: 'Profilo aggiornato' });
  } catch (error) {
    logger.error('Errore updateProfilo', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento profilo' });
  }
};

const updateAvatar = async (req, res) => {
  try {
    const parsed = parseAvatarDataUrl(req.body?.immagine);
    if (!parsed.ok) return res.status(400).json({ message: parsed.error });

    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    // Persistiamo la versione canonica, non la stringa grezza del client.
    await user.update({ avatar_immagine: parsed.dataUrl });

    const { password, ...safeUser } = user.toJSON();
    res.json({ user: safeUser, message: 'Immagine profilo aggiornata' });
  } catch (error) {
    logger.error('Errore updateAvatar', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento dell\'immagine profilo' });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    await user.update({ avatar_immagine: null });

    const { password, ...safeUser } = user.toJSON();
    res.json({ user: safeUser, message: 'Immagine profilo rimossa' });
  } catch (error) {
    logger.error('Errore deleteAvatar', { err: error });
    res.status(500).json({ message: 'Errore nella rimozione dell\'immagine profilo' });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { password_attuale, nuova_password } = req.body;
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'Utente non trovato' });

    if (!user.password) {
      return res.status(400).json({
        message: 'Questo account non ha una password locale. Accedi con Google.',
      });
    }

    const valid = await bcrypt.compare(password_attuale, user.password);
    if (!valid) return res.status(401).json({ message: 'Password attuale non corretta' });

    await user.update({
      password: await bcrypt.hash(nuova_password, 10),
      password_changed_at: new Date(),
    });
    res.json({ message: 'Password aggiornata con successo' });
  } catch (error) {
    logger.error('Errore updatePassword', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento password' });
  }
};

const updatePreferenze = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    const profilo = await ProfiloUtente.findOne({ where: { user_id: req.userId } });
    const minor = isMinorProfilo(profilo);
    const { valuta, tema, reminder, mostra_scommesse, mostra_investimenti, use_ai_categorization } = req.body;
    const updateData = {};
    if (valuta !== undefined) updateData.valuta = valuta;
    if (tema !== undefined) updateData.tema = tema;
    if (reminder !== undefined) updateData.reminder = !!reminder;
    if (use_ai_categorization !== undefined) updateData.use_ai_categorization = !!use_ai_categorization;

    if (minor) {
      if (mostra_scommesse === true || mostra_investimenti === true) {
        return res.status(403).json({
          message: 'Scommesse e investimenti non sono disponibili per utenti under 18.',
        });
      }
      updateData.mostra_scommesse = false;
      updateData.mostra_investimenti = false;
    } else {
      if (mostra_scommesse === true && !wantsScommesse(profilo)) {
        return res.status(403).json({
          message: 'Non puoi attivare Scommesse: nel questionario hai indicato di non scommettere.',
        });
      }
      if (mostra_investimenti === true && !wantsInvestimenti(profilo)) {
        return res.status(403).json({
          message: 'Non puoi attivare Investimenti: nel questionario hai indicato di non investire.',
        });
      }
      if (mostra_scommesse !== undefined) updateData.mostra_scommesse = !!mostra_scommesse;
      if (mostra_investimenti !== undefined) updateData.mostra_investimenti = !!mostra_investimenti;
    }

    await user.update(updateData);

    if (profilo) {
      await syncUserFeatureFlagsFromProfilo(req.userId, profilo);
    }

    const userCompleto = await User.findByPk(req.userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    res.json({ user: formatUser(userCompleto), message: 'Preferenze aggiornate' });
  } catch (error) {
    logger.error('Errore updatePreferenze', { err: error });
    res.status(500).json({ message: 'Errore nell\'aggiornamento preferenze' });
  }
};

const toPlain = (record) => {
  if (record == null) return null;
  if (Array.isArray(record)) {
    return record.map((item) => (item?.toJSON ? item.toJSON() : item));
  }
  return record.toJSON ? record.toJSON() : record;
};

const safeExportQuery = async (label, queryFn, fallback = []) => {
  try {
    const result = await queryFn();
    if (result == null) return fallback;
    return toPlain(result);
  } catch (error) {
    logger.warn(`Export sezione "${label}" non disponibile`, { err: error });
    return fallback;
  }
};

const esportaDati = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    const [
      profilo,
      conti,
      movimenti,
      budget,
      obiettivi,
      investimenti,
      movimentiInvestimento,
      piattaformeScommesse,
      movimentiScommesse,
      categorieRegole,
      regoleMerchant,
      notifiche,
      preferenzeNotifiche,
    ] = await Promise.all([
      safeExportQuery('profilo', () => ProfiloUtente.findOne({ where: { user_id: userId } }), null),
      safeExportQuery('conti', () => Conto.findAll({
        where: { user_id: userId },
        order: [['ordine', 'ASC'], ['id', 'ASC']],
      })),
      safeExportQuery('movimenti', () => Movimento.findAll({
        where: { user_id: userId },
        order: [['data', 'DESC'], ['id', 'DESC']],
      })),
      safeExportQuery('budget', () => BudgetMensile.findAll({
        where: { user_id: userId },
        include: [{ model: BudgetCategoria, as: 'categorie' }],
        order: [['anno', 'DESC'], ['mese', 'DESC']],
      })),
      safeExportQuery('obiettivi', () => Obiettivo.findAll({
        where: { user_id: userId },
        include: [{ model: ObiettivoContributo, as: 'contributi' }],
        order: [['createdAt', 'DESC']],
      })),
      safeExportQuery('investimenti', () => Investimento.findAll({
        where: { user_id: userId },
        order: [['createdAt', 'DESC']],
      })),
      safeExportQuery('movimenti_investimento', () => MovimentoInvestimento.findAll({
        where: { user_id: userId },
        order: [['data', 'DESC'], ['id', 'DESC']],
      })),
      safeExportQuery('piattaforme_scommesse', () => PiattaformaScommesse.findAll({
        where: { user_id: userId },
        order: [['createdAt', 'DESC']],
      })),
      safeExportQuery('movimenti_scommesse', () => MovimentoScommesse.findAll({
        where: { user_id: userId },
        order: [['data', 'DESC'], ['id', 'DESC']],
      })),
      safeExportQuery('categorie_regole', () => CategorieRegola.findAll({
        where: { user_id: userId },
        order: [['priorita', 'DESC'], ['id', 'ASC']],
      })),
      safeExportQuery('regole_merchant', () => RegolaPersonaleMerchant.findAll({
        where: { user_id: userId },
        order: [['priorita', 'DESC'], ['id', 'ASC']],
      })),
      safeExportQuery('notifiche', () => Notifica.findAll({
        where: { user_id: userId },
        order: [['programmata_per', 'DESC'], ['id', 'DESC']],
      })),
      safeExportQuery('preferenze_notifiche', () => PreferenzeNotifiche.findOne({
        where: { user_id: userId },
      }), null),
    ]);

    const categoriePersonali = await CategoriaPersonale.findAll({ where: { user_id: userId } });
    const exportData = {
      categorie_personali: categoriePersonali,
      esportato_il: new Date().toISOString(),
      versione: '2.0',
      formato: 'wallt-portabilita-dati',
      utente: {
        nome: user.nome,
        email: user.email,
        valuta: user.valuta,
        tema: user.tema,
        reminder: user.reminder,
        mostra_scommesse: user.mostra_scommesse,
        mostra_investimenti: user.mostra_investimenti,
        auth_provider: user.auth_provider,
        membro_dal: user.createdAt,
      },
      profilo,
      conti,
      movimenti,
      budget,
      obiettivi,
      portafoglio_investimenti: {
        investimenti,
        movimenti_investimento: movimentiInvestimento,
      },
      scommesse: {
        piattaforme: piattaformeScommesse,
        movimenti_scommesse: movimentiScommesse,
      },
      regole: {
        categorie: categorieRegole,
        merchant_personali: regoleMerchant,
      },
      notifiche: {
        preferenze: preferenzeNotifiche,
        storico: notifiche,
      },
    };

    const dataOggi = new Date().toISOString().split('T')[0];
    const filename = `wallt-export-${dataOggi}.json`;
    const jsonBody = `${JSON.stringify(exportData, null, 2)}\n`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(jsonBody, 'utf8'));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(jsonBody);
  } catch (error) {
    logger.error('Errore esportaDati', { err: error });
    res.status(500).json({ message: 'Errore nell\'esportazione dati' });
  }
};

const deleteAccount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { password, conferma } = req.body;

    const user = await User.findByPk(req.userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    const isOAuth = isOAuthProvider(user.auth_provider) || !user.password;

    if (isOAuth) {
      // JWT già validato da authMiddleware; account OAuth senza password locale.
      if (conferma !== 'ELIMINA') {
        await t.rollback();
        return res.status(400).json({ message: 'Digita ELIMINA per confermare la cancellazione' });
      }
    } else {
      if (!password) {
        await t.rollback();
        return res.status(400).json({ message: 'Password richiesta per confermare' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        await t.rollback();
        return res.status(401).json({ message: 'Password non corretta' });
      }
    }

    await deleteUserAccountCompletely(req.userId, t);

    await t.commit();
    res.json({ success: true, message: 'Account eliminato' });
  } catch (error) {
    await t.rollback();
    logger.error('Errore deleteAccount', { err: error });
    res.status(500).json({ message: 'Errore nell\'eliminazione account' });
  }
};

/**
 * Reset transazioni: elimina i movimenti e azzera i saldi, mantiene conti e profilo.
 */
const resetAccount = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { password, conferma } = req.body;

    const user = await User.findByPk(req.userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    const isGoogle = user.auth_provider === 'google' || !user.password;
    if (isGoogle) {
      if (conferma !== 'RESETTA') {
        await t.rollback();
        return res.status(400).json({ message: 'Digita RESETTA per confermare il reset' });
      }
    } else {
      if (!password) {
        await t.rollback();
        return res.status(400).json({ message: 'Password richiesta per confermare' });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        await t.rollback();
        return res.status(401).json({ message: 'Password non corretta' });
      }
    }

    await deleteAllTransactions(req.userId, t);
    await t.commit();

    const userCompleto = await User.findByPk(req.userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: ProfiloUtente, as: 'profilo' }],
    });

    res.json({
      success: true,
      message: 'Transazioni eliminate. I conti sono stati conservati.',
      user: formatUser(userCompleto),
    });
  } catch (error) {
    await t.rollback();
    logger.error('Errore resetAccount', { err: error });
    res.status(500).json({ message: 'Errore nel reset delle transazioni' });
  }
};

module.exports = {
  updateProfilo,
  updateAvatar,
  deleteAvatar,
  updatePassword,
  updatePreferenze,
  esportaDati,
  deleteAccount,
  resetAccount,
};
