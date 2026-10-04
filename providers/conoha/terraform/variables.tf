variable "name" {
  description = "Name of the server and the prefix of everything created with it"
  type        = string
  default     = "almide-cloud-example"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name))
    error_message = "Use 3-41 lowercase letters, digits or hyphens."
  }
}

variable "flavor" {
  # The verified plan. The image build compiles only the app (the compiler is
  # downloaded); smaller plans were not measured.
  description = "ConoHa plan by flavor name: g2l-t-c4m4 is Linux, hourly billing, 4 cores, 4 GB"
  type        = string
  default     = "g2l-t-c4m4"
}

variable "image" {
  description = "ConoHa Docker application image (Docker Engine and Compose on Ubuntu 24.04)"
  type        = string
  default     = "vmi-docker-29.2-ubuntu-24.04-amd64"
}

variable "ssh_public_key" {
  description = "Path of the public key installed for root"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "ssh_allowed_cidrs" {
  # No default on purpose. ConoHa's IPv4v6-SSH group admits SSH from anywhere;
  # this configuration admits only the given sources.
  description = "Source CIDRs allowed to reach SSH, for example your own address as /32"
  type        = list(string)
  validation {
    condition = length(var.ssh_allowed_cidrs) > 0 && alltrue([
      for c in var.ssh_allowed_cidrs : can(cidrhost(c, 0)) && !contains(["0.0.0.0/0", "::/0"], c)
    ])
    error_message = "Give at least one specific CIDR; 0.0.0.0/0 and ::/0 are refused."
  }
}
