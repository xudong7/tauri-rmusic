# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rmusic is a cross-platform desktop music player built with Tauri 2 and Vue 3. It plays local audio files (MP3, WAV, OGG, FLAC) and streams online music through NetEase API proxies.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (Vite + Tauri dev mode)
npm run tauri dev

# Build frontend only
npm run build

# Build production app
npm run tauri build
# Output: src-tauri/target/release/ (binary)
#         src-tauri/target/release/bundle/ (installers)

# Format code
npm run format

# Check formatting
npm run format:check
```

## Git Workflow

- **Feature branches**: Every feature development must start from a new branch checked out from `main` (e.g. `perf/`, `feat/`, `fix/` prefixes). Never develop directly on `main`.
- **Commits**: Commit automatically once a complete feature is finished — local commits need no confirmation. Commit per completed feature, not per edit.
- **Gate**: Pushing to remote, creating a PR, and merging/releasing into `main` must ONLY be done after the user explicitly instructs it — never proactively. Pushing always means opening a PR against remote `main`; never push directly to `main`.
- **Merge style**: When merging a PR, use **squash** merge.
- **Release**: Publishing a release is part of the merge — do both together, in the same approved step. Every PR bumps the version in all three files together: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. Merging to `main` makes CI build the three platforms and create tag `app-v<version>` plus a **draft** GitHub release; publishing that draft (`gh release edit app-v<version> --draft=false`) is the final step.
- **Cleanup**: Delete the feature branch (local and remote) after the merge is complete.

Note: Online music requires a local API proxy running at `http://localhost:3000` (see [nooblong/NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup)).

## Architecture

### Tech Stack

- **Frontend**: Vue 3 + TypeScript, Element Plus (UI), Pinia (state), Vue Router, Vue I18n
- **Backend**: Rust with Tauri 2, Rodio (audio playback), Reqwest (HTTP)
- **Build**: Vite (frontend), Cargo (Rust)

### Frontend Structure (`src/`)

```
src/
├── api/commands/    # Tauri IPC command handlers (file, music, netease, playlist)
├── components/      # Vue components organized by feature
│   ├── feature/     # Feature-specific: PlayerBar, MusicList, LyricView, ImmersiveView
│   └── layout/      # Layout: HeaderBar, Sidebar
├── composables/      # Vue composition functions
├── stores/          # Pinia stores (playerStore, localMusicStore, onlineMusicStore, playlistStore, themeStore)
├── views/           # Page components (LocalMusicView, OnlineMusicView, PlaylistView, SettingsView)
├── router/          # Vue Router config
├── locales/         # i18n translations (en.ts, zh.ts)
└── types/           # TypeScript interfaces
```

### Backend Structure (`src-tauri/src/`)

```
src-tauri/src/
├── lib.rs           # Tauri app setup, command registration
├── main.rs          # Binary entry point
├── music.rs         # Audio playback with Rodio
├── file.rs          # File system operations
├── netease.rs       # NetEase API integration
├── playlist.rs      # Playlist persistence
├── tray.rs          # System tray
└── service.rs       # Sidecar service setup
```

### State Management

Pinia stores manage application state:
- `playerStore.ts` - Playback state (current track, play/pause, volume, progress)
- `localMusicStore.ts` - Scanned local music library
- `onlineMusicStore.ts` - Online search results and streaming
- `playlistStore.ts` - User playlists
- `themeStore.ts` - Theme configuration (light/dark/auto)

### Tauri IPC

Frontend communicates with Rust backend via Tauri commands defined in `src/api/commands/`. Each module handles a domain: `file.ts` (scanning), `music.ts` (playback), `netease.ts` (API proxy), `playlist.ts` (CRUD).

### Window Configuration

The app uses a frameless window (decorations: false) with custom window controls in the HeaderBar component. Window state persists via `tauri-plugin-window-state`.

## Key Patterns

- **Composables**: Use Vue composables in `src/composables/` for reusable logic (e.g., keyboard shortcuts, audio controls)
- **i18n**: Translation keys in `src/locales/en.ts` and `src/locales/zh.ts`
- **Keyboard shortcuts**: Space (play/pause), Left/Right arrows (prev/next)
