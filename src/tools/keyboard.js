const { z } = require("zod");
const { ydotool } = require("../helpers/ydotool");

const KEY_MAP = {
  "return": "28:1 28:0", "enter": "28:1 28:0",
  "tab": "15:1 15:0",
  "escape": "1:1 1:0", "esc": "1:1 1:0",
  "backspace": "14:1 14:0",
  "delete": "111:1 111:0",
  "space": "57:1 57:0",
  "up": "103:1 103:0", "down": "108:1 108:0",
  "left": "105:1 105:0", "right": "106:1 106:0",
  "home": "102:1 102:0", "end": "107:1 107:0",
  "pageup": "104:1 104:0", "pagedown": "109:1 109:0",
  "f1": "59:1 59:0", "f2": "60:1 60:0", "f3": "61:1 61:0",
  "f4": "62:1 62:0", "f5": "63:1 63:0", "f6": "64:1 64:0",
  "f7": "65:1 65:0", "f8": "66:1 66:0", "f9": "67:1 67:0",
  "f10": "68:1 68:0", "f11": "87:1 87:0", "f12": "88:1 88:0",
};

const MOD_MAP = {
  "ctrl": 29, "shift": 42, "alt": 56, "super": 125, "meta": 125,
};

const LETTER_CODES = {};
"qwertyuiop".split("").forEach((c, i) => { LETTER_CODES[c] = 16 + i; });
"asdfghjkl".split("").forEach((c, i) => { LETTER_CODES[c] = 30 + i; });
"zxcvbnm".split("").forEach((c, i) => { LETTER_CODES[c] = 44 + i; });

function register(server) {
  server.registerTool(
    "type_text",
    {
      description: "Type text using the keyboard, as if the user typed it.",
      inputSchema: {
        text: z.string().describe("Text to type"),
        delay: z.coerce.number().optional().describe("Delay between keystrokes in ms (default 12)"),
      },
    },
    async ({ text, delay }) => {
      try {
        const keyDelay = delay || 12;
        ydotool(`type --key-delay ${keyDelay} -- "${text.replace(/"/g, '\\"')}"`);
        return { content: [{ type: "text", text: `Typed: "${text}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Type failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "key_press",
    {
      description: "Press a key or key combination (e.g. 'Return', 'ctrl+s', 'alt+F4', 'Tab'). Uses ydotool key codes.",
      inputSchema: {
        keys: z.string().describe("Key combo, e.g. 'Return', 'ctrl+s', 'alt+Tab'. Use ydotool key names."),
      },
    },
    async ({ keys }) => {
      try {
        const lower = keys.toLowerCase().trim();

        if (lower.includes("+")) {
          const parts = lower.split("+");
          const modifiers = parts.slice(0, -1);
          const key = parts[parts.length - 1];

          let seq = "";
          for (const mod of modifiers) {
            const code = MOD_MAP[mod];
            if (!code) return { content: [{ type: "text", text: `Unknown modifier: ${mod}` }] };
            seq += `${code}:1 `;
          }
          if (KEY_MAP[key]) {
            seq += KEY_MAP[key] + " ";
          } else {
            const code = LETTER_CODES[key];
            if (!code) return { content: [{ type: "text", text: `Unknown key: ${key}` }] };
            seq += `${code}:1 ${code}:0 `;
          }
          for (const mod of modifiers.reverse()) {
            seq += `${MOD_MAP[mod]}:0 `;
          }
          ydotool(`key ${seq.trim()}`);
        } else if (KEY_MAP[lower]) {
          ydotool(`key ${KEY_MAP[lower]}`);
        } else {
          return { content: [{ type: "text", text: `Unknown key: ${keys}. Use key names like Return, Tab, ctrl+s, etc.` }] };
        }

        return { content: [{ type: "text", text: `Pressed: ${keys}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Key press failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
