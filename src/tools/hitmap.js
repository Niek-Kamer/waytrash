const { z } = require("zod");
const { buildBrowserHitMap, buildATSPIHitMap } = require("../helpers/hitmap");
const { execSync } = require("child_process");
const path = require("path");

const ATSPI_HELPER = path.join(__dirname, "..", "helpers", "atspi-helper.py");

function formatTarget(t, index) {
  return `${index}. [${t.type}] "${t.label}" → click(${t.screen.cx}, ${t.screen.cy})  bounds(${t.screen.x},${t.screen.y} ${t.screen.w}x${t.screen.h})`;
}

function register(server) {
  server.registerTool(
    "get_clickable_elements",
    {
      description:
        "Get all clickable elements on screen with their exact screen coordinates. " +
        "For browsers: extracts buttons, links, inputs from the active page via Plasma Browser Integration. " +
        "For KDE apps: uses AT-SPI accessibility tree. " +
        "Returns elements with click(x, y) coordinates ready for mouse_click. " +
        "Use this instead of screenshots to find where to click.",
      inputSchema: {
        source: z.enum(["browser", "app"]).optional().describe(
          "'browser' for active browser tab (default), 'app' for AT-SPI accessibility tree"
        ),
        app: z.string().optional().describe("For source='app': filter to app name (e.g. 'dolphin', 'systemsettings')"),
        filter: z.string().optional().describe("Filter elements by label text (case-insensitive)"),
      },
    },
    async ({ source, app, filter }) => {
      try {
        const src = source || "browser";

        if (src === "browser") {
          const hitmap = await buildBrowserHitMap();
          let targets = hitmap.targets;

          if (filter) {
            const f = filter.toLowerCase();
            targets = targets.filter((t) => t.label.toLowerCase().includes(f));
          }

          if (!targets.length) {
            return { content: [{ type: "text", text: `No clickable elements found${filter ? ` matching "${filter}"` : ""}` }] };
          }

          const header = `Page: "${hitmap.page.title}"\nWindow content at: (${hitmap.window.x},${hitmap.window.y})\n`;
          const lines = targets.map((t, i) => formatTarget(t, i + 1));
          return { content: [{ type: "text", text: header + lines.join("\n") }] };
        }

        if (src === "app") {
          const appArg = app ? `"${app.replace(/"/g, '\\"')}"` : '""';
          const output = execSync(
            `python3 "${ATSPI_HELPER}" tree ${appArg} 10`,
            { encoding: "utf8", timeout: 15000 }
          );
          const data = JSON.parse(output);
          if (!data.length) {
            return { content: [{ type: "text", text: `No accessibility data for "${app || "any app"}". App may need restart.` }] };
          }

          const allTargets = [];
          for (const appData of data) {
            const targets = buildATSPIHitMap(appData.elements);
            for (const t of targets) {
              t.app = appData.app;
              allTargets.push(t);
            }
          }

          let filtered = allTargets;
          if (filter) {
            const f = filter.toLowerCase();
            filtered = allTargets.filter((t) => t.label.toLowerCase().includes(f));
          }

          if (!filtered.length) {
            return { content: [{ type: "text", text: `No interactive elements found${filter ? ` matching "${filter}"` : ""}` }] };
          }

          const lines = filtered.map((t, i) => {
            const appPrefix = data.length > 1 ? `[${t.app}] ` : "";
            return `${i + 1}. ${appPrefix}[${t.type}] "${t.label}" → click(${t.screen.cx}, ${t.screen.cy})`;
          });
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        return { content: [{ type: "text", text: `Unknown source: ${src}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Hit map failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
