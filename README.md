# Expo Electron

Add an Electron desktop shell and a Windows installer to an existing Expo app. Commands follow Expo's style: `prebuild`, `start`, and `build`. This is an independent community tool, not an official Expo command.

[Инструкция на русском](README.ru.md)

## Add to an Expo app

Requires Node.js 22.12 or newer and an Expo app with a working web version.

This repository is private. On each computer, authenticate an account with access before installing:

```sh
gh auth login
gh auth setup-git
```

Run these commands **inside your Expo project**:

```sh
npm install --save-dev git+https://github.com/maxdeepfield/expo-electron.git#v0.2.0
npx expo-electron prebuild --platform windows
npx expo-electron start
npx expo-electron build --platform windows
npx expo-electron build --platform windows --installer
```

The first build produces `desktop-dist/win-unpacked/`. The installer build produces `installer/<AppName>-Setup-<version>-x64.exe`.

For Yarn, pnpm, or Bun, add the same Git URL as a dev dependency with your package manager. Preparation detects the target's `packageManager` field or lockfile and uses that manager. Override it with `--package-manager npm|pnpm|yarn|bun`.

### One command, without keeping the CLI as a dependency

```sh
npx --yes --package=git+https://github.com/maxdeepfield/expo-electron.git#v0.2.0 expo-electron prebuild --platform windows
```

After preparation, these generated npm scripts also work:

```sh
npm run electron
npm run build:desktop:web
npm run build:win
npm run build:win:installer
```

GitHub installation requires Git. A private repository also requires GitHub authentication (`gh auth setup-git` with GitHub CLI). Releases include an npm tarball for installing without Git. This package has not been published to the npm registry; use the Git URL or release tarball for the initial installation.

## What preparation does

- Generates `electron/main.cjs`, `dev.cjs`, `build.cjs`, `static-server.cjs`, and `desktop.json`.
- Generates `electron-builder.json` with a Windows x64 NSIS installer and selectable installation folder.
- Adds desktop scripts and Electron/electron-builder dev dependencies.
- Installs missing web dependencies through `expo install`, matching your Expo SDK.
- Adds output directories to `.gitignore`.
- Reads the name and ID from Expo config, including installed apps with `app.config.js`/`app.config.ts`.

Expo's `package.json.main`, Android/iOS configuration and existing dependency versions are preserved. An existing Electron setup or customized generated file causes preparation to stop before changing files. Use `--dry-run` to preview, `--no-install` to write only files, or `--force` after reviewing conflicts.

## Commands

```sh
expo-electron prepare [project-dir] [options]
expo-electron prebuild [project-dir] [options]
expo-electron start [project-dir]
expo-electron build [project-dir] --platform windows [--installer | --dir]
```

`prepare` and `prebuild` are equivalent. The default directory is the current project.

| Preparation option           | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `--name "My App"`            | Desktop product name                                        |
| `--app-id com.example.myapp` | Desktop application ID                                      |
| `--package-manager npm`      | Override detection; also accepts pnpm, yarn, bun            |
| `--no-install`               | Generate files without installing                           |
| `--dry-run`                  | Preview without writing or installing                       |
| `--force`                    | Replace conflicting generated files and desktop scripts     |
| `--adopt`                    | Keep an existing `electron/main.js`, preload and app assets |

For an uninstalled app with a dynamic config, install its dependencies first or supply `--name` and `--app-id`. Configuration errors from an installed Expo CLI are reported before file writes.

## Configuration

- `electron/desktop.json`: name, app ID, window dimensions and stable local port.
- `electron-builder.json`: installer, output paths, icon and signing/build options.
- `electron/main.cjs`: desktop window and lifecycle.

If `assets/icon.ico` exists at preparation time, it is copied automatically. Otherwise the default Electron icon is used. The renderer is sandboxed with context isolation and no Node integration. External HTTP(S) links open in the browser.

## Supported apps and limits

Your Expo app must have a working **web version**. Native-only libraries/features need web implementations. `web.output: "single"` and `"static"` work; server output/API routes require a separately hosted backend. Development starts its own Expo web server on a free port and stops it when Electron exits.

For an app that already has a custom `electron/main.js`, prepare it with `--adopt`. This keeps the existing Electron main process, preload script, loading page, assets and file associations, and adds the package's Expo dev launcher and staged Windows build.

```sh
npx expo-electron prepare --platform windows --adopt
```

Windows builds stage only the exported web bundle and desktop runtime in `.electron-app/`, with no Expo/native production dependencies. The source entry point is never rewritten. Build NSIS installers on Windows; other host platforms require electron-builder's cross-build toolchain. macOS/Linux packaging, native Electron modules, auto-updates and signing credentials are not generated. Use `--adopt` to keep IPC and tray behavior from a custom Electron main process.

Initial defaults: Electron 44.5.1 and electron-builder 26.17.0. Change them in your app's dev dependencies as needed; existing versions are preserved. The production server keeps a stable origin for web storage. For a port collision, change `electron/desktop.json` or close the other app instance.

## Development

```sh
git clone https://github.com/maxdeepfield/expo-electron.git
cd expo-electron
npm ci
npm test
npm pack
```

The CLI has no runtime dependencies. CI checks Node 22/24 on Windows and Linux. Package uploads exclude tests, sample projects, build outputs and local configuration. No automatic npm publication is configured.

References: [Expo web development](https://docs.expo.dev/workflow/web/), [Expo native prebuild](https://docs.expo.dev/workflow/continuous-native-generation/), [electron-builder NSIS configuration](https://www.electron.build/v26/docs/nsis/).
