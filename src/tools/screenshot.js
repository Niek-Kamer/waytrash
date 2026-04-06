const { z } = require("zod");
const { execSync } = require("child_process");
const fs = require("fs");

const SCREENSHOT_PATH = "/tmp/claude-desktop-screenshot.png";

function register(server) {
  server.registerTool(
    "screenshot",
    {
      description: "Take a screenshot of the entire screen. Returns the image so you can see what's on screen.",
      inputSchema: {
        delay: z.coerce.number().optional().describe("Delay in seconds before taking screenshot"),
      },
    },
    async ({ delay }) => {
      try {
        const delayFlag = delay ? `--delay ${Math.round(delay * 1000)}` : "";
        execSync(
          `spectacle -b -n -f -o "${SCREENSHOT_PATH}" ${delayFlag} 2>/dev/null`,
          { timeout: 10000 }
        );
        const data = fs.readFileSync(SCREENSHOT_PATH);
        return {
          content: [
            {
              type: "image",
              data: data.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Screenshot failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
