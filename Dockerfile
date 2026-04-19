# Production Dockerfile for Agent Bar Hangout
# Compatible with Docker, Podman, and Kubernetes
#
# Build:   docker build -t agent-bar-hangout .
#          podman build -t agent-bar-hangout .
#
# Run:     docker run -p 8080:8080 agent-bar-hangout
#          podman run -p 8080:8080 agent-bar-hangout

# ──────────────────────────────────────────────────────────────
# Stage 1: Build stage
# ──────────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev || npm install

# Copy source files
COPY . .

# Build frontend if build script exists
RUN if [ -f "build-frontend.js" ]; then node build-frontend.js; fi

# ──────────────────────────────────────────────────────────────
# Stage 2: Production stage
# ──────────────────────────────────────────────────────────────
FROM node:18-alpine AS production

# Add labels for container metadata
LABEL org.opencontainers.image.title="Agent Bar Hangout"
LABEL org.opencontainers.image.description="Lightweight dev server for Agent Bar Hangout"
LABEL org.opencontainers.image.source="https://github.com/your-org/agent-bar-hangout"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files from builder
COPY --from=builder /app/server.js ./
COPY --from=builder /app/persistence.js ./
COPY --from=builder /app/app.js ./
COPY --from=builder /app/index.html ./
COPY --from=builder /app/style.css ./
COPY --from=builder /app/public ./public/

# Create data directory for persistence
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=8080
ENV PERSISTENCE_DB_PATH=/app/data/agent-bar-hangout.db
ENV PERSISTENCE_MEMORY_FILE_PATH=/app/data/memories.json

# Expose the application port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" || exit 1

# Start the application
CMD ["node", "server.js"]
