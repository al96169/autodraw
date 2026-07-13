import { defineStore } from 'pinia'
import { reactive, ref, computed, markRaw } from 'vue'
import { parseFont, textToPath, textToSkeletonPaths } from '../lib/textToPath'
import { preloadHanzi, buildHanziTextPaths } from '../lib/hanziStrokes'
import type { Region, Stroke, ExecuteOptions } from '../../../shared/types'
import type { Shape, TextShape, SvgShape } from '../types'
import { svgToPath } from '../lib/svgToPath'
import { sampleAllShapes } from '../lib/strokeSampler'

export interface FontOption {
  file: string
  label: string
}

export const SYSTEM_FONTS: FontOption[] = [
  { file: 'simhei.ttf', label: '黑体 SimHei' },
  { file: 'simkai.ttf', label: '楷体 KaiTi' },
  { file: 'simfang.ttf', label: '仿宋 FangSong' },
  { file: 'arial.ttf', label: 'Arial' },
  { file: 'times.ttf', label: 'Times New Roman' }
]

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export const useCanvasStore = defineStore('canvas', () => {
  const region = ref<Region | null>(null)
  const shapes = ref<Shape[]>([])
  const selectedId = ref<string | null>(null)
  const font = ref<any>(null)
  const fontName = ref<string>('')
  const fontFileName = ref<string>('')
  const fontError = ref<string>('')

  const executeOptions = reactive<ExecuteOptions>({
    stepDelayMs: 3,
    strokeDelayMs: 40,
    startDelayMs: 500,
    mouseSpeed: 2000,
    moveSettleMs: 5,
    pressSettleMs: 5
  })
  const sampleStep = ref(2)

  const executing = ref(false)
  const cancelRequested = ref(false)
  const progress = ref({ current: 0, total: 0 })

  const selectedShape = computed<Shape | null>(
    () => shapes.value.find((s) => s.id === selectedId.value) || null
  )

  const hasFont = computed(() => !!font.value)

  function setRegion(r: Region | null) {
    region.value = r
  }

  async function initDefaultFont() {
    console.log('[store] initDefaultFont started')
    for (const f of SYSTEM_FONTS) {
      console.log('[store] trying font:', f.file)
      const ok = await loadSystemFont(f.file)
      console.log('[store] font', f.file, 'loaded:', ok)
      if (ok) return
    }
    fontError.value = '未找到可用系统字体，请点击"加载字体"选择 .ttf/.otf 文件'
    console.warn('[store] all system fonts failed')
  }

  async function loadSystemFont(filename: string): Promise<boolean> {
    try {
      console.log('[store] loadSystemFont:', filename)
      const res = await window.api.loadSystemFont(filename)
      console.log('[store] loadSystemFont response:', filename, res ? `buffer=${res.buffer.byteLength}B` : 'null')
      if (!res) return false
      const f = parseFont(res.buffer)
      console.log('[store] parseFont OK:', filename, 'unitsPerEm=', f.unitsPerEm, 'numGlyphs=', f.glyphs.length)
      font.value = f
      fontName.value = res.name
      fontFileName.value = filename
      fontError.value = ''
      // 重新计算所有文字形状的路径
      recomputeAllText()
      return true
    } catch (e) {
      console.error('[store] loadSystemFont failed:', filename, e)
      return false
    }
  }

  async function pickFontFile(): Promise<boolean> {
    const res = await window.api.pickFontFile()
    if (!res) return false
    try {
      const f = parseFont(res.buffer)
      font.value = f
      fontName.value = res.name
      fontFileName.value = res.name
      fontError.value = ''
      recomputeAllText()
      return true
    } catch (e) {
      fontError.value = '字体解析失败：' + (e as Error).message
      return false
    }
  }

  function recomputeAllText() {
    if (!font.value) return
    for (const s of shapes.value) {
      if (s.type === 'text') recomputeText(s)
    }
  }

  function recomputeText(s: TextShape) {
    if (!font.value) return
    const mode = s.textMode || 'outline'
    if (mode === 'skeleton') {
      // 骨架模式：先尝试 hanzi 笔画数据，若未缓存则回退到像素骨架
      const hanziResult = buildHanziTextPaths(s.text, font.value, s.fontSize, s.letterSpacing, s.lineHeight)
      if (hanziResult.paths.length > 0) {
        s.paths = markRaw(hanziResult.paths)
        s.localWidth = hanziResult.width
        s.localHeight = hanziResult.height
        return
      }
      // hanzi 数据未加载，回退到像素骨架，并异步预加载
      const r = textToSkeletonPaths(s.text, font.value, s.fontSize, s.letterSpacing, s.lineHeight)
      s.paths = markRaw(r.paths)
      s.localWidth = r.width
      s.localHeight = r.height
      // 异步预加载 hanzi 数据，加载完成后重新计算
      preloadHanzi(s.text).then(() => {
        const hr = buildHanziTextPaths(s.text, font.value, s.fontSize, s.letterSpacing, s.lineHeight)
        if (hr.paths.length > 0) {
          s.paths = markRaw(hr.paths)
          s.localWidth = hr.width
          s.localHeight = hr.height
          console.log('[store] hanzi data loaded, recomputed skeleton for:', s.text)
        }
      })
    } else {
      const r = textToPath(s.text, font.value, s.fontSize, s.letterSpacing, s.lineHeight)
      s.paths = markRaw(r.paths)
      s.localWidth = r.width
      s.localHeight = r.height
    }
  }

  function addText(text = '文字') {
    console.log('[store] addText called, hasFont:', !!font.value, 'text:', text)
    if (!font.value) {
      fontError.value = '请先加载字体'
      console.warn('[store] addText: no font loaded')
      return null
    }
    try {
      const fontSize = 64
      const r = textToPath(text, font.value, fontSize, 0, 1.25)
      console.log('[store] textToPath result:', r.paths.length, 'paths, size:', r.width, 'x', r.height)
      const cw = region.value?.width || 800
      const ch = region.value?.height || 600
      const shape: TextShape = reactive({
        id: uid(),
        type: 'text',
        x: Math.max(0, (cw - r.width) / 2),
        y: Math.max(0, (ch - r.height) / 2),
        scaleX: 1,
        scaleY: 1,
        paths: markRaw(r.paths),
        localWidth: r.width,
        localHeight: r.height,
        name: '文字',
        text,
        fontSize,
        fontFamily: fontName.value,
        letterSpacing: 0,
        lineHeight: 1.25,
        textMode: 'outline'
      }) as TextShape
      shapes.value.push(shape)
      selectedId.value = shape.id
      console.log('[store] addText done, shape id:', shape.id, 'total shapes:', shapes.value.length)
      return shape
    } catch (e) {
      console.error('[store] addText error:', e)
      return null
    }
  }

  function addSvgFromText(svgText: string, name = 'SVG') {
    console.log('[store] addSvgFromText:', name, 'text length:', svgText.length)
    try {
      const r = svgToPath(svgText)
      console.log('[store] svgToPath result:', r.paths.length, 'paths, size:', r.width, 'x', r.height)
      const cw = region.value?.width || 800
      const ch = region.value?.height || 600
      const fitScale = Math.min((cw * 0.4) / r.width, (ch * 0.4) / r.height, 1)
      const shape: SvgShape = reactive({
        id: uid(),
        type: 'svg',
        x: (cw - r.width * fitScale) / 2,
        y: (ch - r.height * fitScale) / 2,
        scaleX: fitScale,
        scaleY: fitScale,
        paths: markRaw(r.paths),
        localWidth: r.width,
        localHeight: r.height,
        name,
        source: svgText
      }) as SvgShape
      shapes.value.push(shape)
      selectedId.value = shape.id
      console.log('[store] addSvgFromText done, shape id:', shape.id, 'total shapes:', shapes.value.length)
      return shape
    } catch (e) {
      console.error('[store] addSvgFromText error:', e)
      return null
    }
  }

  async function addSvgFromFile(file: File) {
    console.log('[store] addSvgFromFile:', file.name, 'size:', file.size)
    try {
      const text = await file.text()
      return addSvgFromText(text, file.name)
    } catch (e) {
      console.error('[store] addSvgFromFile error:', e)
      return null
    }
  }

  function updateShape(id: string, patch: Partial<Shape>) {
    const s = shapes.value.find((x) => x.id === id)
    if (!s) return
    Object.assign(s, patch)
    if (s.type === 'text' && (patch.text || patch.fontSize || patch.letterSpacing || patch.lineHeight || patch.textMode)) {
      recomputeText(s)
    }
  }

  function removeShape(id: string) {
    const idx = shapes.value.findIndex((x) => x.id === id)
    if (idx >= 0) shapes.value.splice(idx, 1)
    if (selectedId.value === id) selectedId.value = null
  }

  function selectShape(id: string | null) {
    selectedId.value = id
  }

  function clearShapes() {
    shapes.value = []
    selectedId.value = null
  }

  function addTestShape() {
    console.log('[store] addTestShape called, region:', region.value ? `${region.value.width}x${region.value.height}` : 'null')
    const cw = region.value?.width || 800
    const ch = region.value?.height || 600
    const shape: SvgShape = reactive({
      id: uid(),
      type: 'svg',
      x: cw * 0.2,
      y: ch * 0.2,
      scaleX: 1,
      scaleY: 1,
      paths: [
        `M 0 0 L ${cw * 0.6} 0 L ${cw * 0.6} ${ch * 0.6} L 0 ${ch * 0.6} Z`,
        `M ${cw * 0.1} ${ch * 0.1} L ${cw * 0.5} ${ch * 0.5}`,
        `M ${cw * 0.5} ${ch * 0.1} L ${cw * 0.1} ${ch * 0.5}`
      ],
      localWidth: cw * 0.6,
      localHeight: ch * 0.6,
      name: '测试形状',
      source: ''
    }) as SvgShape
    shapes.value.push(shape)
    selectedId.value = shape.id
    console.log('[store] addTestShape done, shape id:', shape.id, 'total shapes:', shapes.value.length)
    return shape
  }

  function computeStrokes(): Stroke[] {
    return sampleAllShapes(shapes.value, sampleStep.value)
  }

  async function selectRegion() {
    const r = await window.api.selectRegion()
    if (r) {
      region.value = r
    }
    return r
  }

  async function execute(): Promise<{ ok: boolean; error?: string }> {
    if (!region.value) return { ok: false, error: '请先框选画布区域' }
    if (shapes.value.length === 0) return { ok: false, error: '画布为空' }
    const strokes = computeStrokes()
    if (strokes.length === 0) return { ok: false, error: '无可绘制路径' }
    executing.value = true
    cancelRequested.value = false
    progress.value = { current: 0, total: strokes.length }
    try {
      // 将 reactive 对象转为纯对象，避免 IPC 结构化克隆失败
      const plainStrokes = JSON.parse(JSON.stringify(strokes))
      const plainRegion = JSON.parse(JSON.stringify(region.value))
      const plainOptions = JSON.parse(JSON.stringify(executeOptions))
      const res = await window.api.executeStrokes(plainStrokes, plainRegion, plainOptions)
      return res
    } finally {
      executing.value = false
    }
  }

  async function cancelExecute() {
    cancelRequested.value = true
    await window.api.cancelExecute()
  }

  return {
    region,
    shapes,
    selectedId,
    selectedShape,
    font,
    fontName,
    fontFileName,
    fontError,
    hasFont,
    executeOptions,
    sampleStep,
    executing,
    cancelRequested,
    progress,
    setRegion,
    initDefaultFont,
    loadSystemFont,
    pickFontFile,
    addText,
    addSvgFromText,
    addSvgFromFile,
    updateShape,
    removeShape,
    selectShape,
    clearShapes,
    addTestShape,
    computeStrokes,
    selectRegion,
    execute,
    cancelExecute
  }
})
