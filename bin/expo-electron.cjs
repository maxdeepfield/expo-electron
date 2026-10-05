#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const help = `Usage: expo-electron <command> [project-dir] [options]

Commands:
  prepare    Generate Electron files and install dependencies
  prebuild   Alias for prepare
  start      Run Expo web and Electron together
  build      Export the web app and build Windows x64 artifacts

Examples:
  expo-electron prepare --name "My App" --app-id com.example.myapp
  expo-electron prebuild --platform windows
  expo-electron start
  expo-electron build --platform windows
  expo-electron build --platform windows --installer

Prepare options: --platform windows, --adopt (existing electron/main.js), --no-install, --dry-run, --force, --name, --app-id, --package-manager
Build options: --platform windows, --installer, --dir (default)
`;

function main(args) {
  const [command, ...rest] = args;
  if (!command || ["--help", "-h", "help"].includes(command)) {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log(require("../package.json").version);
    return;
  }
  if (["prepare", "prebuild"].includes(command)) {
    require("./prepare.cjs").main(rest);
    return;
  }
  if (!["start", "build"].includes(command))
    throw new Error(`Unknown command: ${command}. Run expo-electron --help.`);
  if (rest.includes("--help") || rest.includes("-h")) {
    console.log(help);
    return;
  }
  let target = ".",
    hasTarget = false,
    installer = false,
    explicitDir = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (command === "build" && arg === "--platform") {
      if (rest[++i] !== "windows")
        throw new Error(
          "This starter currently builds --platform windows only.",
        );
    } else if (command === "build" && arg === "--installer") installer = true;
    else if (command === "build" && arg === "--dir") explicitDir = true;
    else if (arg.startsWith("-"))
      throw new Error(`Unknown ${command} option: ${arg}`);
    else if (hasTarget) throw new Error("Specify one Expo project directory.");
    else {
      target = arg;
      hasTarget = true;
    }
  }
  if (installer && explicitDir) throw new Error("Choose --installer or --dir.");
  const root = path.resolve(target);
  if (!fs.existsSync(path.join(root, "electron/desktop.json")))
    throw new Error(
      `Project is not prepared. Run expo-electron prepare "${root}" first.`,
    );
  const script = path.join(
    root,
    "electron",
    command === "start" ? "dev.cjs" : "build.cjs",
  );
  const result = spawnSync(
    process.execPath,
    [script, ...(command === "build" ? [installer ? "installer" : "dir"] : [])],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
module.exports = { main };
