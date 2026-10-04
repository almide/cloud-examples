# ConoHa VPS: native container route

Status: on 2026-10-04 a VPS was created with the [Terraform](#optional-a-disposable-vps-with-terraform)
below (`g2l-t-c4m4`, Docker 29.2.1, Compose v5.0.2, Ubuntu 24.04.4, x86_64). The
Compose commands below built the image on the VPS, and the shared 18-case HTTP
contract passed through an SSH tunnel; port 8080 was not reachable from the
internet. The VPS was then destroyed. The same commands also passed on macOS
arm64 (Docker 29.6.1). TLS, a reverse proxy, restart behavior and load were not
tested. No ConoHa SDK is required.

## Prerequisites

- An existing Linux VPS, compatible Docker Engine and Compose plugin, and a
  deliberate plan for TLS and ingress. Do not create resources just to run tests.
- Build on a matching Linux architecture.
- The image build downloads the pinned compiler and compiles only the app with
  cargo. On a 4-core, 4 GB VPS it took 91 seconds including base-image pulls, and
  24 seconds for a rebuild without layer cache. Smaller plans were not measured.

## Optional: a disposable VPS with Terraform

[terraform/](terraform/) creates one new VPS for this example and nothing else:
a `g2l-t-c4m4` server (Linux, hourly billing, 4 cores, 4 GB) from ConoHa's Docker
image, its 100 GB boot volume, an SSH key pair, and a security group that admits
only TCP 22 from the CIDRs you give. ConoHa's `IPv4v6-SSH` group admits SSH from
anywhere, so it is not used. Existing servers, keys and groups in the account are
not read or changed. The server is billed hourly until it is destroyed, stopped or
not; check [ConoHa pricing](https://vps.conoha.jp/pricing/) first.

It uses the Aid-On fork of the ConoHa provider, which is not on the Terraform
Registry. Build it and point `dev_overrides` at it as its
[setup section](https://github.com/Aid-On/terraform-provider-conohavps#セットアップ)
describes. Credentials are those of a ConoHa API user, given only through the
environment; keep them in a file outside Git:

```sh
cat > ~/.config/conoha/credentials.env <<'X'
export CONOHAVPS_TENANT_ID='...'
export CONOHAVPS_USER_ID='...'
export CONOHAVPS_PASSWORD='...'
X
chmod 600 ~/.config/conoha/credentials.env
set -a; . ~/.config/conoha/credentials.env; set +a

cd providers/conoha/terraform
cp terraform.tfvars.example terraform.tfvars   # set ssh_allowed_cidrs to your /32
terraform init
terraform plan
terraform apply
ssh root@$(terraform output -raw ipv4) cloud-init status --wait
```

`terraform.tfvars`, state and `.terraform/` are ignored by Git. A new ConoHa
account may refuse a second server (`Number of flavors (plans) allowed per project
is limit`) until ConoHa raises the limit. On first boot the Docker image runs
unattended upgrades, so wait for cloud-init before building. Then run the
commands below on the server, and finish with `terraform destroy`.

From the repository root:

```sh
docker compose -f providers/conoha/compose.yaml build
docker compose -f providers/conoha/compose.yaml up -d
curl --fail http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/greet \
  -H 'content-type: application/json' --data '{"name":"ConoHa"}'
docker compose -f providers/conoha/compose.yaml down
```

Compose binds the app only to the host loopback address. For public access, place
a TLS reverse proxy in front and configure the intended ConoHa security group
and guest firewall yourself. Docker-published ports can bypass UFW; UFW alone is
not proof the app is private. The optional Terraform creates only the server and
its SSH-only security group; no TLS, DNS or public ingress is included.

The runtime image uses a non-root UID, and Compose drops capabilities and makes
the root filesystem read-only. These choices are a starting point, not a security
audit. The image currently uses version tags rather than immutable base digests.

## Official references

- [ConoHa Docker template](https://doc.conoha.jp/products/vps-v3/image-v3/image-application-v3/docker-v3/)
- [ConoHa security groups](https://doc.conoha.jp/products/vps-v3/security-v3/security-group-v3/)
- [Docker on Ubuntu, including firewall limitations](https://docs.docker.com/engine/install/ubuntu/)
