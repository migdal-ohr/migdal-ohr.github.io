// Migdal Ohr — Windows desktop app.
// Serves the built web app from inside the installer over a private app:// origin,
// so the app opens instantly (even with no internet, from the offline snapshot)
// while all data still syncs live with the shared database.
const { app, BrowserWindow, protocol, shell, net, Menu, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const SCHEME = "app";
const HOST = "migdal";
const DIST = path.join(__dirname, "..", "dist");

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// one window only — a second double-click focuses the open one
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
}

// remember window size/position
const stateFile = path.join(app.getPath("userData"), "window.json");
const loadState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return { width: 1400, height: 900 }; } };
const saveState = (w) => { try { if (!w.isMinimized()) fs.writeFileSync(stateFile, JSON.stringify({ ...w.getNormalBounds(), maximized: w.isMaximized() })); } catch { /* ignore */ } };

function createWindow() {
  const s = loadState();
  const win = new BrowserWindow({
    x: s.x, y: s.y, width: s.width || 1400, height: s.height || 900,
    minWidth: 900, minHeight: 600,
    title: "רישום מגדל אור",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    backgroundColor: "#f5f7fb",
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  if (s.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  win.on("close", () => saveState(win));

  // WhatsApp, public links, etc. → the user's normal browser. Blank windows (print/preview) stay in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === "about:blank") return { action: "allow" };
    if (/^(https?|mailto|tel|whatsapp):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`${SCHEME}://${HOST}`)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.session.setSpellCheckerLanguages(["he", "en-US"]);

  // Hebrew right-click menu (copy/paste/spelling)
  win.webContents.on("context-menu", (_e, p) => {
    const items = [];
    for (const sug of p.dictionarySuggestions.slice(0, 4)) items.push({ label: sug, click: () => win.webContents.replaceMisspelling(sug) });
    if (items.length) items.push({ type: "separator" });
    if (p.isEditable) items.push({ label: "גזור", role: "cut" }, { label: "העתק", role: "copy" }, { label: "הדבק", role: "paste" }, { label: "בחר הכל", role: "selectAll" });
    else if (p.selectionText) items.push({ label: "העתק", role: "copy" });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });

  win.loadURL(`${SCHEME}://${HOST}/`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, (req) => {
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response("forbidden", { status: 403 });
    // client-side routes (/rsvp, /auth, …) fall back to the app shell
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
    return net.fetch(pathToFileURL(file).toString());
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "קובץ", submenu: [{ label: "רענון", role: "reload" }, { label: "מסך מלא", role: "togglefullscreen" }, { type: "separator" }, { label: "יציאה", role: "quit" }] },
    { label: "תצוגה", submenu: [{ label: "הגדל", role: "zoomIn" }, { label: "הקטן", role: "zoomOut" }, { label: "גודל רגיל", role: "resetZoom" }] },
    { label: "עזרה", submenu: [{ label: "אודות", click: () => dialog.showMessageBox({ title: "רישום מגדל אור", message: `רישום מגדל אור\nגרסה ${app.getVersion()}` }) }] },
  ]));

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
