const dbus = require("dbus-next");
const { execSync } = require("child_process");
const path = require("path");

const KWIN_SCRIPT = path.resolve(__dirname, "kwin-cursor.js");
const SCRIPT_NAME = "cursorTracker";

// D-Bus interface that receives cursor position updates from the KWin script.
class CursorTracker extends dbus.interface.Interface {
  Update(x, y) {
    process.stdout.write(`\r  x: ${x}  y: ${y}    `);
  }
}

CursorTracker.configureMembers({
  methods: { Update: { inSignature: "ii", outSignature: "" } },
});

function loadKwinScript() {
  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${SCRIPT_NAME}" 2>/dev/null`
    );
  } catch {}

  execSync(
    `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "${KWIN_SCRIPT}" "${SCRIPT_NAME}"`,
    { encoding: "utf8" }
  );
  execSync("qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start");
}

function unloadKwinScript() {
  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${SCRIPT_NAME}"`
    );
  } catch {}
}

async function main() {
  const bus = dbus.sessionBus();

  await bus.requestName("com.cursor.Tracker", 0);
  bus.export("/Cursor", new CursorTracker("com.cursor.Tracker"));

  loadKwinScript();
  console.log("Tracking cursor. Move your mouse. Ctrl+C to stop.\n");

  process.on("SIGINT", () => {
    console.log("\n\nCleaning up...");
    unloadKwinScript();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
