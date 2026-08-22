#!/usr/bin/env bash
set -euo pipefail

source_database_url="${SUPABASE_DB_URL:-}"
restore_database_url="${SUPABASE_RESTORE_TEST_DB_URL:-}"
production_api_url="${NEXT_PUBLIC_SUPABASE_URL:-}"
confirmation="${CONFIRM_ERASE_RESTORE_TEST_DATABASE:-}"
backup_root="${BACKUP_OUTPUT_DIR:-.data/backups/database-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "$source_database_url" || -z "$restore_database_url" ]]; then
  echo "Set SUPABASE_DB_URL and SUPABASE_RESTORE_TEST_DB_URL."
  exit 2
fi

if [[ "$source_database_url" == "$restore_database_url" ]]; then
  echo "Refusing to restore into the source database."
  exit 2
fi

production_project_ref="${production_api_url#https://}"
production_project_ref="${production_project_ref%%.*}"
if [[ -n "$production_project_ref" && "$restore_database_url" == *"$production_project_ref"* ]]; then
  echo "Refusing to use the production Supabase project as the restore target."
  exit 2
fi

if [[ "$confirmation" != "ERASE_DISPOSABLE_RESTORE_TARGET" ]]; then
  echo "The restore validation erases the target public schema. Set CONFIRM_ERASE_RESTORE_TEST_DATABASE=ERASE_DISPOSABLE_RESTORE_TARGET after checking the target URL."
  exit 2
fi

for command_name in supabase psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required for the restore test."
    exit 2
  fi
done

mkdir -p "$backup_root"
roles_dump="$backup_root/roles.sql"
schema_dump="$backup_root/schema.sql"
data_dump="$backup_root/data.sql"

echo "Creating database backup in $backup_root"
supabase db dump --db-url "$source_database_url" --role-only --file "$roles_dump"
supabase db dump --db-url "$source_database_url" --file "$schema_dump"
supabase db dump --db-url "$source_database_url" --data-only --use-copy --file "$data_dump"

echo "Erasing only the disposable target's public schema"
psql "$restore_database_url" -X -v ON_ERROR_STOP=1 -c "drop schema if exists public cascade; create schema public; grant usage on schema public to postgres, anon, authenticated, service_role;"

echo "Restoring schema and data into the disposable target"
psql "$restore_database_url" -X -v ON_ERROR_STOP=1 -f "$roles_dump"
psql "$restore_database_url" -X -v ON_ERROR_STOP=1 -f "$schema_dump"
psql "$restore_database_url" -X -v ON_ERROR_STOP=1 -f "$data_dump"

counts_sql="select jsonb_build_object(
  'profiles', (select count(*) from public.profiles),
  'restrooms', (select count(*) from public.restrooms),
  'reviews', (select count(*) from public.reviews),
  'restroom_updates', (select count(*) from public.restroom_updates),
  'reports', (select count(*) from public.reports),
  'advertising_campaigns', (select count(*) from public.advertising_campaigns),
  'request_rate_limits', (select count(*) from public.request_rate_limits),
  'stripe_webhook_events', (select count(*) from public.stripe_webhook_events),
  'restroom_source_records', (select count(*) from public.restroom_source_records),
  'promotion_activity_events', (select count(*) from public.promotion_activity_events),
  'restroom_verifications', (select count(*) from public.restroom_verifications),
  'community_photos', (select count(*) from public.community_photos),
  'community_notes', (select count(*) from public.community_notes),
  'community_note_votes', (select count(*) from public.community_note_votes)
)::text;"
source_counts="$(psql "$source_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "$counts_sql")"
restore_counts="$(psql "$restore_database_url" -X -A -t -v ON_ERROR_STOP=1 -c "$counts_sql")"

if [[ "$source_counts" != "$restore_counts" ]]; then
  echo "Restore count validation failed."
  echo "Source:  $source_counts"
  echo "Restore: $restore_counts"
  exit 1
fi

echo "Restore validation passed: $restore_counts"
echo "Database backup retained at $backup_root"
