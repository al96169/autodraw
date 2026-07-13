import { parse } from 'opentype.js'

export interface TextPathResult {
  paths: string[]
  width: number
  height: number
}

/**
 * 变换 Path 的 commands：Y轴翻转 + 平移。
 * opentype.js 字体坐标系 Y 轴向上，SVG/屏幕坐标系 Y 轴向下，需翻转。
 */
function transformPath(p: any, flipY: boolean, dx: number, dy: number): string {
  const cmds = p.commands
  for (const c of cmds) {
    if (c.type === 'M' || c.type === 'L' || c.type === 'T') {
      if (flipY) c.y = -c.y
      c.x += dx
      c.y += dy
    } else if (c.type === 'C') {
      if (flipY) { c.y = -c.y; c.y1 = -c.y1; c.y2 = -c.y2 }
      c.x += dx; c.y += dy
      c.x1 += dx; c.y1 += dy
      c.x2 += dx; c.y2 += dy
    } else if (c.type === 'Q') {
      if (flipY) { c.y = -c.y; c.y1 = -c.y1 }
      c.x += dx; c.y += dy
      c.x1 += dx; c.y1 += dy
    } else if (c.type === 'S') {
      if (flipY) { c.y = -c.y; c.y2 = -c.y2 }
      c.x += dx; c.y += dy
      c.x2 += dx; c.y2 += dy
    }
    // Z 不需要变换
  }
  return p.toPathData()
}

/**
 * 将文字转为字形轮廓路径（空心字）。
 * 坐标系已归一化：路径包围盒左上角对齐到 (0,0)，Y 轴向下（SVG 标准）。
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
  let minY = Infinity  // 字体坐标系（Y向上）的 minY
  let maxX = -Infinity
  let maxY = -Infinity  // 字体坐标系（Y向上）的 maxY

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    x = 0
    for (const ch of line) {
      const glyph = font.charToGlyph(ch)
      const gp = glyph.getPath(x, y, fontSize)
      collected.push(gp)
      const bb = gp.getBoundingBox()
      if (!isFinite(bb.x1)) {
        // 空格等无轮廓字符
      } else {
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

  // Y 轴翻转后：新的 minY = -maxY, 新的 maxY = -minY
  // 平移使左上角对齐到 (0,0)：dx = -minX, dy = -(-maxY) = maxY
  const dx = -minX
  const dy = maxY  // 翻转后平移量
  const dStrings = collected.map((p) => transformPath(p, true, dx, dy))

  return {
    paths: dStrings,
    width: maxX - minX,
    height: maxY - minY
  }
}

// ========== 非空心字（笔画骨架化）==========

/**
 * 将文字渲染到 Canvas 并提取骨架（细化）路径。
 * 使用 Zhang-Suen 细化算法对填充字形做骨架化，得到近似笔画中心线。
 */
export function textToSkeletonPaths(
  text: string,
  font: any,
  fontSize: number,
  letterSpacing = 0,
  lineHeight = 1.25
): TextPathResult {
  if (!text) return { paths: [], width: 0, height: 0 }

  // 1. 用 opentype.js 获取文字尺寸
  const outlineResult = textToPath(text, font, fontSize, letterSpacing, lineHeight)
  const w = Math.ceil(outlineResult.width) + 4
  const h = Math.ceil(outlineResult.height) + 4
  if (w <= 0 || h <= 0) return { paths: [], width: 0, height: 0 }

  // 2. 创建 Canvas，用 opentype.js 的 Path 对象绘制填充字形
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.clearRect(0, 0, w, h)

  // 用 opentype.js 的 font.draw 渲染填充文字
  // draw(ctx, text, x, y, fontSize, options)
  font.draw(ctx, text, 2, h - 2, fontSize, { letterSpacing, lineHeight })

  // 3. 提取像素，做二值化
  const imgData = ctx.getImageData(0, 0, w, h)
  const binary: Uint8Array = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    binary[i] = imgData.data[i * 4 + 3] > 128 ? 1 : 0  // 用 alpha 通道
  }

  // 4. Zhang-Suen 细化算法
  const skeleton = zhangSuenThin(binary, w, h)

  // 5. 将骨架像素追踪为路径
  const paths = traceSkeleton(skeleton, w, h)

  return {
    paths,
    width: outlineResult.width,
    height: outlineResult.height
  }
}

/**
 * Zhang-Suen 细化算法。
 * 输入：二值图（1=前景，0=背景），输出：细化后的二值图。
 */
function zhangSuenThin(binary: Uint8Array, w: number, h: number): Uint8Array {
  let img = new Uint8Array(binary)
  let changed = true

  while (changed) {
    changed = false

    // Sub-iteration 1
    const toRemove1: number[] = []
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

        // 转变次数 A(P1)
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
        let ap = 0
        for (let i = 0; i < 8; i++) {
          if (seq[i] === 0 && seq[i + 1] === 1) ap++
        }
        if (ap !== 1) continue

        // Sub-iteration 1 条件
        if (p2 * p4 * p6 !== 0) continue
        if (p4 * p6 * p8 !== 0) continue

        toRemove1.push(idx)
      }
    }
    for (const idx of toRemove1) {
      img[idx] = 0
      changed = true
    }

    // Sub-iteration 2
    const toRemove2: number[] = []
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

        // Sub-iteration 2 条件
        if (p2 * p4 * p8 !== 0) continue
        if (p2 * p6 * p8 !== 0) continue

        toRemove2.push(idx)
      }
    }
    for (const idx of toRemove2) {
      img[idx] = 0
      changed = true
    }
  }

  return img
}

/**
 * 将骨架像素追踪为 SVG path 字符串数组。
 * 策略：从端点或交叉点开始，沿骨架追踪连续路径。
 */
function traceSkeleton(skeleton: Uint8Array, w: number, h: number): string[] {
  const visited = new Uint8Array(w * h)
  const paths: string[] = []

  // 找到所有前景像素的邻居数
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

  // 从起点开始追踪路径
  function tracePath(startX: number, startY: number): { points: [number, number][] } {
    const points: [number, number][] = [[startX, startY]]
    visited[startY * w + startX] = 1
    let cx = startX, cy = startY
    let prevX = -1, prevY = -1

    while (true) {
      let nextX = -1, nextY = -1
      let found = false

      // 优先搜索 8 邻域
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1 && !found; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
          if (nx === prevX && ny === prevY) continue
          const idx = ny * w + nx
          if (skeleton[idx] === 1 && visited[idx] === 0) {
            nextX = nx
            nextY = ny
            found = true
          }
        }
      }

      if (!found) break

      prevX = cx
      prevY = cy
      cx = nextX
      cy = nextY
      visited[cy * w + cx] = 1
      points.push([cx, cy])
    }

    return { points }
  }

  // 找端点（邻居数=1）或交叉点（邻居数>2）开始追踪
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

  // 从端点/交叉点开始追踪
  for (const [sx, sy] of startPoints) {
    if (visited[sy * w + sx] === 1) continue
    const { points } = tracePath(sx, sy)
    if (points.length >= 2) {
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
      paths.push(d)
    }
  }

  // 追踪剩余的未访问像素（环状路径）
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skeleton[y * w + x] === 1 && visited[y * w + x] === 0) {
        const { points } = tracePath(x, y)
        if (points.length >= 2) {
          const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
          paths.push(d)
        }
      }
    }
  }

  return paths
}

export function parseFont(buffer: ArrayBuffer): any {
  return parse(buffer)
}
