# kde-mcp-desktop

MCP server for controlling the KDE Plasma desktop through structured text instead of screenshots. Gives Claude (or any MCP client) full access to browser content, window management, and input automation — at ~15-30x fewer tokens than screenshot-based approaches.

## What it does

- **Read browser pages** — title, text, headings, links, buttons, inputs from any tab in your live browser session. No screenshots, no raw HTML, no bot detection. Uses the fully rendered, JavaScript-executed, authenticated page.
- **Control the browser** — navigate URLs, click elements by text/CSS/index, type into inputs, scroll, go back/forward, manage tabs. All via DBus, all structured text.
- **Read window state** — which windows are open, their geometry, focus state, stacking order, PID — directly from the KWin compositor.
- **Read app content** — Konsole terminal text, clipboard contents via Klipper DBus.
- **Hit maps** — get every clickable element on screen with exact pixel coordinates, ready for mouse_click.
- **Input control** — mouse move/click/drag/scroll and keyboard input via ydotool.

## Requirements

- KDE Plasma 6 on Wayland
- Node.js 18+
- ydotool (for mouse/keyboard input)
- Python 3 with PyGObject + AT-SPI2 (for accessibility tree)
- Brave/Chrome/Firefox with KDE Plasma Browser Integration extension

### Plasma Browser Integration (for browser control)

The browser features require a modified version of the KDE Plasma Browser Integration extension that adds page content reading and DOM interaction. You need to build and install this from source:

```bash
# Clone plasma-browser-integration (if not already in project dir)
git clone https://invent.kde.org/niccolobrambilla/plasma-browser-integration.git
cd plasma-browser-integration

# Check out the version matching your system
# Run: pacman -Qi plasma-browser-integration | grep Version
# Then: git checkout v6.5.6  (or whatever matches)
git checkout v<your-version>

# Build
mkdir build && cd build
cmake ..
make -j$(nproc)
sudo make install

# Load the modified extension in your browser
# 1. Go to brave://extensions (or chrome://extensions)
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the plasma-browser-integration/extension/ directory
# 5. Enable the extension
# 6. Disable the store version if installed (same ID, can't have both)
```

After loading, reload any open tabs so the content script injects.

## Install

```bash
npm install
```

## Usage

### As MCP server

```bash
npm start
```

Add to your MCP client config:
```json
{
  "mcpServers": {
    "desktop-control": {
      "command": "node",
      "args": ["/path/to/kde-mcp-desktop/src/server.js"]
    }
  }
}
```

### CLI tools (for testing)

```bash
# List all open windows with geometry
npm run windows

# Read app content
npm run content                  # list available apps
npm run content -- konsole       # terminal text from all Konsole tabs
npm run content -- clipboard     # clipboard contents
npm run content -- browser       # list browser tabs
npm run content -- page          # read active browser tab content

# Get clickable elements with screen coordinates
npm run hitmap                   # all clickable elements
npm run hitmap -- search         # filter by text
```

### Browser control via DBus (direct)

```bash
# Navigate
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.Navigate "https://example.com"

# Read page content
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.GetActiveContent

# Click an element
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.ClickElement "text:Sign In"
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.ClickElement "link:0"
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.ClickElement "#submit-btn"

# Type into an input
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.TypeInElement "input:0" "hello world"

# Scroll
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.ScrollPage "down" 2

# Go back/forward
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.GoBack
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.GoForward

# Tab management
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.CreateTab "https://example.com"
qdbus org.kde.plasma.browser_integration /PageContent org.kde.pbi.PageContent.CloseTab -1
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate active tab to URL |
| `browser_click` | Click element by text, CSS selector, or index |
| `browser_type` | Type text into an input element |
| `browser_scroll` | Scroll the page |
| `browser_back` / `browser_forward` | Browser history navigation |
| `browser_search` | Search Google/DuckDuckGo and return structured results |
| `browser_new_tab` / `browser_close_tab` | Tab management |
| `get_content` | Read content from Konsole, browser, or clipboard |
| `get_clickable_elements` | Hit map with screen coordinates |
| `list_windows` | Window geometry, state, stacking order |
| `get_window_geometry` | Query specific window geometry |
| `focus_window` | Focus a window by title |
| `list_browser_tabs` | List/activate browser tabs |
| `get_clipboard` | Read clipboard contents and history |
| `screenshot` | Take a screenshot (fallback) |
| `mouse_move` / `mouse_click` / `mouse_drag` / `mouse_scroll` | Mouse control |
| `type_text` / `key_press` | Keyboard control |
| `run_command` | Execute shell commands |
| `get_accessibility_tree` / `find_element` | AT-SPI accessibility tree |

## Architecture

```
Claude / MCP Client
    |
    v
MCP Server (src/server.js)
    |
    +-- Browser Control (DBus → PBI native host → extension → content script → DOM)
    +-- Window Management (DBus → KWin compositor)
    +-- App Content (DBus → Konsole, Klipper)
    +-- Input Control (ydotool → Wayland compositor)
    +-- Accessibility (AT-SPI → running apps)
```

## Token efficiency

| Method | Tokens per page read | Can interact? |
|--------|---------------------|---------------|
| Screenshot | ~1,500-3,000 | No |
| WebFetch | ~500-2,000 | No |
| **This project** | **~200-500** | **Yes** |

## License

MIT
