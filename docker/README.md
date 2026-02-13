# Docker Builder for Tools Repository

This Docker setup runs the build script daily, pulling the latest code from main, executing the build, and pushing results back to the repository.

## Prerequisites

1. **Docker and Docker Compose**: Install from [docker.com](https://www.docker.com/products/docker-desktop)
2. **Git SSH Keys**: Set up SSH authentication with your git remote
   - Generate SSH key if you don't have one: `ssh-keygen -t ed25519 -C "your-email@example.com"`
   - Add the public key to your GitHub account (Settings > SSH and GPG keys)

## Setup Instructions

### 1. Initialize Git Remote Authentication

Make sure your local machine can authenticate with your git remote without prompting for a password:

```bash
# Test SSH connection
ssh -T git@github.com

# If this prompts for a password, add your SSH key to ssh-agent:
ssh-add ~/.ssh/id_ed25519  # or your key filename
```

### 2. Configure Docker Environment

The Docker container will mount your SSH keys from `~/.ssh`. Ensure your keys are properly loaded:

```bash
# Check your SSH keys
ls -la ~/.ssh/
```

### 3. Build and Start the Container

From the repository root (where this docker folder is located):

```bash
# Build the Docker image
docker-compose -f docker/docker-compose.yml build

# Start the container in the background
docker-compose -f docker/docker-compose.yml up -d

# Verify it's running
docker-compose -f docker/docker-compose.yml ps
```

### 4. Monitor the Logs

```bash
# View real-time logs
docker-compose -f docker/docker-compose.yml logs -f

# View logs for a specific timestamp
docker-compose -f docker/docker-compose.yml logs --tail=100
```

## How It Works

The builder container:
1. Starts and enters a loop
2. Pulls the latest code from `origin/main`
3. Runs the `build.sh` script
4. Commits any changes with a timestamp
5. Pushes changes back to the remote
6. Sleeps for 24 hours
7. Repeats from step 2

## Managing the Container

### Stop the Builder

```bash
docker-compose -f docker/docker-compose.yml down
```

### Restart the Builder

```bash
docker-compose -f docker/docker-compose.yml restart
```

### Run a Manual Build (while running)

```bash
docker-compose -f docker/docker-compose.yml exec builder bash build.sh
```

### View Container Logs

```bash
# Follow logs in real-time
docker-compose -f docker/docker-compose.yml logs -f builder

# View last 50 lines
docker-compose -f docker/docker-compose.yml logs --tail=50 builder
```

### Create a Symlink for Easier Commands

For convenience, you can create a shell alias:

```bash
# Add to your ~/.bashrc or ~/.zshrc
alias builder='docker-compose -f /path/to/tools/docker/docker-compose.yml'

# Then you can use:
builder up -d
builder logs -f
builder down
```

## Troubleshooting

### "Permission denied (publickey)" Error

**Issue**: The container can't authenticate with your git remote.

**Solution**:
```bash
# Add your SSH key to the agent on your local machine
ssh-add ~/.ssh/id_ed25519

# Restart the container
docker-compose -f docker/docker-compose.yml restart
```

### "Build script not found" Error

**Solution**: Ensure you're running the command from the correct directory (where the docker folder is located):

```bash
cd /path/to/tools/repository
docker-compose -f docker/docker-compose.yml up -d
```

### Container Exits Immediately

**Solution**: Check the logs to see what went wrong:

```bash
docker-compose -f docker/docker-compose.yml logs
```

Common causes:
- SSH keys not accessible
- Repository checkout failed
- Build script has errors

## Customization

### Change Build Frequency

Edit `docker/entrypoint.sh` and modify the sleep duration:

```bash
# Change 86400 (24 hours) to desired seconds
sleep 86400
```

Examples:
- Every hour: `sleep 3600`
- Every 6 hours: `sleep 21600`

### Change Git Author

Edit `docker/docker-compose.yml` and modify the environment variables:

```yaml
environment:
  GIT_AUTHOR_NAME: "Your Name Here"
  GIT_AUTHOR_EMAIL: "your-email@example.com"
  GIT_COMMITTER_NAME: "Your Name Here"
  GIT_COMMITTER_EMAIL: "your-email@example.com"
```

### Modify Resource Limits

Edit `docker/docker-compose.yml` under the `deploy` section to adjust CPU and memory limits based on your system.

## File Structure

```
docker/
├── Dockerfile           # Container image definition
├── docker-compose.yml   # Docker Compose configuration
├── entrypoint.sh        # Startup script that runs the build loop
└── README.md           # This file
```

## Notes

- The container mounts your local repository directory, so changes are reflected immediately on your host machine
- SSH keys are mounted as read-only (`ro`) for security
- The container restarts automatically if it stops unexpectedly (`restart: unless-stopped`)
- Each build run includes a timestamp to track when builds were executed
- Failed builds will stop the loop (due to `set -e` in entrypoint.sh) - check logs for details
