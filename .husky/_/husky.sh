#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  readonly hook_name="$(basename -- "$0")"
  export husky_skip_init=1
  sh -e "$0" "$@"
  code="$?"

  if [ "$code" != 0 ]; then
    echo "husky - $hook_name script failed (code $code)"
  fi

  exit "$code"
fi
