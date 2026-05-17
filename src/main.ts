import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { errorToText, useToast } from './utils/toast'
import './styles/main.css'
import 'vue-sonner/style.css'

const pinia = createPinia()
const app = createApp(App)
const toast = useToast()

app.config.errorHandler = (error) => {
  toast.error(errorToText(error, '应用运行出错。'))
}

window.addEventListener('unhandledrejection', (event) => {
  toast.error(errorToText(event.reason, '操作失败。'))
})

app.use(pinia).use(router).mount('#app')
