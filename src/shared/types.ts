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
}

export type ExportFormat = 'anjian' | 'ahk' | 'python'
