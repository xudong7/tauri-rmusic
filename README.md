# Rmusic

A modern cross-platform desktop music player built with Tauri and Vue.js.

[English](README.md) | [中文](README_zh.md)

![GitHub License](https://img.shields.io/github/license/xudong7/tauri-rmusic)
![GitHub release](https://img.shields.io/github/v/release/xudong7/tauri-rmusic)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue)
![Vue](https://img.shields.io/badge/Vue.js-3.5-green)

## Screenshots

![Screenshot](/screenshots/image-1.png)

![Screenshot](/screenshots/image-2.png)

![Screenshot](/screenshots/image-3.png)

![Screenshot](/screenshots/image-4.png)

> **Note**: If you need online music functionality, you need to start [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) and [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) at the same time.

## Online Music Feature

Rmusic now supports online music streaming. You can:

- Search and play songs from the KuGou music platform
- Switch between local music and online music within the application
- Enjoy seamless music playback experience even when switching between different pages

### How to Use

1. First download and start the [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) and [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) local proxy server
2. Make sure **NeteaseCloudMusicApiBackup** is running on <http://localhost:3000> and **KuGouMusicApi** is running on <http://localhost:3001>
3. In Rmusic, click the navigation menu to enter the "Online Music" page
4. Enter keywords to search for songs and play them

## Disclaimer

1. This project is for learning purposes only. Please respect copyright and do not use this project for commercial activities or illegal purposes!
2. Copyright data may be generated during the use of this project. For this copyright data, this project does not own them. To avoid infringement, users must clear the copyright data generated during the use of this project within 24 hours.
3. Users are responsible for any direct, indirect, special, incidental or consequential damages (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses) arising from the use of this project or from this agreement or from the use or inability to use this project.
4. It is prohibited to use this project in violation of local laws and regulations. The user shall be responsible for any illegal acts caused by using this project knowingly or unknowingly when local laws and regulations do not allow it, and this project shall not bear any direct, indirect, special, incidental or consequential liability arising therefrom.
5. Music platforms are not easy, please respect copyright and support genuine versions.
6. This project is only used to explore and research technical feasibility, and does not accept any commercial (including but not limited to advertising, etc.) cooperation and donations.
7. If the official music platform feels that this project is inappropriate, you can contact this project to change or remove it.

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **Lightweight**: Built with Rust and Tauri for optimal performance
- **Music Folder Scanning**: Automatically scans and indexes your music library
- **File Format Support**: Plays MP3, WAV, OGG, and FLAC audio formats
- **Beautiful Interface**: Clean and intuitive UI built with Vue.js and Element Plus
- **Volume Control**: Easily adjust playback volume with slider
- **Online Music**: Search and play online music through KuGou Music API and NetEase Cloud Music API
- **Continuous Playback**: Maintains music playback state when switching between different pages
- **Dark Mode**: Supports dark mode for better user experience in low-light environments
- **Immersive Mode**: Full-screen playback with beautiful album art and lyrics display
- **Lyrics Support**: Display synchronized lyrics for both local and online music
- **Music Download**: Download online music to local storage with cover art and lyrics
- **System Tray**: Minimize to system tray with quick access controls
- **Keyboard Shortcuts**: Support for space (play/pause) and arrow keys (next/previous)
- **Settings Window**: Dedicated settings interface for theme and download preferences
- **Auto Theme**: Automatically switch between light and dark themes based on time

## Technology Stack

- **Frontend**: Vue.js 3, Element Plus UI, Vue Router, Pinia (State Management)
- **Backend**: Rust, Tauri 2.0
- **Audio Playback**: Rodio (Rust audio playback library)
- **HTTP Client**: Reqwest (for online music APIs)
- **Async Runtime**: Tokio (for asynchronous operations in Rust)
- **Build Tools**: Vite, Cargo
- **UI Components**: Element Plus Icons, Custom CSS
- **Packaging**: Tauri bundler for cross-platform distribution

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- Rust and Cargo
- npm or yarn

### Installation

1. Clone the repository

   ```bash
   git clone https://github.com/yourusername/rmusic.git
   cd rmusic
   ```

2. Install dependencies

   ```bash
   npm install
   ```

3. Run the development version

   ```bash
   npm run tauri dev
   ```

### Building for Production

To build the application for your current platform:

```bash
npm run tauri build
```

The built application will be available in the `src-tauri/target/release` directory.

## Usage

1. **Launch the application**
2. **Local Music**:
   - Click "Choose Music Folder" to select a directory containing your music files
   - The application will scan the selected folder for supported audio files
   - Click on a song from the list to start playback
3. **Online Music**:
   - Navigate to the "Online Music" page using the header navigation
   - Search for songs using keywords
   - Click play button to stream music online
   - Use download button to save songs locally
4. **Playback Controls**:
   - Use the playback controls to play, pause, and adjust volume
   - Use space bar to toggle play/pause
   - Use arrow keys to skip to next/previous track
5. **Immersive Mode**:
   - Click the album art in the player bar to enter full-screen immersive mode
   - View synchronized lyrics and enjoy beautiful visual effects
6. **Settings**:
   - Click the settings icon to open preferences window
   - Customize theme, download location, and other preferences

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## TODO

- [ ] **Repeat Modes**: Single track repeat, playlist repeat, and shuffle modes
- [ ] **Enhanced Settings Window**:
  - [ ] Library scan preferences
  - [ ] Cache management options
- [ ] **Theme Customization**: Custom color schemes and accent colors
- [ ] **Language Support**: Internationalization (i18n) for multiple languages
- [ ] **More Music Sources**: Integration with additional music streaming APIs
- [ ] **Import/Export**: Backup and restore music library and playlists
- [ ] **Notification Support**: Now playing notifications with controls

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Tauri](https://tauri.app/) - For the framework to build the desktop application
- [Vue.js](https://vuejs.org/) - For the frontend framework
- [Rodio](https://github.com/RustAudio/rodio) - For audio playback capabilities
- [Element Plus](https://element-plus.org/) - For UI components
- [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) - For enabling online music functionality
- [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) - For enabling online music functionality
