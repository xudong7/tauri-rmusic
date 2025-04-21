# Rmusic

A modern cross-platform desktop music player built with Tauri and Vue.js.

[中文文档](README_zh.md)

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **Lightweight**: Built with Rust and Tauri for optimal performance
- **Music Folder Scanning**: Automatically scans and indexes your music library
- **File Format Support**: Plays MP3, WAV, OGG, and FLAC audio formats
- **Simple Interface**: Clean and intuitive UI built with Vue.js and Element Plus
- **Volume Control**: Easily adjust playback volume

## Technology Stack

- **Frontend**: Vue.js 3, Element Plus UI
- **Backend**: Rust, Tauri
- **Audio Playback**: Rodio (Rust audio playback library)
- **Tokio**: For asynchronous runtime in Rust
- **Build Tools**: Vite, Cargo

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

1. Launch the application
2. Click "Choose Music Folder" to select a directory containing your music files
3. The application will scan the selected folder for supported audio files
4. Click on a song from the list to start playback
5. Use the playback controls to play, pause, and adjust volume

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Tauri](https://tauri.app/) - For the framework to build the desktop application
- [Vue.js](https://vuejs.org/) - For the frontend framework
- [Rodio](https://github.com/RustAudio/rodio) - For audio playback capabilities
- [Element Plus](https://element-plus.org/) - For UI components

