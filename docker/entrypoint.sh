#!/bin/bash
set -e

# Configure git
git config --global user.name "Docker Builder"
git config --global user.email "docker-builder@local"

# Configure SSH for git operations
mkdir -p ~/.ssh
chmod 700 ~/.ssh

echo "Starting daily build scheduler..."
echo "Build will run daily at the scheduled time"

while true; do
  echo ""
  echo "========================================"
  echo "Running build at $(date)"
  echo "========================================"

  # Pull latest changes
  echo "Pulling latest code from main..."
  git fetch origin main
  git reset --hard origin/main

  # Run build script
  echo "Running build script..."
  bash build.sh

  # Commit and push changes if any
  echo "Checking for changes..."
  if [ -n "$(git status --porcelain)" ]; then
    echo "Changes detected, committing and pushing..."
    git add -A
    git commit -m "Automated build on $(date '+%Y-%m-%d %H:%M:%S')"
    git push origin main
    echo "Successfully pushed changes"
  else
    echo "No changes to commit"
  fi

  echo "========================================"
  echo "Build completed at $(date)"
  echo "Sleeping for 24 hours..."
  echo "========================================"

  # Sleep for 24 hours (86400 seconds)
  sleep 86400
done
