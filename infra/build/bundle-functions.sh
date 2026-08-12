#!/usr/bin/env bash
#
# Bundles every Lambda entry point in apps/api/src/lambda into one self
# contained file per function, ready to be zipped and uploaded.
#
# Run this before `terraform plan` in an environment. The lambda module reads
# the output of this script and fails loudly if it is not there, rather than
# deploying an empty package.
#
#   infra/build/bundle-functions.sh [output-directory]
#
# The default output directory is infra/build/dist, which the repository's
# .gitignore already excludes.
#
# Why this is a script and not a `null_resource` with a local provisioner:
# Terraform evaluates the archive data sources during plan and would run a
# provisioner during apply, so a build wired that way is always one apply
# behind the source it bundles. Building first, then planning, is the order
# that cannot be wrong.

set -euo pipefail

# Pinned rather than floating. The bundler decides what code actually runs in
# production, so which bundler is not a detail a lock file elsewhere should be
# free to move.
readonly ESBUILD_VERSION='0.25.0'

# The Lambda runtime. Kept in step with the `runtime` argument in the lambda
# module and with .nvmrc; a bundle targeting a newer Node than the runtime
# emits syntax the runtime cannot parse, and the failure is a cryptic init
# error rather than a build error.
readonly NODE_TARGET='node24'

# The application is ESM, so the bundle is ESM and the file is named .mjs,
# which is how Lambda decides to load it as a module.
#
# Some bundled dependencies are CommonJS and call `require` at runtime rather
# than at the top level — pino resolves its transports that way. `require` does
# not exist in an ES module, so without this banner those calls fail at the
# first log line rather than at build time.
readonly ESM_REQUIRE_BANNER=$'import { createRequire as __nodeCreateRequire } from "node:module";\nconst require = __nodeCreateRequire(import.meta.url);'

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repository_root=$(cd -- "${script_dir}/../.." && pwd)
entry_point_dir="${repository_root}/apps/api/src/lambda"
output_dir="${1:-${script_dir}/dist}"

if [[ ! -d "${entry_point_dir}" ]]; then
  echo "No entry points at ${entry_point_dir}" >&2
  exit 1
fi

# Removed rather than overwritten. A function deleted from the source would
# otherwise leave its last bundle behind, and Terraform would happily keep
# deploying it.
rm -rf "${output_dir}"
mkdir -p "${output_dir}"

bundled=0

for entry_point in "${entry_point_dir}"/*.ts; do
  function_name=$(basename "${entry_point}" .ts)

  # The test file sits beside the entry points on purpose — it is what pins
  # that each one exports a handler — and it is not one of them.
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
