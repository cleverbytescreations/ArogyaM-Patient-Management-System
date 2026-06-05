---
name: project-claude-config
description: ArogyaM PMS Claude Code configuration — skills, hooks, commands, and settings all created and validated
metadata:
  type: project
---

Claude Code configuration fully generated and validated for ArogyaM PMS on 2026-06-05.

**Why:** User asked for a complete Claude Code config based on the architecture and implementation plan docs.

**How to apply:** All files are in place. Remind user to restart Claude Code to pick up the new hooks and commands.

Files created:
- `CLAUDE.md` — routing document (53 lines)
- `.claude/skills/architecture-deep-dive/SKILL.md`
- `.claude/skills/backend-patterns/SKILL.md`
- `.claude/skills/frontend-guidelines/SKILL.md`
- `.claude/hooks/prefer_lsp.py` — redirects Grep on .py/.ts/.tsx to LSP
- `.claude/hooks/ts-diagnostics.sh` — runs tsc --noEmit after frontend edits
- `.claude/commands/` — 9 slash commands: fix-error, impl-phase, lint-fix, migrate, new-endpoint, phase-status, run-tests, session-end, update-checklist
- `.claude/settings.json` — project permissions + hooks wired
- `.gitignore` updated to exclude `.claude/settings.local.json`

Key project facts locked in:
- Backend: sync SQLAlchemy (not async), psycopg3, no connection pooler in Phase 1
- Module path: `backend/app/modules/<domain>/router|service|repository|models|schemas.py`
- Frontend: Radix UI + Tailwind (NOT MUI)
- Tests + migrations run inside Docker: `docker compose exec api pytest/alembic`
- Redis optional (no DB slot assignments in Phase 1)
- No outbox pattern, no Celery in Phase 1
- No separate vector DB (pgvector is future-only)
