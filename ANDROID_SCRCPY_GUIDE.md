# 配合 scrcpy 连接安卓手机画画

用 [scrcpy](https://github.com/Genymobile/scrcpy) 将手机屏幕镜像到电脑，AutoDraw 直接在 scrcpy 窗口上框选画布区域绘制即可。

## 安装 scrcpy

```powershell
winget install --exact Genymobile.scrcpy
```

或从 [Releases 页面](https://github.com/Genymobile/scrcpy/releases/latest) 下载 `scrcpy-win64-v4.1.zip` 解压，确保 `adb` 也在 PATH 中。

## 连接手机

### USB（推荐）

1. USB 数据线连接手机，手机弹出授权对话框点「允许」
2. `adb devices` 确认设备已识别
3. 启动 scrcpy：

```powershell
scrcpy --no-audio --stay-awake --turn-screen-off --mouse-bind=++++:++++
```

> `--mouse-bind=++++:++++` 必须加，否则右键/中键会被 scrcpy 拦截为「返回」「主页」快捷键，导致鼠标按下抬起无法传到手机。

### WiFi 无线

先用 USB 连接，然后：

```powershell
scrcpy --tcpip
```

自动配置后可拔掉 USB 线。

## 绘画步骤

1. **启动 scrcpy** — 手机屏幕镜像到电脑桌面
2. **打开绘图 App** — 在 scrcpy 窗口里点击打开绘图 App，选好画笔和颜色
3. **框选画布** — 在 AutoDraw 中点「框选区域」，直接在 scrcpy 窗口上拖选 App 内的画布范围
4. **添加内容** — 输入文字或拖入 SVG，调整属性使预览与画布对齐
5. **执行绘制** — 点「执行绘制」，鼠标自动在手机画布上画画，ESC 中止

> 框选后不要移动或缩放 scrcpy 窗口，否则坐标会偏移。

## 参数微调

scrcpy 镜像有 35-70ms 延迟，如果断笔或漏画，适当调大 AutoDraw 的停顿参数：

| 参数 | 建议值 | 说明 |
|------|--------|------|
| `moveSettleMs` | 10-15 | 移动到起点后停顿 |
| `pressSettleMs` | 10-15 | 按下后停顿 |
| `strokeDelayMs` | 60-80 | 笔画间隔 |

## 常见问题

- **鼠标点击无效** — 确认加了 `--mouse-bind=++++:++++`；小米设备需额外开启「USB 调试（安全设置）」
- **ADB 找不到设备** — 换数据线（确认支持数据传输）、换 USB 端口、安装手机品牌驱动
- **线条断续** — 增大 `moveSettleMs`、`pressSettleMs`、`strokeDelayMs`，降低 `mouseSpeed`

## 参考

- [scrcpy 官方仓库](https://github.com/Genymobile/scrcpy)
- [Windows 安装指南](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md)
- [连接方式文档](https://github.com/Genymobile/scrcpy/blob/master/doc/connection.md)
