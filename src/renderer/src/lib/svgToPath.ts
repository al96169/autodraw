export interface SvgPathResult {
  paths: string[]
  width: number
  height: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 将基础几何元素转为 path d 字符串 */
function elementToPathData(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  const num = (k: string, d = 0) => parseFloat(el.getAttribute(k) || '') || d
  switch (tag) {
    case 'path':
      return el.getAttribute('d')
    case 'rect': {
      const x = num('x'), y = num('y'), w = num('width'), h = num('height')
      const r = num('rx') || num('ry')
      if (r > 0 && r <= w / 2 && r <= h / 2) {
        return `M ${x + r} ${y} h ${w - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${h - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(w - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(h - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} z`
      }
      return `M ${x} ${y} h ${w} v ${h} h ${-w} z`
    }
    case 'circle': {
      const cx = num('cx'), cy = num('cy'), r = num('r')
      return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 z`
    }
    case 'ellipse': {
      const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry')
      return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 z`
    }
    case 'line': {
      return `M ${num('x1')} ${num('y1')} L ${num('x2')} ${num('y2')}`
    }
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') || '').trim().match(/-?[\d.eE+-]+/g)
      if (!pts || pts.length < 2) return null
      let d = `M ${pts[0]} ${pts[1]}`
      for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`
      if (tag === 'polygon') d += ' z'
      return d
    }
    default:
      return null
  }
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString()
}

/**
 * 将 path d 字符串整体平移 (dx,dy)。
 * 绝对坐标按规则平移；相对坐标（小写命令）保持不变。
 */
function translatePath(d: string, dx: number, dy: number): string {
  if (dx === 0 && dy === 0) return d
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)
  if (!tokens) return d

  const groupSize = (c: string): number => {
    switch (c) {
      case 'H': case 'V': return 1
      case 'M': case 'L': case 'T': return 2
      case 'S': case 'Q': return 4
      case 'C': return 6
      case 'A': return 7
      case 'Z': return 0
      default: return 2
    }
  }

  let result = ''
  let cmd = ''
  let cmdUpper = ''
  let idx = 0
  for (const t of tokens) {
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) {
      cmd = t
      cmdUpper = t.toUpperCase()
      idx = 0
      result += t
      continue
    }
    const num = parseFloat(t)
    let out = num
    const g = groupSize(cmdUpper)
    const pos = idx % g
    const absolute = cmd === cmdUpper
    if (absolute) {
      switch (cmdUpper) {
        case 'H':
          out = num + dx
          break
        case 'V':
          out = num + dy
          break
        case 'A':
          if (pos === 5) out = num + dx
          else if (pos === 6) out = num + dy
          break
        case 'Z':
          break
        default:
          // M L T C S Q：偶数为 x，奇数为 y
          out = pos % 2 === 0 ? num + dx : num + dy
          break
      }
    }
    result += (result && /[-+]?\d/.test(result[result.length - 1]) ? ' ' : '') + fmt(out)
    idx++
  }
  return result
}

/** 从 path d 字符串中提取所有坐标点（纯数学，不依赖 DOM） */
function parsePathCoords(d: string): number[][] {
  const points: number[][] = []
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g)
  if (!tokens) return points

  let cx = 0, cy = 0
  let cmd = '', cmdUpper = ''
  let idx = 0

  const groupSize = (c: string): number => {
    switch (c) {
      case 'H': case 'V': return 1
      case 'M': case 'L': case 'T': return 2
      case 'S': case 'Q': return 4
      case 'C': return 6
      case 'A': return 7
      case 'Z': return 0
      default: return 2
    }
  }

  for (const t of tokens) {
    if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) {
      cmd = t
      cmdUpper = t.toUpperCase()
      idx = 0
      if (cmdUpper === 'Z') {
        // Z 不产生新坐标
      }
      continue
    }
    const num = parseFloat(t)
    const g = groupSize(cmdUpper)
    const pos = idx % g
    const absolute = cmd === cmdUpper

    if (cmdUpper === 'H' || (cmdUpper === 'A' && pos === 5)) {
      const x = absolute ? num : cx + num
      if (cmdUpper === 'H') cx = x
      else cx = x // A 的第 6 个参数是 x
      if (cmdUpper === 'H') points.push([cx, cy])
    } else if (cmdUpper === 'V' || (cmdUpper === 'A' && pos === 6)) {
      const y = absolute ? num : cy + num
      if (cmdUpper === 'V') cy = y
      else cy = y
      if (cmdUpper === 'V') points.push([cx, cy])
    } else if (cmdUpper === 'A') {
      // A 命令: rx ry x-axis-rotation large-arc sweep x y
      if (pos === 5) {
        cx = absolute ? num : cx + num
      } else if (pos === 6) {
        cy = absolute ? num : cy + num
        points.push([cx, cy])
      }
    } else if (g === 2) {
      // M L T: x y
      if (pos === 0) {
        cx = absolute ? num : cx + num
      } else {
        cy = absolute ? num : cy + num
        points.push([cx, cy])
      }
    } else if (g === 4) {
      // S Q: x1 y1 x y (或 S: x2 y2 x y)
      if (pos === 2) {
        cx = absolute ? num : cx + num
      } else if (pos === 3) {
        cy = absolute ? num : cy + num
        points.push([cx, cy])
      }
    } else if (g === 6) {
      // C: x1 y1 x2 y2 x y
      if (pos === 4) {
        cx = absolute ? num : cx + num
      } else if (pos === 5) {
        cy = absolute ? num : cy + num
        points.push([cx, cy])
      }
    }
    idx++
  }
  return points
}

/** 计算一组 d 字符串的并集包围盒（纯数学，不依赖 DOM） */
function computeBBox(dStrings: string[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const d of dStrings) {
    const pts = parsePathCoords(d)
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * 将 SVG 文本转为路径 d 字符串列表。
 * 本地坐标系归一化到 [0,width]x[0,height]。
 * 注意：v1 不处理 transform 属性。
 */
export function svgToPath(svgText: string): SvgPathResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('SVG 解析失败')
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('未找到 <svg> 根元素')

  let vbW = 0
  let vbH = 0
  let vbX = 0
  let vbY = 0
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const p = vb.split(/[\s,]+/).map(Number)
    if (p.length >= 4 && p.every((n) => !isNaN(n))) {
      vbX = p[0]
      vbY = p[1]
      vbW = p[2]
      vbH = p[3]
    }
  }
  if (!vbW) vbW = parseFloat(svg.getAttribute('width') || '') || 0
  if (!vbH) vbH = parseFloat(svg.getAttribute('height') || '') || 0

  const dStrings: string[] = []
  svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon').forEach((el) => {
    const d = elementToPathData(el)
    if (d) dStrings.push(d)
  })

  if (dStrings.length === 0)
    throw new Error('SVG 中未发现可绘制形状（仅支持 path/rect/circle/ellipse/line/polyline/polygon）')

  if (!vbW || !vbH) {
    // 无 viewBox/宽高：用包围盒归一化
    const bb = computeBBox(dStrings)
    for (let i = 0; i < dStrings.length; i++) {
      dStrings[i] = translatePath(dStrings[i], -bb.x, -bb.y)
    }
    vbW = bb.width
    vbH = bb.height
  } else if (vbX !== 0 || vbY !== 0) {
    for (let i = 0; i < dStrings.length; i++) {
      dStrings[i] = translatePath(dStrings[i], -vbX, -vbY)
    }
  }

  return { paths: dStrings, width: vbW, height: vbH }
}
