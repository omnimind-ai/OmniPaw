import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { logger } from './utils/logger'
import { errorToText, useToast } from './utils/toast'
import './styles/main.css'
import 'vue-sonner/style.css'

const pinia = createPinia()
const app = createApp(App)
const toast = useToast()

const appLogger = logger.child('app')

app.config.errorHandler = (error, _instance, info) => {
  appLogger.error('Vue runtime error.', { info, error })
  toast.error(errorToText(error, '应用运行出错。'))
}

window.addEventListener('unhandledrejection', (event) => {
  appLogger.error('Renderer unhandled promise rejection.', { error: event.reason })
  toast.error(errorToText(event.reason, '操作失败。'))
})

app.use(pinia).use(i18n).use(router).mount('#app')
