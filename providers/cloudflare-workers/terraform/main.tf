# The Worker from the Wrangler bundle, its KV namespace for /notes, and a
# deployment of that version. Same settings as ../wrangler.jsonc.

locals {
  worker_js = file("${var.bundle_dir}/worker.js")
  # Only the Wasm module the bundle imports; a stale one in the directory is not uploaded.
  wasm = regex("from \"\\./([0-9a-f]+-app\\.wasm)\"", local.worker_js)[0]
}

resource "cloudflare_workers_kv_namespace" "notes" {
  account_id = var.account_id
  title      = "${var.name}-notes"
}

resource "cloudflare_worker" "api" {
  account_id = var.account_id
  name       = var.name
  subdomain = {
    enabled          = var.workers_dev
    previews_enabled = false
  }
}

resource "cloudflare_worker_version" "api" {
  account_id         = var.account_id
  worker_id          = cloudflare_worker.api.id
  compatibility_date = "2026-10-04"
  # Almide's generated glue has a top-level import.meta.url and an unused
  # node:fs/promises fallback; see ../README.md.
  compatibility_flags = ["nodejs_compat", "new_module_registry"]
  main_module         = "worker.js"
  modules = [
    {
      name         = "worker.js"
      content_type = "application/javascript+module"
      content_file = "${var.bundle_dir}/worker.js"
    },
    {
      name         = local.wasm
      content_type = "application/wasm"
      content_file = "${var.bundle_dir}/${local.wasm}"
    },
  ]
  bindings = [{
    name         = "NOTES"
    type         = "kv_namespace"
    namespace_id = cloudflare_workers_kv_namespace.notes.id
  }]
}

resource "cloudflare_workers_deployment" "api" {
  account_id  = var.account_id
  script_name = cloudflare_worker.api.name
  strategy    = "percentage"
  versions = [{
    version_id = cloudflare_worker_version.api.id
    percentage = 100
  }]
}
