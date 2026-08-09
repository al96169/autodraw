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

/**
 * 计算一组 d 字符串的并集包围盒。
 * 使用一次性 DOM 批量操作：将所有路径放入一个 <g>，调用一次 getBBox()。
 * 仅在 viewBox 不可用时作为 fallback 使用。
 */
function computeBBox(dStrings: string[]): { x: number; y: number; width: number; height: number } {
  if (dStrings.length === 0) return { x: 0, y: 0, width: 0, height: 0 }

  const svg = document.createElementNS(SVG_NS, 'svg') as unknown as SVGSVGElement
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  svg.style.left = '-9999px'
  svg.style.top = '0'
  svg.style.pointerEvents = 'none'

  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
  for (const d of dStrings) {
    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement
    path.setAttribute('d', d)
    g.appendChild(path)
  }
  svg.appendChild(g)
  document.body.appendChild(svg)

  let result: { x: number; y: number; width: number; height: number }
  try {
    const bb = g.getBBox()
    result = { x: bb.x, y: bb.y, width: bb.width, height: bb.height }
  } catch {
    result = { x: 0, y: 0, width: 0, height: 0 }
  }

  document.body.removeChild(svg)
  return result
}

/**
 * 提取 path d 字符串中第一个 M/m 命令的坐标。
 * SVG 规范中，路径的第一个 moveto 始终是绝对坐标（即使用小写 m）。
 */
function getFirstPoint(d: string): { x: number; y: number } | null {
  const m = d.match(/^[Mm]\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)[\s,]+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/)
  if (!m) return null
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
}

/**
 * 将 SVG 文本转为路径 d 字符串列表。
 * 使用 viewBox 进行坐标系归一化，过滤掉超出 viewBox 的路径。
 */
export function svgToPath(svgText: string): SvgPathResult {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('SVG 解析失败')
  const svg = doc.querySelector('svg')
  if (!svg) throw new Error('未找到 <svg> 根元素')

  // 解析 viewBox
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

  // 解析 <style> 标签中的 CSS 规则，检测哪些 class 代表白色填充
  const whiteFillClasses = new Set<string>()
  const styleEls = svg.querySelectorAll('style')
  styleEls.forEach((styleEl) => {
    const css = styleEl.textContent || ''
    // 匹配 .className { ... fill: #fff/#ffffff/white ... }
    const ruleMatches = css.matchAll(/\.([\w-]+)\s*\{[^}]*fill\s*:\s*(#fff(?:fff)?|white)\s*[^}]*\}/gi)
    for (const m of ruleMatches) {
      whiteFillClasses.add(m[1])
    }
  })

  function isWhiteFilled(el: Element): boolean {
    // 检查 fill 属性
    const fillAttr = (el.getAttribute('fill') || '').toLowerCase().trim()
    if (['#fff', '#ffffff', 'white', 'rgb(255,255,255)', 'rgb(255, 255, 255)'].includes(fillAttr)) {
      return true
    }
    // 检查 inline style 中的 fill
    const styleAttr = el.getAttribute('style') || ''
    if (/fill\s*:\s*(#fff(?:fff)?|white)\s*[;'"]/i.test(styleAttr)) {
      return true
    }
    // 检查 class 是否匹配白色填充 CSS 规则
    const cls = el.getAttribute('class')
    if (cls) {
      for (const c of cls.split(/\s+/)) {
        if (whiteFillClasses.has(c)) return true
      }
    }
    return false
  }

  const dStrings: string[] = []
  let skippedWhite = 0
  svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon').forEach((el) => {
    if (isWhiteFilled(el)) {
      skippedWhite++
      return
    }
    const d = elementToPathData(el)
    if (d) dStrings.push(d)
  })
  if (skippedWhite > 0) {
    console.log(`[svgToPath] skipped ${skippedWhite} white-filled paths`)
  }

  if (dStrings.length === 0)
    throw new Error('SVG 中未发现可绘制形状（仅支持 path/rect/circle/ellipse/line/polyline/polygon）')

  let finalW: number
  let finalH: number
  let offsetX = 0
  let offsetY = 0

  if (vbW > 0 && vbH > 0) {
    // 有 viewBox：使用 viewBox 尺寸，过滤超出 viewBox 的路径
    const margin = 5 // 容差，允许轻微超出边界的路径
    const filtered: string[] = []
    let skippedOutside = 0
    for (const d of dStrings) {
      const pt = getFirstPoint(d)
      if (pt) {
        const outside =
          pt.x < vbX - margin ||
          pt.x > vbX + vbW + margin ||
          pt.y < vbY - margin ||
          pt.y > vbY + vbH + margin
        if (outside) {
          skippedOutside++
          continue
        }
      }
      filtered.push(d)
    }
    if (skippedOutside > 0) {
      console.log(`[svgToPath] skipped ${skippedOutside} paths outside viewBox`)
    }
    dStrings.length = 0
    dStrings.push(...filtered)

    // 使用 viewBox 偏移进行平移（通常 vbX=vbY=0，无需平移）
    offsetX = -vbX
    offsetY = -vbY
    finalW = vbW
    finalH = vbH
  } else {
    // 无 viewBox：回退到包围盒计算
    const bb = computeBBox(dStrings)
    offsetX = -bb.x
    offsetY = -bb.y
    finalW = isFinite(bb.width) && bb.width > 0 ? bb.width : 0
    finalH = isFinite(bb.height) && bb.height > 0 ? bb.height : 0
  }

  // 应用平移
  if (offsetX !== 0 || offsetY !== 0) {
    for (let i = 0; i < dStrings.length; i++) {
      dStrings[i] = translatePath(dStrings[i], offsetX, offsetY)
    }
  }

  console.log(`[svgToPath] result: ${dStrings.length} paths, ${finalW}x${finalH}`)
  return { paths: dStrings, width: finalW, height: finalH }
}
