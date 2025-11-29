#!/usr/bin/env bash

# Configure script behavior (https://stackoverflow.com/a/2871034/6651650).
# -e script exits on error 
# -u errors on undefined variables 
# -x prints commands before execution 
# -o pipefail exits on command pipe failures. 
set -euxo pipefail


# Make sure we are on the dev branch.
git checkout dev

# Make sure we have installed all of the npm packages
npm install

vsce publish --pre-release