import { contextBridge, ipcRenderer } from 'electron'
import type { Region, Stroke, ExecuteOptions } from '../shared/types'

const api = {
  selectRegion: (): Promise<Region | null> => ipcRenderer.invoke('region:select'),

  executeStrokes: (
    strokes: Stroke[],
    region: Region,
    options: ExecuteOptions
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('execute:run', strokes, region, options),

  cancelExecute: (): Promise<void> => ipcRenderer.invoke('execute:cancel'),

  onExecuteProgress: (cb: (p: { current: number; total: number }) => void) => {
    const handler = (_e: unknown, p: { current: number; total: number }) => cb(p)
    ipcRenderer.on('execute:progress', handler)
    return () => ipcRenderer.removeListener('execute:progress', handler)
  },

  loadSystemFont: (filename: string): Promise<{ name: string; buffer: ArrayBuffer } | null> =>
    ipcRenderer.invoke('font:loadSystem', filename),

  pickFontFile: (): Promise<{ name: string; buffer: ArrayBuffer } | null> =>
    ipcRenderer.invoke('font:pick'),

  saveScript: (content: string, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save', content, defaultName),

  getScreenInfo: (): Promise<{ width: number; height: number; scaleFactor: number }> =>
    ipcRenderer.invoke('screen:info')
}

contextBridge.exposeInMainWorld('api', api)

export type AutodrawApi = typeof api
