output "image_path" {
  description = "Tag and push the image here, then set var.image to its digest"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/almide-api"
}

output "service_url" {
  value = var.image == null ? null : google_cloud_run_v2_service.api[0].uri
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "notes_bucket" {
  value = google_storage_bucket.notes.name
}
