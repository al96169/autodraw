<script setup lang="ts">
import { ref } from 'vue'
import { useCanvasStore, SYSTEM_FONTS } from '../stores/canvas'

const store = useCanvasStore()
const localMsg = ref('')
const emit = defineEmits<{
  (e: 'execute'): void
  (e: 'cancel'): void
  (e: 'export'): void
}>()

async function onSelectRegion() {
  try {
    console.log('[Toolbar] selectRegion clicked')
    const r = await store.selectRegion()
    console.log('[Toolbar] selectRegion result:', r)
    if (!r) return
  } catch (e) {
    console.error('[Toolbar] selectRegion error:', e)
    localMsg.value = '框选区域失败: ' + (e as Error).message
    setTimeout(() => (localMsg.value = ''), 3000)
  }
}

function onAddText() {
  console.log('[Toolbar] onAddText clicked, hasFont:', store.hasFont, 'fontError:', store.fontError)
  if (!store.hasFont) {
    console.warn('[Toolbar] no font loaded, fontError:', store.fontError)
    localMsg.value = '字体未加载，请在左侧下拉框选择字体'
    setTimeout(() => (localMsg.value = ''), 3000)
    return
  }
  const shape = store.addText('AutoDraw')
  if (shape) {
    console.log('[Toolbar] text added successfully')
    localMsg.value = '文字已添加'
  } else {
    console.error('[Toolbar] addText returned null')
    localMsg.value = '添加文字失败，请查看控制台'
  }
  setTimeout(() => (localMsg.value = ''), 3000)
}

function onTestShape() {
  console.log('[Toolbar] onTestShape clicked')
  const shape = store.addTestShape()
  if (shape) {
    localMsg.value = '测试形状已添加'
  } else {
    localMsg.value = '添加测试形状失败'
  }
  setTimeout(() => (localMsg.value = ''), 3000)
}

function onExecute() {
  if (!store.region) {
    localMsg.value = '请先框选画布区域'
    setTimeout(() => (localMsg.value = ''), 3000)
    return
  }
  if (store.shapes.length === 0) {
    localMsg.value = '请先添加文字或形状'
    setTimeout(() => (localMsg.value = ''), 3000)
    return
  }
  emit('execute')
}

function onExport() {
  if (!store.region) {
    localMsg.value = '请先框选画布区域'
    setTimeout(() => (localMsg.value = ''), 3000)
    return
  }
  if (store.shapes.length === 0) {
    localMsg.value = '请先添加文字或形状'
    setTimeout(() => (localMsg.value = ''), 3000)
    return
  }
  emit('export')
}

function onClear() {
  if (store.shapes.length && confirm('确定清空画布？')) store.clearShapes()
}

async function onFontChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v === '__pick__') {
    await store.pickFontFile()
  } else {
    await store.loadSystemFont(v)
  }
}
</script>

<template>
  <div class="toolbar">
    <div class="group">
      <button class="primary" @click="onSelectRegion">框选画布区域</button>
      <span class="hint">拖拽框选桌面区域作为画布</span>
    </div>

    <div class="group">
      <label>字体</label>
      <select :value="store.fontFileName || ''" @change="onFontChange" title="选择字体">
        <option value="" disabled>选择字体…</option>
        <option v-for="f in SYSTEM_FONTS" :key="f.file" :value="f.file">{{ f.label }}</option>
        <option value="__pick__">… 加载字体文件</option>
      </select>
      <button @click="onAddText">添加文字</button>
      <button @click="onTestShape" class="btn-test">测试形状</button>
    </div>

    <div class="group">
      <span class="hint">SVG 文件可直接拖入画布</span>
    </div>

    <div class="spacer"></div>

    <span v-if="localMsg" class="local-msg">{{ localMsg }}</span>

    <div class="group">
      <button class="danger" @click="onClear" :disabled="store.shapes.length === 0">清空</button>
      <button @click="onExport" :disabled="store.shapes.length === 0 || !store.region">导出脚本</button>
      <button v-if="!store.executing" class="primary" @click="onExecute">▶ 执行绘制</button>
      <button v-else class="danger" @click="emit('cancel')">■ 停止</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.spacer { flex: 1; }
.hint { color: var(--text-dim); font-size: 11px; }
label { font-size: 11px; color: var(--text-dim); }
.local-msg { font-size: 11px; color: var(--accent); }
.btn-test { background: #2a4a2a; }
</style>
