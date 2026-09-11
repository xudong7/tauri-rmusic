# Rmusic

A modern, lightweight cross-platform desktop music player built with Tauri 2 and Vue 3. Play local audio files and browse online music through a bundled NetEase API proxy.

[English](README.md) | [中文](README_zh.md)

[![License](https://img.shields.io/github/license/xudong7/tauri-rmusic)](LICENSE)
[![Release](https://img.shields.io/github/v/release/xudong7/tauri-rmusic)](https://github.com/xudong7/tauri-rmusic/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8DB?logo=tauri)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)](https://vuejs.org/)

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Online Music](#online-music)
- [Usage](#usage)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Disclaimer](#disclaimer)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Features

| Category            | Description                                                                         |
| ------------------- | ----------------------------------------------------------------------------------- |
| **Cross-platform**  | Windows, macOS, Linux                                                               |
| **Performance**     | Rust + Tauri for minimal footprint and fast startup                                 |
| **Local playback**  | Scan folders; play MP3, WAV, OGG, FLAC                                              |
| **Online search**   | Five tabs — songs, artists, albums, playlists, charts — each paging independently   |
| **Online browsing** | Open playlists and albums, browse the official charts, play straight through a list |
| **Artist pages**    | Popular songs and full discography, with pagination                                 |
| **UI**              | Vue 3 + Element Plus; light, dark, and warm themes                                  |
| **Playback**        | Volume, progress, repeat, shuffle; lyrics and immersive full-screen mode            |
| **Convenience**     | System tray, keyboard shortcuts (space, arrows), download with cover and lyrics     |
| **Settings**        | Theme, download path, library scan, cache management                                |

---

## Technology Stack

| Layer     | Technologies                                     |
| --------- | ------------------------------------------------ |
| Frontend  | Vue 3, Element Plus, Vue Router, Pinia, Vue I18n |
| Backend   | Rust, Tauri 2.0                                  |
| Audio     | Rodio, Symphonia                                 |
| Network   | Reqwest, Tokio                                   |
| Packaging | Vite, Cargo                                      |
| Testing   | Vitest, Vue Test Utils                           |

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (required by Vitest; Vite 6 needs 18+)
- **Rust** and Cargo ([rustup](https://rustup.rs/))
- Platform-specific Tauri dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

### Install and Run

```bash
git clone https://github.com/xudong7/tauri-rmusic.git
cd tauri-rmusic
npm install
npm run tauri dev
```

Use `npm` — it is what CI uses (`npm ci` against `package-lock.json`).

### Build for Production

```bash
npm run tauri build
```

Output: `src-tauri/target/release/` (binary); installers in `src-tauri/target/release/bundle/`.

### Scripts

| Command                 | Description                            |
| ----------------------- | -------------------------------------- |
| `npm run tauri dev`     | Run the app (Vite + Tauri in dev mode) |
| `npm run tauri build`   | Build a production app and installers  |
| `npm run dev`           | Frontend only, in a browser            |
| `npm run build`         | Frontend production build              |
| `npm run typecheck`     | Type-check with `vue-tsc`              |
| `npm run test`          | Run tests in watch mode                |
| `npm run test:run`      | Run tests once                         |
| `npm run test:coverage` | Run tests with coverage                |
| `npm run format`        | Format with Prettier                   |
| `npm run format:check`  | Check formatting without writing       |

---

## Online Music

Online features work out of the box — there is no separate service to install or start by hand.

Rmusic bundles [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) as a Tauri sidecar and launches it on demand, the first time you search or play something online. It listens on `http://localhost:3000` and is stopped when the app exits.

Worth knowing:

- **Already running the proxy yourself?** The bundled sidecar will fail to bind port 3000 and Rmusic will silently fall back to your instance. Stop one of them if the behaviour seems off.
- **Anonymous access.** There is no sign-in. Tracks that require a NetEase membership will fail to play, and personal playlists, daily recommendations, and cloud storage are out of reach.
- **Apple Silicon.** The bundled proxy ships as an x86_64 binary and runs under Rosetta 2.

---

## Usage

1. **Local music** — Choose a music folder; the app scans and lists supported formats. Click a track to play.
2. **Online music** — Open the Online Music page and pick a tab:
   - **Songs** — search by keyword
   - **Artists** — paginated artist results, and artist pages list albums alongside popular songs
   - **Albums** — open an album to play its full track list
   - **Playlists** — search playlists and open one; next/previous follow the playlist order
   - **Charts** — the official NetEase charts, each opening as a playlist
3. **Playback** — Use the bottom bar or shortcuts: `Space` (play/pause), `Left`/`Right` (previous/next).
4. **Immersive mode** — Click the cover in the player bar for full-screen lyrics and visuals.
5. **Settings** — Change theme, download directory, scan options, and cache.

---

## Contributing

Contributions are welcome — bug fixes, features, documentation, translations, and tests alike.

### Ways to Help

- **Bug fixes** — Report or fix issues.
- **Features** — New playback or UI improvements. For anything large, open an Issue first so we can agree on the approach.
- **Docs** — README, code comments, or guides.
- **UI/UX** — Layout, accessibility, and workflow improvements.
- **i18n** — New or updated translations.
- **Tests** — Unit or integration tests.

### Development Setup

```bash
git clone https://github.com/<your-fork>/tauri-rmusic.git
cd tauri-rmusic
npm install
npm run tauri dev
```

### Before You Open a Pull Request

Run these three and make sure they pass — CI will not catch them for you:

```bash
npm run typecheck
npm run test:run
npm run format:check
```

Rust changes also have their own tests:

```bash
cd src-tauri && cargo test
```

There is a second Rust test group that runs against a live sidecar. It is ignored by default because it needs the proxy on `localhost:3000`:

```bash
cd src-tauri && cargo test --lib live_sidecar -- --ignored
```

### Branch and Commit Conventions

Branch from `main`:

| Prefix           | Use for                          |
| ---------------- | -------------------------------- |
| `feat/<name>`    | New features                     |
| `fix/<name>`     | Bug fixes                        |
| `issue/<number>` | Work tracked by a specific issue |
| `release/vX.Y.Z` | Release preparation              |

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are written **in English**:

```
feat(online): add playlist search
fix(player): stop the underline on artist links
```

Common prefixes in this repo: `feat`, `fix`, `refactor`, `style`, `test`, `chore`, `release`.

### Project Conventions Worth Knowing

A few things that are easy to get wrong and are not obvious from the code:

- **`src/api/types.ts` has two maps.** A new Tauri command must be added to both `TauriCommandParamsMap` and `TauriCommandResultMap` — `TauriCommand` is their intersection, so adding it to only one leaves the command uncallable.
- **Register new Rust commands in `lib.rs`.** They must appear in the `generate_handler!` list. A missing entry does not fail the build; it fails at runtime as "command not found".
- **`src/locales/zh.ts` and `en.ts` must stay in key parity.** `fallbackLocale` is `zh`, so a missing English key silently renders Chinese instead of erroring. There is a test that enforces this.
- **Comments are written in Chinese** throughout the codebase, matching the existing style. Commit messages are English.
- **Element Plus components are registered one by one** in `src/main.ts`, not via `app.use(ElementPlus)`. Using a component that is not in that list renders nothing at all — with no error.

Keep changes focused. If a refactor is needed to make a fix possible, do it in a separate commit so it can be reviewed on its own.

### Reporting Bugs and Suggesting Features

Open an Issue. For bugs, the app version, platform, and steps to reproduce save a round trip.

---

## Roadmap

- [x] Repeat and shuffle modes
- [x] Settings: library scan, cache
- [x] Online playlists, albums, and charts
- [x] Artist pages with albums and pagination
- [ ] Sign-in support — personal playlists, daily recommendations, higher audio quality
- [ ] arm64 build of the bundled proxy (currently x86_64 only)
- [ ] Theme customization (accent colors)
- [ ] i18n for more languages
- [ ] More music sources
- [ ] Import/export library and playlists
- [ ] Now playing notifications

---

## Disclaimer

<details>
<summary>Legal and usage notice (click to expand)</summary>

1. This project is for learning only. Do not use it for commercial or illegal purposes. Respect copyright.
2. Any copyrighted data produced while using this project is not owned by the project. You must delete such data within 24 hours to reduce infringement risk.
3. The authors are not liable for any direct, indirect, special, incidental, or consequential damages from using this project.
4. Do not use this project in places where it violates local laws. You are responsible for your own compliance.
5. Please support official music platforms and legal distribution.
6. This project is for technical exploration and research only. It does not accept commercial partnerships or donations.
7. If a rights holder finds this project inappropriate, please contact the maintainers to request changes or removal.

</details>

---

## License

[MIT](LICENSE)

---

## Acknowledgements

- [Tauri](https://tauri.app/) — Desktop framework
- [Vue.js](https://vuejs.org/) — Frontend framework
- [Rodio](https://github.com/RustAudio/rodio) — Audio playback
- [Symphonia](https://github.com/pdeljanov/Symphonia) — Audio decoding
- [Element Plus](https://element-plus.org/) — UI components
- [NeteaseCloudMusicApiBackup](https://github.com/nooblong/NeteaseCloudMusicApiBackup) — NetEase API proxy
