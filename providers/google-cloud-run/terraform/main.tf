# The native container on Cloud Run: an Artifact Registry repository, a runtime
# identity with no project roles, a private bucket for /notes, and the service
# with internal ingress and the invoker IAM check. Same settings as
# ../service.template.yaml.

resource "google_project_service" "apis" {
  for_each           = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "storage.googleapis.com", "iam.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "almide"
  format        = "DOCKER"
  location      = var.region
  depends_on    = [google_project_service.apis]
}

resource "google_service_account" "runtime" {
  account_id   = "${var.name}-run"
  display_name = "Runtime identity of ${var.name}; no project roles"
  depends_on   = [google_project_service.apis]
}

resource "google_storage_bucket" "notes" {
  name                        = "${var.project_id}-${var.name}-notes"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true # destroy removes the stored notes too
  depends_on                  = [google_project_service.apis]
}

# Read and overwrite objects in this bucket only.
resource "google_storage_bucket_iam_member" "runtime_notes" {
  bucket = google_storage_bucket.notes.name
  role   = "roles/storage.objectUser"
  member = google_service_account.runtime.member
}

resource "google_cloud_run_v2_service" "api" {
  count                = var.image == null ? 0 : 1
  name                 = var.name
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = false
  deletion_protection  = false

  template {
    service_account                  = google_service_account.runtime.email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    max_instance_request_concurrency = 1 # native http.serve is sequential
    timeout                          = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      name  = "api"
      image = var.image
      ports {
        name           = "http1"
        container_port = 8080
      }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.notes.name
      }
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        timeout_seconds   = 5
        period_seconds    = 10
        failure_threshold = 24
      }
      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        timeout_seconds   = 5
        period_seconds    = 30
        failure_threshold = 3
      }
    }
  }

  depends_on = [google_storage_bucket_iam_member.runtime_notes]
}

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = var.image == null ? toset([]) : toset(var.invoker_members)
  name     = google_cloud_run_v2_service.api[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = each.value
}
