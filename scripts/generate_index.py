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

def get_description_from_meta(index_path):
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f, 'html.parser')
            meta_tag = soup.find('meta', attrs={'name': 'description'})
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
            'title': data.get('title', path),
            'description': data.get('description', '')
        })

    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Index</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="filter-container" id="filterContainer">
        <input type="text" class="filter-input" id="filterInput" placeholder="Type to filter projects...">
        <div class="filter-hint">Enter to open • Tab to select • Esc to close</div>
    </div>
    <div class="container">
        <header>
            <h1>Project Index</h1>
            <p class="subtitle">A collection of tools and utilities</p>
        </header>
"""

    for category in sorted(categories.keys()):
        html += f"        <section class=\"category-section\">\n"
        html += f"            <h2>{category}</h2>\n"
        html += f"            <ul class=\"projects-list\">\n"
        for project in sorted(categories[category], key=lambda x: x['title']):
            html += f"                <li class=\"project-item\">\n"
            html += f"                    <a href=\"{project['path']}/index.html\">\n"
            html += f"                        <div class=\"project-info\">\n"
            html += f"                            <div class=\"project-title\">{project['title']}</div>\n"
            if project['description']:
                html += f"                            <div class=\"project-description\">{project['description']}</div>\n"
            html += f"                        </div>\n"
            html += f"                        <span class=\"project-path\">{project['path']}</span>\n"
            html += f"                    </a>\n"
            html += f"                </li>\n"
        html += "            </ul>\n"
        html += "        </section>\n"

    html += "    </div>\n"
    html += "    <footer>\n"
    html += "        <p>Responsible disclosure: All these demos and tools have been coded with AI.</p>\n"
    html += "    </footer>\n"
    html += "    <script src=\"script.js\"></script>\n</body>\n</html>"

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
        description = get_description_from_meta(index_path)

        # Always check meta tag first for category
        meta_cat = get_category_from_meta(index_path)
        category = meta_cat if meta_cat else "Uncategorized"

        # If project exists in JSON and has no meta tag, use existing category
        if path in existing_projects and not meta_cat:
            category = existing_projects[path].get('category', 'Uncategorized')

        # For new projects without meta tag, check commit message
        if path not in existing_projects and not meta_cat and commit_msg:
            commit_cat = extract_category_from_commit(commit_msg)
            if commit_cat:
                category = commit_cat

        # Build project data
        project_data = {
            'title': title,
            'category': category
        }
        if description:
            project_data['description'] = description

        new_projects_data[path] = project_data

    # Save updated projects JSON
    save_projects(new_projects_data)

    # Generate HTML
    generate_index_html(new_projects_data)

if __name__ == "__main__":
    main()
