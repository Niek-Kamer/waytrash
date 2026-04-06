const { z } = require("zod");
const {
  discoverApps,
  readAppContent,
  klipperGetContents,
  klipperGetHistory,
} = require("../helpers/kde-content");
const { readBrowserContent, listBrowserTabs, activateBrowserTab } = require("../helpers/browser");

function formatPageContent(page) {
  const lines = [];
  lines.push(`"${page.title}" — ${page.url}`);

  if (page.headings?.length) {
    lines.push("\nStructure:");
    for (const h of page.headings) {
      lines.push(`${"  ".repeat(h.level - 1)}${"#".repeat(h.level)} ${h.text}`);
    }
  }

  if (page.text) {
    lines.push("\nText:");
    lines.push(page.text.substring(0, 1500));
  }

  if (page.inputs?.length) {
    lines.push("\nInputs:");
    for (const inp of page.inputs) {
      const label = inp.label || inp.name || inp.placeholder || "(unnamed)";
      const val = inp.value ? ` = "${inp.value}"` : "";
      lines.push(`  [${inp.type}] ${label}${val}`);
    }
  }

  if (page.buttons?.length) {
    lines.push("\nButtons:");
    for (const b of page.buttons) {
      const dis = b.disabled ? " (disabled)" : "";
      lines.push(`  [${b.tag}] "${b.text}"${dis}`);
    }
  }

  if (page.links?.length) {
    lines.push("\nLinks:");
    for (const l of page.links) {
      lines.push(`  "${l.text}" → ${l.href}`);
    }
  }

  return lines.join("\n");
}

function register(server) {
  server.registerTool(
    "get_content",
    {
      description:
        "Read the content of a running app without taking a screenshot. " +
        "For Konsole: returns terminal text of all tabs. " +
        "For browsers (Brave/Chrome/Firefox): lists open tabs via Plasma Browser Integration. " +
        "If browser was launched with --remote-debugging-port, returns full page content (text, links, buttons, inputs). " +
        "For clipboard: returns clipboard contents. " +
        "Query by app name ('konsole', 'brave', 'browser', 'clipboard') or PID.",
      inputSchema: {
        query: z.string().describe(
          "App name ('konsole', 'brave', 'browser', 'clipboard') or PID"
        ),
      },
    },
    async ({ query }) => {
      try {
        const q = query.toLowerCase();

        // Browser apps — try CDP first, then Plasma Integration
        if (["browser", "brave", "chrome", "chromium", "firefox", "cdp", "code", "vscode", "electron"].includes(q)) {
          const result = await readBrowserContent(q === "browser" ? "" : q);

          if (!result) {
            return {
              content: [{ type: "text", text: "No browser data available. Is Plasma Browser Integration installed?" }],
            };
          }

          if (result.method === "cdp") {
            const lines = result.pages.map((p) =>
              p.error ? `"${p.title}" — Error: ${p.error}` : formatPageContent(p)
            );
            return { content: [{ type: "text", text: lines.join("\n\n") }] };
          }

          // Plasma integration — tab titles only
          if (!result.tabs.length) {
            return { content: [{ type: "text", text: `No browser tabs matching "${query}"` }] };
          }
          const lines = result.tabs.map((t, i) => `${i + 1}. "${t.title}" (id: ${t.id})`);
          lines.push("\nNote: Tab titles only. For full page content, launch browser with --remote-debugging-port=9222");
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        // KDE apps (Konsole, Klipper, etc.)
        const result = await readAppContent(query);
        if (!result) {
          // Check browser tabs as fallback
          try {
            const tabs = await listBrowserTabs();
            const match = tabs.filter((t) => t.title.toLowerCase().includes(q));
            if (match.length) {
              const lines = match.map((t, i) => `${i + 1}. "${t.title}" (id: ${t.id})`);
              return { content: [{ type: "text", text: `Browser tabs matching "${query}":\n${lines.join("\n")}` }] };
            }
          } catch {}

          const apps = await discoverApps();
          const list = apps.map((a) => `${a.app} (PID: ${a.pid})`).join(", ");
          return {
            content: [{
              type: "text",
              text: `No readable app matching "${query}". Available: ${list || "none"}, browser, clipboard`,
            }],
          };
        }

        switch (result.type) {
          case "konsole": {
            const lines = [];
            for (const s of result.sessions) {
              const marker = s.active ? " [ACTIVE]" : "";
              lines.push(`── Tab: "${s.title}" (PID: ${s.pid}, fg: ${s.foregroundPid})${marker} ──`);
              const textLines = s.text.split("\n");
              const trimmed = textLines.slice(-50).join("\n").trimEnd();
              lines.push(trimmed);
              lines.push("");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "klipper":
            return {
              content: [{ type: "text", text: `Clipboard: ${result.contents}` }],
            };

          default:
            return {
              content: [{
                type: "text",
                text: `App "${result.app}" (${result.service}) detected but no content reader available yet.`,
              }],
            };
        }
      } catch (err) {
        return { content: [{ type: "text", text: `Content read failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "list_browser_tabs",
    {
      description:
        "List all open browser tabs with their titles. Uses Plasma Browser Integration — " +
        "works on live Brave/Chrome/Firefox without relaunch. Can also activate (focus) a tab by ID.",
      inputSchema: {
        action: z.enum(["list", "activate"]).optional().describe("Action: 'list' (default) or 'activate'"),
        tabId: z.string().optional().describe("Tab ID to activate (from a previous list call)"),
      },
    },
    async ({ action, tabId }) => {
      try {
        if (action === "activate" && tabId) {
          await activateBrowserTab(tabId);
          return { content: [{ type: "text", text: `Activated tab ${tabId}` }] };
        }

        const tabs = await listBrowserTabs();
        if (!tabs.length) {
          return { content: [{ type: "text", text: "No browser tabs found. Is Plasma Browser Integration installed?" }] };
        }
        const lines = tabs.map((t, i) => `${i + 1}. "${t.title}" (id: ${t.id})`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Browser tabs failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "get_clipboard",
    {
      description: "Get the current clipboard contents and optionally recent history.",
      inputSchema: {
        history: z.coerce.number().optional().describe("Number of recent clipboard items to return (default: just current)"),
      },
    },
    async ({ history }) => {
      try {
        if (history) {
          const items = await klipperGetHistory(history);
          const lines = items.map((item, i) => `${i + 1}. ${item.substring(0, 200)}`);
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        const contents = await klipperGetContents();
        return { content: [{ type: "text", text: contents }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Clipboard read failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
