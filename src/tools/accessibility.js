const { z } = require("zod");
const { execSync } = require("child_process");
const path = require("path");

const ATSPI_HELPER = path.join(__dirname, "..", "helpers", "atspi-helper.py");

function register(server) {
  server.registerTool(
    "get_accessibility_tree",
    {
      description:
        "Get the accessibility tree of UI elements on screen. Returns structured element data " +
        "(name, role, position, size, actions, states) for all visible elements. " +
        "Optionally filter to a specific application. Use this to understand what's on screen " +
        "and find precise coordinates for clicking.",
      inputSchema: {
        app: z.string().optional().describe("Filter to app name (partial match, e.g. 'konsole', 'brave')"),
        maxDepth: z.coerce.number().optional().describe("Max tree depth to traverse (default 10)"),
      },
    },
    async ({ app, maxDepth }) => {
      try {
        const appArg = app ? `"${app.replace(/"/g, '\\"')}"` : '""';
        const depth = maxDepth || 10;
        const output = execSync(
          `python3 "${ATSPI_HELPER}" tree ${appArg} ${depth}`,
          { encoding: "utf8", timeout: 15000 }
        );
        const data = JSON.parse(output);

        if (!data.length) {
          return {
            content: [{
              type: "text",
              text: app
                ? `No accessibility data for "${app}". The app may need to be restarted after enabling accessibility.`
                : "No accessibility data found. Apps started before enabling accessibility need to be restarted.",
            }],
          };
        }

        const lines = [];
        for (const appData of data) {
          lines.push(`\n=== ${appData.app} ===`);
          for (const el of appData.elements) {
            const indent = "  ".repeat(Math.min(el.depth, 6));
            const name = el.name ? `"${el.name}"` : "(unnamed)";
            const actions = el.actions.length ? ` [actions: ${el.actions.join(", ")}]` : "";
            const states = el.states.length ? ` {${el.states.join(", ")}}` : "";
            const text = el.text ? ` text="${el.text.substring(0, 50)}"` : "";
            lines.push(
              `${indent}${el.role} ${name} @ (${el.x},${el.y}) ${el.width}x${el.height}${actions}${states}${text}`
            );
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Accessibility tree failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "find_element",
    {
      description:
        "Search for UI elements by name/text and optional role. Returns matching elements with " +
        "their exact screen coordinates — use these coordinates with mouse_click to interact.",
      inputSchema: {
        query: z.string().describe("Text to search for in element names and text content (case-insensitive)"),
        role: z.string().optional().describe("Filter by element role (e.g. 'button', 'menu item', 'check box', 'text')"),
      },
    },
    async ({ query, role }) => {
      try {
        const queryArg = `"${query.replace(/"/g, '\\"')}"`;
        const roleArg = role ? `"${role.replace(/"/g, '\\"')}"` : "";
        const output = execSync(
          `python3 "${ATSPI_HELPER}" find ${queryArg} ${roleArg}`,
          { encoding: "utf8", timeout: 15000 }
        );
        const matches = JSON.parse(output);

        if (!matches.length) {
          return {
            content: [{
              type: "text",
              text: `No elements found matching "${query}"${role ? ` with role "${role}"` : ""}. ` +
                "Try a broader search, or the app may need to be restarted after enabling accessibility.",
            }],
          };
        }

        const lines = matches.map((el, i) => {
          const center = `center: (${el.x + Math.round(el.width / 2)}, ${el.y + Math.round(el.height / 2)})`;
          const actions = el.actions.length ? ` [actions: ${el.actions.join(", ")}]` : "";
          const text = el.text ? ` text="${el.text.substring(0, 50)}"` : "";
          return (
            `${i + 1}. [${el.app}] ${el.role} "${el.name}" @ (${el.x},${el.y}) ${el.width}x${el.height} — ${center}${actions}${text}`
          );
        });

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Find element failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "list_accessible_apps",
    {
      description:
        "List all applications that expose accessibility data. Apps with 0 children were likely " +
        "started before accessibility was enabled and need to be restarted.",
      inputSchema: {},
    },
    async () => {
      try {
        const output = execSync(
          `python3 "${ATSPI_HELPER}" apps`,
          { encoding: "utf8", timeout: 10000 }
        );
        const apps = JSON.parse(output);
        const lines = apps.map(
          (a) => `${a.name || "(unnamed)"}: ${a.children} top-level elements${a.children === 0 ? " (needs restart for accessibility)" : ""}`
        );
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `List apps failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
