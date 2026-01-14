# HA Intent Parser Visualizer

A visual debugger for Home Assistant Assist intent recognition templates.
This tool runs entirely in the browser.

## Features

- Parse and visualize Home Assistant sentence templates
- Debug matching against example sentences
- **Common Rules Support**: Includes standard Home Assistant expansion rules (e.g., `<name>`, `<area>`, `<on_off_states>`) imported from `_common.yaml`.

## Usage

1. Open `index.html` in your browser.
2. Enter a sentence (e.g., "turn on the kitchen light").
3. Add a template (e.g., "turn on [the] {area} <name>").
4. See the trace and match results.

## Updating Common Rules

The project includes a copy of the Home Assistant common rules in `common-rules.js`.
To update these rules from the official repository:

1. Download the latest `_common.yaml`:
   ```bash
   curl -o _common.yaml https://raw.githubusercontent.com/OHF-Voice/intents/main/sentences/en/_common.yaml
   ```

2. Convert it to JavaScript:
   ```bash
   # Requires Python 3 and PyYAML
   python3 convert_yaml.py
   ```

   (You may need to install PyYAML: `pip install pyyaml`)

This will update `common-rules.js` which is used by the application.
