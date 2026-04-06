const dbus = require("dbus-next");
const { execSync } = require("child_process");
const fs = require("fs");

const BUS_NAME = "com.cursor.Tracker";
const OBJ_PATH = "/Cursor";

let _bridge = null;
const _pending = new Map();

/**
 * DBus service that receives results from KWin scripts via callDBus().
 * Uses module-level _pending map since dbus-next doesn't support constructors.
 */
class KWinBridge extends dbus.interface.Interface {
  Respond(requestId, jsonData) {
    const resolve = _pending.get(requestId);
    if (resolve) {
      _pending.delete(requestId);
      resolve(jsonData);
    }
  }
}

KWinBridge.configureMembers({
  methods: {
    Respond: { inSignature: "ss", outSignature: "" },
  },
});

/**
 * Register a pending request and return a promise that resolves when
 * the KWin script calls Respond().
 */
function expect(requestId, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(requestId);
      reject(new Error(`KWin bridge timeout for request "${requestId}"`));
    }, timeoutMs);

    _pending.set(requestId, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Initialize the DBus bridge. Call once at server startup.
 * Safe to call multiple times — returns the existing bridge if already running.
 */
async function initBridge() {
  if (_bridge) return _bridge;

  const bus = dbus.sessionBus();
  await bus.requestName(BUS_NAME, 0);
  _bridge = new KWinBridge(BUS_NAME);
  bus.export(OBJ_PATH, _bridge);
  return _bridge;
}

/**
 * Run a KWin script that calls back to the bridge with results.
 *
 * The scriptBody should be a function body that builds a result and ends with:
 *   callDBus("com.cursor.Tracker", "/Cursor", "com.cursor.Tracker", "Respond", REQUEST_ID, JSON.stringify(result));
 *
 * Use the helper `wrapScript()` to handle this automatically — just write the
 * script body that builds and returns the `result` variable.
 */
async function queryKwin(name, scriptBody, { timeoutMs = 3000 } = {}) {
  const bridge = await initBridge();
  const requestId = `${name}_${Date.now()}`;

  // Wrap the script body to call back to our bridge
  const fullScript = `
(function() {
  var REQUEST_ID = "${requestId}";
  ${scriptBody}
  callDBus("${BUS_NAME}", "${OBJ_PATH}", "${BUS_NAME}", "Respond", REQUEST_ID, JSON.stringify(result));
})();
`;

  const tmpPath = `/tmp/claude-${name}.js`;
  fs.writeFileSync(tmpPath, fullScript);

  const promise = expect(requestId, timeoutMs);

  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}" 2>/dev/null`
    );
  } catch {}

  execSync(
    `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "${tmpPath}" "${name}"`,
    { encoding: "utf8" }
  );
  execSync("qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start");

  try {
    const json = await promise;
    return JSON.parse(json);
  } finally {
    try {
      execSync(
        `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}" 2>/dev/null`
      );
    } catch {}
  }
}

module.exports = { initBridge, queryKwin };
