#!/bin/bash

# Setup Git repository
echo "🚀 Setting up Git repository..."

# Initialize git if not exists
if [ ! -d .git ]; then
    git init
    echo "✅ Git initialized"
fi

# Create necessary directories
mkdir -p .github/workflows
mkdir -p .github/ISSUE_TEMPLATE
mkdir -p .github/PULL_REQUEST_TEMPLATE
mkdir -p docs
mkdir -p scripts
mkdir -p .vscode

# Copy template files
# (Add your template copying logic here)

# Set git configurations
git config core.autocrlf input
git config core.fileMode false

# Add files
git add .
git commit -m "chore: initial project setup"

echo "✅ Git repository setup complete!"