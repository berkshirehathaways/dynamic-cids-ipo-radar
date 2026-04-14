#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is required"
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
  echo "SUPABASE_PROJECT_REF is required"
  exit 1
fi

npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push

echo "Supabase link + migration push completed."
