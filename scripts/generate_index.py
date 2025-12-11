import os
import json
import argparse
import re
from bs4 import BeautifulSoup
from collections import defaultdict

PROJECTS_FILE = 'projects.json'

def load_projects():
    if os.path.exists(PROJECTS_FILE):
        with open(PROJECTS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_projects(projects):
    with open(PROJECTS_FILE, 'w') as f:
        json.dump(projects, f, indent=2, sort_keys=True)

def find_projects(root_dir):
    project_paths = []
    for root, dirs, files in os.walk(root_dir):
        if 'index.html' in files:
            if os.path.abspath(root) == os.path.abspath(root_dir):
                continue

            # Skip hidden directories and the .github folder
            rel_path = os.path.relpath(root, root_dir)
            if any(part.startswith('.') for part in rel_path.split(os.sep)):
                continue

            project_paths.append(rel_path)
    return project_paths

def get_title(index_path):
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')
            if soup.title:
                return soup.title.string.strip()
    except Exception as e:
        print(f"Error reading {index_path}: {e}")
    return os.path.dirname(index_path)

def get_category_from_meta(index_path):
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')
            meta_tag = soup.find('meta', attrs={'name': 'category'})
            if meta_tag and meta_tag.get('content'):
                return meta_tag['content'].strip()
    except Exception:
        pass
    return None

def extract_category_from_commit(commit_msg):
    if not commit_msg:
        return None
    # Look for patterns like [CategoryName] or Category: Name
    match = re.search(r'\[(.*?)\]', commit_msg)
    if match:
        return match.group(1).strip()

    match = re.search(r'Category:\s*(.*)', commit_msg, re.IGNORECASE)
    if match:
        return match.group(1).strip()

    return None

def generate_index_html(projects):
    # Group projects by category
    categories = defaultdict(list)
    for path, data in projects.items():
        categories[data.get('category', 'Uncategorized')].append({
            'path': path,
            'title': data.get('title', path)
        })

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Index</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h2 { margin-top: 30px; color: #555; font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        ul { list-style-type: none; padding: 0; }
        li { margin-bottom: 12px; }
        a { text-decoration: none; color: #0366d6; font-weight: 600; font-size: 1.1em; }
        a:hover { text-decoration: underline; }
        .project-path { font-size: 0.85em; color: #666; margin-left: 10px; font-weight: normal; }
    </style>
</head>
<body>
    <h1>Project Index</h1>
"""

    for category in sorted(categories.keys()):
        html += f"    <h2>{category}</h2>\n    <ul>\n"
        for project in sorted(categories[category], key=lambda x: x['title']):
            html += f"        <li><a href=\"{project['path']}/index.html\">{project['title']}</a> <span class=\"project-path\">({project['path']})</span></li>\n"
        html += "    </ul>\n"

    html += "</body>\n</html>"

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit-msg', help='Commit message to extract category from')
    args = parser.parse_args()

    commit_msg = args.commit_msg or os.environ.get('COMMIT_MSG')

    existing_projects = load_projects()
    found_paths = find_projects('.')

    # Identify active projects and update metadata
    new_projects_data = {}

    for path in found_paths:
        index_path = os.path.join(path, 'index.html')
        title = get_title(index_path)

        category = "Uncategorized"

        # 1. Check if it exists in JSON
        if path in existing_projects:
             category = existing_projects[path].get('category', 'Uncategorized')
             # Update title just in case it changed
             existing_projects[path]['title'] = title
             new_projects_data[path] = existing_projects[path]
        else:
            # New project
            # 2. Check meta tag
            meta_cat = get_category_from_meta(index_path)
            if meta_cat:
                category = meta_cat
            # 3. Check commit message (only if strictly new)
            elif commit_msg:
                commit_cat = extract_category_from_commit(commit_msg)
                if commit_cat:
                    category = commit_cat

            new_projects_data[path] = {
                'title': title,
                'category': category
            }

    # Save updated projects JSON
    save_projects(new_projects_data)

    # Generate HTML
    generate_index_html(new_projects_data)

if __name__ == "__main__":
    main()
