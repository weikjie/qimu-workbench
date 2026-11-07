# 栖木工作台

一个安静、本地优先的桌面效率空间。使用 **Electron + React + TypeScript** 构建，把待办、常用网页和 Markdown 笔记收进同一个工作台。

![今日总览](docs/screenshots/overview.png)

## 功能

- **今日总览**：集中查看完成进度、待办、快捷入口与最近笔记。
- **待办清单**：快速添加、按 P0–P3 设置优先级并分组展示、在优先级内拖动排序（也支持聚焦拖动把手后按 ↑ / ↓ 移动）、复制到剪贴板，以及完成、内联编辑、筛选、删除与清除已完成。
- **快捷链接**：收藏常去网页，点击即用浏览器打开；可针对每个链接指定使用已安装的 Chrome、Edge、Firefox、Brave、Vivaldi 或 Opera，也可以交给系统默认浏览器。
- **Markdown 笔记**：全幅编辑画布与可收起的笔记列表，支持编辑 / 双栏 / 预览三种视图、格式工具栏、搜索、自动保存、字数统计，以及表格、任务列表、代码块等常用语法。每篇内置笔记都是笔记文件夹中的独立 `.md` 文件，可用其他编辑器直接打开；笔记列表底部的“笔记文件夹”按钮可打开所在目录。编辑器支持直接从剪贴板粘贴图片：图片保存到笔记文件夹的 `img/<笔记名>/` 下，并在正文中插入相对路径引用；打开的外部文件则保存到该文件所在目录的 `img/<文件名>/` 下。安装后还可从资源管理器右键打开外部 `.md` / `.markdown` 文件，并在工作台内写回原文件；文档中以相对路径引用的图片会按文件所在目录解析显示。
- **托盘运行**：点击窗口右上角关闭按钮只会隐藏到系统托盘，工作台继续在后台运行；右键托盘图标选择“退出”才会完全退出。
- **本地优先**：无需账号，工作台数据保存在本机；从托盘退出时还会做一次同步落盘。
- **浅色主题**：所有颜色经由语义化 CSS 变量提供，功能组件与主题样式解耦。

| 待办清单 | 快捷链接 |
| --- | --- |
| ![待办清单](docs/screenshots/todos.png) | ![快捷链接](docs/screenshots/links.png) |

![Markdown 笔记](docs/screenshots/notes.png)

## 快速开始

环境要求：Node.js >= 22.12，pnpm 12（项目锁定 `pnpm@12.4.2`）。

```bash
pnpm install
pnpm dev
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Vite 开发服务器与 Electron，支持渲染层热更新 |
| `pnpm typecheck` | 分别检查主进程与渲染层 TypeScript |
| `pnpm build` | 类型检查并生成生产构建到 `out/` |
| `pnpm start` | 用 Electron 预览生产构建（仍使用开发数据目录） |
| `pnpm package:win` | 生成 Windows NSIS 安装包到 `release/` |

> Electron 的运行时二进制默认从 GitHub 下载。仓库内的 `.npmrc` 已配置 npmmirror 镜像以加快安装；如需换回官方源，删除其中 `electron_mirror` 一行即可。打包配置使用本机 `node_modules/electron/dist`，因此无需再次下载 Electron。

打包完成后：

- 安装包：`release/栖木工作台 Setup 0.2.0.exe`
- 免安装运行：`release/win-unpacked/栖木工作台.exe`

当前安装包未进行代码签名。在本机自用没有问题；正式对外分发时建议配置 Windows 代码签名证书，以减少 SmartScreen 提示。

首次打开会自动放入一组可自由修改或删除的示例待办、快捷链接，并在 `notes/` 目录生成两篇真实的 Markdown 说明笔记。

### 用栖木工作台打开 Markdown 文件

安装包会为 `.md` 和 `.markdown` 注册文件关联：

1. 在资源管理器中右键 Markdown 文件，选择 **使用栖木工作台打开**。
2. 也可以在 **打开方式** 中选择 **栖木工作台**，或将它设为默认应用。
3. 文件打开后会在左侧“已打开的文件”中出现，编辑内容会自动写回原文件；文档中的相对路径图片会按原文件目录解析。点击标题右侧的关闭按钮可回到笔记库。

Windows 10 / 11 的默认应用由系统保护，安装程序只能注册应用，不能静默替换已有的默认打开方式。若设置为默认应用，请在系统设置中确认。Windows 11 若在精简右键菜单里看不到自定义项，可在“显示更多选项”中查看。卸载时会清理本应用注册的右键菜单与文件关联。

### 关闭到托盘

点击窗口右上角的关闭按钮不会退出应用，而是隐藏到 Windows 系统托盘：

- 左键单击托盘图标，或选择 **打开栖木工作台**，可恢复窗口。
- 右键托盘图标，选择 **退出**，才会真正结束进程。
- 在托盘运行期间，快捷链接、文件关联等仍然可用；再次从资源管理器打开 Markdown 文件会恢复窗口并打开文件。

## 数据与安全

### 开发 / 生产数据隔离

两个环境使用各自独立的目录、Chromium 会话与单实例锁，可以同时运行而互不影响：

| 环境 | 数据目录 |
| --- | --- |
| 生产环境（安装包 / `win-unpacked`） | `~/.qimu-workbench` |
| 开发环境（`pnpm dev` / `pnpm start`） | `~/.qimu-workbench-dev` |

内置笔记保存在各自目录下的 `notes/*.md`，每篇一个真实 Markdown 文件；`workspace.json` 只保存待办、快捷链接和笔记索引（ID、标题、文件名、时间），不再保存笔记正文。粘贴的图片保存在 `notes/img/<笔记名>/`，以笔记文件为基准写入相对路径引用。Windows 上 `~` 即 `%USERPROFILE%`；环境由 Electron 的 `app.isPackaged` 判定。

```text
~/.qimu-workbench/
├─ workspace.json          待办、快捷链接、笔记索引
├─ notes/
│  ├─ 欢迎来到栖木.md
│  ├─ Markdown 语法速查.md
│  └─ img/
│     └─ 欢迎来到栖木/
│        └─ image-20261108-012345-a1b2c3d4.png
└─ runtime/                Chromium 缓存、Local Storage、单实例锁等运行数据
```

- 保存策略：工作台索引约 380ms、外部 Markdown 文件约 420ms 防抖写入；从托盘退出或页面卸载时通过同步 IPC 补写，避免最后几个字符丢失；写入采用临时文件替换。待办的优先级与手动排序保存在 `workspace.json` 中，旧数据缺少优先级时会自动归为 P2。
- 笔记文件：标题变化时文件名会跟随更新；删除笔记会删除对应 `.md` 文件，并清理当前笔记名对应的图片目录；若 `workspace.json` 丢失，应用可从 `notes/` 目录恢复笔记。改名后的笔记会沿用改名前的图片目录，已写入的图片引用不会失效，新粘贴的图片则使用改名后的目录。在其他编辑器中修改文件后，重启工作台即可读取最新内容。
- 运行数据：`runtime/` 只存放 Chromium 缓存和运行时状态，关闭应用后可安全清理，应用会自动重建；它不包含待办、链接或笔记正文。
- 进程隔离：渲染层不开启 Node.js，启用 `contextIsolation` 与沙箱，只通过 preload 暴露最小 API。
- 文件保护：从系统打开的外部 Markdown 文件由主进程读取并登记；渲染层只能凭本次打开的文档 ID 保存内容，不能构造任意文件路径或写入其他文件。内置笔记文件名也由主进程校验，避免路径穿越。
- 图片保护：`qimu-file` 协议只对当前已打开的文档或已落盘的笔记提供图片，按文档 / 笔记目录解析相对路径，并只允许常见图片扩展名，不能作为通用文件读取接口；笔记图片还会限制在笔记目录内，避免路径穿越。
- 图片粘贴：主进程只接受渲染层通过当前笔记 / 已打开文件 ID 发来的图片数据，文件名、目录和扩展名均由主进程按图片文件头生成；支持 PNG、JPEG、GIF、WebP、AVIF、BMP、ICO，单张不超过 32 MB。
- 链接保护：只接受 `http://` / `https://` 地址；浏览器打开目标只能来自主进程探测到的可执行文件，渲染层无法传入任意命令路径；Markdown 预览经 DOMPurify 清洗，外部链接交给系统打开。
- 浏览器探测：优先检查各平台常见安装路径，Windows 下再通过注册表 `App Paths` 兜底，结果在本次运行内缓存。

## 目录结构

```text
src/
├─ shared/                 纯类型与共享契约（无 Electron 依赖）
│  ├─ types.ts             Todo / QuickLink / MarkdownNote / 外部文件契约
│  ├─ priorities.ts        待办优先级 P0–P3 与校验
│  ├─ assets.ts            外部 Markdown 图片的协议地址
│  ├─ api.ts               preload API 与 IPC channel 契约
│  └─ defaults.ts          首次启动内容
├─ main/                   主进程
│  ├─ index.ts             窗口、安全策略、IPC 注册
│  ├─ data-paths.ts        开发/生产数据目录
│  ├─ store.ts             工作台索引、笔记文件同步与恢复
│  ├─ note-files.ts        内置笔记的 .md 文件读写与文件名规则
│  ├─ note-images.ts       笔记图片的保存与读取
│  ├─ image-files.ts       图片格式识别、目录读取与写入
│  ├─ external-files.ts    外部 Markdown 文件读取、保存与路径白名单
│  └─ browsers.ts          已安装浏览器探测与指定浏览器打开
├─ preload/                类型化 contextBridge
└─ renderer/src/
   ├─ app/                 应用壳、侧边栏、顶栏、WorkspaceProvider、OpenFilesProvider
   ├─ features/            业务模块，彼此独立
   │  ├─ overview/
   │  ├─ todos/
   │  ├─ links/
   │  └─ notes/
   ├─ components/
   │  ├─ ui/               Button、Modal、Toast、Segmented、PriorityBadge 等
   │  └─ layout/           PageHeader、BrandMark
   ├─ services/desktop.ts  渲染层唯一与 Electron 通信的入口
   ├─ hooks/               可复用 React hooks
   ├─ lib/                 格式化、URL、Markdown、优先级等纯函数
   ├─ theme/               ThemeProvider 与主题注册表
   └─ styles/
      ├─ tokens.css        字体、间距、圆角、动效等非颜色 token
      ├─ tones.css         快捷链接品牌色
      ├─ base.css          全局重置
      └─ themes/light.css  当前浅色主题的语义颜色 token
```

### 分层原则

1. **业务与 UI 分离**：业务组件只消费 `useWorkspace()` 提供的状态与 action；通用交互放在 `components/ui`，页面骨架放在 `components/layout`。
2. **功能模块独立**：每个 feature 拥有自己的视图、局部组件与样式；总览只通过统一的 action 和导航回调触达其他模块。
3. **桌面能力隔离**：feature 不直接访问 `window.workbench`，统一经过 `services/desktop.ts`。以后做 Web / 移动端时，可直接替换这一层实现。
4. **主题与组件解耦**：组件样式只引用语义变量（如 `--color-surface`、`--color-accent`），不直接写浅色值。

### 添加新主题

1. 复制 `src/renderer/src/styles/themes/light.css` 为新主题文件，覆盖同名语义变量。
2. 在 `main.tsx` 引入新主题样式。
3. 在 `theme/ThemeProvider.tsx` 的 `THEMES` 注册表中增加主题项。

现有组件无需改动。若新增功能需要新的颜色，同样在主题文件中补充语义 token，而不是在组件 CSS 中写死颜色。

## 当前范围

当前针对桌面端实现，并在 Windows 上验证。主进程已包含 macOS / Linux 的常见浏览器路径，但窗口控制样式目前以 Windows 的无边框标题栏为默认目标；未来扩展移动或 Web 端时，渲染层业务模块可以复用，Electron 相关的 `main/`、`preload/` 与 `services/desktop.ts` 需要替换为对应平台的实现。
