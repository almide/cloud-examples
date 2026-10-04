variable "project_id" {
  description = "An existing project with billing; use a dedicated one for trying this out"
  type        = string
}

variable "region" {
  type    = string
  default = "asia-northeast1"
}

variable "name" {
  description = "Service name and prefix of what is created with it"
  type        = string
  default     = "almide-api-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.name))
    error_message = "Use 3-24 lowercase letters, digits or hyphens (service-account ids are limited to 30)."
  }
}

variable "image" {
  # Null on the first apply: the repository must exist before the image is pushed.
  description = "The pushed image pinned by digest; the service is created only once this is set"
  type        = string
  default     = null
  validation {
    condition     = var.image == null || can(regex("^[a-z0-9-]+-docker\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9._-]+/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Use an Artifact Registry image pinned to a full sha256 digest, not a tag."
  }
}

variable "invoker_members" {
  # Empty by default: no one can invoke the service until you name them.
  description = "IAM members granted roles/run.invoker on the service, e.g. serviceAccount:caller@PROJECT.iam.gserviceaccount.com"
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for m in var.invoker_members : !contains(["allUsers", "allAuthenticatedUsers"], m)])
    error_message = "allUsers and allAuthenticatedUsers are refused; this example stays private."
  }
}
