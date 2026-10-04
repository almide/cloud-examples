variable "project_id" {
  description = "An existing project with billing; use a dedicated one for trying this out"
  type        = string
}

variable "region" {
  type    = string
  default = "asia-northeast1"
}

variable "name" {
  description = "Function name and prefix of what is created with it"
  type        = string
  default     = "almide-fn-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.name))
    error_message = "Use 3-24 lowercase letters, digits or hyphens (service-account ids are limited to 30)."
  }
}

variable "package_dir" {
  description = "The staged package from `npm run package:faas` (node_modules is left out; the build installs from the lockfile)"
  type        = string
  default     = "../../../build/packages/google-cloud-functions"
}

variable "invoker_members" {
  # Empty by default: no one can invoke the function until you name them.
  description = "IAM members granted roles/run.invoker, e.g. serviceAccount:caller@PROJECT.iam.gserviceaccount.com"
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for m in var.invoker_members : !contains(["allUsers", "allAuthenticatedUsers"], m)])
    error_message = "allUsers and allAuthenticatedUsers are refused; this example stays private."
  }
}
