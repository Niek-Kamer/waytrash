const { z } = require("zod");
const { ydotool, ydotoolSleep } = require("../helpers/ydotool");

function register(server) {
  server.registerTool(
    "mouse_move",
    {
      description: "Move the mouse cursor to an absolute x,y position on screen.",
      inputSchema: {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
      },
    },
    async ({ x, y }) => {
      try {
        ydotool(`mousemove --absolute -x ${x} -y ${y}`);
        return { content: [{ type: "text", text: `Moved mouse to (${x}, ${y})` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Mouse move failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "mouse_click",
    {
      description: "Click a mouse button. Optionally move to x,y first. Button: left (default), right, middle.",
      inputSchema: {
        x: z.coerce.number().optional().describe("X coordinate to move to before clicking"),
        y: z.coerce.number().optional().describe("Y coordinate to move to before clicking"),
        button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button"),
        double: z.boolean().optional().describe("Double click"),
      },
    },
    async ({ x, y, button, double }) => {
      try {
        if (x !== undefined && y !== undefined) {
          ydotool(`mousemove --absolute -x ${x} -y ${y}`);
          ydotoolSleep();
        }
        const buttonCode = { left: "0xC0", right: "0xC1", middle: "0xC2" }[button || "left"];
        const repeat = double ? "--repeat 2 --repeat-delay 80" : "";
        ydotool(`click ${buttonCode} ${repeat}`);
        const pos = x !== undefined ? ` at (${x}, ${y})` : "";
        return { content: [{ type: "text", text: `${double ? "Double-" : ""}Clicked ${button || "left"}${pos}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Click failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "mouse_drag",
    {
      description: "Click and drag from one position to another. Useful for drawing, selecting, or moving things.",
      inputSchema: {
        fromX: z.coerce.number().describe("Start X"),
        fromY: z.coerce.number().describe("Start Y"),
        toX: z.coerce.number().describe("End X"),
        toY: z.coerce.number().describe("End Y"),
        steps: z.coerce.number().optional().describe("Number of intermediate steps for smooth dragging (default 20)"),
      },
    },
    async ({ fromX, fromY, toX, toY, steps }) => {
      try {
        const n = steps || 20;
        ydotool(`mousemove --absolute -x ${fromX} -y ${fromY}`);
        ydotoolSleep();
        ydotool("click 0x40");
        ydotoolSleep();

        for (let i = 1; i <= n; i++) {
          const x = Math.round(fromX + (toX - fromX) * (i / n));
          const y = Math.round(fromY + (toY - fromY) * (i / n));
          ydotool(`mousemove --absolute -x ${x} -y ${y}`);
        }

        ydotoolSleep();
        ydotool("click 0x80");
        return { content: [{ type: "text", text: `Dragged from (${fromX}, ${fromY}) to (${toX}, ${toY})` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Drag failed: ${err.message}` }] };
      }
    }
  );

  server.registerTool(
    "mouse_scroll",
    {
      description: "Scroll the mouse wheel up or down.",
      inputSchema: {
        direction: z.enum(["up", "down"]).describe("Scroll direction"),
        amount: z.coerce.number().optional().describe("Scroll amount (default 3)"),
        x: z.coerce.number().optional().describe("X position to scroll at"),
        y: z.coerce.number().optional().describe("Y position to scroll at"),
      },
    },
    async ({ direction, amount, x, y }) => {
      try {
        if (x !== undefined && y !== undefined) {
          ydotool(`mousemove --absolute -x ${x} -y ${y}`);
          ydotoolSleep();
        }
        const dist = (amount || 3) * (direction === "up" ? -1 : 1);
        ydotool(`mousemove --wheel -- 0 ${dist}`);
        return { content: [{ type: "text", text: `Scrolled ${direction} by ${amount || 3}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Scroll failed: ${err.message}` }] };
      }
    }
  );
}

module.exports = { register };
