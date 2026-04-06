#!/usr/bin/env node
const { initBridge } = require("../kwin/bridge");
const { queryKwin } = require("../kwin/bridge");

const SCRIPT = `
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
      frame: {x: c.frameGeometry.x, y: c.frameGeometry.y, w: c.frameGeometry.width, h: c.frameGeometry.height},
      content: {x: c.clientGeometry.x, y: c.clientGeometry.y, w: c.clientGeometry.width, h: c.clientGeometry.height},
      minimized: c.minimized, fullScreen: c.fullScreen, keepAbove: c.keepAbove, opacity: c.opacity,
      dialog: c.dialog, transientFor: c.transientFor ? c.transientFor.caption : null,
      output: c.output ? c.output.name : null, desktop: c.desktops.length ? c.desktops[0].name : null,
      z: zMap[c.internalId] !== undefined ? zMap[c.internalId] : -1
    });
  }
  result.sort(function(a, b) { return b.z - a.z; });
`;

(async () => {
  await initBridge();
  const windows = await queryKwin("cliListWindows", SCRIPT);
  console.log(JSON.stringify(windows, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
