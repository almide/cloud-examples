terraform {
  required_version = ">= 1.5"
  required_providers {
    google  = { source = "hashicorp/google", version = "~> 8.5" }
    archive = { source = "hashicorp/archive", version = "~> 2.8" }
    time    = { source = "hashicorp/time", version = "~> 0.13" }
  }
}

# Credentials from Application Default Credentials (gcloud auth application-default login).
provider "google" {
  project = var.project_id
  region  = var.region
}
