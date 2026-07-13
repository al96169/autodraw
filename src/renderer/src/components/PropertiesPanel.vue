<script setup lang="ts">
import { useCanvasStore, SYSTEM_FONTS } from '../stores/canvas'
import type { TextShape, SvgShape } from '../types'

const store = useCanvasStore()

function num(e: Event): number {
  const v = parseFloat((e.target as HTMLInputElement).value)
  return isNaN(v) ? 0 : v
}

function updateText(field: keyof TextShape, e: Event) {
  const s = store.selectedShape as TextShape | null
  if (!s) return
  const val = field === 'text' ? (e.target as HTMLTextAreaElement).value : num(e)
  store.updateShape(s.id, { [field]: val } as Partial<TextShape>)
}

function updateTextMode(e: Event) {
  const s = store.selectedShape as TextShape | null
  if (!s) return
  const val = (e.target as HTMLSelectElement).value as 'outline' | 'skeleton'
  store.updateShape(s.id, { textMode: val } as Partial<TextShape>)
}

function updateCommon(field: 'x' | 'y' | 'scaleX' | 'scaleY', e: Event) {
  const s = store.selectedShape
  if (!s) return
  store.updateShape(s.id, { [field]: num(e) } as any)
}

function resetScale() {
  const s = store.selectedShape as SvgShape | null
  if (!s) return
  store.updateShape(s.id, { scaleX: 1, scaleY: 1 } as any)
}
</script>

<template>
  <div class="props">
    <!-- 形状属性 -->
    <section v-if="store.selectedShape">
      <div class="title">
        {{ store.selectedShape.type === 'text' ? '文字属性' : 'SVG 属性' }}
        <button class="danger mini" @click="store.removeShape(store.selectedId!)">删除</button>
      </div>

      <div class="row">
        <label>X</label>
        <input type="number" :value="Math.round(store.selectedShape.x)" @change="updateCommon('x', $event)" />
        <label>Y</label>
        <input type="number" :value="Math.round(store.selectedShape.y)" @change="updateCommon('y', $event)" />
      </div>
      <div class="row">
        <label>缩放X</label>
        <input type="number" step="0.1" :value="store.selectedShape.scaleX.toFixed(2)" @change="updateCommon('scaleX', $event)" />
        <label>缩放Y</label>
        <input type="number" step="0.1" :value="store.selectedShape.scaleY.toFixed(2)" @change="updateCommon('scaleY', $event)" />
      </div>

      <template v-if="store.selectedShape.type === 'text'">
        <div class="col">
          <label>文字内容</label>
          <textarea rows="3" :value="store.selectedShape.text" @input="updateText('text', $event)"></textarea>
        </div>
        <div class="row">
          <label>字号</label>
          <input type="number" :value="store.selectedShape.fontSize" @change="updateText('fontSize', $event)" />
          <label>字距</label>
          <input type="number" :value="store.selectedShape.letterSpacing" @change="updateText('letterSpacing', $event)" />
        </div>
        <div class="row">
          <label>行距</label>
          <input type="number" step="0.05" :value="store.selectedShape.lineHeight" @change="updateText('lineHeight', $event)" />
        </div>
        <div class="row">
          <label>字体</label>
          <select :value="store.fontFileName" @change="($e) => { const v = ($e.target as HTMLSelectElement).value; if (v === '__pick__') store.pickFontFile(); else store.loadSystemFont(v) }">
            <option value="" disabled>选择字体…</option>
            <option v-for="f in SYSTEM_FONTS" :key="f.file" :value="f.file">{{ f.label }}</option>
            <option value="__pick__">… 加载字体文件</option>
          </select>
        </div>
        <div class="row">
          <label>模式</label>
          <select :value="store.selectedShape.textMode" @change="updateTextMode">
            <option value="outline">空心描边</option>
            <option value="skeleton">笔画骨架</option>
          </select>
        </div>
      </template>

      <template v-else>
        <div class="row">
          <label>名称</label>
          <input :value="store.selectedShape.name" disabled />
        </div>
        <button class="mini" @click="resetScale">还原缩放 (1:1)</button>
      </template>
    </section>

    <section v-else>
      <div class="title">提示</div>
      <p class="tip">点击形状可选中并编辑；拖动可移动，拖动右下角手柄可缩放；按 Delete 删除。SVG 文件可直接拖入画布。</p>
    </section>

    <!-- 绘制设置 -->
    <section>
      <div class="title">绘制设置</div>
      <div class="row">
        <label>起步延时(ms)</label>
        <input type="number" v-model.number="store.executeOptions.startDelayMs" />
      </div>
      <div class="row">
        <label>步进延时(ms)</label>
        <input type="number" v-model.number="store.executeOptions.stepDelayMs" />
      </div>
      <div class="row">
        <label>抬笔延时(ms)</label>
        <input type="number" v-model.number="store.executeOptions.strokeDelayMs" />
      </div>
      <div class="row">
        <label>鼠标速度(px/s)</label>
        <input type="number" v-model.number="store.executeOptions.mouseSpeed" />
      </div>
      <div class="row">
        <label>采样步长(px)</label>
        <input type="number" v-model.number="store.sampleStep" />
      </div>
      <p class="tip">步进延时越大绘制越慢但越稳；采样步长越小路径越精细。</p>
    </section>
  </div>
</template>

<style scoped>
.props {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
section {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
}
.title {
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.row label { width: 64px; font-size: 11px; }
.row input, .row select { flex: 1; width: 0; }
.col { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.col label { font-size: 11px; }
textarea { resize: vertical; width: 100%; }
.tip { font-size: 11px; color: var(--text-dim); line-height: 1.5; margin: 4px 0 0; }
.mini { padding: 3px 8px; font-size: 11px; }
</style>
