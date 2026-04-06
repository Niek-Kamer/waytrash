#!/usr/bin/env node
const { initBridge } = require("../kwin/bridge");
const { buildBrowserHitMap } = require("../helpers/hitmap");

const filter = process.argv[2] || "";

(async () => {
  await initBridge();
  const hitmap = await buildBrowserHitMap();
  let targets = hitmap.targets;

  if (filter) {
    const f = filter.toLowerCase();
    targets = targets.filter((t) => t.label.toLowerCase().includes(f));
  }

  console.log(`Page: "${hitmap.page.title}"`);
  console.log(`URL: ${hitmap.page.url}`);
  console.log(`Window content at: (${hitmap.window.x},${hitmap.window.y}) ${hitmap.window.w}x${hitmap.window.h}`);
  console.log(`Viewport: ${hitmap.viewport.w}x${hitmap.viewport.h} scroll(${hitmap.viewport.scrollX},${hitmap.viewport.scrollY})`);
  console.log(`\nClickable elements (${targets.length}):\n`);

  for (var i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`${i + 1}. [${t.type}] "${t.label}" → click(${t.screen.cx}, ${t.screen.cy})  bounds(${t.screen.x},${t.screen.y} ${t.screen.w}x${t.screen.h})`);
  }

  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
