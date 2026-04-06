#!/usr/bin/env node
const { readAppContent, discoverApps } = require("../helpers/kde-content");
const { listBrowserTabs, readPageContentViaPBI } = require("../helpers/browser");
const { findCDPApps, readPageContent } = require("../helpers/cdp");

const query = process.argv[2] || "";

(async () => {
  if (!query) {
    console.log("Usage: npm run content -- <app>\n");
    console.log("KDE apps:");
    const apps = await discoverApps();
    for (const a of apps) console.log(`  ${a.app} (PID: ${a.pid})`);
    console.log("  clipboard\n");
    console.log("Browser:");
    try {
      const tabs = await listBrowserTabs();
      console.log(`  browser  (${tabs.length} tabs live)`);
    } catch {
      console.log("  browser  (Plasma Browser Integration not available)");
    }
    const cdpApps = await findCDPApps();
    if (cdpApps.length) {
      for (const app of cdpApps)
        for (const t of app.targets) console.log(`  cdp [port:${app.port}] ${t.title}`);
    }
    process.exit(0);
  }

  const q = query.toLowerCase();

  // Page content from active browser tab (PBI plugin)
  if (q === "page" || q === "activetab") {
    try {
      const page = await readPageContentViaPBI(null);
      console.log(`"${page.title}" — ${page.url}\n`);
      if (page.headings?.length) {
        console.log("Structure:");
        for (const h of page.headings) console.log(`${"  ".repeat(h.level - 1)}${"#".repeat(h.level)} ${h.text}`);
        console.log();
      }
      if (page.text) console.log("Text:\n" + page.text.substring(0, 2000) + "\n");
      if (page.buttons?.length) { console.log("Buttons:"); for (const b of page.buttons) console.log(`  "${b.text}"`); console.log(); }
      if (page.inputs?.length) { console.log("Inputs:"); for (const i of page.inputs) console.log(`  [${i.type}] ${i.label || i.name || i.placeholder || "(unnamed)"}${i.value ? ` = "${i.value}"` : ""}`); console.log(); }
      if (page.links?.length) { console.log("Links (" + page.links.length + "):"); for (const l of page.links.slice(0, 20)) console.log(`  "${l.text}" → ${l.href}`); if (page.links.length > 20) console.log(`  ... and ${page.links.length - 20} more`); }
    } catch (e) {
      console.error("Page content failed: " + e.message);
      console.error("Make sure the active browser tab is focused and has been reloaded since the extension was updated.");
    }
    process.exit(0);
  }

  // Browser tabs list (live, no relaunch needed)
  if (q === "browser" || q === "tabs") {
    const tabs = await listBrowserTabs();
    if (!tabs.length) { console.log("No browser tabs found."); process.exit(1); }
    tabs.forEach((t, i) => console.log(`${i + 1}. "${t.title}" (id: ${t.id})`));
    process.exit(0);
  }

  // CDP (full page content, needs --remote-debugging-port)
  if (q === "cdp" || q === "brave" || q === "chrome" || q === "code" || q === "vscode") {
    const ports = [9222, 9223, 9224, 9225];
    const apps = await findCDPApps(ports);
    if (!apps.length) {
      // Fall back to tab listing for brave/chrome
      if (q === "brave" || q === "chrome") {
        console.log("No CDP port — showing tab titles from Plasma Browser Integration:\n");
        const tabs = await listBrowserTabs();
        tabs.forEach((t, i) => console.log(`${i + 1}. "${t.title}" (id: ${t.id})`));
        console.log("\nFor full page content: brave --remote-debugging-port=9222");
      } else {
        console.log(`No CDP on ports ${ports.join(", ")}. Launch with --remote-debugging-port=9222`);
      }
      process.exit(1);
    }
    for (const app of apps) {
      for (const target of app.targets) {
        if (q !== "cdp" && !target.title.toLowerCase().includes(q)) continue;
        try {
          const page = await readPageContent(target.wsUrl);
          console.log(`\n"${page.title}" — ${page.url}`);
          if (page.headings?.length) {
            console.log("\nStructure:");
            for (const h of page.headings) console.log(`${"  ".repeat(h.level - 1)}${"#".repeat(h.level)} ${h.text}`);
          }
          if (page.text) console.log("\nText:\n" + page.text.substring(0, 1500));
          if (page.buttons?.length) { console.log("\nButtons:"); for (const b of page.buttons) console.log(`  "${b.text}"`); }
          if (page.inputs?.length) { console.log("\nInputs:"); for (const i of page.inputs) console.log(`  [${i.type}] ${i.label || i.name || "(unnamed)"}`); }
          if (page.links?.length) { console.log("\nLinks:"); for (const l of page.links) console.log(`  "${l.text}" → ${l.href}`); }
        } catch (e) { console.log(`\n"${target.title}" — Error: ${e.message}`); }
        console.log();
      }
    }
    process.exit(0);
  }

  // KDE apps
  const result = await readAppContent(query);
  if (!result) { console.error(`No readable app matching "${query}"`); process.exit(1); }

  switch (result.type) {
    case "konsole":
      for (const s of result.sessions) {
        const marker = s.active ? " [ACTIVE]" : "";
        console.log(`── Tab: "${s.title}" (PID:${s.pid} fg:${s.foregroundPid})${marker} ──`);
        console.log(s.text.split("\n").slice(-50).join("\n").trimEnd());
        console.log();
      }
      break;
    case "klipper":
      console.log(`Clipboard: ${result.contents}`);
      break;
    default:
      console.log(`App "${result.app}" detected but no content reader yet.`);
  }

  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
