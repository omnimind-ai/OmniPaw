import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { i18n } from '@/i18n'
import { logger } from '@/utils/logger'
import { errorToText, useToast } from '@/utils/toast'
import CatPanelApp from './CatPanelApp.vue'

import '@/styles/main.css'
import 'vue-sonner/style.css'

const pinia = createPinia()
const app = createApp(CatPanelApp)
const toast = useToast()
const panelLogger = logger.child('cat.panel')

app.config.errorHandler = (error, _instance, info) => {
  panelLogger.error('Cat panel Vue runtime error.', { info, error })
  toast.error(errorToText(error, i18n.global.t('catWindow.runtime.panelError')))
}

window.addEventListener('unhandledrejection', (event) => {
  panelLogger.error('Cat panel unhandled promise rejection.', { error: event.reason })
  toast.error(errorToText(event.reason, i18n.global.t('catWindow.runtime.panelOperationFailed')))
})

app.use(pinia).use(i18n).mount('#app')
