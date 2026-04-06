// KWin script — loaded into the compositor via D-Bus.
// Sends the real post-acceleration cursor position to com.cursor.Tracker
// on every movement via the workspace.cursorPosChanged signal.

workspace.cursorPosChanged.connect(function () {
  var pos = workspace.cursorPos;
  callDBus(
    "com.cursor.Tracker",
    "/Cursor",
    "com.cursor.Tracker",
    "Update",
    pos.x,
    pos.y
  );
});
