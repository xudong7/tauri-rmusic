# Rmusic

一个使用 Tauri 和 Vue.js 构建的现代跨平台桌面音乐播放器。

## 屏幕截图

![截图](/screenshots/image.png)

![截图](/screenshots/image-1.png)

![截图](/screenshots/image-2.png)

![截图](/screenshots/image-3.png)

![截图](/screenshots/image-4.png)

[English Documentation](README.md)

p.s. 如果需要在线听歌功能，需要同时启动[KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)

## 在线音乐功能

Rmusic 现已支持在线音乐播放功能，您可以：

- 搜索并播放酷狗音乐平台的歌曲
- 在应用程序内切换本地音乐和在线音乐
- 享受无缝的音乐播放体验，即使在不同页面之间切换

### 使用方法

1. 先下载并启动 [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) 本地代理服务器
2. 确保其在 <http://localhost:3000> 端口运行
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
- **简洁界面**: 使用 Vue.js 和 Element Plus 构建的清晰直观的用户界面
- **音量控制**: 轻松调节播放音量
- **在线音乐**: 通过酷狗音乐API搜索和播放在线音乐
- **持续播放**: 在不同页面间切换时保持音乐播放状态
- **深色模式**: 支持深色模式，适合低光环境下使用

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
6. 对于在线音乐，导航到"在线音乐"页面，搜索歌曲并播放

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

该项目采用 MIT 许可证 - 详情请查看 LICENSE 文件。

## 致谢

- [Tauri](https://tauri.app/) - 用于构建桌面应用程序的框架
- [Vue.js](https://vuejs.org/) - 前端框架
- [Rodio](https://github.com/RustAudio/rodio) - 音频播放功能
- [Element Plus](https://element-plus.org/) - UI 组件
- [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) - 启用在线音乐功能
