#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");

const scripts = {
  electron: "node electron/dev.cjs",
  "build:desktop:web": "expo export --platform web --output-dir dist",
  "build:win": "node electron/build.cjs dir",
  "build:win:installer": "node electron/build.cjs installer",
};
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function parseArgs(args) {
  const options = { target: ".", install: true };
  let hasTarget = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--no-install") options.install = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--platform") {
      if (args[++i] !== "windows")
        throw new Error(
          "This starter currently prepares --platform windows only.",
        );
    } else if (arg === "--package-manager") {
      const value = args[++i];
      if (!["npm", "pnpm", "yarn", "bun"].includes(value))
        throw new Error("--package-manager must be npm, pnpm, yarn, or bun.");
      options.packageManager = value;
    } else if (arg === "--name" || arg === "--app-id") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} needs a value.`);
      options[arg === "--name" ? "name" : "appId"] = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (hasTarget) throw new Error("Specify one Expo project directory.");
    else {
      options.target = arg;
      hasTarget = true;
    }
  }
  return options;
}

function prepare(options) {
  const root = path.resolve(options.target);
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath))
    throw new Error(`No package.json in ${root}`);
  const pkg = readJson(packagePath);
  const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };
  if (!dependencies.expo)
    throw new Error("The target must be an existing Expo project.");
  let expo = {};
  const appJson = path.join(root, "app.json");
  if (fs.existsSync(appJson)) expo = readJson(appJson).expo || {};
  // Resolve app.config.js/ts through Expo when it is installed in the target.
  // A newly cloned, uninstalled app can still be prepared from app.json.
  const dynamicConfig = [
    "app.config.js",
    "app.config.ts",
    "app.config.mjs",
    "app.config.cjs",
  ].some((file) => fs.existsSync(path.join(root, file)));
  if (dynamicConfig) {
    let expoPackage;
    try {
      expoPackage = require.resolve("expo/package.json", { paths: [root] });
    } catch {
      /* Install first to evaluate a dynamic config. */
    }
    if (expoPackage) {
      const result = spawnSync(
        process.execPath,
        [
          path.join(path.dirname(expoPackage), "bin/cli"),
          "config",
          "--type",
          "public",
          "--json",
        ],
        { cwd: root, encoding: "utf8" },
      );
      if (result.error || result.status !== 0)
        throw new Error(
          `Cannot resolve Expo app config: ${result.error?.message || result.stderr}`,
        );
      expo = JSON.parse(result.stdout);
    } else {
      console.log(
        "Expo is not installed yet; using app.json/package.json defaults. Use --name and --app-id to override a dynamic app config.",
      );
    }
  }
  if (expo.web?.output === "server") {
    throw new Error(
      'Electron needs a client web export. Use expo.web.output "single" or "static"; host server/API routes separately.',
    );
  }
  const slug = (pkg.name || expo.slug || "expo-desktop")
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase();
  const name =
    options.name ||
    expo.name ||
    (pkg.name || "").replace(/^@[^/]+\//, "") ||
    "Expo Desktop";
  const appId =
    options.appId ||
    expo.android?.package ||
    expo.ios?.bundleIdentifier ||
    `com.expo.app${slug.replace(/-/g, "")}`;
  if (!name.trim() || /[<>:"/\\|?*\x00-\x1f]/.test(name))
    throw new Error(
      'App name must be a valid Windows filename. Use --name "My App".',
    );
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+$/.test(appId))
    throw new Error(
      "Use a reverse-domain app ID, e.g. --app-id com.example.myapp",
    );
  const desktop = {
    name,
    appId,
    port:
      20000 +
      (createHash("sha256").update(appId).digest().readUInt32BE(0) % 20000),
    width: 1100,
    height: 760,
  };
  const builder = {
    appId,
    productName: name,
    directories: { app: ".electron-app", output: "desktop-dist" },
    files: [
      "dist/**/*",
      "electron/**/*",
      "package.json",
      "!node_modules{,/**/*}",
    ],
    extraMetadata: { main: "electron/main.cjs" },
    npmRebuild: false,
    win: {
      target: [{ target: "nsis", arch: ["x64"] }],
      artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
    },
  };
  const writes = new Map();
  for (const file of [
    "main.cjs",
    "dev.cjs",
    "build.cjs",
    "static-server.cjs",
  ]) {
    writes.set(
      `electron/${file}`,
      Buffer.from(
        fs
          .readFileSync(path.join(__dirname, "..", "templates", file), "utf8")
          .replace(/\r\n/g, "\n"),
      ),
    );
  }
  const icon = path.join(root, "assets", "icon.ico");
  if (fs.existsSync(icon)) {
    writes.set("electron/icon.ico", fs.readFileSync(icon));
    builder.win.icon = "electron/icon.ico";
  }
  writes.set("electron/desktop.json", Buffer.from(json(desktop)));
  writes.set("electron-builder.json", Buffer.from(json(builder)));
  const conflicts = [];
  if (
    fs.existsSync(path.join(root, "electron")) &&
    !fs.existsSync(path.join(root, "electron", "desktop.json"))
  ) {
    conflicts.push("electron/ (existing desktop setup)");
  }
  for (const [file, content] of writes) {
    const target = path.join(root, file);
    if (fs.existsSync(target)) {
      const previous = fs.readFileSync(target);
      const matches = file.endsWith(".ico")
        ? previous.equals(content)
        : previous.toString("utf8").replace(/\r\n/g, "\n") ===
          content.toString("utf8").replace(/\r\n/g, "\n");
      if (!matches) conflicts.push(file);
    }
  }
  for (const [key, value] of Object.entries(scripts)) {
    if (pkg.scripts?.[key] && pkg.scripts[key] !== value)
      conflicts.push(`package.json scripts.${key}`);
  }
  if (conflicts.length && !options.force) {
    throw new Error(
      `Existing configuration would be overwritten:\n  ${conflicts.join("\n  ")}\nUse a fresh project, or review these files before using --force.`,
    );
  }
  const missingWeb = [
    "react-dom",
    "react-native-web",
    "@expo/metro-runtime",
  ].filter((dep) => !dependencies[dep]);
  pkg.scripts = { ...pkg.scripts, ...scripts };
  pkg.devDependencies = { ...pkg.devDependencies };
  for (const [dep, version] of Object.entries({
    electron: "44.5.1",
    "electron-builder": "26.17.0",
  })) {
    if (!dependencies[dep]) pkg.devDependencies[dep] = version;
  }
  const ignorePath = path.join(root, ".gitignore");
  let ignore = fs.existsSync(ignorePath)
    ? fs.readFileSync(ignorePath, "utf8")
    : "";
  const lines = new Set(ignore.split(/\r?\n/));
  const ignores = [
    ".electron-app/",
    "desktop-dist/",
    "installer/",
    "dist/",
    ".expo/",
    "node_modules/",
  ].filter((line) => !lines.has(line) && !lines.has("/" + line));
  if (ignores.length)
    ignore += `${ignore && !ignore.endsWith("\n") ? "\n" : ""}\n# Expo Electron artifacts\n${ignores.join("\n")}\n`;

  console.log(
    `${options.dryRun ? "Would prepare" : "Preparing"} ${name} (${appId}) in ${root}`,
  );
  for (const file of writes.keys()) console.log(`  ${file}`);
  console.log("  package.json scripts + desktop devDependencies\n  .gitignore");
  const packageManager = detectPackageManager(
    root,
    pkg,
    options.packageManager,
  );
  if (options.dryRun) return { root, missingWeb, packageManager };
  for (const [file, content] of writes) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(packagePath, json(pkg));
  if (ignores.length) fs.writeFileSync(ignorePath, ignore);
  return { root, missingWeb, packageManager };
}

function detectPackageManager(root, pkg, explicit) {
  if (explicit) return explicit;
  const configured = (pkg.packageManager || "").split("@")[0];
  if (["npm", "pnpm", "yarn", "bun"].includes(configured)) return configured;
  for (const [file, manager] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ]) {
    if (fs.existsSync(path.join(root, file))) return manager;
  }
  return "npm";
}

function install(root, missingWeb, packageManager) {
  const run = (command, args, shell = false) => {
    const result = spawnSync(command, args, {
      cwd: root,
      stdio: "inherit",
      shell,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Dependency installation failed. Files are prepared; retry ${packageManager} install. ${result.error?.message || ""}`,
      );
  };
  if (packageManager !== "npm" || process.platform !== "win32") {
    // All arguments here are fixed package names/options, not user shell text.
    run(packageManager, ["install"], process.platform === "win32");
  } else {
    let npmCli = process.env.npm_execpath;
    if (!npmCli || !npmCli.endsWith("npm-cli.js")) {
      const candidates = [
        path.join(
          path.dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        ),
      ];
      if (process.platform === "win32") {
        const found = spawnSync("where.exe", ["npm.cmd"], { encoding: "utf8" });
        for (const command of (found.stdout || "").trim().split(/\r?\n/)) {
          if (command)
            candidates.push(
              path.join(
                path.dirname(command),
                "node_modules/npm/bin/npm-cli.js",
              ),
            );
        }
      }
      npmCli = candidates.find((file) => fs.existsSync(file));
    }
    if (!npmCli)
      throw new Error(
        "Files are prepared. Run npm install in the target app (npm CLI was not found).",
      );
    run(process.execPath, [npmCli, "install"]);
  }
  if (missingWeb.length)
    run(process.execPath, [
      path.join(
        path.dirname(require.resolve("expo/package.json", { paths: [root] })),
        "bin/cli",
      ),
      "install",
      ...missingWeb,
      `--${packageManager}`,
    ]);
}

function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      'Usage: expo-electron prepare [project-dir] [--platform windows] [--name "My App"] [--app-id com.example.app]\n  --package-manager npm|pnpm|yarn|bun  Override package manager detection\n  --no-install  Prepare files only; install dependencies yourself\n  --dry-run     Show changes without writing or installing\n  --force       Replace conflicting generated files and desktop scripts',
    );
    return;
  }
  const { root, missingWeb, packageManager } = prepare(options);
  if (options.dryRun) return;
  if (options.install) install(root, missingWeb, packageManager);
  else {
    console.log(`\nNext: ${packageManager} install`);
    if (missingWeb.length)
      console.log(
        `Then: npx expo install ${missingWeb.join(" ")} --${packageManager}`,
      );
  }
  console.log(
    "\nReady: npm run electron | npm run build:win | npm run build:win:installer",
  );
}
if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
module.exports = { prepare, parseArgs, main, detectPackageManager };
