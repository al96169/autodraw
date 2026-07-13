/**
 * 汉字笔画骨架数据加载器
 * 使用 hanzi-writer-data 的 CDN 数据，获取每个汉字的中心线笔画路径
 * 数据来源: Make me a Hanzi 项目 (9000+ 汉字)
 * 坐标系: 1024x1024, 左上角 (0, 900), Y 轴向下递减（需翻转）
 */

// CDN: 每个字符一个 JSON 文件
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/'

// 缓存：字符 -> 笔画数据
const cache = new Map<string, number[][][] | null>()

/** 判断是否为 CJK 汉字 */
export function isCJK(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (code >= 0x4e00 && code <= 0x9fff) ||
         (code >= 0x3400 && code <= 0x4dbf) ||
         (code >= 0xf900 && code <= 0xfaff)
}

/** 加载单个汉字的笔画 medians 数据 */
export async function loadHanziMedians(char: string): Promise<number[][][] | null> {
  if (!isCJK(char)) return null
  if (cache.has(char)) return cache.get(char)!

  try {
    const url = CDN_BASE + encodeURIComponent(char) + '.json'
    const res = await fetch(url)
    if (!res.ok) {
      console.warn('[hanzi] failed to load:', char, res.status)
      cache.set(char, null)
      return null
    }
    const data = await res.json()
    const medians = data.medians as number[][][]
    cache.set(char, medians)
    return medians
  } catch (e) {
    console.warn('[hanzi] error loading:', char, e)
    cache.set(char, null)
    return null
  }
}

/** 预加载文本中所有 CJK 字符的笔画数据 */
export async function preloadHanzi(text: string): Promise<void> {
  const chars = new Set<string>()
  for (const ch of text) {
    if (isCJK(ch)) chars.add(ch)
  }
  await Promise.all([...chars].map((ch) => loadHanziMedians(ch)))
}

/**
 * 将汉字 medians 转为 SVG path data
 * @param char 汉字
 * @param fontSize 目标字号
 * @returns SVG path data 数组（每个元素是一笔），如果字符未加载返回 null
 */
export function hanziToPaths(char: string, fontSize: number): string[] | null {
  const medians = cache.get(char)
  if (!medians) return null

  const scale = fontSize / 1024
  const paths: string[] = []

  for (const stroke of medians) {
    if (stroke.length === 0) continue
    const parts: string[] = []
    for (let i = 0; i < stroke.length; i++) {
      const rawX = stroke[i][0]
      const rawY = stroke[i][1]
      // 坐标变换: Y 轴翻转 (900 - rawY)，然后缩放
      const x = (rawX * scale).toFixed(1)
      const y = ((900 - rawY) * scale).toFixed(1)
      parts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`)
    }
    paths.push(parts.join(' '))
  }

  return paths
}

/**
 * 将整段文字转为笔画路径（仅 CJK 字符使用 hanzi 数据，非 CJK 回退到空心轮廓）
 * @param text 文字
 * @param font opentype.js 字体（用于非 CJK 回退和测量）
 * @param fontSize 字号
 * @param letterSpacing 字距
 * @param lineHeight 行距
 * @returns 路径结果
 */
export function buildHanziTextPaths(
  text: string,
  font: any,
  fontSize: number,
  letterSpacing = 0,
  lineHeight = 1.25
): { paths: string[]; width: number; height: number } {
  const scale = fontSize / font.unitsPerEm
  const lineH = fontSize * lineHeight
  const allPaths: string[] = []
  let x = 0
  let y = 0
  let maxX = 0
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    x = 0
    for (const ch of line) {
      if (isCJK(ch)) {
        // 使用 hanzi 笔画数据
        const hanziPaths = hanziToPaths(ch, fontSize)
        if (hanziPaths && hanziPaths.length > 0) {
          // 平移到当前 x 位置，Y 已在 hanziToPaths 中处理
          for (const p of hanziPaths) {
            allPaths.push(translatePath(p, x, y))
          }
        }
        // 汉字宽度按 fontSize 计算（近似正方形）
        x += fontSize + letterSpacing
      } else {
        // 非 CJK 字符使用 opentype.js 轮廓
        const glyph = font.charToGlyph(ch)
        const gp = glyph.getPath(x, y, fontSize)
        const d = pathCommandsToSvg(gp, x, y)
        if (d) allPaths.push(d)
        x += glyph.advanceWidth * scale + letterSpacing
      }
      maxX = Math.max(maxX, x)
    }
    y += lineH
  }

  return {
    paths: allPaths,
    width: maxX,
    height: y || lineH
  }
}

/** 平移 SVG path data */
function translatePath(d: string, dx: number, dy: number): string {
  return d.replace(/([ML])\s*([\d.-]+)\s+([\d.-]+)/g, (_, cmd, x, y) => {
    return `${cmd} ${(parseFloat(x) + dx).toFixed(1)} ${(parseFloat(y) + dy).toFixed(1)}`
  })
}

/** 将 opentype.js Path commands 转 SVG path data（用于非 CJK 回退） */
function pathCommandsToSvg(p: any, dx: number, dy: number): string {
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
