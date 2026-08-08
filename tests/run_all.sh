#!/usr/bin/env bash
#
# Run every test in tests/ and exit non-zero if any of them fails.
#
# This is the one entry point: run it before a commit, and CI runs the same
# script, so the two can never drift. Tests are discovered by glob, not listed
# here, so a new tests/test_*.php or tests/test_*_js.js is picked up with no
# edit to this file. Support scripts (dump_clusters.php, regenerate_board.php)
# do not carry the test_ prefix and are skipped.
#
# Every test file already exits non-zero on failure, so nothing here parses
# output -- a file's exit status is the verdict.
#
# Usage:  bash tests/run_all.sh
#         PHP=/path/to/php bash tests/run_all.sh
#
# Note: no `set -e`. A failing test must not abort the run; the point is to
# report every failure in one pass.
set -uo pipefail
shopt -s nullglob

cd "$(dirname "$0")/.."

# --- interpreters -----------------------------------------------------------
# Homebrew's php is not on a non-login shell's PATH on macOS, and silently
# skipping half the suite is the exact failure this script exists to prevent,
# so an interpreter that cannot be found is a hard error.
find_bin() {
    local override="$1"; shift
    if [ -n "$override" ]; then
        command -v "$override" >/dev/null 2>&1 && { printf '%s' "$override"; return 0; }
        return 1
    fi
    local cand
    for cand in "$@"; do
        command -v "$cand" >/dev/null 2>&1 && { printf '%s' "$cand"; return 0; }
    done
    return 1
}

PHP_BIN=$(find_bin "${PHP:-}" php /opt/homebrew/bin/php /usr/local/bin/php /usr/bin/php) || {
    echo "error: no php found. Install it, put it on PATH, or set PHP=/path/to/php." >&2
    exit 2
}
NODE_BIN=$(find_bin "${NODE:-}" node /opt/homebrew/bin/node /usr/local/bin/node) || {
    echo "error: no node found. Install it, put it on PATH, or set NODE=/path/to/node." >&2
    exit 2
}

# test_cluster_parity_js.js shells out to php itself; hand it the same binary
# this run resolved, so both halves of the suite test one PHP.
export PHP="$PHP_BIN"

echo "php:  $PHP_BIN ($("$PHP_BIN" -r 'echo PHP_VERSION;'))"
echo "node: $NODE_BIN ($("$NODE_BIN" --version))"
echo

# --- run --------------------------------------------------------------------
pass=0
fail=0
failed=()

run_test() {
    local bin="$1" file="$2" out
    printf '  %-42s ' "$(basename "$file")"
    if out=$("$bin" "$file" 2>&1); then
        printf 'ok\n'
        pass=$((pass + 1))
    else
        printf 'FAIL\n'
        fail=$((fail + 1))
        failed+=("$file")
        printf '%s\n' "$out" | sed 's/^/      /'
    fi
}

for f in tests/test_*.php; do run_test "$PHP_BIN" "$f"; done
for f in tests/test_*_js.js; do run_test "$NODE_BIN" "$f"; done

# --- verdict ----------------------------------------------------------------
echo
if [ "$fail" -eq 0 ]; then
    echo "$pass test files passed."
    exit 0
fi

echo "$fail of $((pass + fail)) test files FAILED:"
for f in "${failed[@]}"; do echo "  $f"; done
exit 1
