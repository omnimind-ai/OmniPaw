import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { setupI18n } from './i18n/composables'
import { useCustomizerStore } from './stores/customizer'
import vuetify from './plugins/vuetify'
import { router } from './router'
import './styles/main.css'

setupI18n().finally(() => {
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia).use(router).use(vuetify).mount('#app')

  const customizer = useCustomizerStore(pinia)
  vuetify.theme.global.name.value = customizer.uiTheme
})
