const {
  createOAuthChallenge,
} = require('./oauthChallenge.service');
const {
  GoogleNativeAuthError,
  verifyGoogleCredential,
} = require('./googleNativeAuth.service');

class GoogleStepUpError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.name = 'GoogleStepUpError';
    this.statusCode = statusCode;
  }
}

const generateChallenge = (userId, platform = 'web') => createOAuthChallenge({
  provider: 'google',
  purpose: 'step_up',
  platform,
  userId,
});

const verifyGoogleStepUp = async ({ credential, challenge, userId, googleId, platform = 'web' }) => {
  if (!googleId) throw new GoogleStepUpError('Account non collegato a Google', 400);
  try {
    await verifyGoogleCredential({
      credential,
      challenge,
      purpose: 'step_up',
      platform,
      userId,
      googleId,
      requireEmail: false,
    });
  } catch (error) {
    if (error instanceof GoogleNativeAuthError) {
      throw new GoogleStepUpError(error.message, error.statusCode);
    }
    throw error;
  }
};

module.exports = {
  generateChallenge,
  verifyGoogleStepUp,
  GoogleStepUpError,
};
