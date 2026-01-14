import yaml
import json

with open('_common.yaml', 'r') as f:
    data = yaml.safe_load(f)

# Extract expansion rules and lists
expansion_rules = data.get('expansion_rules', {})
lists = data.get('lists', {})

# Create a JS file content
js_content = f"""
export const COMMON_EXPANSION_RULES = {json.dumps(expansion_rules, indent=2)};

export const COMMON_LISTS = {json.dumps(lists, indent=2)};
"""

with open('common-rules.js', 'w') as f:
    f.write(js_content)
