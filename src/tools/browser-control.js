const { z } = require("zod");
const dbus = require("dbus-next");

const PBI_SERVICE = "org.kde.plasma.browser_integration";
const PBI_PATH = "/PageContent";
const PBI_IFACE = "org.kde.pbi.PageContent";

async function callPBI(method, ...args) {
  const bus = dbus.sessionBus();
  const proxy = await bus.getProxyObject(PBI_SERVICE, PBI_PATH);
  const iface = proxy.getInterface(PBI_IFACE);
  const result = await iface[method](...args);
  return typeof result === "string" && result.startsWith("{") ? JSON.parse(result) : result;
}

function register(server) {
  server.registerTool(
    "browser_navigate",
    {
      description:
        "Navigate the active browser tab to a URL. Waits for the page to load. " +
        "Returns the page title once loaded.",
      inputSchema: {
        url: z.string().describe("URL to navigate to"),
      },
    },
    async ({ url }) => {
      try {
        const result = await callPBI("Navigate", url);
        return { content: [{ type: "text", text: `Navigated to: "${result.title}" — ${url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Navigate failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_click",
    {
      description:
        "Click an element in the active browser tab. No screenshots needed. " +
        "Selector can be: CSS selector (e.g. '#submit', '.btn'), " +
        "text match (e.g. 'text:Sign In'), " +
        "or index from get_clickable_elements (e.g. 'link:3', 'button:0', 'input:1').",
      inputSchema: {
        selector: z.string().describe("Element selector: CSS, 'text:Label', or 'link:N'/'button:N'/'input:N'"),
      },
    },
    async ({ selector }) => {
      try {
        const result = await callPBI("ClickElement", selector);
        return { content: [{ type: "text", text: `Clicked [${result.tag}] "${result.text}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Click failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_type",
    {
      description:
        "Type text into an input element in the active browser tab. " +
        "Finds the element, focuses it, clears it, and types the text. " +
        "Selector can be: CSS selector, 'text:Label', or 'input:N'.",
      inputSchema: {
        selector: z.string().describe("Element selector"),
        text: z.string().describe("Text to type"),
      },
    },
    async ({ selector, text }) => {
      try {
        const result = await callPBI("TypeInElement", selector, text);
        return { content: [{ type: "text", text: `Typed "${text}" into ${selector}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Type failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_scroll",
    {
      description:
        "Scroll the active browser page. Direction: 'down', 'up', 'top', 'bottom'. " +
        "Returns current scroll position.",
      inputSchema: {
        direction: z.enum(["down", "up", "left", "right", "top", "bottom"]).describe("Scroll direction"),
        amount: z.coerce.number().optional().describe("Scroll amount in page-heights (default 1)"),
      },
    },
    async ({ direction, amount }) => {
      try {
        const result = await callPBI("ScrollPage", direction, amount || 1);
        return {
          content: [{
            type: "text",
            text: `Scrolled ${direction}. Position: ${result.scrollY}/${result.scrollHeight - result.viewportHeight}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Scroll failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_back",
    {
      description: "Go back in browser history.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await callPBI("GoBack");
        return { content: [{ type: "text", text: `Back to: "${result.title}" — ${result.url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Back failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_forward",
    {
      description: "Go forward in browser history.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await callPBI("GoForward");
        return { content: [{ type: "text", text: `Forward to: "${result.title}" — ${result.url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Forward failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_new_tab",
    {
      description: "Open a new browser tab, optionally with a URL.",
      inputSchema: {
        url: z.string().optional().describe("URL to open (default: blank tab)"),
      },
    },
    async ({ url }) => {
      try {
        const result = await callPBI("CreateTab", url || "about:blank");
        return { content: [{ type: "text", text: `New tab ${result.tabId}: "${result.title}" — ${result.url}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `New tab failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_close_tab",
    {
      description: "Close a browser tab by ID. Use -1 for the active tab.",
      inputSchema: {
        tabId: z.coerce.number().optional().describe("Tab ID to close (-1 for active, from list_browser_tabs)"),
      },
    },
    async ({ tabId }) => {
      try {
        const result = await callPBI("CloseTab", tabId ?? -1);
        return { content: [{ type: "text", text: `Closed tab ${result.closed}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Close tab failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_search",
    {
      description:
        "Search the web and return structured results. Navigates to a search engine, " +
        "submits the query, and returns the result titles, snippets, and URLs. " +
        "No screenshots needed — results come back as structured text.",
      inputSchema: {
        query: z.string().describe("Search query"),
        engine: z.enum(["google", "duckduckgo"]).optional().describe("Search engine (default: google)"),
      },
    },
    async ({ query, engine }) => {
      try {
        const eng = engine || "google";
        const searchUrl = eng === "duckduckgo"
          ? `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
          : `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        // Navigate to search
        await callPBI("Navigate", searchUrl);

        // Wait a moment for JS rendering, then read content
        await new Promise((r) => setTimeout(r, 1000));
        const page = await callPBI("GetActiveContent");
        const content = typeof page === "string" ? JSON.parse(page) : page;

        // Extract search results from the page structure
        const lines = [];
        lines.push(`Search: "${query}" (${eng})`);
        lines.push(`URL: ${content.url}\n`);

        // Headings often contain result titles
        if (content.headings?.length) {
          lines.push("Results:");
          for (const h of content.headings) {
            lines.push(`  ${h.text}`);
          }
          lines.push("");
        }

        // Links are the actual search result URLs
        if (content.links?.length) {
          const resultLinks = content.links.filter((l) =>
            !l.href.includes("google.com/search") &&
            !l.href.includes("accounts.google") &&
            !l.href.includes("support.google") &&
            !l.href.includes("policies.google") &&
            !l.href.includes("duckduckgo.com") &&
            l.text.length > 2
          ).slice(0, 15);

          lines.push(`Links (${resultLinks.length}):`);
          for (let i = 0; i < resultLinks.length; i++) {
            lines.push(`${i + 1}. "${resultLinks[i].text}" → ${resultLinks[i].href}`);
          }
        }

        // Page text contains snippets
        if (content.text) {
          lines.push("\nPage text (first 2000 chars):");
          lines.push(content.text.substring(0, 2000));
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Search failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
