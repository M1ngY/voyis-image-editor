import { ipcMain, app, BrowserWindow, dialog } from "electron";
import { fileURLToPath } from "node:url";
import { promises } from "node:fs";
import path from "node:path";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
const IMAGE_FILTERS = [
  {
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"]
  }
];
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
};
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("voyis:select-images", async () => {
  if (!win) {
    throw new Error("Main window is not ready");
  }
  const result = await dialog.showOpenDialog(win, {
    title: "Select images",
    properties: ["openFile", "multiSelections"],
    filters: IMAGE_FILTERS
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  const files = await Promise.all(
    result.filePaths.map(async (filePath) => {
      const [fileBuffer, stats] = await Promise.all([
        promises.readFile(filePath),
        promises.stat(filePath)
      ]);
      return {
        path: filePath,
        name: path.basename(filePath),
        type: getMimeType(filePath),
        size: stats.size,
        lastModified: stats.mtimeMs,
        data: fileBuffer.toString("base64")
      };
    })
  );
  return files;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
