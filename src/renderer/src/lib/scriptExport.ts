import type { Stroke, Region, ExecuteOptions, ExportFormat } from '../../shared/types'

export interface ExportContext {
  strokes: Stroke[]
  region: Region
  scaleFactor: number
  options: ExecuteOptions
}

function phys(p: { x: number; y: number }, region: Region, sf: number): [number, number] {
  return [Math.round((region.x + p.x) * sf), Math.round((region.y + p.y) * sf)]
}

const FILE_EXT: Record<ExportFormat, string> = {
  anjian: 'q',
  ahk: 'ahk',
  python: 'py'
}

const FILE_NAME: Record<ExportFormat, string> = {
  anjian: 'autodraw',
  ahk: 'autodraw',
  python: 'autodraw'
}

export function defaultFileName(format: ExportFormat): string {
  return `${FILE_NAME[format]}.${FILE_EXT[format]}`
}

export function generateScript(format: ExportFormat, ctx: ExportContext): string {
  switch (format) {
    case 'anjian':
      return generateAnjian(ctx)
    case 'ahk':
      return generateAhk(ctx)
    case 'python':
      return generatePython(ctx)
  }
}

/** 按键精灵脚本 */
function generateAnjian(ctx: ExportContext): string {
  const { strokes, region, scaleFactor: sf, options } = ctx
  const lines: string[] = []
  lines.push('// AutoDraw 导出 - 按键精灵脚本')
  lines.push(`// 画布区域: ${region.x},${region.y} ${region.width}x${region.height}  缩放: ${sf}`)
  lines.push(`// 共 ${strokes.length} 笔`)
  lines.push(`Delay ${options.startDelayMs}`)
  strokes.forEach((s, i) => {
    if (s.points.length === 0) return
    lines.push(`// 第 ${i + 1} 笔`)
    const [sx, sy] = phys(s.points[0], region, sf)
    lines.push(`MoveTo ${sx}, ${sy}`)
    if (options.stepDelayMs > 0) lines.push(`Delay ${options.stepDelayMs}`)
    lines.push('LeftDown 1')
    for (let j = 1; j < s.points.length; j++) {
      const [px, py] = phys(s.points[j], region, sf)
      lines.push(`MoveTo ${px}, ${py}`)
      if (options.stepDelayMs > 0) lines.push(`Delay ${options.stepDelayMs}`)
    }
    lines.push('LeftUp 1')
    if (i < strokes.length - 1 && options.strokeDelayMs > 0) lines.push(`Delay ${options.strokeDelayMs}`)
  })
  lines.push('// 结束')
  return lines.join('\r\n')
}

/** AutoHotkey v1 脚本 */
function generateAhk(ctx: ExportContext): string {
  const { strokes, region, scaleFactor: sf, options } = ctx
  const lines: string[] = []
  lines.push('#NoEnv')
  lines.push('#SingleInstance, Force')
  lines.push('CoordMode, Mouse, Screen')
  lines.push('SetMouseDelay, 0')
  lines.push(`; AutoDraw 导出 - AutoHotkey 脚本 / 共 ${strokes.length} 笔`)
  lines.push(`Sleep, ${options.startDelayMs}`)
  strokes.forEach((s, i) => {
    if (s.points.length === 0) return
    lines.push(`; 第 ${i + 1} 笔`)
    const [sx, sy] = phys(s.points[0], region, sf)
    lines.push(`MouseMove, ${sx}, ${sy}, 0`)
    if (options.stepDelayMs > 0) lines.push(`Sleep, ${options.stepDelayMs}`)
    lines.push('Click, Down')
    for (let j = 1; j < s.points.length; j++) {
      const [px, py] = phys(s.points[j], region, sf)
      lines.push(`MouseMove, ${px}, ${py}, 0`)
      if (options.stepDelayMs > 0) lines.push(`Sleep, ${options.stepDelayMs}`)
    }
    lines.push('Click, Up')
    if (i < strokes.length - 1 && options.strokeDelayMs > 0) lines.push(`Sleep, ${options.strokeDelayMs}`)
  })
  lines.push('ExitApp')
  return lines.join('\r\n')
}

/** Python (pyautogui) 脚本 */
function generatePython(ctx: ExportContext): string {
  const { strokes, region, scaleFactor: sf, options } = ctx
  const lines: string[] = []
  lines.push('# -*- coding: utf-8 -*-')
  lines.push('# AutoDraw 导出 - Python (pyautogui) 脚本')
  lines.push('# 依赖: pip install pyautogui')
  lines.push('import pyautogui')
  lines.push('import time')
  lines.push('')
  lines.push('pyautogui.FAILSAFE = False')
  lines.push(`step_delay = ${options.stepDelayMs} / 1000.0`)
  lines.push(`stroke_delay = ${options.strokeDelayMs} / 1000.0`)
  lines.push('')
  lines.push(`time.sleep(${options.startDelayMs} / 1000.0)`)
  lines.push('')
  strokes.forEach((s, i) => {
    if (s.points.length === 0) return
    lines.push(`# 第 ${i + 1} 笔`)
    const [sx, sy] = phys(s.points[0], region, sf)
    lines.push(`pyautogui.moveTo(${sx}, ${sy})`)
    if (options.stepDelayMs > 0) lines.push('time.sleep(step_delay)')
    lines.push("pyautogui.mouseDown(button='left')")
    for (let j = 1; j < s.points.length; j++) {
      const [px, py] = phys(s.points[j], region, sf)
      lines.push(`pyautogui.moveTo(${px}, ${py})`)
      if (options.stepDelayMs > 0) lines.push('time.sleep(step_delay)')
    }
    lines.push("pyautogui.mouseUp(button='left')")
    if (i < strokes.length - 1 && options.strokeDelayMs > 0) lines.push('time.sleep(stroke_delay)')
    lines.push('')
  })
  lines.push("print('AutoDraw 完成')")
  return lines.join('\n')
}
