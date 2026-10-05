"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, shell, dialog } = require("electron");
const desktop = require("./desktop.json");
const { startStaticServer } = require("./static-server.cjs");
let server;

async function createWindow() {
  let url = process.env.EXPO_WEB_URL;
  if (!url || app.isPackaged) {
    if (!server)
      server = await startStaticServer(
        path.join(__dirname, "../dist"),
        desktop.port,
        desktop.spa !== false,
      );
    url = server.url;
  }
  const origin = new URL(url).origin;
  const icon = path.join(__dirname, "icon.ico");
  const win = new BrowserWindow({
    title: desktop.name,
    width: desktop.width,
    height: desktop.height,
    show: false,
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());
  const openExternal = (candidate) => {
    try {
      if (["https:", "http:"].includes(new URL(candidate).protocol))
        shell.openExternal(candidate).catch(console.error);
    } catch {
      /* Ignore invalid links. */
    }
  };
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      openExternal(target);
    }
  });
  await win.loadURL(url);
}

app.setName(desktop.name);
app.setAppUserModelId(desktop.appId);
const fail = (err) => {
  dialog.showErrorBox(
    `${desktop.name} failed to start`,
    `${err.message}\nIf the local desktop port is busy, close the other instance or change electron/desktop.json.`,
  );
  app.quit();
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(createWindow).catch(fail);
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow().catch(fail);
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => server?.server.close());
