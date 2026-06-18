import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { i18n } from '@/i18n'
import { logger } from '@/utils/logger'
import CatBubbleApp from './CatBubbleApp.vue'

import '@/styles/main.css'

const pinia = createPinia()
const app = createApp(CatBubbleApp)
const bubbleLogger = logger.child('cat.bubble')

app.config.errorHandler = (error, _instance, info) => {
  bubbleLogger.error('Cat bubble Vue runtime error.', { info, error })
}

window.addEventListener('unhandledrejection', (event) => {
  bubbleLogger.error('Cat bubble unhandled promise rejection.', { error: event.reason })
})

app.use(pinia).use(i18n).mount('#app')
