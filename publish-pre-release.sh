#!/usr/bin/env bash

# Configure script behavior (https://stackoverflow.com/a/2871034/6651650).
# -e script exits on error 
# -u errors on undefined variables 
# -o pipefail exits on command pipe failures. 
set -euo pipefail

# # Debugging
# set -x


# Make sure we are on the dev branch.
git checkout dev

# Check that Git repository is clean. ("-n" checks that the string is not empty.)
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: The Git repository is dirty. Please commit or stash any changes."
  exit 1
fi

# Make sure we have installed all of the npm packages
npm install

vsce publish --pre-release