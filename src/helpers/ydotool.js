const { execSync } = require("child_process");

const YDOTOOL_ENV = { ...process.env, YDOTOOL_SOCKET: "/tmp/.ydotool_socket" };

function ydotool(args) {
  execSync(`ydotool ${args}`, { env: YDOTOOL_ENV });
}

function ydotoolSleep(seconds = 0.05) {
  execSync(`sleep ${seconds}`);
}

module.exports = { ydotool, ydotoolSleep, YDOTOOL_ENV };
