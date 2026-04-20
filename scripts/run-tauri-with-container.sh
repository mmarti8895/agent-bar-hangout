#!/bin/bash
# filepath: /home/mars/Desktop/projects/agent-bar-hangout/scripts/run-tauri-with-container.sh
# Run Tauri UI with backend from Podman/Docker container
#
# Usage: ./scripts/run-tauri-with-container.sh [docker|podman]
#
# This script:
# 1. Builds and starts the backend container (if not running)
# 2. Launches the Tauri desktop app connected to the container

set -e

CONTAINER_RUNTIME="${1:-podman}"
CONTAINER_NAME="agent-bar-hangout"
IMAGE_NAME="agent-bar-hangout:latest"
PORT="${PORT:-8080}"

cd "$(dirname "$0")/.."

echo "🐳 Using container runtime: $CONTAINER_RUNTIME"

# Check if container runtime is available
if ! command -v "$CONTAINER_RUNTIME" &> /dev/null; then
    echo "❌ $CONTAINER_RUNTIME is not installed"
    exit 1
fi

# Check if the container is already running
if $CONTAINER_RUNTIME ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "✅ Backend container '$CONTAINER_NAME' is already running"
else
    # Check if container exists but is stopped
    if $CONTAINER_RUNTIME ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
        echo "🔄 Starting existing container '$CONTAINER_NAME'..."
        $CONTAINER_RUNTIME start "$CONTAINER_NAME"
    else
        # Build the image if it doesn't exist
        if ! $CONTAINER_RUNTIME images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE_NAME}$"; then
            echo "🔨 Building container image..."
            $CONTAINER_RUNTIME build -t "$IMAGE_NAME" .
        fi

        echo "🚀 Starting new backend container..."
        $CONTAINER_RUNTIME run -d \
            --name "$CONTAINER_NAME" \
            -p "${PORT}:8080" \
            -e NODE_ENV=development \
            -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
            -e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
            -e GOOGLE_API_KEY="${GOOGLE_API_KEY:-}" \
            -v agent-bar-data:/app/data:Z \
            "$IMAGE_NAME"
    fi
fi

# Wait for the backend to be ready
echo "⏳ Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s "http://localhost:${PORT}/health" > /dev/null 2>&1; then
        echo "✅ Backend is ready at http://localhost:${PORT}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend failed to start. Check logs with: $CONTAINER_RUNTIME logs $CONTAINER_NAME"
        exit 1
    fi
    sleep 1
done

# Build frontend assets
echo "🎨 Building frontend assets..."
node build-frontend.js

# Run Tauri in dev mode (it will connect to the container's backend)
echo "🖥️  Launching Tauri UI (connecting to containerized backend)..."
echo ""
echo "Note: The Tauri window will load from http://localhost:${PORT}"
echo "      Backend is running in container: $CONTAINER_NAME"
echo ""

# Run Tauri without the beforeDevCommand (we're using the container)
TAURI_CLI_NO_DEV_SERVER_WAIT=true npx tauri dev --no-watch

