import { mouse, Point, Button } from '@nut-tree-fork/nut-js'
import type { Stroke, Region, ExecuteOptions } from '../shared/types'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

class MouseControl {
  private cancelled = false

  cancel() {
    this.cancelled = true
  }

  async run(
    strokes: Stroke[],
    region: Region,
    options: ExecuteOptions,
    scaleFactor: number,
    onProgress: (p: { current: number; total: number }) => void
  ): Promise<{ ok: boolean; error?: string }> {
    this.cancelled = false
    mouse.config.mouseSpeed = options.mouseSpeed
    mouse.config.autoDelayMs = 0

    if (options.startDelayMs > 0) await sleep(options.startDelayMs)

    const total = strokes.length
    for (let i = 0; i < total; i++) {
      if (this.cancelled) return { ok: false, error: 'cancelled' }
      const s = strokes[i]
      if (!s.points || s.points.length === 0) {
        onProgress({ current: i + 1, total })
        continue
      }

      // 移动到起点（不按笔）
      const first = s.points[0]
      await mouse.setPosition(this.toScreen(first, region, scaleFactor))
      // 等待鼠标定位完成，避免紧接着的 pressButton 事件丢失
      await sleep(Math.max(options.stepDelayMs, 5))

      // 按下左键，并等待事件被系统处理
      await mouse.pressButton(Button.LEFT)
      await sleep(10) // 确保 pressButton 事件被 OS 处理

      // 沿路径移动
      for (let j = 1; j < s.points.length; j++) {
        if (this.cancelled) {
          await mouse.releaseButton(Button.LEFT)
          return { ok: false, error: 'cancelled' }
        }
        await mouse.setPosition(this.toScreen(s.points[j], region, scaleFactor))
        if (options.stepDelayMs > 0) await sleep(options.stepDelayMs)
      }

      // 松开左键，并等待事件被系统处理
      await mouse.releaseButton(Button.LEFT)
      await sleep(5) // 确保 releaseButton 事件被处理后再移到下一笔

      onProgress({ current: i + 1, total })
      if (i < total - 1 && options.strokeDelayMs > 0) await sleep(options.strokeDelayMs)
    }

    return { ok: true }
  }

  /** 画布相对坐标 -> 屏幕物理像素坐标（兼容 DPI 缩放） */
  private toScreen(p: { x: number; y: number }, region: Region, scaleFactor: number): Point {
    return new Point(
      Math.round((region.x + p.x) * scaleFactor),
      Math.round((region.y + p.y) * scaleFactor)
    )
  }
}

export const mouseControl = new MouseControl()
