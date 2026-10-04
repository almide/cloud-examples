# The Wasm function on Cloud Run functions (Cloud Functions v2 API): the staged
# package as source, a build identity, a runtime identity with no project roles,
# a private bucket for /notes, internal-only ingress and the invoker IAM check.
# Same settings as ../deploy.sh.

resource "google_project_service" "apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com", "run.googleapis.com", "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com", "storage.googleapis.com", "iam.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "runtime" {
  account_id   = "${var.name}-run"
  display_name = "Runtime identity of ${var.name}; no project roles"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "build" {
  account_id   = "${var.name}-build"
  display_name = "Builds ${var.name} from source"
  depends_on   = [google_project_service.apis]
}

resource "google_project_iam_member" "build" {
  project = var.project_id
  role    = "roles/cloudbuild.builds.builder"
  member  = google_service_account.build.member
}

# New IAM grants take a minute to reach Cloud Build.
resource "time_sleep" "build_iam" {
  depends_on      = [google_project_iam_member.build]
  create_duration = "60s"
}

resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-${var.name}-source"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true
  depends_on                  = [google_project_service.apis]
}

data "archive_file" "source" {
  type        = "zip"
  source_dir  = var.package_dir
  output_path = "${path.module}/.terraform/${var.name}-source.zip"
  excludes    = ["node_modules/**"]
}

resource "google_storage_bucket_object" "source" {
  name   = "${var.name}-${data.archive_file.source.output_sha256}.zip"
  bucket = google_storage_bucket.source.name
  source = data.archive_file.source.output_path
}

resource "google_storage_bucket" "notes" {
  name                        = "${var.project_id}-${var.name}-notes"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = true # destroy removes the stored notes too
  depends_on                  = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "runtime_notes" {
  bucket = google_storage_bucket.notes.name
  role   = "roles/storage.objectUser"
  member = google_service_account.runtime.member
}

resource "google_cloudfunctions2_function" "api" {
  name     = var.name
  location = var.region

  build_config {
    runtime         = var.runtime
    entry_point     = "almideApi"
    service_account = google_service_account.build.id
    source {
      storage_source {
        bucket = google_storage_bucket.source.name
        object = google_storage_bucket_object.source.name
      }
    }
  }

  service_config {
    service_account_email            = google_service_account.runtime.email
    ingress_settings                 = "ALLOW_INTERNAL_ONLY"
    max_instance_request_concurrency = 1
    min_instance_count               = 0
    max_instance_count               = 3
    available_memory                 = "256Mi"
    available_cpu                    = "1"
    timeout_seconds                  = 30
    all_traffic_on_latest_revision   = true
    environment_variables = {
      GCS_BUCKET = google_storage_bucket.notes.name
    }
  }

  depends_on = [time_sleep.build_iam, google_storage_bucket_iam_member.runtime_notes]
}

# The function is served by a Cloud Run service; invocation is its run.invoker.
resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = toset(var.invoker_members)
  name     = google_cloudfunctions2_function.api.service_config[0].service
  location = var.region
  role     = "roles/run.invoker"
  member   = each.value
}
