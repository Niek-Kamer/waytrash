#!/usr/bin/env python3
"""AT-SPI accessibility tree helper for the desktop MCP server."""

import json
import sys
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def ensure_enabled():
    """Ensure AT-SPI is enabled."""
    import subprocess
    subprocess.run(
        ["busctl", "--user", "set-property", "org.a11y.Bus",
         "/org/a11y/bus", "org.a11y.Status", "IsEnabled", "b", "true"],
        capture_output=True,
    )


def get_element_info(node, depth=0):
    """Extract useful info from an AT-SPI node."""
    try:
        name = node.get_name() or ""
        role = node.get_role_name() or ""
        ext = node.get_extents(Atspi.CoordType.SCREEN)
        x, y, w, h = ext.x, ext.y, ext.width, ext.height

        states = []
        state_set = node.get_state_set()
        for s in [Atspi.StateType.VISIBLE, Atspi.StateType.SHOWING,
                  Atspi.StateType.FOCUSED, Atspi.StateType.ENABLED,
                  Atspi.StateType.CHECKED, Atspi.StateType.SELECTED]:
            if state_set.contains(s):
                states.append(Atspi.StateType.get_name(s))

        actions = []
        try:
            action_iface = node.get_action_iface()
            if action_iface:
                for i in range(action_iface.get_n_actions()):
                    actions.append(action_iface.get_action_name(i))
        except Exception:
            pass

        text = ""
        try:
            text_iface = node.get_text_iface()
            if text_iface:
                text = text_iface.get_text(0, text_iface.get_character_count()) or ""
        except Exception:
            pass

        return {
            "name": name,
            "role": role,
            "x": x, "y": y, "width": w, "height": h,
            "states": states,
            "actions": actions,
            "text": text[:200] if text else "",
            "depth": depth,
        }
    except Exception:
        return None


def walk_tree(node, depth=0, max_depth=15):
    """Recursively walk the accessibility tree."""
    elements = []
    info = get_element_info(node, depth)
    if info:
        has_bounds = info["width"] > 0 and info["height"] > 0
        # Always include elements with bounds — parent containers may not be
        # "visible" themselves but their children are interactive.
        if has_bounds:
            elements.append(info)

    if depth < max_depth:
        try:
            count = node.get_child_count()
            for i in range(count):
                try:
                    child = node.get_child_at_index(i)
                    if child:
                        elements.extend(walk_tree(child, depth + 1, max_depth))
                except Exception:
                    continue
        except Exception:
            pass

    return elements


def get_tree(app_name=None, max_depth=10):
    """Get the accessibility tree, optionally filtered to a specific app."""
    Atspi.init()
    desktop = Atspi.get_desktop(0)
    all_elements = []

    for i in range(desktop.get_child_count()):
        try:
            app = desktop.get_child_at_index(i)
            if not app:
                continue
            name = app.get_name() or ""
            if app_name and app_name.lower() not in name.lower():
                continue
            elements = walk_tree(app, depth=0, max_depth=max_depth)
            if elements:
                all_elements.append({"app": name, "elements": elements})
        except Exception:
            continue

    return all_elements


def find_elements(query, role=None):
    """Find elements matching a text query and optional role filter."""
    Atspi.init()
    desktop = Atspi.get_desktop(0)
    matches = []
    query_lower = query.lower()

    def search(node, app_name, depth=0):
        if depth > 15:
            return
        try:
            info = get_element_info(node, depth)
            if info:
                has_bounds = info["width"] > 0 and info["height"] > 0
                name_match = query_lower in (info["name"] or "").lower()
                text_match = query_lower in (info["text"] or "").lower()
                role_match = role is None or role.lower() == info["role"].lower()
                if has_bounds and (name_match or text_match) and role_match:
                    info["app"] = app_name
                    matches.append(info)

            count = node.get_child_count()
            for i in range(count):
                try:
                    child = node.get_child_at_index(i)
                    if child:
                        search(child, app_name, depth + 1)
                except Exception:
                    continue
        except Exception:
            pass

    for i in range(desktop.get_child_count()):
        try:
            app = desktop.get_child_at_index(i)
            if app:
                search(app, app.get_name() or "", 0)
        except Exception:
            continue

    return matches


if __name__ == "__main__":
    ensure_enabled()

    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: atspi-helper.py <command> [args]"}))
        sys.exit(1)

    command = sys.argv[1]

    if command == "tree":
        app_name = sys.argv[2] if len(sys.argv) > 2 else None
        max_depth = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        result = get_tree(app_name, max_depth)
        print(json.dumps(result, ensure_ascii=False))

    elif command == "find":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        role = sys.argv[3] if len(sys.argv) > 3 else None
        result = find_elements(query, role)
        print(json.dumps(result, ensure_ascii=False))

    elif command == "apps":
        Atspi.init()
        desktop = Atspi.get_desktop(0)
        apps = []
        for i in range(desktop.get_child_count()):
            try:
                app = desktop.get_child_at_index(i)
                if app:
                    apps.append({"name": app.get_name() or "", "children": app.get_child_count()})
            except Exception:
                continue
        print(json.dumps(apps, ensure_ascii=False))

    else:
        print(json.dumps({"error": f"Unknown command: {command}"}))
        sys.exit(1)
