# Rmusic

一个使用 Tauri 和 Vue.js 构建的现代跨平台桌面音乐播放器。

[English](README.md) | [中文](README_zh.md)

![GitHub License](https://img.shields.io/github/license/xudong7/tauri-rmusic)
![GitHub release](https://img.shields.io/github/v/release/xudong7/tauri-rmusic)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)
![Vue](https://img.shields.io/badge/Vue.js-3.5-green)

## 屏幕截图

![截图](/screenshots/image-1.png)

![截图](/screenshots/image-2.png)

![截图](/screenshots/image-3.png)

![截图](/screenshots/image-4.png)

> **注意**: 如果需要在线听歌功能，需要同时启动[KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)和[NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup)两个本地代理服务器。

## 在线音乐功能

Rmusic 现已支持在线音乐播放功能，您可以：

- 搜索并播放酷狗音乐平台的歌曲
- 在应用程序内切换本地音乐和在线音乐
- 享受无缝的音乐播放体验，即使在不同页面之间切换

### 使用方法

1. 先下载并启动 [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) 和 [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) 本地代理服务器
2. 确保 **NeteaseCloudMusicApiBackup** 运行在 `http://localhost:3000`，**KuGouMusicApi** 运行在 `http://localhost:3001`
3. 在 Rmusic 中点击导航菜单进入"在线音乐"页面
4. 输入关键词搜索歌曲并播放

## 免责声明

1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途!
2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产 生的版权数据。
3. 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停 工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
4. 禁止在违反当地法律法规的情况下使用本项目。 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本 项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。
5. 音乐平台不易，请尊重版权，支持正版。
6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。
7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。

## 功能特点

- **跨平台**: 支持 Windows、macOS 和 Linux
- **轻量级**: 使用 Rust 和 Tauri 构建，性能优异
- **音乐文件夹扫描**: 自动扫描和索引您的音乐库
- **文件格式支持**: 播放 MP3、WAV、OGG 和 FLAC 音频格式
- **美观界面**: 使用 Vue.js 和 Element Plus 构建的清晰直观的用户界面
- **音量控制**: 使用滑块轻松调节播放音量
- **在线音乐**: 通过酷狗音乐 API 和网易云音乐 API 搜索和播放在线音乐
- **持续播放**: 在不同页面间切换时保持音乐播放状态
- **深色模式**: 支持深色模式，适合低光环境下使用
- **沉浸模式**: 全屏播放界面，展示精美专辑封面和歌词
- **歌词支持**: 显示本地和在线音乐的同步歌词
- **音乐下载**: 下载在线音乐到本地存储，包含封面和歌词
- **系统托盘**: 最小化到系统托盘，快速访问控制
- **键盘快捷键**: 支持空格键（播放/暂停）和方向键（上一首/下一首）
- **设置窗口**: 专用设置界面，配置主题和下载偏好
- **自动主题**: 根据时间自动切换浅色和深色主题

## 技术栈

- **前端**: Vue.js 3, Element Plus UI, Vue Router, Pinia (状态管理)
- **后端**: Rust, Tauri 2.0
- **音频播放**: Rodio (Rust 音频播放库)
- **HTTP 客户端**: Reqwest (用于在线音乐 API)
- **异步运行时**: Tokio (Rust 异步操作)
- **构建工具**: Vite, Cargo
- **UI 组件**: Element Plus Icons, 自定义 CSS
- **打包**: Tauri bundler 跨平台分发

## 快速开始

### 前置条件

- Node.js (v16 或更高版本)
- Rust 和 Cargo
- npm 或 yarn

### 安装

1. 克隆仓库 ```bash
   git clone https://github.com/xudong7/tauri-rmusic.git
   cd rmusic

   ```

   ```

2. 安装依赖

   ```bash
   npm install
   ```

3. 运行开发版本

   ```bash
   npm run tauri dev
   ```

### 生产环境构建

为当前平台构建应用程序:

```bash
npm run tauri build
```

构建后的应用将位于 `src-tauri/target/release` 目录中。

## 使用方法

1. **启动应用程序**
2. **本地音乐**:
   - 点击"选择音乐文件夹"选择包含音乐文件的目录
   - 应用程序将扫描选定文件夹中支持的音频文件
   - 点击列表中的歌曲开始播放
3. **在线音乐**:
   - 使用标题导航栏进入"在线音乐"页面
   - 使用关键词搜索歌曲
   - 点击播放按钮在线播放音乐
   - 使用下载按钮将歌曲保存到本地
4. **播放控制**:
   - 使用播放控制来播放、暂停和调节音量
   - 使用空格键切换播放/暂停
   - 使用方向键切换到上一首/下一首
5. **沉浸模式**:
   - 点击播放栏中的专辑封面进入全屏沉浸模式
   - 查看同步歌词并享受美丽的视觉效果
6. **设置**:
   - 点击设置图标打开偏好设置窗口
   - 自定义主题、下载位置和其他偏好设置

## 贡献

我们热烈欢迎社区贡献者加入 Rmusic 项目！🎵

### 如何贡献

我们欢迎各种形式的贡献，包括但不限于：

- **🐛 Bug 修复**: 发现并修复项目中的错误
- **✨ 新功能**: 实现新的音乐播放功能或用户界面改进
- **📝 文档完善**: 改进README、注释或添加使用教程
- **🎨 UI/UX 优化**: 界面设计改进和用户体验优化
- **🌍 国际化**: 添加多语言支持
- **🧪 测试**: 编写单元测试或集成测试
- **💡 建议**: 在 Issues 中提出功能建议或改进意见

### 参与步骤

1. **Fork 本仓库**到您的 GitHub 账户
2. **创建功能分支**: `git checkout -b feature/amazing-feature`
3. **提交更改**: `git commit -m 'Add some amazing feature'`
4. **推送到分支**: `git push origin feature/amazing-feature`
5. **提交 Pull Request**

### 代码规范

- 遵循现有的代码风格和命名约定
- 为新功能编写清晰的注释
- 确保代码通过现有测试
- 对于重大更改，请先创建 Issue 讨论

### 开发环境设置

请参考 [快速开始](#快速开始) 部分设置开发环境。

感谢每一位贡献者让 Rmusic 变得更好！❤️

## TODO

- [ ] **重复模式**: 单曲循环、播放列表循环和随机播放模式
- [x] **增强的设置窗口**:
  - [x] 音乐库扫描偏好设置
  - [x] 缓存管理选项
- [ ] **主题自定义**: 自定义配色方案和强调色
- [ ] **语言支持**: 国际化 (i18n) 支持多种语言
- [ ] **更多音乐源**: 集成其他音乐流媒体 API
- [ ] **导入/导出**: 备份和恢复音乐库和播放列表
- [ ] **通知支持**: 正在播放的通知和控制

## 许可证

该项目采用 MIT 许可证 - 详情请查看 LICENSE 文件。

## 致谢

- [Tauri](https://tauri.app/) - 用于构建桌面应用程序的框架
- [Vue.js](https://vuejs.org/) - 前端框架
- [Rodio](https://github.com/RustAudio/rodio) - 音频播放功能
- [Element Plus](https://element-plus.org/) - UI 组件
- [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) - 启用在线音乐功能
- [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) - 启用在线音乐功能
