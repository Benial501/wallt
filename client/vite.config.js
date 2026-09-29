import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { normalizeApiUrl } from './src/config/normalizeApiUrl.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = normalizeApiUrl(env.VITE_API_URL, { isProduction: mode === 'production' })
  const apiCspSources = `${apiUrl} ${apiUrl}/`

  // Sentry invia i report al proprio host di ingest: senza questa source la
  // CSP li blocca in silenzio e il monitoraggio sembra solo "non arrivare
  // mai". L'origin si ricava dal DSN invece di essere scritto a mano, cosi'
  // cambiare progetto Sentry non richiede di ricordarsi anche di questa riga.
  const sentryCspSource = (() => {
    const dsn = env.VITE_SENTRY_DSN?.trim()
    if (!dsn) return ''
    try {
      return ` ${new URL(dsn).origin}`
    } catch {
      throw new Error('VITE_SENTRY_DSN non e\' un URL valido.')
    }
  })()

  return {
    plugins: [
      vue(),
      vueDevTools(),
      {
        name: 'wallt-api-csp-source',
        transformIndexHtml(html) {
          return html.replaceAll('__WALLT_API_CSP_SOURCES__', apiCspSources + sentryCspSource)
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
