# Exact Rust version and Almide release (checksum-verified); base-image digests are
# not locked yet. The release binary needs glibc 2.39+, hence Debian trixie. Native
# `almide build` emits Rust and compiles it with cargo, so the build stage keeps Rust.
FROM rust:1.99.0-trixie AS build
WORKDIR /work
COPY .almide-release .almide-checksums.sha256 rust-toolchain.toml ./
COPY scripts/install-almide.sh scripts/install-almide.sh
RUN ./scripts/install-almide.sh
COPY src/ src/
RUN mkdir build && .tools/bin/almide build src/native.almd -o build/server

FROM debian:trixie-slim AS runtime
WORKDIR /app
COPY --from=build /work/build/server ./server
COPY LICENSE /app/LICENSE
COPY licenses/ /app/licenses/
# Mount point for STORE_DIR (/notes storage), owned by the runtime user so a
# fresh named volume inherits it. Unused unless STORE_DIR is set.
RUN install -d -o 65532 -g 65532 /data
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
