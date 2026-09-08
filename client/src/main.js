import './assets/styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth.store'
import { installAppGestures } from './utils/appGestures'

// Completa il blocco dello zoom dove il meta viewport non basta (Safari iOS).
installAppGestures()

const app = createApp(App)
const pinia = createPinia()

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

app.mount('#app')

document.querySelector('.boot-splash')?.remove()

const authStore = useAuthStore()
authStore.init()
