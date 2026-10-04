variable "account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "name" {
  description = "Worker name; the KV namespace is <name>-notes"
  type        = string
  default     = "almide-cloud-example"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,62}$", var.name))
    error_message = "Use 3-63 lowercase letters, digits or hyphens."
  }
}

variable "bundle_dir" {
  description = "Output of `npm run check:workers`: worker.js and the Wasm module it imports"
  type        = string
  default     = "../../../build/worker-bundle"
}

variable "workers_dev" {
  # The Worker has no authentication: on workers.dev it is public.
  description = "Serve the Worker on its public *.workers.dev URL"
  type        = bool
  default     = true
}
