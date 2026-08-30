const { User, ProfiloUtente } = require('../models');
const { findUserByEmail } = require('../utils/findUserByEmail');
const { repairUserProfilo } = require('./onboarding.service');

const buildGoogleUserPayload = (profile, email, { useAiCategorization = false } = {}) => {
  const now = new Date();
  return {
    nome: profile.displayName || 'Utente Google',
    email,
    password: null,
    avatar: profile.photos?.[0]?.value || null,
    auth_provider: 'google',
    google_id: profile.id,
    privacy_accepted_at: now,
    terms_accepted_at: now,
    use_ai_categorization: useAiCategorization,
    last_login_at: now,
  };
};

class GoogleAccountLinkingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleAccountLinkingError';
    this.code = 'google_account_exists_local';
  }
}

/**
 * Trova o crea l'utente Google. Se esiste già un account Google (stesso
 * google_id) lo riusa. Se esiste un account con la stessa email ma senza
 * google_id collegato e SENZA password locale (creato in precedenza da un
 * altro login Google, o mai completato), collega Google senza creare un
 * duplicato.
 *
 * Se invece l'account con quella email è un account LOCALE con password
 * (auth_provider 'local') non ancora collegato a Google, il login Google
 * NON viene collegato automaticamente: farlo permetterebbe a chiunque di
 * pre-registrare un account locale con l'email di una vittima e ottenerne
 * così l'accesso quando la vittima usa "Accedi con Google" la prima volta
 * (account pre-hijacking / classic federation merge attack — l'attaccante
 * conoscerebbe comunque la password dell'account "unito"). L'email è
 * verificata da Google ma la registrazione locale di WALLT non richiede
 * verifica email, quindi il solo match sull'indirizzo non è una prova
 * sufficiente di proprietà dell'account esistente.
 */
const resolveGoogleUser = async (profile, { useAiCategorization = false } = {}) => {
  const email = profile.emails?.[0]?.value;
  if (!email) {
    throw new Error('Email Google non disponibile');
  }

  const useAi = useAiCategorization === true;
  const now = new Date();

  let user = await User.findOne({ where: { google_id: profile.id } });

  if (!user) {
    user = await findUserByEmail(User, email);
    if (user && !user.google_id && user.password) {
      throw new GoogleAccountLinkingError(
        `Esiste già un account locale con l'email ${email}. Accedi con la password `
        + 'per usare questo account (o reimpostala con "Password dimenticata").',
      );
    }
  }

  if (!user) {
    user = await User.create(buildGoogleUserPayload(profile, email, { useAiCategorization: useAi }));
  } else {
    const updates = {
      last_login_at: now,
    };

    if (!user.google_id) {
      updates.google_id = profile.id;
      if (!user.password) {
        updates.auth_provider = 'google';
      }
    }

    if (!user.avatar && profile.photos?.[0]?.value) {
      updates.avatar = profile.photos[0].value;
    }

    if (!user.privacy_accepted_at) {
      updates.privacy_accepted_at = now;
    }

    if (!user.terms_accepted_at) {
      updates.terms_accepted_at = now;
    }

    if (useAi && !user.use_ai_categorization) {
      updates.use_ai_categorization = true;
    }

    await user.update(updates);
  }

  await repairUserProfilo(user.id);

  return User.findByPk(user.id, {
    include: [{ model: ProfiloUtente, as: 'profilo' }],
  });
};

module.exports = {
  resolveGoogleUser,
  GoogleAccountLinkingError,
  buildGoogleUserPayload,
};
