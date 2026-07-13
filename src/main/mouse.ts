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

    // 安全回退值，防止 IPC 传参缺失
    const moveSettleMs = options.moveSettleMs ?? 5
    const pressSettleMs = options.pressSettleMs ?? 5
    const stepDelayMs = options.stepDelayMs ?? 3
    const strokeDelayMs = options.strokeDelayMs ?? 40
    const startDelayMs = options.startDelayMs ?? 500
    const mouseSpeed = options.mouseSpeed ?? 2000

    console.log('[mouse] options:', JSON.stringify({ moveSettleMs, pressSettleMs, stepDelayMs, strokeDelayMs, startDelayMs, mouseSpeed }))
    console.log('[mouse] total strokes:', strokes.length, 'scaleFactor:', scaleFactor)

    if (startDelayMs > 0) await sleep(startDelayMs)

    const total = strokes.length
    for (let i = 0; i < total; i++) {
      if (this.cancelled) return { ok: false, error: 'cancelled' }
      const s = strokes[i]
      if (!s.points || s.points.length === 0) {
        onProgress({ current: i + 1, total })
        continue
      }

      // 强制释放鼠标左键，确保处于已释放状态
      await mouse.releaseButton(Button.LEFT)
      await sleep(5)

      // 移动到起点（不按笔）
      const first = s.points[0]
      const startPos = this.toScreen(first, region, scaleFactor)
      await mouse.setPosition(startPos)
      // 等待目标软件反应过来光标已到位
      await sleep(Math.max(moveSettleMs, 10))

      // 按下左键，等待目标软件处理按键事件后再开始移动
      await mouse.pressButton(Button.LEFT)
      await sleep(Math.max(pressSettleMs, 15))

      console.log(`[mouse] stroke ${i + 1}/${total}: start=(${startPos.x},${startPos.y}) points=${s.points.length}`)

      // 沿路径移动
      let prevPos = startPos
      for (let j = 1; j < s.points.length; j++) {
        if (this.cancelled) {
          await mouse.releaseButton(Button.LEFT)
          return { ok: false, error: 'cancelled' }
        }
        const currPos = this.toScreen(s.points[j], region, scaleFactor)
        await mouse.setPosition(currPos)
        // 用 mouseSpeed 计算步进延迟：距离/速度*1000ms
        const dist = Math.hypot(currPos.x - prevPos.x, currPos.y - prevPos.y)
        const speedDelay = mouseSpeed > 0 ? Math.round(dist / mouseSpeed * 1000) : 0
        const delay = Math.max(stepDelayMs, speedDelay, 1)
        await sleep(delay)
        prevPos = currPos
      }

      // 松开左键
      await mouse.releaseButton(Button.LEFT)
      // 等待松键事件被处理后再移到下一笔
      await sleep(Math.max(moveSettleMs, 10))

      onProgress({ current: i + 1, total })
      if (i < total - 1 && strokeDelayMs > 0) await sleep(strokeDelayMs)
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
