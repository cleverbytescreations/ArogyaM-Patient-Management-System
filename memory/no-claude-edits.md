---
name: no-claude-edits
description: User guardrail forbidding Codex from changing Claude-related project configuration
metadata:
  type: user-preference
---

Codex must not edit, delete, move, rewrite, normalize, or otherwise modify any Claude-related files in this repository. Claude Code is allowed to modify Claude-related configuration; this restriction is specifically for Codex.

Off-limits includes `CLAUDE.md`, `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `.claude/settings.local.json`, and any future Claude-specific config, skill, hook, command, or settings file.
