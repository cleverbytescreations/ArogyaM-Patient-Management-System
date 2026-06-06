#!/usr/bin/env python3
import json
import sys

data = json.load(sys.stdin)
tool_input = data.get("tool_input", {}) or {}

candidates = []
for key in ("path", "paths", "glob", "pattern", "query", "include"):
    value = tool_input.get(key)
    if isinstance(value, str):
        candidates.append(value)
    elif isinstance(value, list):
        candidates.extend(str(v) for v in value)

text = " ".join(candidates).lower()

lsp_exts = (".py", ".ts", ".tsx")

if any(ext in text for ext in lsp_exts):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": (
                "For typed-code navigation, use the LSP tool instead of Grep. "
                "Prefer definitions, references, symbols, hover/type info, and diagnostics. "
                "Use Grep only as a fallback when LSP cannot answer."
            )
        }
    }))

sys.exit(0)
