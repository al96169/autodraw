<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCanvasStore } from '../stores/canvas'
import { generateScript, defaultFileName } from '../lib/scriptExport'
import type { ExportFormat } from '../../../shared/types'

const store = useCanvasStore()
const emit = defineEmits<{ (e: 'close'): void }>()

const format = ref<ExportFormat>('anjian')
const scaleFactor = ref(1)
const savedPath = ref<string | null>(null)
const copied = ref(false)

onMounted(async () => {
  const info = await window.api.getScreenInfo()
  scaleFactor.value = info.scaleFactor
})

const formats: { value: ExportFormat; label: string; desc: string }[] = [
  { value: 'anjian', label: '按键精灵', desc: 'MoveTo / LeftDown / LeftUp' },
  { value: 'ahk', label: 'AutoHotkey', desc: 'MouseMove / Click (v1)' },
  { value: 'python', label: 'Python (pyautogui)', desc: 'moveTo / mouseDown / mouseUp' }
]

const scriptContent = computed(() => {
  if (!store.region) return '// 请先框选画布区域'
  const strokes = store.computeStrokes()
  return generateScript(format.value, {
    strokes,
    region: store.region,
    scaleFactor: scaleFactor.value,
    options: { ...store.executeOptions }
  })
})

async function onSave() {
  const path = await window.api.saveScript(scriptContent.value, defaultFileName(format.value))
  if (path) {
    savedPath.value = path
  }
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(scriptContent.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <div class="header">
        <span>导出绘画脚本</span>
        <button class="mini" @click="emit('close')">关闭</button>
      </div>

      <div class="fmts">
        <label v-for="f in formats" :key="f.value" class="fmt" :class="{ active: format === f.value }">
          <input type="radio" :value="f.value" v-model="format" />
          <span class="fmt-name">{{ f.label }}</span>
          <span class="fmt-desc">{{ f.desc }}</span>
        </label>
      </div>

      <div class="info">
        笔画数: {{ store.computeStrokes().length }} ｜ 屏幕缩放: {{ scaleFactor }} ｜ 坐标已转为屏幕物理像素
      </div>

      <textarea class="preview" :value="scriptContent" readonly></textarea>

      <div class="actions">
        <span v-if="savedPath" class="saved">已保存: {{ savedPath }}</span>
        <span v-if="copied" class="saved">已复制到剪贴板</span>
        <span class="spacer"></span>
        <button @click="onCopy">复制</button>
        <button class="primary" @click="onSave">保存为文件…</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.dialog {
  width: 720px;
  max-width: 92vw;
  height: 560px;
  max-height: 88vh;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  color: var(--accent);
}
.fmts {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
}
.fmt {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fmt.active { border-color: var(--accent); background: rgba(79, 195, 247, 0.1); }
.fmt input { display: none; }
.fmt-name { font-size: 13px; color: var(--text); }
.fmt-desc { font-size: 11px; color: var(--text-dim); }
.info {
  padding: 0 14px 8px;
  font-size: 11px;
  color: var(--text-dim);
}
.preview {
  flex: 1;
  margin: 0 14px;
  resize: none;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  white-space: pre;
  overflow: auto;
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
}
.spacer { flex: 1; }
.saved { font-size: 11px; color: var(--ok); }
.mini { padding: 3px 8px; font-size: 11px; }
</style>
