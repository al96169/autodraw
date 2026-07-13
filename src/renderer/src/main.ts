import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles.css'

const app = createApp(App)

// 全局错误捕获，防止事件处理器中的异常被静默吞掉
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue ErrorHandler]', info, err)
}

app.use(createPinia()).mount('#app')
