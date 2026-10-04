output "kv_namespace_id" {
  value = cloudflare_workers_kv_namespace.notes.id
}

output "version_id" {
  value = cloudflare_worker_version.api.id
}
