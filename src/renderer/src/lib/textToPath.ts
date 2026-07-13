import { parse } from 'opentype.js'

export interface TextPathResult {
  paths: string[]
  width: number
  height: number
}

/**
 * 将 opentype.js Path 的 commands 直接序列化为 SVG path data。
 * 不使用 toPathData()，因为它会做额外的 Y 轴反射导致文字颠倒。
 * commands 中的坐标已经是 Y-down（SVG 兼容）的，只需平移归一化。
 */
function commandsToPathData(p: any, dx: number, dy: number): string {
  const cmds = p.commands
  const parts: string[] = []
  for (const c of cmds) {
    if (c.type === 'M') {
      parts.push(`M${(c.x + dx).toFixed(2)} ${(c.y + dy).toFixed(2)}`)
    } else if (c.type === 'L') {
      parts.push(`L${(c.x + dx).toFixed(2)} ${(c.y + dy).toFixed(2)}`)
    } else if (c.type === 'C') {
      parts.push(`C${(c.x1 + dx).toFixed(2)} ${(c.y1 + dy).toFixed(2)} ${(c.x2 + dx).toFixed(2)} ${(c.y2 + dy).toFixed(2)} ${(c.x + dx).toFixed(2)} ${(c.y + dy).toFixed(2)}`)
    } else if (c.type === 'Q') {
      parts.push(`Q${(c.x1 + dx).toFixed(2)} ${(c.y1 + dy).toFixed(2)} ${(c.x + dx).toFixed(2)} ${(c.y + dy).toFixed(2)}`)
    } else if (c.type === 'Z') {
      parts.push('Z')
    }
  }
  return parts.join('')
}

/**
 * 将文字转为字形轮廓路径（空心字）。
 * 坐标系已归一化：路径包围盒左上角对齐到 (0,0)。
 * opentype.js getPath 返回的 commands 已是 Y-down 坐标，直接平移即可。
 */
export function textToPath(
  text: string,
  font: any,
  fontSize: number,
  letterSpacing = 0,
  lineHeight = 1.25
): TextPathResult {
  if (!text) return { paths: [], width: 0, height: 0 }
  const scale = fontSize / font.unitsPerEm
  const lineH = fontSize * lineHeight
  const collected: any[] = []
  let x = 0
  let y = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    x = 0
    for (const ch of line) {
      const glyph = font.charToGlyph(ch)
      const gp = glyph.getPath(x, y, fontSize)
      collected.push(gp)
      const bb = gp.getBoundingBox()
      if (isFinite(bb.x1)) {
        minX = Math.min(minX, bb.x1)
        minY = Math.min(minY, bb.y1)
        maxX = Math.max(maxX, bb.x2)
        maxY = Math.max(maxY, bb.y2)
      }
      x += glyph.advanceWidth * scale + letterSpacing
    }
    y += lineH
  }

  if (!isFinite(minX)) {
    return { paths: [], width: x || fontSize, height: lineH }
  }

  // 平移使包围盒左上角对齐到 (0,0)
  // commands 已是 Y-down，minY 是最上方（最负的 Y），maxY 是最下方
  const dx = -minX
  const dy = -minY
  const dStrings = collected.map((p) => commandsToPathData(p, dx, dy))

  return {
    paths: dStrings,
    width: maxX - minX,
    height: maxY - minY
  }
}

// ========== 非空心字（笔画骨架化）==========

export function textToSkeletonPaths(
  text: string,
  font: any,
  fontSize: number,
  letterSpacing = 0,
  lineHeight = 1.25
): TextPathResult {
  if (!text) return { paths: [], width: 0, height: 0 }

  const outlineResult = textToPath(text, font, fontSize, letterSpacing, lineHeight)
  const SUPER = 3 // 超采样倍数，越高骨架越平滑
  const padding = 4 * SUPER
  const w = (Math.ceil(outlineResult.width) + 4 * 2) * SUPER
  const h = (Math.ceil(outlineResult.height) + 4 * 2) * SUPER
  if (w <= 0 || h <= 0) return { paths: [], width: 0, height: 0 }

  // 1. 用 opentype.js 的 font.draw 渲染填充文字到 Canvas（超采样分辨率）
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.clearRect(0, 0, w, h)
  font.draw(ctx, text, padding, padding + fontSize * SUPER * 0.8, fontSize * SUPER, { letterSpacing, lineHeight })

  // 2. 提取像素二值化
  const imgData = ctx.getImageData(0, 0, w, h)
  const binary: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    binary[i] = imgData.data[i * 4 + 3] > 128 ? 1 : 0
  }

  // 3. Zhang-Suen 细化
  const skeleton = zhangSuenThin(binary, w, h)

  // 4. 追踪骨架为路径（在高分辨率空间）
  const rawPaths = traceSkeleton(skeleton, w, h, padding)

  // 5. 将路径从超采样空间缩放回原始空间
  const scaledPaths = rawPaths.map((d) => {
    const pts = parsePathPoints(d)
    return pts.map((p) => [p[0] / SUPER, p[1] / SUPER] as [number, number])
  })

  // 6. 合并短碎片、简化路径、平滑
  const mergedPaths = mergeSimplifySmooth(scaledPaths)

  return {
    paths: mergedPaths,
    width: outlineResult.width,
    height: outlineResult.height
  }
}

/** 从 SVG path data 字符串中解析出点列表 */
function parsePathPoints(d: string): [number, number][] {
  const pts: [number, number][] = []
  const matches = d.match(/[ML]\s*([\d.-]+)\s+([\d.-]+)/g)
  if (matches) {
    for (const m of matches) {
      const parts = m.match(/([\d.-]+)\s+([\d.-]+)/)!
      pts.push([parseFloat(parts[1]), parseFloat(parts[2])])
    }
  }
  return pts
}

function zhangSuenThin(binary: Uint8Array, w: number, h: number): Uint8Array {
  let img = new Uint8Array(binary)
  let changed = true

  while (changed) {
    changed = false

    for (const subIter of [1, 2]) {
      const toRemove: number[] = []
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x
          if (img[idx] !== 1) continue

          const p2 = img[(y - 1) * w + x]
          const p3 = img[(y - 1) * w + x + 1]
          const p4 = img[y * w + x + 1]
          const p5 = img[(y + 1) * w + x + 1]
          const p6 = img[(y + 1) * w + x]
          const p7 = img[(y + 1) * w + x - 1]
          const p8 = img[y * w + x - 1]
          const p9 = img[(y - 1) * w + x - 1]

          const neighbors = [p2, p3, p4, p5, p6, p7, p8, p9]
          const bp = neighbors.reduce((a, b) => a + b, 0)
          if (bp < 2 || bp > 6) continue

          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let ap = 0
          for (let i = 0; i < 8; i++) {
            if (seq[i] === 0 && seq[i + 1] === 1) ap++
          }
          if (ap !== 1) continue

          if (subIter === 1) {
            if (p2 * p4 * p6 !== 0) continue
            if (p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0) continue
            if (p2 * p6 * p8 !== 0) continue
          }

          toRemove.push(idx)
        }
      }
      for (const idx of toRemove) {
        img[idx] = 0
        changed = true
      }
    }
  }

  return img
}

function traceSkeleton(skeleton: Uint8Array, w: number, h: number, padding: number): string[] {
  const visited = new Uint8Array(w * h)
  const paths: [number, number][][] = []

  function neighborCount(x: number, y: number): number {
    let count = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        if (skeleton[ny * w + nx] === 1) count++
      }
    }
    return count
  }

  function tracePath(startX: number, startY: number): [number, number][] {
    const points: [number, number][] = [[startX, startY]]
    visited[startY * w + startX] = 1
    let cx = startX, cy = startY
    let lastDir = 0

    const dirs = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1]
    ]

    while (true) {
      const orderedDirs: [number, number][] = []
      for (let i = 0; i < 8; i++) {
        const idx = (lastDir + i) % 8
        orderedDirs.push(dirs[idx])
      }

      let found = false
      for (const [dx, dy] of orderedDirs) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        const idx = ny * w + nx
        if (skeleton[idx] === 1 && visited[idx] === 0) {
          if (dx === 0 && dy === -1) lastDir = 0
          else if (dx === 1 && dy === -1) lastDir = 1
          else if (dx === 1 && dy === 0) lastDir = 2
          else if (dx === 1 && dy === 1) lastDir = 3
          else if (dx === 0 && dy === 1) lastDir = 4
          else if (dx === -1 && dy === 1) lastDir = 5
          else if (dx === -1 && dy === 0) lastDir = 6
          else if (dx === -1 && dy === -1) lastDir = 7
          cx = nx
          cy = ny
          visited[cy * w + cx] = 1
          points.push([cx, cy])
          found = true
          break
        }
      }

      if (!found) break
    }

    return points
  }

  const startPoints: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skeleton[y * w + x] === 1 && visited[y * w + x] === 0) {
        const nc = neighborCount(x, y)
        if (nc <= 1 || nc > 2) {
          startPoints.push([x, y])
        }
      }
    }
  }

  for (const [sx, sy] of startPoints) {
    if (visited[sy * w + sx] === 1) continue
    const points = tracePath(sx, sy)
    if (points.length >= 2) paths.push(points)
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skeleton[y * w + x] === 1 && visited[y * w + x] === 0) {
        const points = tracePath(x, y)
        if (points.length >= 2) paths.push(points)
      }
    }
  }

  return paths.map((pts) => {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p[0] - padding).toFixed(1)} ${(p[1] - padding).toFixed(1)}`).join(' ')
  })
}

function mergeSimplifySmooth(paths: [number, number][][], mergeDist = 5): string[] {
  if (paths.length === 0) return []

  // 1. 合并近距离的路径片段
  let allPoints = paths.map((p) => [...p])
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < allPoints.length; i++) {
      for (let j = 0; j < allPoints.length; j++) {
        if (i === j) continue
        const a = allPoints[i]
        const b = allPoints[j]
        if (a.length === 0 || b.length === 0) continue

        const endA = a[a.length - 1]
        const startB = b[0]
        const dist = Math.hypot(endA[0] - startB[0], endA[1] - startB[1])

        if (dist < mergeDist) {
          allPoints[i] = a.concat(b.slice(1))
          allPoints[j] = []
          merged = true
        }
      }
    }
  }

  // 2. 简化 + 平滑
  const result: string[] = []
  for (const pts of allPoints) {
    if (pts.length < 2) continue
    const simplified = douglasPeucker(pts, 2.0)
    if (simplified.length < 2) continue
    const smoothed = movingAverage(smoothed2(simplified), 3)
    if (smoothed.length < 2) continue
    const d = smoothed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    result.push(d)
  }

  return result
}

/** 移动平均平滑 */
function movingAverage(points: [number, number][], radius: number): [number, number][] {
  if (points.length <= 2 || radius <= 0) return points
  const result: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    let sx = 0, sy = 0, count = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
      sx += points[j][0]
      sy += points[j][1]
      count++
    }
    result.push([sx / count, sy / count])
  }
  // 保持首尾点不变，避免端点偏移
  result[0] = [points[0][0], points[0][1]]
  result[result.length - 1] = [points[points.length - 1][0], points[points.length - 1][1]]
  return result
}

/** 二次平滑（先简化再平滑的中间步骤别名，保持代码清晰） */
function smoothed2(points: [number, number][]): [number, number][] {
  return points
}

function douglasPeucker(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance)
    const right = douglasPeucker(points.slice(maxIdx), tolerance)
    return left.slice(0, -1).concat(right)
  } else {
    return [first, last]
  }
}

function pointToLineDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  return Math.hypot(p[0] - projX, p[1] - projY)
}

export function parseFont(buffer: ArrayBuffer): any {
  return parse(buffer)
}
