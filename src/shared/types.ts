// 主进程与渲染进程共享的类型定义
export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** 一笔：按下 -> 移动 -> 松开，坐标为画布相对坐标 */
export interface Stroke {
  points: Point[]
}

export interface ExecuteOptions {
  stepDelayMs: number
  strokeDelayMs: number
  startDelayMs: number
  mouseSpeed: number
  /** 移动到起点后等待多久再按键（让目标软件反应过来） */
  moveSettleMs: number
  /** 按下鼠标后等待多久再开始移动（让目标软件处理按键事件） */
  pressSettleMs: number
}

export type ExportFormat = 'anjian' | 'ahk' | 'python'
