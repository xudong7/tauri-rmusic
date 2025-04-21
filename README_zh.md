# Rmusic

一个使用 Tauri 和 Vue.js 构建的现代跨平台桌面音乐播放器。

[English Documentation](README.md)

## 功能特点

- **跨平台**: 支持 Windows、macOS 和 Linux
- **轻量级**: 使用 Rust 和 Tauri 构建，性能优异
- **音乐文件夹扫描**: 自动扫描和索引您的音乐库
- **文件格式支持**: 播放 MP3、WAV、OGG 和 FLAC 音频格式
- **简洁界面**: 使用 Vue.js 和 Element Plus 构建的清晰直观的用户界面
- **音量控制**: 轻松调节播放音量

## 技术栈

- **前端**: Vue.js 3, Element Plus UI
- **后端**: Rust, Tauri
- **音频播放**: Rodio (Rust 音频播放库)
- **异步运行时**: Tokio
- **构建工具**: Vite, Cargo

## 快速开始

### 前置条件

- Node.js (v16 或更高版本)
- Rust 和 Cargo
- npm 或 yarn

### 安装

1. 克隆仓库
   ```bash
   git clone https://github.com/yourusername/rmusic.git
   cd rmusic
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

1. 启动应用程序
2. 点击"选择音乐文件夹"选择包含音乐文件的目录
3. 应用程序将扫描选定文件夹中支持的音频文件
4. 点击列表中的歌曲开始播放
5. 使用播放控制来播放、暂停和调节音量

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

该项目采用 MIT 许可证 - 详情请查看 LICENSE 文件。

## 致谢

- [Tauri](https://tauri.app/) - 用于构建桌面应用程序的框架
- [Vue.js](https://vuejs.org/) - 前端框架
- [Rodio](https://github.com/RustAudio/rodio) - 音频播放功能
- [Element Plus](https://element-plus.org/) - UI 组件