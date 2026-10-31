---
reader: the owner, then whoever extends the settings window
---

# Ghostty settings window

The settings window is a local web page for changing your Ghostty config. Every change is previewed and checked by Ghostty before it is written, and every write takes a backup you can return to in one click.

## Start and stop

It runs only while you use it, as the pm2 service `ghostty-settings` on port 5124.

1. Start it from any of these:
   - **bfb Home:** the Local tools card. Click Ghostty settings and it starts and opens in a new tab.
   - **Switchboard:** Dev servers, under Local services. Start, then the link.
   - **A terminal:** `svc up ghostty-settings`, then open http://127.0.0.1:5124/
2. Use it. The plain address works; it forwards you to the page with its access token.
3. Leave it. It stops by itself after 5 minutes without a click or keypress from you. pm2 does not restart it, and an open tab polling for changes does not keep it alive.
4. If a tab is still open when it stops, the tab says so and reconnects by itself once you start it again. Your staged changes stay in that tab.

Stop it sooner with the power button on the bfb card, Stop in Switchboard, or `svc down ghostty-settings`. A restart of the Mac leaves it stopped.

The service is defined in `ecosystem.config.cjs`. The 5 minutes can be changed with the environment variable `GHOSTTY_MGR_IDLE_MS`, and `0` turns the stop off. `npm start` still runs it in a terminal for development.

## Using it

1. Pick a group in the strip at the top, or press `/` and search by name, key or description.
2. Change a control. The row is marked as staged, the sample terminal on the right updates, and the diff panel under it shows the exact lines that would change.
3. Check Ghostty's verdict in the diff panel, then press Apply or `⌘↵`.
4. Read the receipt. It names the backup file and the history entry.
5. Press your reload keybind in Ghostty, which the receipt shows.

Nothing is written until step 3. Esc discards the staged changes, and `⌘Z` brings them back once.

## Four ways back

After every Apply the receipt offers these.

| Way | What it does |
|---|---|
| Undo | Restores the exact earlier file |
| History | Opens the history entry for that Apply |
| Copy | Copies a `cp` command that puts the backup back |
| Git hash | The history entry's id, for the history repo in the state folder |

## What protects your config

- Staging never writes. A test fails if the page ever calls a write route while you stage.
- Apply needs the hash of the file you staged against, and the server refuses when the file changed since, both when Apply starts and just before the file is replaced.
- A change set that fails Ghostty's own validator is refused, and the message names the key.
- A validator that did not run cleanly counts as a failure, never as a clean file.
- Raw file can save a file with problems after an explicit confirm. It gets the same backup, receipt and Undo.

## Checks

Run `bash app/checks/settings-gui.sh`. It runs the checks that need no browser and exits non-zero on any violation. `npm test` runs the full suite.

`node app/test/tools/second-writer-probe.mjs` runs many Applies against a concurrent hand-edit writer and prints how many were applied, refused and lost.

## Not done yet

- The theme picker replaces a `light:X,dark:Y` pair with one theme. Editing each side needs your call.
- History diffs still show git's header lines.
- The first Apply to an empty config adds a blank line.
- Starting and stopping from Switchboard and the better-file-browser homepage depends on a proposal that is filed, `prop-20261031-145506-e0`.
