const { queryKwin } = require("../kwin/bridge");
const { readPageContentViaPBI } = require("./browser");

const WINDOW_QUERY_SCRIPT = `
  var stack = workspace.stackingOrder;
  var zMap = {};
  for (var i = 0; i < stack.length; i++) { zMap[stack[i].internalId] = i; }
  var clients = workspace.windowList();
  var result = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    if (c.normalWindow === false && c.dialog === false) continue;
    result.push({
      caption: c.caption, resourceClass: c.resourceClass, pid: c.pid, active: c.active,
      content: {x: c.clientGeometry.x, y: c.clientGeometry.y, w: c.clientGeometry.width, h: c.clientGeometry.height},
      z: zMap[c.internalId] !== undefined ? zMap[c.internalId] : -1
    });
  }
  result.sort(function(a, b) { return b.z - a.z; });
`;

/**
 * Get the content geometry of the active/topmost window matching a query.
 * Returns {x, y, w, h} in absolute screen coordinates (content area, no decorations).
 */
async function getWindowContentGeometry(query) {
  const windows = await queryKwin("hitmapWindowQuery", WINDOW_QUERY_SCRIPT);
  if (!query) {
    // Return the active window
    const active = windows.find((w) => w.active);
    return active ? active.content : windows[0]?.content;
  }
  const q = query.toLowerCase();
  const match = windows.find(
    (w) =>
      (w.caption || "").toLowerCase().includes(q) ||
      (w.resourceClass || "").toLowerCase().includes(q)
  );
  return match ? match.content : null;
}

/**
 * Convert a viewport-relative rect to absolute screen coordinates.
 * viewportRect: {x, y, w, h} — element position within the browser viewport
 * windowContent: {x, y, w, h} — window content area in screen coordinates
 */
function toScreenCoords(viewportRect, windowContent) {
  return {
    x: windowContent.x + viewportRect.x,
    y: windowContent.y + viewportRect.y,
    w: viewportRect.w,
    h: viewportRect.h,
    cx: windowContent.x + viewportRect.x + Math.round(viewportRect.w / 2),
    cy: windowContent.y + viewportRect.y + Math.round(viewportRect.h / 2),
  };
}

/**
 * Build a hit map of all clickable elements on the active browser page.
 * Combines PBI page content (with viewport rects) and KWin window geometry.
 * Returns array of {type, label, screen: {x, y, w, h, cx, cy}, ...metadata}.
 */
async function buildBrowserHitMap() {
  // Get page content with element rects
  const page = await readPageContentViaPBI(null);
  if (!page) throw new Error("No page content available");

  // Get the browser window's content geometry
  const winGeo = await getWindowContentGeometry("brave") ||
                 await getWindowContentGeometry("chrome") ||
                 await getWindowContentGeometry("chromium") ||
                 await getWindowContentGeometry("firefox");
  if (!winGeo) throw new Error("No browser window found");

  const targets = [];

  // Buttons
  for (const b of page.buttons || []) {
    if (!b.rect || b.disabled) continue;
    targets.push({
      type: "button",
      label: b.text,
      screen: toScreenCoords(b.rect, winGeo),
    });
  }

  // Inputs
  for (const inp of page.inputs || []) {
    if (!inp.rect) continue;
    const label = inp.label || inp.name || inp.placeholder || `[${inp.type}]`;
    targets.push({
      type: "input",
      label: label,
      inputType: inp.type,
      value: inp.value,
      screen: toScreenCoords(inp.rect, winGeo),
    });
  }

  // Links (only visible ones)
  for (const l of page.links || []) {
    if (!l.rect) continue;
    targets.push({
      type: "link",
      label: l.text,
      href: l.href,
      screen: toScreenCoords(l.rect, winGeo),
    });
  }

  // Headings (useful for orientation)
  for (const h of page.headings || []) {
    if (!h.rect) continue;
    targets.push({
      type: "heading",
      label: `h${h.level}: ${h.text}`,
      screen: toScreenCoords(h.rect, winGeo),
    });
  }

  return {
    page: { title: page.title, url: page.url },
    viewport: page.viewport,
    window: winGeo,
    targets,
  };
}

/**
 * Build a hit map from AT-SPI accessibility tree for native KDE apps.
 * AT-SPI elements already have absolute screen coordinates.
 */
function buildATSPIHitMap(atspiElements) {
  const targets = [];
  for (const el of atspiElements) {
    if (el.width <= 0 || el.height <= 0) continue;
    const hasAction = el.actions && el.actions.length > 0;
    const isInteractive = hasAction ||
      ["button", "check box", "radio button", "menu item", "text", "combo box", "toggle button", "link"]
        .includes((el.role || "").toLowerCase());

    if (!isInteractive) continue;

    targets.push({
      type: el.role || "unknown",
      label: el.name || el.text || "(unnamed)",
      screen: {
        x: el.x,
        y: el.y,
        w: el.width,
        h: el.height,
        cx: el.x + Math.round(el.width / 2),
        cy: el.y + Math.round(el.height / 2),
      },
      actions: el.actions,
    });
  }
  return targets;
}

module.exports = { buildBrowserHitMap, buildATSPIHitMap, getWindowContentGeometry, toScreenCoords };
