# RMusic: 轻量级跨平台音乐播放器，让音乐播放回归简约与优雅

向大家介绍我的开源项目 **RMusic** —— 一款使用 Tauri 和 Vue.js 构建的现代跨平台桌面音乐播放器。在当前主流音乐软件越来越臃肿、广告越来越多的今天，RMusic 旨在为用户提供一个简约、高效且注重隐私的音乐播放体验。

项目地址：[GitHub - RMusic](https://github.com/xudong7/tauri-rmusic)

## 项目背景

作为一名大二软件工程专业学生，我一直对新兴的编程语言和技术保持浓厚的兴趣。当接触到Rust这门语言时，为了更好地学习Rust并将理论知识应用到实践中，我决定挑战自己开发一个实用的桌面应用。

同时，作为一个热爱音乐的学生，我发现市面上的主流音乐软件虽然功能丰富，但往往伴随着大量的推荐、社交和广告功能，使得单纯的"听音乐"这一需求被各种复杂功能所掩盖。很多音乐播放器要么过于简陋，要么过于臃肿，很少有真正平衡良好的选择。

这两个因素促使我萌生了创建RMusic的想法 —— 一个由Rust驱动的现代音乐播放器。通过这个项目，我不仅能够提升自己的Rust编程能力，还能结合前端开发知识，打造一款真正符合个人需求的音乐应用。最终，RMusic成为了一款资源占用低、启动迅速、界面简洁的跨平台音乐播放器，也记录了我作为学生开发者的成长历程。

## 核心特性

### 1. 轻量与高性能

RMusic 基于 Tauri 框架开发，相比 Electron 等传统跨平台框架，应用体积小且运行时资源占用极低。得益于 Rust 的高性能特性，即使在低配置设备上也能流畅运行。

### 2. 双模式音乐体验

RMusic 不仅支持本地音乐播放，还可以连接在线音乐API，让您同时拥有离线和在线的音乐体验：

* **本地模式**：扫描并管理您的本地音乐库，支持MP3、WAV、OGG和FLAC等常见音频格式
* **在线模式**：通过酷狗音乐API搜索和播放海量在线音乐资源

### 3. 美观的用户界面

RMusic 使用 Vue.js 和 Element Plus 构建了直观且美观的用户界面：

* **沉浸式播放界面**：全屏模式下欣赏专辑封面和歌词
* **深色模式支持**：保护您的眼睛，适合夜间使用
* **自定义标题栏**：美观且功能齐全的窗口控制

### 4. 跨平台兼容性

本人在 Windows 和 Linux 上进行了充分测试，确保 RMusic 在这两个平台上都能流畅运行。macOS 由于本人没有设备，暂时未进行测试，但理论上也应支持。

## 实际效果展示

![image-1.png](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/e1f76b016fd6481a8bdcdc66797d05c0~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAgZHVuamlh:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiNDIwMjgwMjY0ODQ1NzkxNCJ9&rk3s=e9ecf3d6&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1746668136&x-orig-sign=j2maBPomzbUDJX53Z%2BvL4NHpIvk%3D)

![image-2.png](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/64747f3a39964c35b2c7437300fa99c4~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAgZHVuamlh:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiNDIwMjgwMjY0ODQ1NzkxNCJ9&rk3s=e9ecf3d6&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1746668146&x-orig-sign=Ghh9Wh8%2BKuvSdx3q2Euqs%2F8brlM%3D)

*RMusic 沉浸式播放模式*

![image-3.png](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/79e80020d6eb4a4e802f47c70eec6028~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAgZHVuamlh:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiNDIwMjgwMjY0ODQ1NzkxNCJ9&rk3s=e9ecf3d6&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1746668153&x-orig-sign=CBYkq42KGFW6GPhLcPu09ONaEKc%3D)

*RMusic 深色主题模式*

![image-4.png](https://p0-xtjj-private.juejin.cn/tos-cn-i-73owjymdk6/baf0d40b2c9049c5b3dd0880056002d7~tplv-73owjymdk6-jj-mark-v1:0:0:0:0:5o6Y6YeR5oqA5pyv56S-5Yy6IEAgZHVuamlh:q75.awebp?policy=eyJ2bSI6MywidWlkIjoiNDIwMjgwMjY0ODQ1NzkxNCJ9&rk3s=e9ecf3d6&x-orig-authkey=f32326d3454f2ac7e96d3d06cdbb035152127018&x-orig-expires=1746668161&x-orig-sign=%2FxP9FyOSaOzFwySRqPvvbp0CF5g%3D)

*RMusic 亮色主题模式*

## 技术亮点

作为一个技术驱动的项目，RMusic 在实现过程中采用了多项现代化技术：

### 前端技术栈

* **Vue.js 3**：采用 Composition API，代码组织更加清晰
* **Element Plus**：美观且功能丰富的UI组件库

### 后端技术栈

* **Rust**：安全且高性能的系统编程语言
* **Tauri**：比Electron更轻量的跨平台框架
* **Rodio**：Rust生态中强大的音频播放库
* **Tokio**：高性能的异步运行时

### 架构设计

RMusic 采用前后端分离的架构，前端负责UI渲染和用户交互，后端处理文件操作、音频播放和网络请求等底层功能。两者通过Tauri提供的API进行通信，既保证了界面的响应速度，又确保了核心功能的高效执行。

## 使用指南

### 本地音乐播放

1. 启动应用后，点击左上角的"选择目录"按钮
2. 选择您的音乐文件夹，RMusic会自动扫描支持的音频文件
3. 点击歌曲列表中的任意歌曲即可开始播放
4. 使用底部控制栏调整音量、切换歌曲或暂停播放

### 在线音乐功能

要使用在线音乐功能，您需要：

1. 下载并启动 [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) 本地代理服务器
2. 确保其在 <http://localhost:3000> 端口运行
3. 在 RMusic 中点击顶部的模式切换按钮进入"在线音乐"模式
4. 在搜索框中输入关键词，搜索您喜爱的歌曲
5. 点击搜索结果中的歌曲即可立即播放

### 沉浸模式

想要获得更专注的音乐体验？点击播放控制栏左侧的封面图片，即可进入沉浸式播放界面，欣赏全屏封面和歌词。

## 开源与贡献

RMusic 是一个完全开源的项目，采用 MIT 许可证。我们欢迎社区的任何形式的贡献，包括但不限于：

* 功能建议和问题反馈
* 代码贡献和Bug修复
* 文档改进和翻译
* UI/UX设计优化

项目地址：[GitHub - RMusic](https://github.com/xudong7/tauri-rmusic)

## 免责声明

RMusic 项目仅供学习和个人使用，请尊重音乐版权，支持正版音乐平台。在线音乐功能仅用于技术研究和个人试听，请在24小时内删除相关音频文件，并购买正版音乐以支持音乐人。

***

欢迎在评论区分享您的想法和建议，也欢迎给项目点个Star！让我们一起，让音乐播放回归简约与优雅。
