#!/usr/bin/env bash

set -Eeuo pipefail

required_env=(
  GH_REPO
  GH_TOKEN
  GITEE_TOKEN
  GITEE_OWNER
  GITEE_REPO
  RELEASE_TAG
)

required_commands=(gh git curl jq awk find stat mktemp)

die() {
  echo "::error::$*" >&2
  exit 1
}

timestamp() {
  printf '%s UTC / %s CST' \
    "$(date -u '+%H:%M:%S')" \
    "$(TZ='Asia/Shanghai' date '+%H:%M:%S')"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

for env_name in "${required_env[@]}"; do
  [ -n "${!env_name:-}" ] || die "${env_name} is not configured."
done

for command_name in "${required_commands[@]}"; do
  command -v "${command_name}" > /dev/null 2>&1 || die "Required command ${command_name} is unavailable."
done

api_base="https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}"
tag="${RELEASE_TAG}"
encoded_tag="$(jq -rn --arg value "${tag}" '$value | @uri')"
github_remote="https://github.com/${GH_REPO}.git"
gitee_remote="https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}.git"
work_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gitee-release-sync.XXXXXX")"
assets_dir="${work_dir}/assets"
release_body_file="${work_dir}/release_body.md"

mkdir -p "${assets_dir}"

curl_read=(
  curl
  --silent
  --show-error
  --retry 3
  --retry-delay 5
  --retry-connrefused
  --connect-timeout 30
  --max-time 120
)

curl_write=(
  curl
  --fail-with-body
  --silent
  --show-error
  --connect-timeout 30
  --max-time 120
)

print_gitee_response() {
  local response_file="$1"
  local response_excerpt

  if [ ! -s "${response_file}" ]; then
    echo "Gitee returned an empty response body."
  elif jq -e . "${response_file}" > /dev/null 2>&1; then
    jq 'walk(if type == "object" then del(.access_token) else . end)' "${response_file}"
  else
    response_excerpt="$(head -c 2000 "${response_file}")"
    printf '%s\n' "${response_excerpt//"${GITEE_TOKEN}"/***REDACTED***}"
  fi
}

resolve_remote_tag_sha() {
  local remote="$1"
  local refs direct peeled

  if ! refs="$(GIT_TERMINAL_PROMPT=0 git ls-remote --tags "${remote}" \
    "refs/tags/${tag}" "refs/tags/${tag}^{}")"; then
    echo "Failed to query tag ${tag} from ${remote}." >&2
    return 1
  fi

  direct="$(printf '%s\n' "${refs}" | awk -v ref="refs/tags/${tag}" '$2 == ref { print $1; exit }')"
  peeled="$(printf '%s\n' "${refs}" | awk -v ref="refs/tags/${tag}^{}" '$2 == ref { print $1; exit }')"
  printf '%s\n' "${peeled:-${direct}}"
}

lookup_gitee_release_id() {
  local response_file="${work_dir}/gitee_existing_release.json"
  local status

  if ! status="$("${curl_read[@]}" \
    --output "${response_file}" \
    --write-out '%{http_code}' \
    "${api_base}/releases/tags/${encoded_tag}?access_token=${GITEE_TOKEN}")"; then
    echo "Failed to query the existing Gitee release for ${tag}." >&2
    print_gitee_response "${response_file}" >&2
    return 1
  fi

  case "${status}" in
    200)
      if ! jq -e '. == null or (type == "object" and has("id"))' "${response_file}" > /dev/null; then
        echo "Gitee returned an unexpected release lookup response for ${tag}." >&2
        print_gitee_response "${response_file}" >&2
        return 1
      fi
      jq -r 'if type == "object" then (.id // empty) else empty end' "${response_file}"
      ;;
    404)
      ;;
    *)
      echo "Failed to query the existing Gitee release for ${tag}: HTTP ${status}." >&2
      print_gitee_response "${response_file}" >&2
      return 1
      ;;
  esac
}

prepare_github_release() {
  local release_info

  log "Reading GitHub release ${tag}."
  release_info="$(gh release view "${tag}" --json name,body)"
  release_name="$(printf '%s\n' "${release_info}" | jq -r --arg tag "${tag}" '.name // $tag')"
  printf '%s\n' "${release_info}" | jq -r '.body // ""' > "${release_body_file}"

  log "Downloading GitHub release assets."
  gh release download "${tag}" --pattern "*" --dir "${assets_dir}"
  ls -lh "${assets_dir}"

  test -f "${assets_dir}/tampermonkey-plugin-koishi-market-ai-helper.user.js"
  test -f "${assets_dir}/tampermonkey-plugin-koishi-market-ai-helper-dist.tar.gz"
  test -f "${assets_dir}/SHA256SUMS.txt"
}

ensure_gitee_tag() {
  github_tag_sha="$(resolve_remote_tag_sha "${github_remote}")"
  [ -n "${github_tag_sha}" ] || die "GitHub tag ${tag} does not exist in ${GH_REPO}."

  gitee_tag_sha="$(resolve_remote_tag_sha "${gitee_remote}")"
  if [ -n "${gitee_tag_sha}" ]; then
    log "Gitee tag ${tag} already exists at ${gitee_tag_sha}."
    [ "${gitee_tag_sha}" = "${github_tag_sha}" ] || \
      die "Gitee tag ${tag} points to ${gitee_tag_sha}, expected ${github_tag_sha}."
    return
  fi

  log "Creating Gitee tag ${tag} from GitHub commit ${github_tag_sha}."
  tag_payload="$(jq -n \
    --arg token "${GITEE_TOKEN}" \
    --arg tag "${tag}" \
    --arg ref "${github_tag_sha}" \
    '{
      access_token: $token,
      tag_name: $tag,
      refs: $ref,
      tag_message: ("Release " + $tag)
    }')"

  if ! "${curl_write[@]}" \
    --output "${work_dir}/gitee_tag.json" \
    -X POST \
    --header 'Content-Type: application/json;charset=UTF-8' \
    "${api_base}/tags" \
    -d "${tag_payload}"; then
    gitee_tag_sha="$(resolve_remote_tag_sha "${gitee_remote}")"
    if [ "${gitee_tag_sha}" != "${github_tag_sha}" ]; then
      echo "Failed to create Gitee tag ${tag}." >&2
      print_gitee_response "${work_dir}/gitee_tag.json" >&2
      exit 1
    fi
    log "Gitee tag ${tag} became available while the create request completed."
  fi

  for attempt in 1 2 3 4 5; do
    gitee_tag_sha="$(resolve_remote_tag_sha "${gitee_remote}")"
    if [ "${gitee_tag_sha}" = "${github_tag_sha}" ]; then
      log "Created and verified Gitee tag ${tag} at ${gitee_tag_sha}."
      return
    fi
    log "Waiting for Gitee tag ${tag} to become visible (${attempt}/5)."
    sleep 2
  done

  die "Created Gitee tag ${tag}, but expected ${github_tag_sha} and received ${gitee_tag_sha:-missing}."
}

delete_existing_gitee_release() {
  local release_id delete_status release_deleted remaining_release_id

  release_id="$(lookup_gitee_release_id)"
  if [ -z "${release_id}" ]; then
    log "Gitee release ${tag} does not exist yet."
    return
  fi

  log "Deleting existing Gitee release ${release_id} for ${tag}."
  if ! delete_status="$(curl \
    --silent \
    --show-error \
    --connect-timeout 30 \
    --max-time 120 \
    --output "${work_dir}/gitee_delete.json" \
    --write-out '%{http_code}' \
    -X DELETE \
    "${api_base}/releases/${release_id}?access_token=${GITEE_TOKEN}")"; then
    echo "Failed to delete existing Gitee release ${release_id}." >&2
    print_gitee_response "${work_dir}/gitee_delete.json" >&2
    exit 1
  fi

  case "${delete_status}" in
    200|202|204|404)
      ;;
    *)
      echo "Failed to delete existing Gitee release ${release_id}: HTTP ${delete_status}." >&2
      print_gitee_response "${work_dir}/gitee_delete.json" >&2
      exit 1
      ;;
  esac

  release_deleted="false"
  remaining_release_id="${release_id}"
  for attempt in 1 2 3 4 5; do
    sleep 2
    remaining_release_id="$(lookup_gitee_release_id)"
    if [ -z "${remaining_release_id}" ]; then
      release_deleted="true"
      break
    fi
    log "Waiting for Gitee release ${tag} to be deleted (${attempt}/5)."
  done

  [ "${release_deleted}" = "true" ] || \
    die "Gitee release ${tag} is still visible as ${remaining_release_id} after deletion."
}

create_gitee_release() {
  local create_payload

  create_payload="$(jq -n \
    --arg token "${GITEE_TOKEN}" \
    --arg tag "${tag}" \
    --arg name "${release_name}" \
    --arg target "${github_tag_sha}" \
    --rawfile body "${release_body_file}" \
    '{
      access_token: $token,
      tag_name: $tag,
      name: $name,
      body: $body,
      target_commitish: $target,
      prerelease: false
    }')"

  log "Creating Gitee release for ${tag}."
  if ! "${curl_write[@]}" \
    --output "${work_dir}/gitee_release.json" \
    -X POST \
    --header 'Content-Type: application/json;charset=UTF-8' \
    "${api_base}/releases" \
    -d "${create_payload}"; then
    echo "Failed to create Gitee release for ${tag}." >&2
    print_gitee_response "${work_dir}/gitee_release.json" >&2
    exit 1
  fi

  new_release_id="$(jq -r '.id // empty' "${work_dir}/gitee_release.json")"
  [ -n "${new_release_id}" ] || {
    echo "Gitee release response did not include a release id." >&2
    print_gitee_response "${work_dir}/gitee_release.json" >&2
    exit 1
  }

  log "Created Gitee release ${new_release_id}."
}

upload_gitee_assets() {
  local total current success file filename filesize filesize_h
  local started_at finished_at elapsed curl_exit upload_status

  total="$(find "${assets_dir}" -maxdepth 1 -type f | wc -l | tr -d ' ')"
  current=0
  success=0
  log "Uploading ${total} assets to Gitee release ${new_release_id}."

  for file in "${assets_dir}"/*; do
    [ -f "${file}" ] || continue
    current=$((current + 1))
    filename="$(basename "${file}")"
    filesize="$(stat -c%s "${file}" 2>/dev/null || stat -f%z "${file}" 2>/dev/null || echo 0)"
    filesize_h="$(numfmt --to=iec "${filesize}" 2>/dev/null || echo "${filesize} bytes")"
    log "[${current}/${total}] Uploading ${filename} (${filesize_h}, ${filesize} bytes)."

    started_at="$(date +%s)"
    curl_exit=0
    upload_status="$(curl \
      --silent \
      --show-error \
      --max-time 1200 \
      --connect-timeout 30 \
      --output "${work_dir}/gitee_upload.json" \
      --write-out '%{http_code}' \
      -X POST \
      --header 'Content-Type: multipart/form-data' \
      -F "access_token=${GITEE_TOKEN}" \
      -F "file=@${file}" \
      "${api_base}/releases/${new_release_id}/attach_files")" || curl_exit=$?
    finished_at="$(date +%s)"
    elapsed=$((finished_at - started_at))
    log "Upload result for ${filename}: curl=${curl_exit}, HTTP=${upload_status:-000}, elapsed=${elapsed}s."

    if [ "${curl_exit}" -ne 0 ]; then
      echo "Failed to upload ${filename} to Gitee." >&2
      print_gitee_response "${work_dir}/gitee_upload.json" >&2
      exit 1
    fi

    case "${upload_status}" in
      200|201)
        ;;
      *)
        echo "Failed to upload ${filename}: HTTP ${upload_status}." >&2
        print_gitee_response "${work_dir}/gitee_upload.json" >&2
        exit 1
        ;;
    esac

    if ! jq -e '.browser_download_url // .download_url // .id' \
      "${work_dir}/gitee_upload.json" > /dev/null; then
      echo "Unexpected Gitee response for ${filename}." >&2
      print_gitee_response "${work_dir}/gitee_upload.json" >&2
      exit 1
    fi

    success=$((success + 1))
    log "Uploaded ${filename}."
  done

  log "Gitee upload summary: ${success}/${total} succeeded."
  [ "${success}" -eq "${total}" ] || die "Not all Gitee release assets were uploaded."
}

main() {
  prepare_github_release
  ensure_gitee_tag
  delete_existing_gitee_release
  create_gitee_release
  upload_gitee_assets
}

main "$@"
