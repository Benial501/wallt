import './assets/styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth.store'
import { installAppGestures } from './utils/appGestures'
import { inizializzaSentry, inizializzaAnalytics } from './utils/monitoraggio'

// Dopo un deploy, una scheda già aperta può chiedere un chunk con hash ormai
// rimosso. Ricarica l'HTML corrente così Vite richiede i bundle del deployment
// attivo invece di lasciare la navigazione in errore.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

// Completa il blocco dello zoom dove il meta viewport non basta (Safari iOS).
installAppGestures()

const app = createApp(App)
const pinia = createPinia()

// Sentry si aggancia da se' agli errori dei componenti, ma questo handler
// esisteva gia' e continua a valere: in sviluppo e' l'unico che parla.
app.config.errorHandler = (err, instance, info) => {
  console.error('[WALLT runtime error]', err, info, instance?.$?.type?.name)
  if (import.meta.env.DEV) {
    const box = document.getElementById('wallt-runtime-error')
    if (box) {
      box.textContent = `Errore: ${err?.message || err}`
      box.hidden = false
    }
  }
}

app.use(pinia)
app.use(router)

// Prima del mount, cosi' un errore durante il primo render viene gia' visto.
// Non si attende: senza DSN non fa nulla, e con il DSN un problema di rete
// del monitoraggio non deve ritardare l'avvio dell'app.
inizializzaSentry(app, router)
inizializzaAnalytics()

app.mount('#app')

document.querySelector('.boot-splash')?.remove()

const authStore = useAuthStore()
authStore.init()
