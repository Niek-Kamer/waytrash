#!/usr/bin/env node
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { initBridge } = require("./kwin/bridge");

const server = new McpServer({
  name: "desktop-control",
  version: "1.0.0",
});

// Register all tool modules
require("./tools/screenshot").register(server);
require("./tools/mouse").register(server);
require("./tools/keyboard").register(server);
require("./tools/windows").register(server);
require("./tools/screen").register(server);
require("./tools/shell").register(server);
require("./tools/accessibility").register(server);
require("./tools/content").register(server);
require("./tools/hitmap").register(server);
require("./tools/browser-control").register(server);

async function main() {
  await initBridge();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
