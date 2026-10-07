# How to install the Usage Monitor

A step-by-step guide. No coding needed: you copy, paste and press Enter.

## What you get

A small panel inside Claude Code that shows:

- how much of your plan's limits you've used, and when they reset
- how many tokens each agent used (the main chat, Explore, and so on)
- how often the cache saved you tokens (cache hit %)
- a guess at whether you'll run out before the next reset

## What you need

- **Claude Code** installed on your computer.
  Not sure? Open a terminal and type `claude --version`. If you see a version number, you're good.
  If not, install it first: <https://docs.claude.com/en/docs/claude-code/setup>

## Install it (about 1 minute)

**Step 1. Open a terminal.**
- Windows: press the Windows key, type `PowerShell`, press Enter.
- Mac: press Cmd + Space, type `Terminal`, press Enter.

**Step 2. Start Claude Code.** Type this and press Enter:

```
claude
```

**Step 3. Paste this into Claude Code and press Enter:**

```
/plugin install agent-usage --marketplace AUCB21/cc-mods
```

**Step 4. Answer the two questions:**
1. *Add marketplace?* Type `y` and press Enter.
2. *Choose a scope:* just press Enter. The first option, **user**, is the right one: it turns the monitor on for all your sessions.

**Step 5. Done!** You'll see `Installed agent-usage. Plugin is now active.`

## How to use it

| Type this in Claude Code | What happens |
| --- | --- |
| `/usage-monitor` | Opens the usage panel |
| `/usage-by-agent` | Prints a table of tokens per agent |

You'll also see live totals in the status line at the bottom.

The panel opens by itself in the Claude desktop app and in wide terminal windows.

## Good to know

- **Desktop app users:** the install command only works in a terminal, not in the desktop app. Install it once from a terminal (steps above); after that, it also works in the desktop app.
- **Numbers start at zero** for each new session.
- **"Cost" is an estimate** of what your usage would cost at API prices. On a Pro or Max plan, that's not what you're billed.
- **Some sections are missing?** "Plan limits" only shows if you're on a Claude subscription, and most sections fill in after Claude's first reply.

## Update or remove it

In a terminal (not inside Claude Code), type one of these and press Enter:

```
claude plugin update agent-usage
```

```
claude plugin uninstall agent-usage
```

## Something not working?

Open an issue here: <https://github.com/AUCB21/cc-mods/issues>
