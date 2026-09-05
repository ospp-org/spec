#!/usr/bin/env bash
# Resolve an ajv-cli binary into $AJV, bootstrapping one OUT OF TREE if nothing is installed.
#
# Sourced by validate-schemas.sh and validate-examples.sh. It is a module, not a gate: it has no
# entry point of its own and check-tool-callers.py excludes it for that reason.
#
# It exists as one file because the two callers had the same twenty lines twice, and this
# repository has already paid for that shape once: validate-schemas.sh was a second, divergent
# copy of its own CI job, and the copy CI did not run rotted unnoticed until it reported 86
# failures out of 86. Two copies of a resolver drift the same way, more quietly.
#
# $AJV_BIN wins, so CI can point at an install made OUTSIDE the checkout. That is deliberate and
# is preserved here: this repo's package.json depends on @ospp/protocol, a package these gates
# never load, and a version cascade once pinned it to a version npm had never carried — after
# which `npm install` failed ETARGET before a single schema was compiled. A gate must not be able
# to die of a dependency it never loads, so nothing here installs into the checkout.
#
# Until 0.32.0 the no-binary branch printed two commands and exited 2. That meant these gates ran
# in CI and nowhere else, and a gate that cannot be run before pushing reports its findings after
# the decision it should have informed. It now bootstraps, cached, and fails only if that fails.

AJV="${AJV_BIN:-}"
if [ -z "$AJV" ]; then
  if [ -x node_modules/.bin/ajv ]; then AJV=node_modules/.bin/ajv
  elif command -v ajv >/dev/null 2>&1; then AJV=$(command -v ajv)
  fi
fi

if [ -z "$AJV" ] || ! "$AJV" help >/dev/null 2>&1; then
  GATE_HOME="${OSPP_GATE_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/ospp-spec-gate}"
  CACHED="$GATE_HOME/node_modules/.bin/ajv"
  if [ ! -x "$CACHED" ]; then
    echo "No ajv-cli found. Bootstrapping one into $GATE_HOME (outside the checkout)..." >&2
    mkdir -p "$GATE_HOME"
    if ! npm install --no-save --prefix "$GATE_HOME" ajv-cli@5 ajv-formats@3 >&2; then
      echo "FATAL: could not install ajv-cli into $GATE_HOME." >&2
      echo "  Tried: \$AJV_BIN, ./node_modules/.bin/ajv, ajv on PATH, then this bootstrap." >&2
      echo "  With a network, the bootstrap is the whole fix. Without one, install ajv-cli@5" >&2
      echo "  and ajv-formats@3 anywhere and point \$AJV_BIN at the binary." >&2
      echo "  Note that \`npx ajv\` does NOT work here — npm resolves it to the ajv *library*," >&2
      echo "  which has no bin, and the local copy shadows any global ajv-cli." >&2
      exit 2
    fi
  fi
  AJV="$CACHED"
  if ! "$AJV" help >/dev/null 2>&1; then
    echo "FATAL: bootstrapped $AJV does not run." >&2
    exit 2
  fi
fi
