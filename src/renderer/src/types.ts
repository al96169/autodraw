import type { Region, Stroke, ExecuteOptions, ExportFormat } from '../../shared/types'

export type { Region, Stroke, ExecuteOptions, ExportFormat }

export type ShapeType = 'text' | 'svg'

export interface BaseShape {
  id: string
  type: ShapeType
  /** 画布左上角坐标（逻辑像素 = 屏幕像素） */
  x: number
  y: number
  /** 缩放比例，基于 localWidth/localHeight */
  scaleX: number
  scaleY: number
  /** 本地坐标系下的路径 d 字符串列表（已归一化到 [0,localWidth]x[0,localHeight]） */
  paths: string[]
  localWidth: number
  localHeight: number
  name: string
}

export interface TextShape extends BaseShape {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  letterSpacing: number
  lineHeight: number
  /** 'outline' = 空心描边, 'skeleton' = 笔画骨架 */
  textMode: 'outline' | 'skeleton'
}

export interface SvgShape extends BaseShape {
  type: 'svg'
  source: string
}

export type Shape = TextShape | SvgShape
