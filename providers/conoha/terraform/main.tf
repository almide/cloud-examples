# One disposable Docker VPS for the Compose example. Everything here is new and
# named after var.name; existing servers, keys and security groups are left alone.

data "conohavps_flavor" "plan" { name = var.flavor }
data "conohavps_image" "docker" { name = var.image }

resource "conohavps_keypair" "admin" {
  name       = "${var.name}-admin"
  public_key = file(pathexpand(var.ssh_public_key))
}

# SSH from the operator's addresses and nothing else inbound. compose.yaml
# publishes the app on host loopback only, so it is reached through SSH.
resource "conohavps_securitygroup" "ssh" {
  name        = "${var.name}-ssh"
  description = "SSH from operator CIDRs only"
}

resource "conohavps_securitygroup_rule" "ssh" {
  for_each         = toset(var.ssh_allowed_cidrs)
  securitygroup_id = conohavps_securitygroup.ssh.id
  direction        = "ingress"
  ethertype        = strcontains(each.value, ":") ? "IPv6" : "IPv4"
  protocol         = "tcp"
  port_range_min   = 22
  port_range_max   = 22
  remote_ip_prefix = each.value
}

resource "conohavps_volume" "boot" {
  name        = "${var.name}-boot"
  size        = 100 # the plan's own boot storage; 200 or 500 is billed as added storage
  volume_type = "c3j1-ds02-boot"
  image_ref   = data.conohavps_image.docker.id
}

resource "conohavps_instance" "host" {
  instance_name_tag = var.name
  flavor_id         = data.conohavps_flavor.plan.id
  block_device      = [{ uuid = conohavps_volume.boot.id }]
  key_name          = conohavps_keypair.admin.name
  security_group    = [{ name = conohavps_securitygroup.ssh.name }]
  power_state       = "ACTIVE"
  depends_on        = [conohavps_securitygroup_rule.ssh]
}

locals {
  # The global address: addresses also lists additional IPs (add-) and local networks (local-).
  ipv4 = [for net, addrs in conohavps_instance.host.addresses : [for a in addrs : a.addr if a.version == 4][0] if startswith(net, "ext-")][0]
}
