terraform {
  required_version = ">= 1.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.26" }
  }
}

# Credentials from CLOUDFLARE_API_TOKEN (Workers Scripts and Workers KV Storage: Edit).
provider "cloudflare" {}
