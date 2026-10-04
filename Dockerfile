# Exact Rust version and Almide commit; base-image digests are not locked yet.
FROM rust:1.99.0-bookworm AS build
WORKDIR /work
COPY .almide-revision rust-toolchain.toml ./
COPY scripts/install-almide.sh scripts/install-almide.sh
RUN ./scripts/install-almide.sh
COPY src/ src/
RUN mkdir build && .tools/bin/almide build src/native.almd -o build/server

FROM debian:bookworm-slim AS runtime
WORKDIR /app
COPY --from=build /work/build/server ./server
COPY LICENSE /app/LICENSE
COPY licenses/ /app/licenses/
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
