FROM mcr.microsoft.com/devcontainers/javascript-node:18

# Install rust toolchain for Tauri development
RUN apt-get update && apt-get install -y curl build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install rustup non-interactive
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /workspace
