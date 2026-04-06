const dbus = require("dbus-next");

function getBus() {
  return dbus.sessionBus();
}

/**
 * Discover running KDE apps on the session bus that we can read content from.
 * Returns array of { service, type, pid } for apps we have readers for.
 */
async function discoverApps() {
  const bus = getBus();
  const dbusProxy = await bus.getProxyObject("org.freedesktop.DBus", "/org/freedesktop/DBus");
  const dbusIface = dbusProxy.getInterface("org.freedesktop.DBus");
  const names = await dbusIface.ListNames();

  const apps = [];
  for (const name of names) {
    const match = name.match(/^org\.kde\.(\w+)-(\d+)$/);
    if (match) {
      apps.push({ service: name, app: match[1], pid: parseInt(match[2], 10) });
    }
  }
  return apps;
}

// ── Konsole ────────────────────────────────────────────────────────────────────

async function konsoleGetSessions(service) {
  const bus = getBus();
  const proxy = await bus.getProxyObject(service, "/Windows/1");
  const iface = proxy.getInterface("org.kde.konsole.Window");
  const sessionList = await iface.sessionList();
  const currentSession = await iface.currentSession();
  return { sessions: sessionList, current: currentSession };
}

async function konsoleReadSession(service, sessionId) {
  const bus = getBus();
  const proxy = await bus.getProxyObject(service, `/Sessions/${sessionId}`);
  const iface = proxy.getInterface("org.kde.konsole.Session");

  const text = await iface.getAllDisplayedText();
  const pid = await iface.processId();
  const fgPid = await iface.foregroundProcessId();
  const title = await iface.title(1); // 1 = displayed title

  return { sessionId, title, pid, foregroundPid: fgPid, text };
}

async function konsoleReadAll(service) {
  const { sessions, current } = await konsoleGetSessions(service);
  const results = [];
  for (const sid of sessions) {
    const session = await konsoleReadSession(service, parseInt(sid, 10));
    session.active = parseInt(sid, 10) === current;
    results.push(session);
  }
  return results;
}

// ── Klipper (clipboard) ────────────────────────────────────────────────────────

async function klipperGetContents() {
  const bus = getBus();
  const proxy = await bus.getProxyObject("org.kde.klipper", "/klipper");
  const iface = proxy.getInterface("org.kde.klipper.klipper");
  const contents = await iface.getClipboardContents();
  return contents;
}

async function klipperGetHistory(count = 5) {
  const bus = getBus();
  const proxy = await bus.getProxyObject("org.kde.klipper", "/klipper");
  const iface = proxy.getInterface("org.kde.klipper.klipper");
  const items = [];
  for (let i = 0; i < count; i++) {
    try {
      const item = await iface.getClipboardHistoryItem(i);
      if (item) items.push(item);
      else break;
    } catch { break; }
  }
  return items;
}

// ── Generic content reader ─────────────────────────────────────────────────────

/**
 * Read content from a KDE app by name or PID.
 * Auto-detects the app type and uses the appropriate reader.
 */
async function readAppContent(query) {
  const apps = await discoverApps();
  const q = query.toLowerCase();
  const pidQuery = parseInt(query, 10);

  // Find matching app
  const match = apps.find(
    (a) => a.app.toLowerCase().includes(q) || a.pid === pidQuery
  );

  if (!match) {
    // Check non-PID services like klipper
    if (q.includes("clip") || q.includes("klipper")) {
      const contents = await klipperGetContents();
      return { type: "klipper", contents };
    }
    return null;
  }

  switch (match.app) {
    case "konsole":
      const sessions = await konsoleReadAll(match.service);
      return { type: "konsole", service: match.service, pid: match.pid, sessions };
    default:
      return { type: "unknown", service: match.service, app: match.app, pid: match.pid };
  }
}

module.exports = {
  discoverApps,
  konsoleGetSessions,
  konsoleReadSession,
  konsoleReadAll,
  klipperGetContents,
  klipperGetHistory,
  readAppContent,
};
