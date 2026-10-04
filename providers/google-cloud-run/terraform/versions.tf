terraform {
  required_version = ">= 1.5"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 8.5" }
  }
}

# Credentials from Application Default Credentials (gcloud auth application-default login).
provider "google" {
  project = var.project_id
  region  = var.region
}
