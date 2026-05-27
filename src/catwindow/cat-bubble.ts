import { createApp } from 'vue'
import { logger } from '@/utils/logger'
import CatBubbleApp from './CatBubbleApp.vue'

import '@/styles/main.css'

const app = createApp(CatBubbleApp)
const bubbleLogger = logger.child('cat.bubble')

app.config.errorHandler = (error, _instance, info) => {
  bubbleLogger.error('Cat bubble Vue runtime error.', { info, error })
}

window.addEventListener('unhandledrejection', (event) => {
  bubbleLogger.error('Cat bubble unhandled promise rejection.', { error: event.reason })
})

app.mount('#app')
