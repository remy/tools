#!/bin/bash
set -euo pipefail

# movies
bash movies/build.sh

# emoji-accessibility
bash emoji-accessibility/build.sh