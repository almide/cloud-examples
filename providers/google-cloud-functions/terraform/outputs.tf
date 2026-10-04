output "function_url" {
  value = google_cloudfunctions2_function.api.service_config[0].uri
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "notes_bucket" {
  value = google_storage_bucket.notes.name
}
