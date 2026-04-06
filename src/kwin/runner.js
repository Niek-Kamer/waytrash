const { execSync } = require("child_process");
const fs = require("fs");

/**
 * Run a KWin script by writing it to a temp file, loading it into the compositor,
 * and optionally capturing its console.log output from journalctl.
 */
function runKwinScript(name, scriptBody, { captureOutput = false, waitMs = 300 } = {}) {
  const tmpPath = `/tmp/claude-${name}.js`;
  fs.writeFileSync(tmpPath, scriptBody);

  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}" 2>/dev/null`
    );
  } catch {}

  execSync(
    `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "${tmpPath}" "${name}"`,
    { encoding: "utf8" }
  );
  execSync("qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start");

  let output = null;
  if (captureOutput) {
    execSync(`sleep ${waitMs / 1000}`);
    output = execSync(
      `journalctl --user -u plasma-kwin_wayland -n 50 --no-pager -o cat 2>/dev/null | grep -o '\\[{"caption".*' | tail -1`,
      { encoding: "utf8", timeout: 3000 }
    ).trim();
  }

  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}" 2>/dev/null`
    );
  } catch {}

  return output;
}

/**
 * Load a persistent KWin script (e.g. cursor tracker) that stays running.
 */
function loadKwinScript(name, scriptPath) {
  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}" 2>/dev/null`
    );
  } catch {}

  execSync(
    `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "${scriptPath}" "${name}"`,
    { encoding: "utf8" }
  );
  execSync("qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.start");
}

function unloadKwinScript(name) {
  try {
    execSync(
      `qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "${name}"`
    );
  } catch {}
}

module.exports = { runKwinScript, loadKwinScript, unloadKwinScript };
