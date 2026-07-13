<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useCanvasStore } from '../stores/canvas'
import type { Shape } from '../types'

const store = useCanvasStore()
const svgRef = ref<SVGSVGElement | null>(null)

type DragState =
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
  | { mode: 'resize'; id: string; sx: number; sy: number; ox: number; oy: number; oScaleX: number; oScaleY: number; lw: number; lh: number }
  | null

const drag = ref<DragState>(null)

const viewBox = computed(() => {
  const r = store.region
  if (!r) return '0 0 800 600'
  return `0 0 ${r.width} ${r.height}`
})

const canvasWidth = computed(() => store.region?.width || 800)
const canvasHeight = computed(() => store.region?.height || 600)

function clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const svg = svgRef.value
  if (!svg) return { x: 0, y: 0 }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function onShapeDown(e: MouseEvent, shape: Shape) {
  e.stopPropagation()
  store.selectShape(shape.id)
  const p = clientToCanvas(e.clientX, e.clientY)
  drag.value = { mode: 'move', id: shape.id, sx: p.x, sy: p.y, ox: shape.x, oy: shape.y }
}

function onHandleDown(e: MouseEvent, shape: Shape) {
  e.stopPropagation()
  e.preventDefault()
  const p = clientToCanvas(e.clientX, e.clientY)
  drag.value = {
    mode: 'resize',
    id: shape.id,
    sx: p.x,
    sy: p.y,
    ox: shape.x,
    oy: shape.y,
    oScaleX: shape.scaleX,
    oScaleY: shape.scaleY,
    lw: shape.localWidth,
    lh: shape.localHeight
  }
}

function onWindowMove(e: MouseEvent) {
  if (!drag.value) return
  const p = clientToCanvas(e.clientX, e.clientY)
  const d = drag.value
  if (d.mode === 'move') {
    const nx = d.ox + (p.x - d.sx)
    const ny = d.oy + (p.y - d.sy)
    store.updateShape(d.id, { x: nx, y: ny } as Partial<Shape>)
  } else {
    if (d.lw <= 0 || d.lh <= 0) return
    const nsx = Math.max(0.05, (d.oScaleX * d.lw + (p.x - d.sx)) / d.lw)
    const nsy = Math.max(0.05, (d.oScaleY * d.lh + (p.y - d.sy)) / d.lh)
    store.updateShape(d.id, { scaleX: nsx, scaleY: nsy } as Partial<Shape>)
  }
}

function onWindowUp() {
  drag.value = null
}

function onBackgroundDown() {
  store.selectShape(null)
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    store.removeShape(store.selectedId)
  }
}

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
}

async function onDrop(e: DragEvent) {
  console.log('[CanvasStage] onDrop triggered')
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) {
    console.log('[CanvasStage] onDrop: no files')
    return
  }
  e.preventDefault()
  console.log('[CanvasStage] onDrop files:', files.length, Array.from(files).map(f => f.name))
  for (const f of Array.from(files)) {
    if (!f.name.toLowerCase().endsWith('.svg')) {
      console.log('[CanvasStage] skipping non-svg file:', f.name)
      continue
    }
    const result = await store.addSvgFromFile(f)
    console.log('[CanvasStage] addSvgFromFile result:', result ? 'success' : 'null')
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onWindowMove)
  window.addEventListener('mouseup', onWindowUp)
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMove)
  window.removeEventListener('mouseup', onWindowUp)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="stage-wrap" @dragover="onDragOver" @drop="onDrop">
    <!-- 未选区提示条 -->
    <div v-if="!store.region" class="no-region-banner">
      ⚠ 尚未框选画布区域 — 点击左上角「框选画布区域」按钮选择桌面绘画区域。当前为预览模式（800×600）。
    </div>

    <div class="canvas-center">
      <svg
        ref="svgRef"
        class="canvas-svg"
        :class="{ 'no-region': !store.region }"
        :viewBox="viewBox"
        preserveAspectRatio="xMidYMid meet"
        @mousedown="onBackgroundDown"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2a2a2a" stroke-width="1" />
          </pattern>
        </defs>
        <rect :x="0" :y="0" :width="canvasWidth" :height="canvasHeight" fill="#1a1a1a" />
        <rect :x="0" :y="0" :width="canvasWidth" :height="canvasHeight" fill="url(#grid)" />

        <g
          v-for="s in store.shapes"
          :key="s.id"
          :transform="`translate(${s.x},${s.y}) scale(${s.scaleX},${s.scaleY})`"
          class="shape"
          :class="{ selected: s.id === store.selectedId }"
          @mousedown="onShapeDown($event, s)"
        >
          <path v-for="(d, i) in s.paths" :key="i" :d="d" class="shape-path" />
        </g>

        <!-- 选择框 -->
        <template v-if="store.selectedShape">
          <rect
            :x="store.selectedShape.x"
            :y="store.selectedShape.y"
            :width="store.selectedShape.localWidth * store.selectedShape.scaleX"
            :height="store.selectedShape.localHeight * store.selectedShape.scaleY"
            class="sel-rect"
          />
          <rect
            :x="store.selectedShape.x + store.selectedShape.localWidth * store.selectedShape.scaleX - 6"
            :y="store.selectedShape.y + store.selectedShape.localHeight * store.selectedShape.scaleY - 6"
            width="12"
            height="12"
            class="sel-handle"
            @mousedown="onHandleDown($event, store.selectedShape!)"
          />
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.stage-wrap {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: #161616;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.no-region-banner {
  background: #4a3a10;
  border-bottom: 1px solid #8a7020;
  color: #ffd060;
  padding: 6px 12px;
  font-size: 12px;
  text-align: center;
  flex-shrink: 0;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-card {
  text-align: center;
  color: var(--text-dim);
}
.empty-title {
  font-size: 18px;
  color: var(--text);
  margin-bottom: 8px;
}
.empty-card p {
  margin: 0 0 16px;
}
.canvas-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  min-height: 0;
}
.canvas-svg {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  background: transparent;
  border: 1px solid var(--border);
}
.canvas-svg.no-region {
  border: 2px dashed #8a7020;
}
.shape {
  cursor: move;
}
.shape-path {
  fill: none;
  stroke: #e0e0e0;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.shape.selected .shape-path {
  stroke: var(--accent);
}
.sel-rect {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}
.sel-handle {
  fill: var(--accent);
  stroke: #fff;
  stroke-width: 1;
  cursor: nwse-resize;
}
</style>
