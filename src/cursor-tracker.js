const dbus = require("dbus-next");
const path = require("path");
const { loadKwinScript, unloadKwinScript } = require("./kwin/runner");

const KWIN_SCRIPT = path.resolve(__dirname, "kwin", "cursor.js");
const SCRIPT_NAME = "cursorTracker";

class CursorTracker extends dbus.interface.Interface {
  Update(x, y) {
    process.stdout.write(`\r  x: ${x}  y: ${y}    `);
  }
}

CursorTracker.configureMembers({
  methods: { Update: { inSignature: "ii", outSignature: "" } },
});

async function main() {
  const bus = dbus.sessionBus();

  await bus.requestName("com.cursor.Tracker", 0);
  bus.export("/Cursor", new CursorTracker("com.cursor.Tracker"));

  loadKwinScript(SCRIPT_NAME, KWIN_SCRIPT);
  console.log("Tracking cursor. Move your mouse. Ctrl+C to stop.\n");

  process.on("SIGINT", () => {
    console.log("\n\nCleaning up...");
    unloadKwinScript(SCRIPT_NAME);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
