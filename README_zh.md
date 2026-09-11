# Rmusic

基于 Tauri 2 与 Vue 3 的跨平台桌面音乐播放器，支持本地音频播放，并通过内置的网易云 API 代理浏览在线音乐。

[English](README.md) | [中文](README_zh.md)

[![License](https://img.shields.io/github/license/xudong7/tauri-rmusic)](LICENSE)
[![Release](https://img.shields.io/github/v/release/xudong7/tauri-rmusic)](https://github.com/xudong7/tauri-rmusic/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8DB?logo=tauri)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)](https://vuejs.org/)

---

## 目录

- [功能特点](#功能特点)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [在线音乐](#在线音乐)
- [使用说明](#使用说明)
- [贡献指南](#贡献指南)
- [开发规划](#开发规划)
- [免责声明](#免责声明)
- [许可证](#许可证)
- [致谢](#致谢)

---

## 功能特点

| 类别         | 说明                                                 |
| ------------ | ---------------------------------------------------- |
| **跨平台**   | Windows、macOS、Linux                                |
| **性能**     | Rust + Tauri，体积小、启动快                         |
| **本地播放** | 扫描文件夹，支持 MP3、WAV、OGG、FLAC                 |
| **在线搜索** | 单曲、歌手、专辑、歌单、排行榜五个页签，各自独立分页 |
| **在线浏览** | 打开歌单与专辑、浏览官方榜单，可直接整张列表顺序播放 |
| **歌手页**   | 热门歌曲与全部专辑，支持真正的分页                   |
| **界面**     | Vue 3 + Element Plus，支持亮色、暗色与暖色主题       |
| **播放**     | 音量、进度、循环、随机；歌词与全屏沉浸模式           |
| **便捷**     | 系统托盘、快捷键（空格、方向键）、带封面与歌词的下载 |
| **设置**     | 主题、下载路径、库扫描、缓存管理                     |

---

## 技术栈

| 层级 | 技术                                             |
| ---- | ------------------------------------------------ |
| 前端 | Vue 3、Element Plus、Vue Router、Pinia、Vue I18n |
| 后端 | Rust、Tauri 2.0                                  |
| 音频 | Rodio、Symphonia                                 |
| 网络 | Reqwest、Tokio                                   |
| 打包 | Vite、Cargo                                      |
| 测试 | Vitest、Vue Test Utils                           |

---

## 快速开始

### 环境要求

- **Node.js** 20+（Vitest 要求；Vite 6 需 18+）
- **Rust** 与 Cargo（[rustup](https://rustup.rs/)）
- 各平台所需的 Tauri 系统依赖，参见 [Tauri 环境准备](https://tauri.app/start/prerequisites/)

### 安装与运行

```bash
git clone https://github.com/xudong7/tauri-rmusic.git
cd tauri-rmusic
npm install
npm run tauri dev
```

请使用 `npm`——CI 也是这么做的（`npm ci` 搭配 `package-lock.json`）。

### 生产构建

```bash
npm run tauri build
```

输出目录：`src-tauri/target/release/`（可执行文件）；安装包在 `src-tauri/target/release/bundle/`。

### 常用脚本

| 命令                    | 说明                              |
| ----------------------- | --------------------------------- |
| `npm run tauri dev`     | 运行应用（Vite + Tauri 开发模式） |
| `npm run tauri build`   | 构建生产版本与安装包              |
| `npm run dev`           | 仅前端，在浏览器中运行            |
| `npm run build`         | 前端生产构建                      |
| `npm run typecheck`     | 用 `vue-tsc` 做类型检查           |
| `npm run test`          | 监听模式运行测试                  |
| `npm run test:run`      | 运行一次测试                      |
| `npm run test:coverage` | 运行测试并输出覆盖率              |
| `npm run format`        | 用 Prettier 格式化                |
| `npm run format:check`  | 只检查格式，不写入                |

---

## 在线音乐

在线功能开箱即用，**不需要手动安装或启动任何服务**。

Rmusic 将 [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) 作为 Tauri sidecar 一并打包，并在你首次搜索或播放在线音乐时按需拉起。它监听 `http://localhost:3000`，应用退出时随之关闭。

几点需要留意：

- **你已经在跑同一个代理？** 内置的 sidecar 会因端口 3000 被占用而启动失败，此时 Rmusic 会静默使用你自己的实例。若行为异常，关掉其中一个。
- **匿名访问。** 应用没有登录入口。标注为会员专享的曲目点击播放会失败，个人歌单、每日推荐、云盘也不在能力范围内。
- **Apple Silicon。** 内置代理目前是 x86_64 二进制，在 Apple Silicon 上通过 Rosetta 2 运行。

---

## 使用说明

1. **本地音乐** — 选择音乐文件夹，应用会扫描并列出支持的格式，点击曲目即可播放。
2. **在线音乐** — 打开在线音乐页面，选择页签：
   - **单曲** — 按关键词搜索
   - **歌手** — 可分页的歌手结果；歌手页同时列出热门歌曲与专辑
   - **专辑** — 点开专辑即可播放完整曲目
   - **歌单** — 搜索歌单并打开；「上一首 / 下一首」会按歌单顺序走
   - **排行榜** — 网易云官方榜单，点进去即为歌单详情
3. **播放控制** — 使用底部控制栏或快捷键：`空格`（播放/暂停）、`左/右方向键`（上一首/下一首）。
4. **沉浸模式** — 点击播放栏中的封面进入全屏，查看歌词与视觉效果。
5. **设置** — 配置主题、下载目录、扫描选项与缓存等。

---

## 贡献指南

欢迎任何形式的参与——修 bug、加功能、补文档、改翻译、写测试。

### 可以做的事

- **Bug 修复** — 提交 Issue 或 PR 修复问题。
- **新功能** — 播放逻辑或界面改进。改动较大时建议先开 Issue 讨论方案。
- **文档** — 完善 README、代码注释或使用说明。
- **UI/UX** — 布局、可访问性、操作流程优化。
- **国际化** — 新增或修订翻译。
- **测试** — 单元测试或集成测试。

### 开发环境

```bash
git clone https://github.com/<你的 fork>/tauri-rmusic.git
cd tauri-rmusic
npm install
npm run tauri dev
```

### 提 PR 之前

请确保下面三条通过——CI 不会替你发现这些问题：

```bash
npm run typecheck
npm run test:run
npm run format:check
```

改动 Rust 代码的话，还有一组 Rust 测试：

```bash
cd src-tauri && cargo test
```

另有一组需要本地 sidecar 在跑的实测，默认被忽略（因为它要求 `localhost:3000` 上有代理）：

```bash
cd src-tauri && cargo test --lib live_sidecar -- --ignored
```

### 分支与提交规范

从 `main` 切分支：

| 前缀             | 用途           |
| ---------------- | -------------- |
| `feat/<名称>`    | 新功能         |
| `fix/<名称>`     | Bug 修复       |
| `issue/<编号>`   | 对应某个 issue |
| `release/vX.Y.Z` | 发版准备       |

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，并且**用英文书写**：

```
feat(online): add playlist search
fix(player): stop the underline on artist links
```

本仓库常见的前缀：`feat`、`fix`、`refactor`、`style`、`test`、`chore`、`release`。

### 几个容易踩的约定

这几处从代码里不容易看出来，但改错了会很难查：

- **`src/api/types.ts` 里有两张表。** 新增 Tauri 命令必须**同时**加进 `TauriCommandParamsMap` 和 `TauriCommandResultMap`——`TauriCommand` 取的是两者交集，只加一张的话命令根本调不动。
- **新的 Rust 命令要在 `lib.rs` 注册。** 必须出现在 `generate_handler!` 列表里。漏了不会编译报错，而是运行时提示 "command not found"。
- **`src/locales/zh.ts` 与 `en.ts` 必须保持键完全一致。** `fallbackLocale` 是 `zh`，英文键缺失不会报错，而是静默显示中文。仓库里有测试专门守这条。
- **代码注释沿用中文**，与现有风格保持一致；提交信息用英文。
- **Element Plus 组件是在 `src/main.ts` 里逐个注册的**，不是 `app.use(ElementPlus)`。用了没注册的组件会渲染成空白，且没有任何报错。

请保持改动聚焦。如果为了修一个问题需要先做重构，把它拆成单独的提交，方便分别审查。

### 反馈问题与建议

直接在 Issue 中提出。报 bug 时附上版本号、平台与复现步骤，能省一轮来回。

---

## 开发规划

- [x] 循环与随机模式
- [x] 设置：库扫描、缓存
- [x] 在线歌单、专辑与排行榜
- [x] 歌手页：专辑列表与真正的分页
- [ ] 支持登录 —— 个人歌单、每日推荐、更高音质
- [ ] 内置代理的 arm64 构建（目前只有 x86_64）
- [ ] 主题自定义（强调色等）
- [ ] 更多语言国际化
- [ ] 更多音乐来源
- [ ] 音乐库与播放列表的导入/导出
- [ ] 正在播放系统通知

---

## 免责声明

<details>
<summary>法律与使用须知（点击展开）</summary>

1. 本项目仅供学习使用，请勿用于商业或非法用途，请尊重版权。
2. 使用过程中可能产生受版权保护的数据，本项目不拥有该数据。为降低侵权风险，请在使用后 24 小时内删除相关数据。
3. 因使用本项目而产生的任何直接、间接、特殊、偶然或后果性损害，作者不承担责任。
4. 请在符合当地法律的前提下使用本项目，用户须自行承担合规责任。
5. 请支持正版与官方音乐平台。
6. 本项目仅用于技术探索与研究，不接受任何商业合作或捐赠。
7. 若权利方认为本项目不妥，请联系维护者进行修改或移除。

</details>

---

## 许可证

[MIT](LICENSE)

---

## 致谢

- [Tauri](https://tauri.app/) — 桌面应用框架
- [Vue.js](https://vuejs.org/) — 前端框架
- [Rodio](https://github.com/RustAudio/rodio) — 音频播放
- [Symphonia](https://github.com/pdeljanov/Symphonia) — 音频解码
- [Element Plus](https://element-plus.org/) — UI 组件
- [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) — 网易云 API 代理
