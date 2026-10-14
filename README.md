# claudius-modulus

A band above the Claude Code prompt that tells you how your session is going, and keeps your spirits up while you
burn through it.

```
 ◆ Sonnet 5.5  ◉ xhigh  Session ████████░░░░░░░░ 31%  resets 3h 55m · runs out in ~2h 30m
 ▌ claudius-modulus - “If you aren't burning 1B tokens a day, are you even alive?”            v1.6.0
```

## Install in one step

Paste this to Claude Code:

> Go to https://github.com/thealrivera/claudius-modulus and follow the install steps in the README.

That's all. The steps below are what it will follow, so you can also run them yourself.

## Install steps

*Claude: do these in order, using the Bash tool. Stop and tell the user if a step fails.*

1. **Check the version.** Run `claude --version`. It must be 2.1.295 or newer. If it is older, find a newer
   `claude` binary and use it for steps 2, 3 and 5. The Claude desktop app keeps one under
   `~/Library/Application Support/Claude/claude-code/<version>/`. Tell the user which one you used.
2. **Add the marketplace.**
   ```bash
   claude plugin marketplace add thealrivera/claudius-modulus
   ```
3. **Install the mod** for the user (every session):
   ```bash
   claude plugin install claudius-modulus@claudius-modulus --scope user
   ```
4. **Turn on auto-update**, so every change merged to `main` reaches this user. Third-party marketplaces have it off by
   default and the repo cannot switch it on for them, so set it in the user's settings. Open `~/.claude/settings.json`
   (or `settings.json` in the folder `CLAUDE_CONFIG_DIR` points to, if it is set). Step 2 already wrote
   `extraKnownMarketplaces.claudius-modulus` there. Add `"autoUpdate": true` to that entry and change nothing else:
   ```json
   "extraKnownMarketplaces": {
     "claudius-modulus": {
       "source": { "source": "github", "repo": "thealrivera/claudius-modulus" },
       "autoUpdate": true
     }
   }
   ```
   Tell the user you did this. They can undo it in `/plugin`, under Marketplaces, by choosing Disable auto-update.
5. **Confirm.** `claude plugin list` should show `claudius-modulus@claudius-modulus` as `enabled`.
6. **Tell the user** to start a new session, or run `/reload-plugins` in an open one. The band appears above the prompt.

Install from a terminal, not from inside the desktop app's Code tab: `/plugin install` is not available there, but the
`claude plugin ...` commands above work from any terminal or from Claude's Bash tool.

## What it shows (v1.6.0)

- **Model and effort chips:** what is answering, and how hard it is thinking.
- **Session bar (Claude plans):** share of your 5-hour usage window used. Solid is used, dim is where your current
  pace ends the window, dark is free. The text says when it resets and whether you will run out first. Week and
  context show only when they pass 80% and 85%.
- **Second row:** twenty token-maxxing one-liners, switching every 30 seconds. When a warning applies (extra `xhigh`
  or `max` effort, an ultracode or Workflow run, a full usage window) it takes every other switch, and a toast
  announces it the first time.
- **API billing:** there are no plan limits, so it shows session cost instead of the bar.
- **Level icon:** on the desktop a pixel icon for the level sits beside the chips, and it moves: the moon's star twinkles, the cup steams, the chevrons march, the bolt sparks, the flame flickers.
- **Cycle the model and effort:** click the model chip or the effort chip to step to the next model (Fable, Opus, Sonnet, Haiku) or the next effort (low to max) for your next request. The chips change at once and a toast confirms it. The same from the prompt: `/cm model next`, `/cm model opus`, `/cm effort prev`, `/cm effort max`, and `/cm off` to drop the override. The band's choice rides on each request until you change the model or effort yourself (`/model`, the picker, the effort slider); then the engine's choice wins. The built-in picker keeps showing the session's own setting, not the band's. While the band holds the keyboard focus, its top-left rule and the brand name turn bright orange.
- **Level meter:** a five-bar symbol under the model chip (`▂▃▅▇█`, one bar lit to all five) with a name (You have work to do, Warming Up, Tokenizing, Tokenmaxxing, Tokenzilla), shown as "Level N - name": how well you are pacing toward using every token.
- **Background work ring:** while sub-agents, workflow agents or background agents run, a ring in the middle shows how many have finished and an estimated time to completion (a pie and a count in a terminal).
- **Collapse:** a `−` button at the top right folds the band to one line (a tiny level glyph, the model and effort chips, the bar and the reset time). `+` brings it back. The choice is remembered between sessions. Collapsed, the chips shorten (`S 5.5`, `Low`), the session % leads the bar, and a short `Projected:` forecast sits beside it when there is room.
- **Brand and version:** a blinking cursor and `claudius-modulus` lead the quote row at the lower left, and a rule above the session block breathes in the cursor's colours; at the lower right, the band shows how many local dev servers are listening (python, node and the like, counted with lsof every 15 seconds), then the version.

## Updates

With auto-update on (step 4), a merge to `main` reaches users on its own: in a session, a few minutes after the first
message, Claude Code fetches the new commit and shows `Plugin updated: claudius-modulus · Run /reload-plugins to apply`.
Run `/reload-plugins` to switch to it now, or it loads the next time Claude Code starts. Auto-update is off if the user
sets `DISABLE_AUTOUPDATER=1` or `DISABLE_UPDATES=1`.

To update by hand:

```bash
claude plugin marketplace update claudius-modulus
claude plugin update claudius-modulus@claudius-modulus
```

```bash
claude plugin uninstall claudius-modulus@claudius-modulus
```

## Versions

Installed copies are versioned by commit, so users always follow `main`.

Releases are tagged (`v1.0.0`) and listed under [Releases](https://github.com/thealrivera/claudius-modulus/releases).
`v1.0.0` is the locked first release (published as `usage-band`, renamed `claudeus-maximus` then `claudius-maximus` in v1.1.0, and `claudius-modulus` after that); `main` may move ahead of it.

## For the maintainer

- Each mod lives in `mods/<name>/` and is listed in `.claude-plugin/marketplace.json`.
- Do not set `version` in `plugin.json` or in the marketplace entry. Without one, Claude Code uses the commit SHA, so every
  merge to `main` is an update for installed users. A pinned version would keep everyone on the old copy until it changes.
- The label on the band comes from `mods/<name>/hooks/version.ts`. Change it only for a visible release, then cut it:
  `git tag -a vX.Y.Z -m "..."`, `git push origin vX.Y.Z`, `gh release create vX.Y.Z`.
- Check a mod before pushing:
  ```bash
  claude plugin validate mods/claudius-modulus
  claude plugin test mods/claudius-modulus
  ```
