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

  return {
    plugins: [
      vue(),
      vueDevTools(),
      {
        name: 'wallt-api-csp-source',
        transformIndexHtml(html) {
          return html.replaceAll('__WALLT_API_CSP_SOURCES__', apiCspSources)
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
