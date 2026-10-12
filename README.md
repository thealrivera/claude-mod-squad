# claude-mod-squad

Mods for Claude Code: small add-ons that change how Claude Code looks and behaves.

| Mod | What it does |
|---|---|
| [`usage-band`](mods/usage-band) | A quiet band above the prompt: live model and effort, 5-hour session usage with a run-out forecast, and a warning when extra, max or ultracode effort is burning usage. |

## Install in one step

Paste this to Claude Code:

> Go to https://github.com/thealrivera/claude-mod-squad and follow the install steps in the README.

That's all. The steps below are what it will follow, so you can also run them yourself.

## Install steps

*Claude: do these in order, using the Bash tool. Stop and tell the user if a step fails.*

1. **Check the version.** Run `claude --version`. It must be 2.1.295 or newer. If it is older, find a newer
   `claude` binary and use it for steps 2 to 4. The Claude desktop app keeps one under
   `~/Library/Application Support/Claude/claude-code/<version>/`. Tell the user which one you used.
2. **Add the marketplace.**
   ```bash
   claude plugin marketplace add thealrivera/claude-mod-squad
   ```
3. **Install the mod** for the user (every session):
   ```bash
   claude plugin install usage-band@claude-mod-squad --scope user
   ```
4. **Confirm.** `claude plugin list` should show `usage-band@claude-mod-squad` as `enabled`.
5. **Tell the user** to start a new session, or run `/reload-plugins` in an open one. The band appears above the prompt.

Install from a terminal, not from inside the desktop app's Code tab: `/plugin install` is not available there, but the
`claude plugin ...` commands above work from any terminal or from Claude's Bash tool.

## usage-band

```
 ◆ Sonnet 5.5  ◉ xhigh  Session ████████░░░░░░░░ 31%  resets 3h 55m · runs out in ~2h 30m
 ⚠ EXTRA EFFORT  xhigh thinking, uses your limit faster
```

- **Model and effort chips:** what is answering, and how hard it is thinking.
- **Session bar (Claude plans):** share of your 5-hour usage window used. Solid is used, dim is where your current
  pace ends the window, dark is free. The text says when it resets and whether you will run out first. Week and
  context show only when they pass 80% and 85%.
- **Warning line:** extra (`xhigh`) or `max` effort, an ultracode or Workflow run, or a full usage window. A toast
  appears the first time each level shows up.
- **API billing:** there are no plan limits, so it shows session cost instead of the bar.

## Update, remove

```bash
claude plugin marketplace update claude-mod-squad
claude plugin update usage-band@claude-mod-squad
```

```bash
claude plugin uninstall usage-band@claude-mod-squad
```

## For the maintainer

- Each mod lives in `mods/<name>/` and is listed in `.claude-plugin/marketplace.json`.
- Installed copies are cached by version. After any change, bump `version` in the mod's `.claude-plugin/plugin.json`
  and push, or `plugin update` will not pick it up.
- Check a mod before pushing:
  ```bash
  claude plugin validate mods/usage-band
  claude plugin test mods/usage-band
  ```
