// The Ghostty settings window as an on-demand local service.
//
// It runs only while you use it: the server exits by itself after 5 minutes
// without a click or keypress, and pm2 must not bring it back, so autorestart
// is off. Start it from Switchboard (Dev servers), bfb Home, or
// `svc up ghostty-settings`. The port is the ports.sh tier-2 claim.
module.exports = {
  apps: [
    {
      name: "ghostty-settings",
      script: "app/server.mjs",
      cwd: __dirname,
      interpreter: "node",
      autorestart: false,
      env: {
        GHOSTTY_MGR_PORT: "5124",
        GHOSTTY_MGR_NO_OPEN: "1",
      },
    },
  ],
};
