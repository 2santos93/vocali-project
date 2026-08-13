#!/usr/bin/env bash

set -euo pipefail

readonly ESBUILD_VERSION='0.25.0'

readonly NODE_TARGET='node24'

readonly ESM_REQUIRE_BANNER=$'import { createRequire as __nodeCreateRequire } from "node:module";\nconst require = __nodeCreateRequire(import.meta.url);'

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repository_root=$(cd -- "${script_dir}/../.." && pwd)
entry_point_dir="${repository_root}/apps/api/src/lambda"
output_dir="${1:-${script_dir}/dist}"

if [[ ! -d "${entry_point_dir}" ]]; then
  echo "No entry points at ${entry_point_dir}" >&2
  exit 1
fi

rm -rf "${output_dir}"
mkdir -p "${output_dir}"

bundled=0

for entry_point in "${entry_point_dir}"/*.ts; do
  function_name=$(basename "${entry_point}" .ts)

  # The test file sits beside the entry points on purpose, because it pins
  # that each one exports a handler, but it is not one of them.
  case "${function_name}" in
    *.test) continue ;;
  esac

  echo "bundling ${function_name}"

  pnpm --silent dlx "esbuild@${ESBUILD_VERSION}" \
    "${entry_point}" \
    --bundle \
    --platform=node \
    --target="${NODE_TARGET}" \
    --format=esm \
    --outfile="${output_dir}/${function_name}/index.mjs" \
    --banner:js="${ESM_REQUIRE_BANNER}" \
    --log-level=warning

  bundled=$((bundled + 1))
done

if [[ ${bundled} -eq 0 ]]; then
  echo "Bundled nothing. ${entry_point_dir} holds no entry point." >&2
  exit 1
fi

echo "Bundled ${bundled} functions into ${output_dir}"
