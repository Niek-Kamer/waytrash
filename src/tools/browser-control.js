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
    "browser_extract",
    {
      description:
        "Extract structured data from repeating elements on the current page. " +
        "Perfect for scraping listings, search results, tables, feeds, etc. " +
        "Provide a CSS selector for the repeating container and field definitions " +
        "to extract from each container. Fields use 'selector' for text content " +
        "or 'selector@attr' for an attribute (e.g. 'a@href' for link URL, 'img@src' for image). " +
        "Use empty string '' as selector to target the container itself. " +
        "Example: containerSelector='.listing', fields={title: 'h2', price: '.price', link: 'a@href'}",
      inputSchema: {
        containerSelector: z.string().describe(
          "CSS selector matching each repeating item (e.g. '.search-result', 'tr.listing', '[data-testid=\"property-card\"]')"
        ),
        fields: z.record(z.string(), z.string()).describe(
          "Map of field names to selectors. Use 'selector' for text, 'selector@attr' for attribute. " +
          "Examples: {title: 'h2', price: '.price', url: 'a@href', image: 'img@src'}"
        ),
        limit: z.coerce.number().optional().describe("Max items to extract (default: all)"),
      },
    },
    async ({ containerSelector, fields, limit }) => {
      try {
        const fieldsJson = JSON.stringify(fields);
        const result = await callPBI("ExtractData", containerSelector, fieldsJson, limit || 0);
        const data = typeof result === "string" ? JSON.parse(result) : result;

        if (data.error) {
          return { content: [{ type: "text", text: `Extract failed: ${data.error}` }] };
        }

        const lines = [];
        lines.push(`Extracted ${data.count} items (${data.total} total on page)\n`);

        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          lines.push(`--- Item ${i + 1} ---`);
          for (const [key, value] of Object.entries(item)) {
            lines.push(`  ${key}: ${value}`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Extract failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "browser_collect",
    {
      description:
        "Paginate through multiple pages and collect extracted data. " +
        "Combines browser_navigate + browser_extract in a loop. " +
        "Two pagination modes: " +
        "1) URL pattern: provide urlPattern with {page} placeholder (e.g. 'https://site.com/search?page={page}') " +
        "2) Next button: provide nextSelector to click a 'next page' element after each extraction. " +
        "Returns all collected items as a single JSON array. " +
        "Includes a configurable delay between pages to avoid rate limiting.",
      inputSchema: {
        containerSelector: z.string().describe("CSS selector for repeating items (same as browser_extract)"),
        fields: z.record(z.string(), z.string()).describe("Field extraction map (same as browser_extract)"),
        urlPattern: z.string().optional().describe(
          "URL with {page} placeholder for page number, e.g. 'https://funda.nl/zoeken/koop?page={page}'"
        ),
        startPage: z.coerce.number().optional().describe("Starting page number (default: 1)"),
        endPage: z.coerce.number().optional().describe("Ending page number (default: 5)"),
        nextSelector: z.string().optional().describe(
          "CSS selector for 'next page' button/link (alternative to urlPattern)"
        ),
        maxPages: z.coerce.number().optional().describe("Max pages to collect (default: 5, max: 50)"),
        delayMs: z.coerce.number().optional().describe("Delay between pages in ms (default: 2000)"),
      },
    },
    async ({ containerSelector, fields, urlPattern, startPage, endPage, nextSelector, maxPages, delayMs }) => {
      try {
        const delay = Math.max(delayMs || 2000, 500);
        const fieldsJson = JSON.stringify(fields);
        const allItems = [];
        let pages = 0;
        const maxP = Math.min(maxPages || 5, 50);
        const start = startPage || 1;
        const end = endPage || (start + maxP - 1);

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        if (urlPattern) {
          // URL pattern pagination
          for (let page = start; page <= end && pages < maxP; page++) {
            const url = urlPattern.replace("{page}", page);
            try {
              await callPBI("Navigate", url);
              await sleep(delay);

              const result = await callPBI("ExtractData", containerSelector, fieldsJson, 0);
              const data = typeof result === "string" ? JSON.parse(result) : result;

              if (data.error) {
                allItems.push({ _page: page, _error: data.error });
              } else if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                  item._page = page;
                  allItems.push(item);
                }
              } else {
                // No items found — likely past last page
                break;
              }
            } catch (err) {
              allItems.push({ _page: page, _error: err.message });
            }
            pages++;
          }
        } else if (nextSelector) {
          // Click-based pagination (start from current page)
          for (let i = 0; i < maxP; i++) {
            try {
              const result = await callPBI("ExtractData", containerSelector, fieldsJson, 0);
              const data = typeof result === "string" ? JSON.parse(result) : result;

              if (data.error) {
                allItems.push({ _page: i + 1, _error: data.error });
              } else if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                  item._page = i + 1;
                  allItems.push(item);
                }
              } else {
                break;
              }

              // Click next
              if (i < maxP - 1) {
                try {
                  await callPBI("ClickElement", nextSelector);
                  await sleep(delay);
                } catch {
                  // No next button — end of pagination
                  break;
                }
              }
            } catch (err) {
              allItems.push({ _page: i + 1, _error: err.message });
              break;
            }
            pages++;
          }
        } else {
          return {
            content: [{ type: "text", text: "Provide either urlPattern or nextSelector for pagination." }],
          };
        }

        const lines = [];
        lines.push(`Collected ${allItems.length} items across ${pages} pages\n`);

        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          if (item._error) {
            lines.push(`--- Page ${item._page} ERROR: ${item._error} ---`);
            continue;
          }
          lines.push(`--- Item ${i + 1} (page ${item._page}) ---`);
          for (const [key, value] of Object.entries(item)) {
            if (key === "_page") continue;
            lines.push(`  ${key}: ${value}`);
          }
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Collect failed: ${err.message}` }] };
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
