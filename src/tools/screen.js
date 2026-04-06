const { z } = require("zod");
const { execSync } = require("child_process");

function register(server) {
  server.registerTool(
    "get_screen_info",
    {
      description: "Get screen resolution and display information.",
      inputSchema: {},
    },
    async () => {
      try {
        const info = execSync(
          "qdbus org.kde.KWin /KWin org.kde.KWin.supportInformation 2>/dev/null",
          { encoding: "utf8" }
        );
        const screenLines = info.split("\n").filter(l =>
          l.includes("Geometry") || l.includes("resolution") || l.includes("Scale") || l.includes("Name:")
        ).slice(0, 10);
        return { content: [{ type: "text", text: screenLines.join("\n") || "Could not parse screen info" }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Screen info failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
