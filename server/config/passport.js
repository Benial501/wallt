const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { resolveGoogleUser } = require('../services/googleAuth.service');

const getGoogleCallbackUrl = () => (
  process.env.GOOGLE_CALLBACK_URL
    || (process.env.NODE_ENV === 'production'
      ? `${process.env.API_URL || 'https://tuo-dominio.com'}/api/auth/google/callback`
      : 'http://localhost:3000/api/auth/google/callback')
);

const isGoogleAuthEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (isGoogleAuthEnabled()) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: getGoogleCallbackUrl(),
    passReqToCallback: true,
  }, async (req, _accessToken, _refreshToken, profile, done) => {
    try {
      const { parseOAuthState } = require('../utils/oauthPopup');
      const { useAiCategorization } = parseOAuthState(req.query?.state);
      const user = await resolveGoogleUser(profile, { useAiCategorization });
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }));
}

module.exports = passport;
module.exports.isGoogleAuthEnabled = isGoogleAuthEnabled;
