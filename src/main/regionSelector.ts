import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import type { Region } from '../shared/types'

const OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin:0; padding:0; box-sizing:border-box; user-select:none; }
  html,body { width:100%; height:100%; overflow:hidden; cursor:crosshair;
    background: rgba(0,0,0,0.18); font-family: "Microsoft YaHei", sans-serif; }
  #tip { position:fixed; top:16px; left:50%; transform:translateX(-50%);
    color:#fff; background:rgba(0,0,0,0.55); padding:10px 18px; border-radius:6px;
    font-size:14px; pointer-events:none; z-index:9999; }
  #sel { position:absolute; border:1.5px solid #ff5a5a; background:rgba(255,90,90,0.12);
    display:none; z-index:9998; }
</style>
</head>
<body>
  <div id="tip">在桌面拖拽框选画布区域（按下鼠标拖动，松开确认；ESC 取消）</div>
  <div id="sel"></div>
<script>
  const { ipcRenderer } = require('electron');
  const sel = document.getElementById('sel');
  let start = null;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    sel.style.left = start.x + 'px';
    sel.style.top = start.y + 'px';
    sel.style.width = '0px';
    sel.style.height = '0px';
    sel.style.display = 'block';
  });
  document.addEventListener('mousemove', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const w = Math.abs(e.clientX - start.x);
    const h = Math.abs(e.clientY - start.y);
    sel.style.left = x + 'px';
    sel.style.top = y + 'px';
    sel.style.width = w + 'px';
    sel.style.height = h + 'px';
  });
  document.addEventListener('mouseup', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const w = Math.abs(e.clientX - start.x);
    const h = Math.abs(e.clientY - start.y);
    start = null;
    if (w < 5 || h < 5) { sel.style.display='none'; return; }
    ipcRenderer.send('region:rect', { x, y, width: w, height: h });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ipcRenderer.send('region:cancel');
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
<\/script>
</body>
</html>`

export function selectRegion(): Promise<Region | null> {
  return new Promise((resolve) => {
    const display = screen.getPrimaryDisplay()
    const { x, y, width, height } = display.bounds

    // 清理可能残留的 once handlers（上次操作异常中断时遗留）
    ipcMain.removeAllListeners('region:rect')
    ipcMain.removeAllListeners('region:cancel')

    const overlay = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    })

    const file = join(tmpdir(), 'autodraw-region.html')
    writeFileSync(file, OVERLAY_HTML, 'utf-8')

    let done = false
    const finish = (r: Region | null) => {
      if (done) return
      done = true
      console.log('[regionSelector] finish:', r ? `(${r.x},${r.y}) ${r.width}x${r.height}` : 'null')
      // 清理 IPC handlers
      ipcMain.removeAllListeners('region:rect')
      ipcMain.removeAllListeners('region:cancel')
      try {
        overlay.close()
      } catch {
        /* noop */
      }
      try {
        unlinkSync(file)
      } catch {
        /* noop */
      }
      resolve(r)
    }

    overlay.once('ready-to-show', () => {
      console.log('[regionSelector] overlay ready-to-show')
      overlay.show()
      overlay.focus()
    })

    overlay.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[regionSelector] overlay did-fail-load:', code, desc)
      finish(null)
    })

    overlay.on('closed', () => {
      console.log('[regionSelector] overlay closed')
      finish(null)
    })

    overlay.loadFile(file).catch((err) => {
      console.error('[regionSelector] loadFile error:', err)
      finish(null)
    })

    ipcMain.once('region:rect', (_e, rect: { x: number; y: number; width: number; height: number }) => {
      // 客户端坐标相对于覆盖窗（覆盖窗位于显示器原点），转为屏幕坐标
      finish({
        x: rect.x + x,
        y: rect.y + y,
        width: rect.width,
        height: rect.height
      })
    })
    ipcMain.once('region:cancel', () => finish(null))
  })
}
