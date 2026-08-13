# AutoDraw

将文字、SVG 矢量图转为自动鼠标绘画脚本的桌面软件。

在任意绘图软件（画图、Photoshop、白板等）中框选画布区域，AutoDraw 会自动控制鼠标，按照导入的文字轮廓或 SVG 路径逐笔绘制。也可导出为按键精灵 / AutoHotkey / Python 脚本，在目标机器上独立运行。

## 扩展指南

- [配合 scrcpy 连接安卓手机画画](ANDROID_SCRCPY_GUIDE.md) — 用 scrcpy 镜像手机屏幕，在手机绘图 App 上自动绘制
- [从图片到 AutoDraw 绘制：完整工作流](IMAGE_TO_DRAW_GUIDE.md) — 选图 → 豆包 AI 转简笔画 → 矢量描摹为 SVG → 导入绘制

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | Electron 30 + electron-vite | 三进程架构（main / preload / renderer） |
| 前端 | Vue 3 + Vite + Pinia | 渲染进程 UI 与状态管理 |
| 鼠标控制 | @nut-tree-fork/nut-js | Windows 全局鼠标自动化 |
| 字体解析 | opentype.js | TTF/OTF 字形轮廓提取 |
| 汉字笔画 | hanzi-writer-data | 9000+ 汉字笔画骨架数据（CDN） |
| 语言 | TypeScript | 全量类型安全 |

## 快速开始

### 环境要求

- Node.js >= 18
- Windows 10/11（鼠标控制依赖 Windows API）

### 安装与运行

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

## 使用流程

1. **框选画布区域** — 点击工具栏「框选区域」，在桌面拖拽选中目标绘图软件的画布范围
2. **添加内容** — 点击「添加文字」输入文字，或直接拖入 SVG 文件到画布（`test/` 文件夹中有示例 SVG 可用）
3. **调整属性** — 在右侧属性面板修改字号、字距、缩放、位置、绘制模式等
4. **执行绘制** — 点击「执行绘制」，鼠标将自动在目标画布上绘制（按 ESC 中止）
5. **导出脚本** — 点击「导出脚本」，选择按键精灵(.q) / AutoHotkey(.ahk) / Python(.py) 格式

## 功能特性

### 文字绘制

- **空心描边模式**（outline）：提取字体字形外轮廓，沿轮廓绘制
- **笔画骨架模式**（skeleton）：对中文使用 hanzi-writer-data 笔画中心线数据，一笔一划绘制；对非 CJK 字符回退到 Zhang-Suen 细化算法提取骨架
- 支持自定义字体加载（系统字体或 .ttf/.otf 文件）
- 可调节字号、字距、行距

### SVG 绘制

- 拖入 SVG 文件自动解析为路径
- 支持 path / rect / circle / ellipse / line / polyline / polygon 元素
- 自动过滤白色填充路径（CSS class 和 inline style 双重检测）
- 使用 viewBox 进行坐标系归一化
- 超长路径自动采样限制，防止卡死

### 鼠标控制

- 可配置的步进延迟、笔画间延迟、启动延迟
- 移动到位后停顿（moveSettleMs）→ 按下后停顿（pressSettleMs）→ 开始移动
- DPI 缩放自动适配
- ESC 全局快捷键中止绘制

### 脚本导出

| 格式 | 扩展名 | 说明 |
|------|--------|------|
| 按键精灵 | .q | MoveTo / LeftDown / LeftUp / Delay |
| AutoHotkey v1 | .ahk | MouseMove / Click / Sleep |
| Python | .py | pyautogui（需 pip install pyautogui） |

## 项目结构

```
src/
├── main/                      # Electron 主进程
│   ├── index.ts               #   窗口创建、IPC 注册、全局快捷键
│   ├── mouse.ts               #   鼠标控制类（nut-js 封装）
│   └── regionSelector.ts      #   全屏覆盖窗区域选择器
├── preload/
│   └── index.ts               # contextBridge API 暴露
├── renderer/src/              # Vue 3 渲染进程
│   ├── components/
│   │   ├── Toolbar.vue        #   顶部工具栏
│   │   ├── CanvasStage.vue    #   画布舞台（拖拽、渲染、预览）
│   │   ├── PropertiesPanel.vue#   右侧属性面板
│   │   └── ExportDialog.vue   #   导出脚本对话框
│   ├── lib/
│   │   ├── textToPath.ts      #   文字 → 路径（轮廓 + 骨架）
│   │   ├── svgToPath.ts       #   SVG → 路径（解析、归一化、过滤）
│   │   ├── strokeSampler.ts   #   路径采样（getPointAtLength + 跳跃检测）
│   │   ├── hanziStrokes.ts    #   汉字笔画数据加载器
│   │   └── scriptExport.ts    #   脚本导出（按键精灵/AHK/Python）
│   ├── stores/
│   │   └── canvas.ts          #   Pinia 画布状态管理
│   ├── types.ts               #   渲染进程类型定义
│   └── App.vue                #   根组件
└── shared/
    └── types.ts               #   主进程与渲染进程共享类型
test/                           # 示例 SVG 文件（可直接拖入画布体验）
```

## 核心数据流

```
文字输入 ──→ textToPath.ts ──→ SVG path d 字符串列表
SVG 文件 ──→ svgToPath.ts ──→ SVG path d 字符串列表
                                    │
                                    ▼
                         strokeSampler.ts
                    （getPointAtLength 采样）
                                    │
                                    ▼
                          Stroke[] (点序列)
                            ├──→ mouse.ts      → 鼠标自动绘制
                            └──→ scriptExport.ts → 导出脚本
```

## 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| stepDelayMs | 3 | 每个采样点之间的延迟（ms） |
| strokeDelayMs | 40 | 笔画之间的延迟（ms） |
| startDelayMs | 500 | 开始绘制前的等待时间（ms） |
| mouseSpeed | 2000 | 鼠标移动速度（像素/秒） |
| moveSettleMs | 5 | 移动到起点后等待目标软件反应（ms） |
| pressSettleMs | 5 | 按下鼠标后等待目标软件处理（ms） |
| sampleStep | 2 | 路径采样步长（像素，越小越精细） |

## 已知设计决策

- **路径采样不拆分 d 字符串**：SVG path 中的相对 `m` 命令在拆分后会被当作绝对 `M` 渲染，导致子路径定位错误。改为对完整 d 字符串采样后通过距离突变检测拆分笔画
- **文字坐标不使用 toPathData()**：opentype.js 的 `toPathData()` 会做额外的 Y 轴反射导致文字颠倒，改为直接序列化 commands
- **Pinia 对象 markRaw**：路径数据量大时 Vue 深度响应式代理会导致性能问题，使用 `markRaw` 跳过代理
- **IPC 结构化克隆**：Pinia reactive Proxy 对象无法直接通过 IPC 传输，使用 `JSON.parse(JSON.stringify(...))` 转为纯对象

## License

MIT
