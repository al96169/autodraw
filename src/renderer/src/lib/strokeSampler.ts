import type { Shape, Stroke } from '../types'

const SVG_NS = 'http://www.w3.org/2000/svg'

// 每条路径最大采样点数，防止超长路径卡死
const MAX_POINTS_PER_PATH = 3000
// 全局最大笔画数限制
const MAX_TOTAL_STROKES = 5000

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

/**
 * 采样单个 d 字符串，返回多组点（每组 = 一条不抬笔的子路径），坐标为本地坐标系。
 *
 * 不再拆分 d 字符串——因为相对 m 命令在拆分后会被当作绝对 M 渲染，导致子路径定位错误。
 * 改为：将完整 d 字符串创建为一个 <path>，用 getPointAtLength 采样所有点，
 * 然后通过检测点间距离的突变（moveto 跳跃）来拆分为多组。
 */
export function samplePathD(d: string, step: number): { x: number; y: number }[][] {
  const result: { x: number; y: number }[][] = []
  const svg = offSvg()

  const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement
  path.setAttribute('d', d)
  svg.appendChild(path)

  let len = 0
  try {
    len = path.getTotalLength()
  } catch {
    path.remove()
    return result
  }
  if (len <= 0) {
    path.remove()
    return result
  }

  // 限制采样点数：如果路径太长，增大步长
  let actualStep = step
  let n = Math.max(1, Math.ceil(len / actualStep))
  if (n > MAX_POINTS_PER_PATH) {
    n = MAX_POINTS_PER_PATH
    actualStep = len / n
  }

  // 采样所有点（整条路径，含所有子路径）
  const allPts: { x: number; y: number }[] = []
  for (let i = 0; i <= n; i++) {
    const p = path.getPointAtLength((i * len) / n)
    allPts.push({ x: p.x, y: p.y })
  }
  path.remove()

  if (allPts.length < 2) return result

  // 计算相邻点间的距离
  const dists: number[] = []
  for (let i = 1; i < allPts.length; i++) {
    const dx = allPts[i].x - allPts[i - 1].x
    const dy = allPts[i].y - allPts[i - 1].y
    dists.push(Math.sqrt(dx * dx + dy * dy))
  }

  // 用中位数作为基准，检测 moveto 跳跃
  // 正常情况下相邻点距离 ≈ actualStep；moveto 跳跃会远大于此
  const sortedDists = [...dists].sort((a, b) => a - b)
  const median = sortedDists[Math.floor(sortedDists.length / 2)] || actualStep
  const jumpThreshold = Math.max(median * 3, actualStep * 2, 3)

  // 按跳跃点拆分为多组
  let currentGroup: { x: number; y: number }[] = [allPts[0]]
  for (let i = 1; i < allPts.length; i++) {
    if (dists[i - 1] > jumpThreshold && currentGroup.length >= 2) {
      // 检测到 moveto 跳跃，开始新的一组
      result.push(currentGroup)
      currentGroup = [allPts[i]]
    } else {
      currentGroup.push(allPts[i])
    }
  }
  if (currentGroup.length >= 2) {
    result.push(currentGroup)
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
  for (const shape of shapes) {
    const s = sampleShape(shape, step)
    for (const stroke of s) {
      strokes.push(stroke)
      if (strokes.length >= MAX_TOTAL_STROKES) {
        console.warn(`[sampler] reached max strokes limit (${MAX_TOTAL_STROKES}), truncating`)
        return strokes
      }
    }
  }
  return strokes
}
