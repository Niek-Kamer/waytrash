const { z } = require("zod");
const { execSync } = require("child_process");

function register(server) {
  server.registerTool(
    "run_command",
    {
      description: "Run a shell command and return the output. Use for launching apps, checking state, etc.",
      inputSchema: {
        command: z.string().describe("Shell command to execute"),
        timeout: z.coerce.number().optional().describe("Timeout in ms (default 10000)"),
      },
    },
    async ({ command, timeout }) => {
      try {
        const output = execSync(command, {
          encoding: "utf8",
          timeout: timeout || 10000,
          env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
        });
        return { content: [{ type: "text", text: output || "(no output)" }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Command failed: ${err.stderr || err.message}` }] };
      }
    }
  );
}

module.exports = { register };
