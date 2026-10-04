output "ipv4" {
  value = local.ipv4
}

output "ssh" {
  value = "ssh root@${local.ipv4}"
}

output "instance_id" {
  value = conohavps_instance.host.id
}
