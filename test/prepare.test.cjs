"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  prepare,
  parseArgs,
  detectPackageManager,
} = require("../bin/prepare.cjs");
const { startStaticServer } = require("../templates/static-server.cjs");
const cli = path.join(__dirname, "../bin/expo-electron.cjs");

function fixture(t, additions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "expo-electron-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "my-app",
      version: "2.3.4",
      main: "expo-router/entry",
      type: "module",
      scripts: { android: "expo run:android" },
      dependencies: { expo: "~54.0.30" },
      ...additions,
    }),
  );
  fs.writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({
      expo: { name: "My App", android: { package: "com.example.myapp" } },
    }),
  );
  return root;
}
const options = (root) => ({ target: root, install: false });

test("preparation preserves Expo entry/native scripts and works with an ESM app", (t) => {
  const root = fixture(t);
  prepare(options(root));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
  assert.equal(pkg.main, "expo-router/entry");
  assert.equal(pkg.scripts.android, "expo run:android");
  assert.equal(pkg.scripts["build:win"], "node electron/build.cjs dir");
  assert.equal(pkg.devDependencies.electron, "44.5.1");
  const cfg = JSON.parse(
    fs.readFileSync(path.join(root, "electron-builder.json")),
  );
  assert.equal(cfg.appId, "com.example.myapp");
  assert.equal(cfg.productName, "My App");
  assert.equal(cfg.extraMetadata.main, "electron/main.cjs");
  assert.equal(cfg.nsis.oneClick, false);
  assert.equal(cfg.directories.app, ".electron-app");
  for (const file of [
    "main.cjs",
    "dev.cjs",
    "build.cjs",
    "static-server.cjs",
  ]) {
    const result = spawnSync(process.execPath, [
      "--check",
      path.join(root, "electron", file),
    ]);
    assert.equal(result.status, 0, String(result.stderr));
  }
});

test("rerunning preparation is idempotent", (t) => {
  const root = fixture(t);
  prepare(options(root));
  const before = ["package.json", ".gitignore", "electron/desktop.json"].map(
    (file) => fs.readFileSync(path.join(root, file), "utf8"),
  );
  prepare(options(root));
  assert.deepEqual(
    ["package.json", ".gitignore", "electron/desktop.json"].map((file) =>
      fs.readFileSync(path.join(root, file), "utf8"),
    ),
    before,
  );
});

test("conflicts abort before writing; force is explicit", (t) => {
  const root = fixture(t, { scripts: { electron: "custom electron runner" } });
  const before = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.throws(() => prepare(options(root)), /would be overwritten/);
  assert.equal(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
    before,
  );
  assert.equal(fs.existsSync(path.join(root, "electron-builder.json")), false);
  prepare({ ...options(root), force: true });
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).scripts
      .electron,
    "node electron/dev.cjs",
  );
});

test("existing Electron directories are protected", (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "electron"));
  fs.writeFileSync(path.join(root, "electron/main.js"), "custom shell");
  assert.throws(() => prepare(options(root)), /existing desktop setup/);
  assert.equal(
    fs.readFileSync(path.join(root, "electron/main.js"), "utf8"),
    "custom shell",
  );
});

test("dry run writes nothing and existing dependency versions are preserved", (t) => {
  const root = fixture(t, { devDependencies: { electron: "^40.0.0" } });
  const before = fs.readFileSync(path.join(root, "package.json"), "utf8");
  prepare({ ...options(root), dryRun: true });
  assert.equal(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
    before,
  );
  assert.equal(fs.existsSync(path.join(root, "electron")), false);
  prepare(options(root));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).devDependencies
      .electron,
    "^40.0.0",
  );
});

test("invalid project and server exports are rejected", (t) => {
  const root = fixture(t, { dependencies: {} });
  assert.throws(() => prepare(options(root)), /existing Expo project/);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", dependencies: { expo: "~54.0.30" } }),
  );
  fs.writeFileSync(
    path.join(root, "app.json"),
    JSON.stringify({ expo: { web: { output: "server" } } }),
  );
  assert.throws(() => prepare(options(root)), /client web export/);
});

test("package manager detection respects explicit options, metadata and lockfiles", (t) => {
  const root = fixture(t);
  assert.equal(detectPackageManager(root, {}), "npm");
  fs.writeFileSync(path.join(root, "yarn.lock"), "");
  assert.equal(detectPackageManager(root, {}), "yarn");
  assert.equal(
    detectPackageManager(root, { packageManager: "pnpm@10.0.0" }),
    "pnpm",
  );
  assert.equal(detectPackageManager(root, {}, "bun"), "bun");
  assert.equal(parseArgs(["--package-manager", "pnpm"]).packageManager, "pnpm");
  assert.throws(
    () => parseArgs(["--package-manager", "invalid"]),
    /must be npm/,
  );
});

test("scoped and numeric package names receive usable default desktop identities", (t) => {
  const root = fixture(t, { name: "@example/123-demo" });
  fs.writeFileSync(path.join(root, "app.json"), '{"expo":{}}');
  prepare(options(root));
  const desktop = JSON.parse(
    fs.readFileSync(path.join(root, "electron/desktop.json")),
  );
  assert.equal(desktop.name, "123-demo");
  assert.match(desktop.appId, /^com\.expo\.app/);
});

test("dynamic Expo app config is resolved through the installed Expo CLI", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "app.config.js"), "module.exports = {};");
  const expo = path.join(root, "node_modules/expo");
  fs.mkdirSync(path.join(expo, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(expo, "package.json"),
    '{"name":"expo","version":"54.0.30"}',
  );
  fs.writeFileSync(
    path.join(expo, "bin/cli"),
    'console.log(JSON.stringify({name:"Dynamic App",android:{package:"com.example.dynamic"}}));',
  );
  prepare(options(root));
  const desktop = JSON.parse(
    fs.readFileSync(path.join(root, "electron/desktop.json")),
  );
  assert.equal(desktop.name, "Dynamic App");
  assert.equal(desktop.appId, "com.example.dynamic");
});

test("CLI exposes Expo-style commands and validates build options", (t) => {
  const root = fixture(t);
  for (const command of ["prepare", "prebuild"]) {
    const result = spawnSync(
      process.execPath,
      [cli, command, root, "--platform", "windows", "--dry-run"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  }
  const invalid = spawnSync(
    process.execPath,
    [cli, "build", root, "--platform", "android"],
    { encoding: "utf8" },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /windows only/);
  const notPrepared = spawnSync(process.execPath, [cli, "start", root], {
    encoding: "utf8",
  });
  assert.equal(notPrepared.status, 1);
  assert.match(notPrepared.stderr, /not prepared/);
});

test("static server serves SPA and static routes but blocks traversal, bad URLs and missing assets", async (t) => {
  const root = fixture(t);
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, "index.html"), "home");
  fs.writeFileSync(path.join(dist, "about.html"), "about");
  fs.writeFileSync(path.join(dist, "app.js"), "console.log(1)");
  fs.writeFileSync(path.join(root, "secret.txt"), "secret");
  const spa = await startStaticServer(dist, 0, true);
  const staticApp = await startStaticServer(dist, 0, false);
  t.after(async () => {
    await Promise.all(
      [spa, staticApp].map(
        ({ server }) => new Promise((resolve) => server.close(resolve)),
      ),
    );
  });
  assert.equal(await (await fetch(spa.url + "/nested-route")).text(), "home");
  assert.equal(await (await fetch(staticApp.url + "/about")).text(), "about");
  assert.equal((await fetch(staticApp.url + "/missing-route")).status, 404);
  assert.equal((await fetch(spa.url + "/missing.js")).status, 404);
  assert.equal((await fetch(spa.url + "/%2e%2e%2fsecret.txt")).status, 403);
  assert.equal((await fetch(spa.url + "/%ZZ")).status, 400);
  assert.match(
    (await fetch(spa.url + "/app.js")).headers.get("content-type"),
    /javascript/,
  );
});
