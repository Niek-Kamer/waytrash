const { z } = require("zod");
const { queryKwin } = require("../kwin/bridge");
const { runKwinScript } = require("../kwin/runner");

// KWin script body shared by list_windows and get_window_geometry.
// Collects all window data in one compositor call: identity, geometry,
// state, relationships, stacking order — everything Claude needs to
// navigate without a screenshot.
const WINDOW_QUERY_SCRIPT = `
  var stack = workspace.stackingOrder;
  var zMap = {};
  for (var i = 0; i < stack.length; i++) {
    zMap[stack[i].internalId] = i;
  }

  var clients = workspace.windowList();
  var result = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    if (!c.normalWindow && !c.dialog) continue;
    result.push({
      caption: c.caption,
      resourceClass: c.resourceClass,
      resourceName: c.resourceName,
      pid: c.pid,
      active: c.active,
      frame: {x: c.frameGeometry.x, y: c.frameGeometry.y, w: c.frameGeometry.width, h: c.frameGeometry.height},
      content: {x: c.clientGeometry.x, y: c.clientGeometry.y, w: c.clientGeometry.width, h: c.clientGeometry.height},
      minimized: c.minimized,
      fullScreen: c.fullScreen,
      keepAbove: c.keepAbove,
      opacity: c.opacity,
      dialog: c.dialog,
      transient: c.transient,
      transientFor: c.transientFor ? c.transientFor.caption : null,
      output: c.output ? c.output.name : null,
      desktop: c.desktops.length ? c.desktops[0].name : null,
      z: zMap[c.internalId] !== undefined ? zMap[c.internalId] : -1
    });
  }
  result.sort(function(a, b) { return b.z - a.z; });
`;

function formatWindow(w) {
  const flags = [];
  if (w.active) flags.push("ACTIVE");
  if (w.minimized) flags.push("minimized");
  if (w.fullScreen) flags.push("fullscreen");
  if (w.keepAbove) flags.push("pinned");
  if (w.dialog) flags.push("dialog");
  if (w.opacity < 1) flags.push(`opacity:${w.opacity}`);
  const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";

  const parent = w.transientFor ? `  Parent: "${w.transientFor}"` : "";

  return (
    `"${w.caption}" (${w.resourceClass}) PID:${w.pid}${flagStr}\n` +
    `  Frame: (${w.frame.x},${w.frame.y}) ${w.frame.w}x${w.frame.h}\n` +
    `  Content: (${w.content.x},${w.content.y}) ${w.content.w}x${w.content.h}\n` +
    `  Output: ${w.output}  Desktop: ${w.desktop}  Z: ${w.z}${parent}`
  );
}

function register(server) {
  server.registerTool(
    "list_windows",
    {
      description:
        "List all open windows with geometry, state, PID, stacking order, and monitor. " +
        "Returns structured text — use instead of screenshots for navigation. " +
        "Sorted by stacking order (topmost first).",
      inputSchema: {},
    },
    async () => {
      try {
        const windows = await queryKwin("claudeListWindows", WINDOW_QUERY_SCRIPT);
        if (!windows.length) {
          return { content: [{ type: "text", text: "No windows found" }] };
        }
        const formatted = windows.map((w, i) => `${i + 1}. ${formatWindow(w)}`).join("\n\n");
        return { content: [{ type: "text", text: formatted }] };
      } catch (err) {
        return { content: [{ type: "text", text: `List windows failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "get_window_geometry",
    {
      description:
        "Get exact geometry and state of windows matching a query. " +
        "Search by title, app class, or PID. Returns frame bounds (including decorations), " +
        "content bounds (excluding decorations), stacking order, and relationships. " +
        "Use instead of screenshots when you need to know where a window is.",
      inputSchema: {
        query: z.string().describe("Window title (partial match), resourceClass (e.g. 'konsole'), or PID"),
      },
    },
    async ({ query }) => {
      try {
        const windows = await queryKwin("claudeGetGeometry", WINDOW_QUERY_SCRIPT);
        const q = query.toLowerCase();
        const pidQuery = parseInt(query, 10);

        const matches = windows.filter(
          (w) =>
            (w.caption || "").toLowerCase().includes(q) ||
            (w.resourceClass || "").toLowerCase().includes(q) ||
            (w.resourceName || "").toLowerCase().includes(q) ||
            (pidQuery && w.pid === pidQuery)
        );

        if (!matches.length) {
          return { content: [{ type: "text", text: `No windows matching "${query}"` }] };
        }
        const formatted = matches.map((w, i) => `${i + 1}. ${formatWindow(w)}`).join("\n\n");
        return { content: [{ type: "text", text: formatted }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Get window geometry failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "focus_window",
    {
      description: "Bring a window to focus by its title (partial match).",
      inputSchema: {
        title: z.string().describe("Part of the window title to match"),
      },
    },
    async ({ title }) => {
      try {
        const script = `
          var clients = workspace.windowList();
          for (var i = 0; i < clients.length; i++) {
            if (clients[i].caption.toLowerCase().indexOf("${title.toLowerCase().replace(/"/g, '\\"')}") !== -1) {
              workspace.activeWindow = clients[i];
              break;
            }
          }
        `;
        runKwinScript("claudeFocusWindow", script);
        return { content: [{ type: "text", text: `Focused window matching "${title}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Focus failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
