<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useCanvasStore } from './stores/canvas'
import Toolbar from './components/Toolbar.vue'
import CanvasStage from './components/CanvasStage.vue'
import PropertiesPanel from './components/PropertiesPanel.vue'
import ExportDialog from './components/ExportDialog.vue'

const store = useCanvasStore()

const exportOpen = ref(false)
const toast = ref<{ msg: string; type: 'info' | 'error' | 'ok' } | null>(null)
let toastTimer: number | null = null

function showToast(msg: string, type: 'info' | 'error' | 'ok' = 'info') {
  toast.value = { msg, type }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = null), 3000)
}

const regionText = computed(() => {
  if (!store.region) return '未选区'
  const r = store.region
  return `画布 ${Math.round(r.width)}×${Math.round(r.height)} @ (${Math.round(r.x)},${Math.round(r.y)})`
})

const apiAvailable = computed(() => typeof window.api !== 'undefined')
const diagInfo = computed(() => {
  return {
    api: apiAvailable.value ? 'OK' : 'MISSING',
    font: store.hasFont ? store.fontName : '未加载',
    shapes: store.shapes.length,
    region: store.region ? `${Math.round(store.region.width)}x${Math.round(store.region.height)}` : '未选区',
    fontError: store.fontError || ''
  }
})

const progressText = computed(() => {
  if (!store.executing) return ''
  return `绘制中 ${store.progress.current}/${store.progress.total}`
})

let unsub: (() => void) | null = null

async function onExecute() {
  const res = await store.execute()
  if (res.ok) showToast('绘制完成', 'ok')
  else if (res.error === 'cancelled') showToast('已取消', 'info')
  else showToast(res.error || '执行失败', 'error')
}

async function onCancel() {
  await store.cancelExecute()
  showToast('正在取消…', 'info')
}

// 绘制期间按 ESC 停止绘制
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.executing) {
    e.preventDefault()
    onCancel()
  }
}

onMounted(async () => {
  console.log('[App] onMounted, starting font init')
  await store.initDefaultFont()
  console.log('[App] font init done, hasFont:', store.hasFont, 'fontName:', store.fontName, 'fontError:', store.fontError)
  if (store.hasFont) {
    showToast(`字体已加载: ${store.fontName}`, 'ok')
  } else {
    showToast('字体加载失败，请在工具栏选择字体文件', 'error')
  }
  unsub = window.api.onExecuteProgress((p) => {
    store.progress = p
  })
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  unsub?.()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="app">
    <Toolbar @execute="onExecute" @cancel="onCancel" @export="exportOpen = true" />
    <div class="body">
      <CanvasStage class="stage" />
      <PropertiesPanel class="panel" />
    </div>
    <div class="statusbar">
      <span>{{ regionText }}</span>
      <span class="diag">API:{{ diagInfo.api }}</span>
      <span class="diag">字体:{{ diagInfo.font }}</span>
      <span class="diag">形状:{{ diagInfo.shapes }}</span>
      <span v-if="store.fontError" class="warn">{{ store.fontError }}</span>
      <span class="spacer"></span>
      <span v-if="progressText" class="accent">{{ progressText }} (ESC 停止)</span>
    </div>
    <ExportDialog v-if="exportOpen" @close="exportOpen = false" />
    <transition name="fade">
      <div v-if="toast" class="toast" :class="toast.type">{{ toast.msg }}</div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.stage {
  flex: 1;
  min-width: 0;
}
.panel {
  width: 290px;
  border-left: 1px solid var(--border);
  background: var(--panel);
  overflow-y: auto;
}
.statusbar {
  height: 26px;
  background: var(--panel-2);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-dim);
}
.statusbar .spacer { flex: 1; }
.statusbar .dim { color: var(--text-dim); }
.statusbar .diag { color: var(--text-dim); font-size: 10px; }
.statusbar .warn { color: var(--danger); }
.statusbar .accent { color: var(--accent); }
.toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 6px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  z-index: 100;
}
.toast.ok { border-color: var(--ok); color: var(--ok); }
.toast.error { border-color: var(--danger); color: var(--danger); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
