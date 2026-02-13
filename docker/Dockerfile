FROM node:20-alpine

# Install required tools
RUN apk add --no-cache bash curl git openssh-client

# Create app directory
WORKDIR /app

# Copy the repository (will be mounted as volume in docker-compose)
COPY . .

# Install node dependencies if needed
RUN npm install --workspaces 2>/dev/null || true

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
