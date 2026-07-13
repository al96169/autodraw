import { app, BrowserWindow, ipcMain, screen, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { mouseControl } from './mouse'
import { selectRegion } from './regionSelector'

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 开启 DevTools 调试模式（在页面加载完成后打开，确保可靠弹出）
  win.webContents.on('did-finish-load', () => {
    win?.webContents.openDevTools({ mode: 'detach' })
  })

  // F12 切换 DevTools（备用）
  globalShortcut.register('F12', () => {
    if (win?.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools()
    } else {
      win?.webContents.openDevTools({ mode: 'detach' })
    }
  })
}

const fontsDir = join(process.env.WINDIR || 'C:\\Windows', 'Fonts')

app.whenReady().then(() => {
  ipcMain.handle('region:select', async () => {
    return await selectRegion()
  })

  ipcMain.handle('execute:run', async (_e, strokes, region, options) => {
    const sf = screen.getPrimaryDisplay().scaleFactor
    // 绘制期间注册全局 ESC 快捷键（窗口失焦时也能收到）
    const escAccel = 'Escape'
    globalShortcut.register(escAccel, () => {
      console.log('[main] ESC pressed, cancelling execution')
      mouseControl.cancel()
    })
    try {
      return await mouseControl.run(strokes, region, options, sf, (p) => {
        win?.webContents.send('execute:progress', p)
      })
    } finally {
      // 绘制结束后注销 ESC 快捷键
      globalShortcut.unregister(escAccel)
    }
  })

  ipcMain.handle('execute:cancel', async () => {
    mouseControl.cancel()
  })

  ipcMain.handle('font:loadSystem', async (_e, filename: string) => {
    try {
      const fontPath = join(fontsDir, filename)
      console.log('[main] font:loadSystem:', fontPath)
      const buffer = readFileSync(fontPath)
      console.log('[main] font read OK:', filename, 'size:', buffer.byteLength)
      return { name: filename, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) }
    } catch (err) {
      console.error('[main] loadSystemFont error:', filename, err)
      return null
    }
  })

  ipcMain.handle('font:pick', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: '选择字体文件',
      filters: [{ name: '字体', extensions: ['ttf', 'otf', 'woff'] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    try {
      const buffer = readFileSync(res.filePaths[0])
      return {
        name: res.filePaths[0].split(/[/\\]/).pop() || 'font',
        buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }
    } catch (err) {
      console.error('font:pick error:', err)
      return null
    }
  })

  ipcMain.handle('file:save', async (_e, content: string, defaultName: string) => {
    const res = await dialog.showSaveDialog(win!, {
      title: '保存脚本',
      defaultPath: defaultName,
      filters: [{ name: '脚本', extensions: ['txt', 'q', 'ahk', 'py'] }]
    })
    if (res.canceled || !res.filePath) return null
    const { writeFileSync } = await import('fs')
    writeFileSync(res.filePath, content, 'utf-8')
    return res.filePath
  })

  ipcMain.handle('screen:info', async () => {
    const d = screen.getPrimaryDisplay()
    return { width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
