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
    # Read existing index.html to get templates
    with open('index.html', 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Extract templates using regex to preserve exact whitespace
    category_match = re.search(r'<template id="category-template">(.*?)</template>', html_content, re.DOTALL)
    project_match = re.search(r'<template id="project-template">(.*?)</template>', html_content, re.DOTALL)

    if not category_match or not project_match:
        print("Error: Could not find templates in index.html")
        return

    # Strip leading/trailing whitespace from templates but keep internal structure
    category_tpl = category_match.group(1).strip()
    project_tpl = project_match.group(1)

    # Group projects by category
    categories = defaultdict(list)
    for path, data in projects.items():
        categories[data.get('category', 'Uncategorized')].append({
            'path': path,
            'title': data.get('title', path),
            'description': data.get('description', '')
        })

    # Generate sections using templates
    sections = []
    for category in sorted(categories.keys()):
        projects_html = ""
        for project in sorted(categories[category], key=lambda x: x['title']):
            project_html = project_tpl
            project_html = project_html.replace('{{path}}', project['path'])
            project_html = project_html.replace('{{title}}', project['title'])
            # Handle optional description - remove line if empty
            if project['description']:
                project_html = project_html.replace('{{description}}', project['description'])
            else:
                # Remove the description div if no description
                project_html = re.sub(r'\s*<div class="project-description">\{\{description\}\}</div>', '', project_html)
            projects_html += project_html

        section_html = category_tpl
        section_html = section_html.replace('{{category}}', category)
        section_html = section_html.replace('{{projects}}', projects_html)
        sections.append(section_html)

    # Join sections with proper indentation
    sections_html = '\n        '.join(sections)

    # Replace content between markers
    pattern = r'(<!-- PROJECTS:START -->).*?(<!-- PROJECTS:END -->)'
    new_content = re.sub(pattern, r'\1\n        ' + sections_html + r'\n        \2', html_content, flags=re.DOTALL)

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_content)

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
