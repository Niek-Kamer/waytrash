const WebSocket = require("ws");
const http = require("http");

/**
 * Discover CDP targets on a given port.
 * Returns array of { type, title, url, wsUrl }.
 */
function discoverTargets(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const targets = JSON.parse(body);
          resolve(
            targets
              .filter((t) => t.type === "page")
              .map((t) => ({
                type: t.type,
                title: t.title,
                url: t.url,
                wsUrl: t.webSocketDebuggerUrl,
                id: t.id,
              }))
          );
        } catch (e) {
          reject(new Error(`Failed to parse CDP targets: ${e.message}`));
        }
      });
    });
    req.on("error", (e) => reject(new Error(`CDP not available on port ${port}: ${e.message}`)));
    req.setTimeout(2000, () => { req.destroy(); reject(new Error(`CDP timeout on port ${port}`)); });
  });
}

/**
 * Send a CDP command over WebSocket and wait for a response.
 */
function cdpCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Date.now() + Math.random();
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.off("message", handler); reject(new Error(`CDP command timeout: ${method}`)); }, 5000);
  });
}

/**
 * Connect to a CDP target and read the page content.
 * Returns { title, url, text, links, buttons, inputs, headings }.
 */
async function readPageContent(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on("error", (e) => reject(new Error(`CDP WebSocket error: ${e.message}`)));

    ws.on("open", async () => {
      try {
        const result = await cdpCommand(ws, "Runtime.evaluate", {
          expression: `JSON.stringify({
            title: document.title,
            url: location.href,
            text: document.body.innerText.substring(0, 2000),
            links: [...document.querySelectorAll('a[href]')].slice(0, 30).map(a => ({
              text: (a.innerText || a.title || a.getAttribute('aria-label') || '').substring(0, 60),
              href: a.href
            })).filter(l => l.text),
            buttons: [...document.querySelectorAll('button, [role="button"], input[type="submit"]')].slice(0, 20).map(b => ({
              text: (b.innerText || b.value || b.title || b.getAttribute('aria-label') || '').substring(0, 60),
              tag: b.tagName.toLowerCase(),
              disabled: b.disabled || false
            })).filter(b => b.text),
            inputs: [...document.querySelectorAll('input:not([type="hidden"]), textarea, select')].slice(0, 20).map(i => ({
              type: i.type || i.tagName.toLowerCase(),
              name: i.name || i.id || '',
              value: (i.value || '').substring(0, 60),
              placeholder: i.placeholder || '',
              label: i.labels?.[0]?.innerText?.substring(0, 40) || ''
            })),
            headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 15).map(h => ({
              level: parseInt(h.tagName[1]),
              text: h.innerText.substring(0, 80)
            }))
          })`,
          returnByValue: true,
        });

        ws.close();
        const value = result?.result?.value;
        if (typeof value === "string") {
          resolve(JSON.parse(value));
        } else {
          resolve(value);
        }
      } catch (e) {
        ws.close();
        reject(e);
      }
    });
  });
}

/**
 * Scan common CDP ports to find Electron/Chromium apps with debugging enabled.
 */
async function findCDPApps(ports = [9222, 9223, 9224, 9225, 9229]) {
  const apps = [];
  for (const port of ports) {
    try {
      const targets = await discoverTargets(port);
      if (targets.length) {
        apps.push({ port, targets });
      }
    } catch {
      // Port not available
    }
  }
  return apps;
}

/**
 * Read content from all pages across all discoverable CDP apps.
 */
async function readAllCDPContent(ports) {
  const apps = await findCDPApps(ports);
  const results = [];
  for (const app of apps) {
    for (const target of app.targets) {
      try {
        const content = await readPageContent(target.wsUrl);
        results.push({ port: app.port, ...content });
      } catch (e) {
        results.push({ port: app.port, title: target.title, url: target.url, error: e.message });
      }
    }
  }
  return results;
}

module.exports = { discoverTargets, readPageContent, findCDPApps, readAllCDPContent };
