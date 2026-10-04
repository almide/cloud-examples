# The conohavps provider is the Aid-On fork (https://github.com/Aid-On/terraform-provider-conohavps),
# which is not on the Registry: build it and point dev_overrides at it (README.md).
terraform {
  required_version = ">= 1.5"
  required_providers {
    conohavps = { source = "gmo-internet/conohavps" }
  }
}

# Credentials from CONOHAVPS_TENANT_ID, CONOHAVPS_USER_ID and CONOHAVPS_PASSWORD.
provider "conohavps" {}
