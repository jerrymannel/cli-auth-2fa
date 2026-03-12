#!/bin/bash

# Exit on error
set -e

echo "Starting build process..."

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Building version $VERSION..."

# Create necessary directories
mkdir -p dist
mkdir -p builds

# Clear existing builds
echo "Clearing builds folder..."
rm -rf builds/*

# Step 1: Bundle the app using esbuild
# We bundle into a single CommonJS file because pkg works best with CJS and bundled deps.
echo "Step 1: Bundling with esbuild..."
npx esbuild app.js \
    --bundle \
    --platform=node \
    --format=cjs \
    --outfile=dist/bundle.cjs

# Step 2: Package with pkg
echo "Step 2: Packaging with pkg..."
# Targets for Mac, Linux, and Windows
# Note: node18 is used as a stable target
npx pkg dist/bundle.cjs \
    --output "builds/cli-auth-2fa-$VERSION" \
    --targets node18-macos-x64,node18-linux-x64,node18-win-x64

echo "Build complete! Executables are in the 'builds' folder:"
ls -lh builds/
