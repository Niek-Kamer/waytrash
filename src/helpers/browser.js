const dbus = require("dbus-next");
const { execSync, spawn } = require("child_process");
const { findCDPApps, readPageContent } = require("./cdp");

function getBus() {
  return dbus.sessionBus();
}

// ── Plasma Browser Integration (works on live browsers) ────────────────────────

/**
 * List all open browser tabs via KDE Plasma Browser Integration.
 * Works on any running Brave/Chrome/Firefox with the Plasma extension installed.
 */
async function listBrowserTabs() {
  const bus = getBus();
  const proxy = await bus.getProxyObject(
    "org.kde.plasma.browser_integration",
    "/TabsRunner"
  );
  const iface = proxy.getInterface("org.kde.krunner1");

  // Match with a short generic query to get all tabs
  // The extension requires min 1 char
  const results = await iface.Match("a");
  const seen = new Set();
  const tabs = [];

  for (const r of results) {
    if (seen.has(r[0])) continue;
    seen.add(r[0]);
    tabs.push({ id: r[0], title: r[1] });
  }

  // Also try other common letters to catch tabs that don't contain 'a'
  for (const letter of ["e", "i", "o", "s", "t"]) {
    try {
      const more = await iface.Match(letter);
      for (const r of more) {
        if (seen.has(r[0])) continue;
        seen.add(r[0]);
        tabs.push({ id: r[0], title: r[1] });
      }
    } catch {}
  }

  return tabs;
}

/**
 * Activate (focus) a browser tab by its ID.
 */
async function activateBrowserTab(tabId) {
  const bus = getBus();
  const proxy = await bus.getProxyObject(
    "org.kde.plasma.browser_integration",
    "/TabsRunner"
  );
  const iface = proxy.getInterface("org.kde.krunner1");
  await iface.Run(tabId, "");
}

// ── Launcher (enables CDP on new instances) ────────────────────────────────────

const APP_CDP_PORTS = {
  brave: 9222,
  chrome: 9222,
  chromium: 9222,
  code: 9223,
  vscode: 9223,
};

const APP_COMMANDS = {
  brave: "brave",
  chrome: "google-chrome-stable",
  chromium: "chromium",
  code: "code",
  vscode: "code",
};

/**
 * Launch an Electron/Chromium app with CDP enabled.
 * Returns the port number for CDP connection.
 */
function launchWithCDP(app, args = []) {
  const appKey = app.toLowerCase();
  const port = APP_CDP_PORTS[appKey];
  const command = APP_COMMANDS[appKey];

  if (!port || !command) {
    throw new Error(
      `Unknown app "${app}". Supported: ${Object.keys(APP_COMMANDS).join(", ")}`
    );
  }

  const fullArgs = [`--remote-debugging-port=${port}`, ...args];
  const child = spawn(command, fullArgs, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { port, pid: child.pid };
}

// ── PBI Page Content (live browser, no relaunch) ───────────────────────────────

/**
 * Read page content from the active browser tab via Plasma Browser Integration.
 * Requires the modified PBI with the pagecontent plugin installed.
 * Returns { title, url, text, headings, links, buttons, inputs } or null.
 */
async function readPageContentViaPBI(tabId) {
  const bus = getBus();
  const proxy = await bus.getProxyObject(
    "org.kde.plasma.browser_integration",
    "/PageContent"
  );
  const iface = proxy.getInterface("org.kde.pbi.PageContent");

  let jsonStr;
  if (tabId !== undefined && tabId !== null && tabId !== -1) {
    jsonStr = await iface.GetContent(tabId);
  } else {
    jsonStr = await iface.GetActiveContent();
  }
  return JSON.parse(jsonStr);
}

// ── Combined reader ────────────────────────────────────────────────────────────

/**
 * Read browser content using the best available method:
 * 1. PBI PageContent (full DOM, live browser, no relaunch)
 * 2. CDP if available (full page content, needs --remote-debugging-port)
 * 3. Plasma Browser Integration tabs (titles only)
 */
async function readBrowserContent(query) {
  const q = (query || "").toLowerCase();

  // Try PBI page content first (works on live browser)
  try {
    const content = await readPageContentViaPBI(null);
    if (content && content.title) {
      return { method: "pbi", pages: [content] };
    }
  } catch {
    // PBI pagecontent plugin not available, fall through
  }

  // Try CDP (full content, needs --remote-debugging-port)
  const cdpApps = await findCDPApps();
  if (cdpApps.length) {
    const results = [];
    for (const app of cdpApps) {
      for (const target of app.targets) {
        if (q && !target.title.toLowerCase().includes(q) && !target.url?.toLowerCase().includes(q)) {
          continue;
        }
        try {
          const content = await readPageContent(target.wsUrl);
          results.push({ source: "cdp", port: app.port, ...content });
        } catch (e) {
          results.push({ source: "cdp", title: target.title, error: e.message });
        }
      }
    }
    if (results.length) return { method: "cdp", pages: results };
  }

  // Fall back to Plasma Browser Integration (tab titles only)
  try {
    const tabs = await listBrowserTabs();
    const filtered = q
      ? tabs.filter((t) => t.title.toLowerCase().includes(q))
      : tabs;
    return { method: "plasma", tabs: filtered };
  } catch {
    return null;
  }
}

module.exports = {
  listBrowserTabs,
  activateBrowserTab,
  launchWithCDP,
  readBrowserContent,
  readPageContentViaPBI,
};
