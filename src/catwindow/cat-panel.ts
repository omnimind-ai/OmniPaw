import { createPinia } from 'pinia'
import { createApp } from 'vue'
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
  toast.error(errorToText(error, '小猫面板运行出错。'))
}

window.addEventListener('unhandledrejection', (event) => {
  panelLogger.error('Cat panel unhandled promise rejection.', { error: event.reason })
  toast.error(errorToText(event.reason, '小猫面板操作失败。'))
})

app.use(pinia).mount('#app')
