# Expo Electron

Добавляет Electron и Windows-инсталлятор в существующий Expo-проект. Это отдельный CLI с командами в стиле Expo.

В папке вашего приложения:

```sh
npm install --save-dev git+https://github.com/maxdeepfield/expo-electron.git#v0.1.1
npx expo-electron prebuild --platform windows
npx expo-electron start
npx expo-electron build --platform windows
npx expo-electron build --platform windows --installer
```

Готовое приложение: `desktop-dist/win-unpacked/`. Инсталлятор: `installer/<имя>-Setup-<версия>-x64.exe`.

Можно подготовить проект одной командой, без постоянной зависимости от CLI:

```sh
npx --yes --package=git+https://github.com/maxdeepfield/expo-electron.git#v0.1.1 expo-electron prebuild --platform windows
```

После подготовки также доступны `npm run electron`, `npm run build:win` и `npm run build:win:installer`.

Имя и ID берутся из Expo config. CLI создаёт оболочку `electron/`, файл `electron-builder.json`, команды сборки и правила `.gitignore`. Устанавливает Electron и electron-builder, а недостающие веб-зависимости — через `expo install`, с учётом SDK. npm, pnpm, Yarn и Bun определяются по настройкам проекта/lockfile; можно выбрать явно: `--package-manager npm`.

Точка входа Expo и Android/iOS-настройки сохраняются. При обнаружении другой Electron-настройки или изменённых файлов CLI останавливается до записи. `--dry-run` показывает план, `--no-install` пропускает установку, `--force` заменяет конфликтующие файлы после вашей проверки. Другие параметры: `--name "Моё приложение"`, `--app-id com.example.myapp`.

У приложения должна работать веб-версия: нативным библиотекам нужны веб-реализации. Поддерживаются `web.output: "single"` и `"static"`; серверные/API routes требуют отдельного backend. Требования: Node.js 22.12+, Git для установки из репозитория, Windows для обычной сборки NSIS. Репозиторий приватный. Перед установкой выполните `gh auth login` и `gh auth setup-git` под аккаунтом с доступом. В GitHub Release есть npm-архив для установки без Git.

Настройки окна — `electron/desktop.json`, настройки сборки и инсталлятора — `electron-builder.json`. Если есть `assets/icon.ico`, он подключится при подготовке. Сертификаты подписи, автообновления, собственные Electron-модули и сборка macOS/Linux не входят в стартовую настройку.

Пакет не опубликован в npm. Первичная установка выполняется по ссылке GitHub или из архива релиза. [Полная документация](README.md).
