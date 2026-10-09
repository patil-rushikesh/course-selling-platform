#!/usr/bin/env bash
set -euo pipefail
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended cluster context}"
: "${APP_IMAGE:?Set APP_IMAGE to the backend image tag or digest}"
: "${FRONTEND_IMAGE:?Set FRONTEND_IMAGE to the frontend image tag or digest}"
cd "$(dirname "$0")/.."
# Limit values to container-reference characters before writing YAML.
for image in "$APP_IMAGE" "$FRONTEND_IMAGE"; do
  [[ "$image" =~ ^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$ ]] || { echo 'Invalid image reference' >&2; exit 1; }
done
KUBECTL=(kubectl --context "$KUBE_CONTEXT")
"${KUBECTL[@]}" apply -f deploy/k8s/namespace.yaml
"${KUBECTL[@]}" -n course-platform get secret course-platform-secrets -o name >/dev/null
# Remove only the obsolete migration Job from an older version of this project.
"${KUBECTL[@]}" -n course-platform delete job course-platform-migrate --ignore-not-found --wait=true
render_dir=$(mktemp -d deploy/.render-XXXXXX)
trap 'rm -rf "$render_dir"' EXIT
write_image_override() {
  local original="$1" reference="$2" image_name tag digest
  if [[ "$reference" == *@* ]]; then
    image_name="${reference%@*}"
    digest="${reference##*@}"
    printf '  - name: %s\n    newName: "%s"\n    newTag: ""\n    digest: "%s"\n' "$original" "$image_name" "$digest"
  else
    if [[ "${reference##*/}" == *:* ]]; then
      image_name="${reference%:*}"
      tag="${reference##*:}"
    else
      image_name="$reference"
      tag=latest
    fi
    printf '  - name: %s\n    newName: "%s"\n    newTag: "%s"\n' "$original" "$image_name" "$tag"
  fi
}
{
  cat <<'YAML'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s
images:
YAML
  write_image_override course-platform "$APP_IMAGE"
  write_image_override course-frontend "$FRONTEND_IMAGE"
} > "$render_dir/kustomization.yaml"
"${KUBECTL[@]}" apply -k "$render_dir"
"${KUBECTL[@]}" -n course-platform rollout status statefulset/postgres --timeout=300s
"${KUBECTL[@]}" -n course-platform rollout status deployment/course-platform --timeout=300s
"${KUBECTL[@]}" -n course-platform rollout status deployment/course-frontend --timeout=300s
