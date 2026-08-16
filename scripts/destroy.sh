#!/usr/bin/env bash
set -euo pipefail

stack_name="${1:-db-less-rag-demo}"

stack_output() {
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" \
    --output text
}

empty_bucket() {
  local bucket_name="$1"
  local versions_json
  local delete_json
  local object_count

  versions_json="$(aws s3api list-object-versions --bucket "$bucket_name" --output json)"
  delete_json="$(printf '%s' "$versions_json" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const data = JSON.parse(input);
  const objects = [
    ...(data.Versions ?? []),
    ...(data.DeleteMarkers ?? []),
  ].map((item) => ({ Key: item.Key, VersionId: item.VersionId }));
  process.stdout.write(JSON.stringify({ Objects: objects, Quiet: true }));
});
')"
  object_count="$(printf '%s' "$delete_json" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => process.stdout.write(String(JSON.parse(input).Objects.length)));
')"

  if [[ "$object_count" -gt 0 ]]; then
    aws s3api delete-objects --bucket "$bucket_name" --delete "$delete_json"
  fi
}

documents_bucket="$(stack_output DocumentsBucketName)"

if [[ -z "$documents_bucket" || "$documents_bucket" == "None" ]]; then
  echo "Could not find bucket outputs for CloudFormation stack: $stack_name" >&2
  exit 1
fi

echo "Permanently deleting objects from s3://$documents_bucket"
empty_bucket "$documents_bucket"

sam delete --stack-name "$stack_name" --no-prompts
