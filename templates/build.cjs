"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const mode = process.argv[2];
if (!["dir", "installer"].includes(mode))
  throw new Error("Usage: node electron/build.cjs dir|installer");
const pkg = require(path.join(root, "package.json"));
const resolvePackage = (name) =>
  path.dirname(require.resolve(`${name}/package.json`, { paths: [root] }));
const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message || `Build exited with code ${result.status}`,
    );
};
const expoCli = path.join(resolvePackage("expo"), "bin/cli");
const configResult = spawnSync(
  process.execPath,
  [expoCli, "config", "--type", "public", "--json"],
  { cwd: root, encoding: "utf8" },
);
if (configResult.error || configResult.status !== 0)
  throw new Error(configResult.stderr || "Cannot resolve Expo config.");
const expoConfig = JSON.parse(configResult.stdout);
if (expoConfig.web?.output === "server")
  throw new Error(
    'Electron requires expo.web.output "single" or "static". Host API/server routes separately.',
  );
run([expoCli, "export", "--platform", "web", "--output-dir", "dist"]);
if (!fs.existsSync(path.join(root, "dist/index.html")))
  throw new Error(
    'The web export has no dist/index.html. Configure Expo web output as "single" or "static".',
  );

// Stage a dependency-free desktop app: Expo dependencies are already in the web bundle.
// Never change the source package.json main field or ship the source/native project.
const stage = path.join(root, ".electron-app");
if (path.dirname(stage) !== root || path.basename(stage) !== ".electron-app")
  throw new Error("Invalid staging path.");
if (fs.existsSync(stage) && fs.lstatSync(stage).isSymbolicLink())
  throw new Error(".electron-app must not be a symlink.");
fs.rmSync(stage, { force: true, recursive: true });
fs.mkdirSync(path.join(stage, "electron"), { recursive: true });
fs.cpSync(path.join(root, "dist"), path.join(stage, "dist"), {
  recursive: true,
});
for (const file of ["main.cjs", "static-server.cjs", "icon.ico"]) {
  const source = path.join(__dirname, file);
  if (fs.existsSync(source))
    fs.copyFileSync(source, path.join(stage, "electron", file));
}
const desktop = {
  ...require("./desktop.json"),
  spa: expoConfig.web?.output !== "static",
};
fs.writeFileSync(
  path.join(stage, "electron/desktop.json"),
  JSON.stringify(desktop, null, 2),
);
const stagedPackage = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description || `${desktop.name} desktop app`,
  main: "electron/main.cjs",
  private: true,
  ...(pkg.author ? { author: pkg.author } : {}),
};
fs.writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify(stagedPackage, null, 2),
);
const args = [
  path.join(resolvePackage("electron-builder"), "cli.js"),
  "--config",
  "electron-builder.json",
  "--win",
  "--x64",
  "--publish",
  "never",
];
if (mode === "dir") args.push("--dir");
else args.push("--config.directories.output=installer");
run(args);
