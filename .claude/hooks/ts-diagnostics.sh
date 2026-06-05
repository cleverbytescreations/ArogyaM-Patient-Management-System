#!/bin/bash
# Runs tsc --noEmit after every Edit/Write on a .ts/.tsx file inside frontend/.
# Exits 2 when type errors are found so Claude is forced to address them.

INPUT=$(cat)

if ! command -v jq &>/dev/null; then
  exit 0
fi

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [[ ! "$FILE" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

FRONTEND_DIR="./frontend"
if [ ! -d "$FRONTEND_DIR" ]; then
  exit 0
fi

DIAG=$(cd "$FRONTEND_DIR" && npx tsc --noEmit --pretty false 2>&1)
TSC_EXIT=$?

if [ $TSC_EXIT -eq 0 ]; then
  exit 0
fi

echo "TypeScript errors detected after editing: $FILE"
echo ""
echo "$DIAG" | head -50
exit 2