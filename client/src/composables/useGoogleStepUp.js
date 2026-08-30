import { ref } from 'vue';
import api from '@/utils/axios';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GSI_SCRIPT_ID = 'wallt-google-identity-services';

let scriptLoadPromise = null;

const loadGoogleIdentityServices = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GSI_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('gsi_load_failed')));
      return;
    }

    const script = document.createElement('script');
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gsi_load_failed'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
};

/**
 * Step-up reale per utenti Google OAuth: ottiene un challenge/nonce dal
 * backend, mostra il pulsante ufficiale "Continua con Google" (Google
 * Identity Services) nel container fornito, e scambia l'ID token risultante
 * con uno step_up_token WALLT tramite POST /api/auth/verify-google.
 */
export function useGoogleStepUp() {
  const verifying = ref(false);
  const error = ref('');

  const renderGoogleStepUpButton = (containerEl) => new Promise((resolve, reject) => {
    if (!containerEl) {
      reject(new Error('missing_container'));
      return;
    }

    verifying.value = false;
    error.value = '';

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      error.value = 'Verifica Google non disponibile in questo ambiente.';
      reject(new Error('missing_client_id'));
      return;
    }

    (async () => {
      try {
        await loadGoogleIdentityServices();
      } catch {
        error.value = 'Impossibile caricare Google Identity Services.';
        reject(new Error('gsi_load_failed'));
        return;
      }

      let challengeRes;
      try {
        challengeRes = await api.post('/auth/google/challenge');
      } catch (err) {
        error.value = err.response?.data?.message || 'Impossibile avviare la verifica Google.';
        reject(err);
        return;
      }

      const { nonce, challenge } = challengeRes.data;

      const handleCredential = async (response) => {
        verifying.value = true;
        try {
          const { data } = await api.post('/auth/verify-google', {
            credential: response.credential,
            challenge,
          });
          verifying.value = false;
          resolve(data.step_up_token);
        } catch (err) {
          verifying.value = false;
          error.value = err.response?.data?.message || 'Verifica Google non riuscita';
          reject(err);
        }
      };

      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce,
          callback: handleCredential,
        });

        // eslint-disable-next-line no-param-reassign
        containerEl.innerHTML = '';
        window.google.accounts.id.renderButton(containerEl, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
        });
      } catch (err) {
        error.value = 'Verifica Google non disponibile in questo ambiente.';
        reject(err);
      }
    })();
  });

  return {
    renderGoogleStepUpButton,
    verifying,
    error,
  };
}
