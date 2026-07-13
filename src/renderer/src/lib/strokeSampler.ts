import type { Shape, Stroke } from '../types'

const SVG_NS = 'http://www.w3.org/2000/svg'

let _offSvg: SVGSVGElement | null = null
function offSvg(): SVGSVGElement {
  if (!_offSvg) {
    _offSvg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement
    _offSvg.setAttribute('width', '0')
    _offSvg.setAttribute('height', '0')
    _offSvg.style.position = 'absolute'
    _offSvg.style.left = '-9999px'
    _offSvg.style.top = '0'
    _offSvg.style.pointerEvents = 'none'
    document.body.appendChild(_offSvg)
  }
  return _offSvg
}

/** 将 d 字符串按 M/m 拆分为子路径（每个子路径为独立一笔） */
function splitSubpaths(d: string): string[] {
  const parts = d.split(/(?=[Mm])/).map((s) => s.trim()).filter(Boolean)
  return parts
}

/** 采样单个 d 字符串，返回多组点（每组 = 一条不抬笔的子路径），坐标为本地坐标系 */
export function samplePathD(d: string, step: number): { x: number; y: number }[][] {
  const result: { x: number; y: number }[][] = []
  const subpaths = splitSubpaths(d)
  const svg = offSvg()
  for (const s of subpaths) {
    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement
    path.setAttribute('d', s)
    svg.appendChild(path)
    let len = 0
    try {
      len = path.getTotalLength()
    } catch {
      path.remove()
      continue
    }
    if (len <= 0) {
      path.remove()
      continue
    }
    const pts: { x: number; y: number }[] = []
    const n = Math.max(1, Math.ceil(len / step))
    for (let i = 0; i <= n; i++) {
      const p = path.getPointAtLength((i * len) / n)
      pts.push({ x: p.x, y: p.y })
    }
    result.push(pts)
    path.remove()
  }
  return result
}

/** 采样一个形状为笔画列表（画布相对坐标） */
export function sampleShape(shape: Shape, step = 2): Stroke[] {
  const strokes: Stroke[] = []
  for (const d of shape.paths) {
    const groups = samplePathD(d, step)
    for (const pts of groups) {
      if (pts.length < 2) continue
      const canvasPts = pts.map((p) => ({
        x: shape.x + p.x * shape.scaleX,
        y: shape.y + p.y * shape.scaleY
      }))
      strokes.push({ points: canvasPts })
    }
  }
  return strokes
}

/** 采样所有形状为笔画列表 */
export function sampleAllShapes(shapes: Shape[], step = 2): Stroke[] {
  const strokes: Stroke[] = []
  for (const shape of shapes) strokes.push(...sampleShape(shape, step))
  return strokes
}
