# ConoHa VPS: native container route

Status: native executable tested on Linux locally. The image and the Compose
commands below were run locally on linux/arm64 (Docker 29.6.1) and passed the
shared 18-case HTTP contract. An x86_64 image and a ConoHa VPS deployment have
**not** been run yet. This directory is a reproducible setup candidate, not a
claim of hosted support. No ConoHa SDK is required.

## Prerequisites

- An existing Linux VPS, compatible Docker Engine and Compose plugin, and a
  deliberate plan for TLS and ingress. Do not create resources just to run tests.
- Build on a matching Linux architecture; the first local proof was x86_64.
- Sufficient build resources. The Almide compiler build embeds Wasmtime and is much
  heavier than the tiny deployed app; build elsewhere and transfer an image if
  the VPS is small. ConoHa's documented 1 GiB template minimum is not a build-RAM
  recommendation.

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
not proof the app is private. No firewall, TLS, DNS or cloud-account automation is
included here.

The runtime image uses a non-root UID, and Compose drops capabilities and makes
the root filesystem read-only. These choices are a starting point, not a security
audit. The image currently uses version tags rather than immutable base digests.

## Official references

- [ConoHa Docker template](https://doc.conoha.jp/products/vps-v3/image-v3/image-application-v3/docker-v3/)
- [ConoHa security groups](https://doc.conoha.jp/products/vps-v3/security-v3/security-group-v3/)
- [Docker on Ubuntu, including firewall limitations](https://docs.docker.com/engine/install/ubuntu/)
