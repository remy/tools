'use strict';

import { parsePackageLockWithPackages, parseNestedDependencies } from './parse-package-lock.js';
import { parsePnpmLock } from './parse-pnpm.js';
import {
  indexNodes,
  countNodes,
  countVisibleNodes,
  getVisibleRoots,
  getDirectChildrenElement,
  matchesSearch,
  renderNode,
  renderChildren
} from './render.js';

export class PackageBrowser {
  constructor() {
    this.elements = {
      fileInput: document.getElementById('fileInput'),
      urlInput: document.getElementById('urlInput'),
      loadUrlBtn: document.getElementById('loadUrlBtn'),
      searchInput: document.getElementById('searchInput'),
      treeContainer: document.getElementById('treeContainer'),
      status: document.getElementById('status'),
      sourceInfo: document.getElementById('sourceInfo'),
      directCount: document.getElementById('directCount'),
      totalCount: document.getElementById('totalCount'),
      visibleCount: document.getElementById('visibleCount'),
      filterChips: Array.from(document.querySelectorAll('.filter-chip'))
    };

    this.state = {
      roots: [],
      searchTerm: '',
      activeFilter: 'all',
      expandedNodes: new Set(),
      nodeIndex: new Map(),
      sourceLabel: 'No lockfile loaded.',
      formatLabel: ''
    };

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    this.elements.fileInput.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      try {
        this.setStatus(`Reading ${file.name}...`);
        const text = await file.text();
        this.loadFromText(text, file.name, file.name);
      } catch (error) {
        this.setStatus(error.message || 'Failed to read file.', 'error');
      } finally {
        this.elements.fileInput.value = '';
      }
    });

    this.elements.loadUrlBtn.addEventListener('click', async () => {
      const input = this.elements.urlInput.value.trim();
      if (!input) {
        this.setStatus('Enter a URL first.', 'error');
        return;
      }

      try {
        const normalizedUrl = this.normalizeGithubUrl(input);
        this.setStatus(`Fetching ${normalizedUrl}...`);
        const response = await fetch(normalizedUrl);
        if (!response.ok) {
          throw new Error(`Request failed (${response.status}).`);
        }

        const text = await response.text();
        const fileName = this.getFileNameFromUrl(normalizedUrl);
        this.loadFromText(text, fileName, normalizedUrl);
      } catch (error) {
        this.setStatus(error.message || 'Failed to fetch URL.', 'error');
      }
    });

    this.elements.searchInput.addEventListener('input', (event) => {
      this.state.searchTerm = event.target.value.trim().toLowerCase();
      this.render();
    });

    this.elements.filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        this.state.activeFilter = chip.dataset.filter || 'all';
        this.elements.filterChips.forEach((item) => item.classList.toggle('active', item === chip));
        this.render();
      });
    });

    this.elements.treeContainer.addEventListener('click', (event) => {
      const toggleButton = event.target.closest('button[data-node-id]');
      if (!toggleButton || toggleButton.classList.contains('is-leaf') || this.state.searchTerm) {
        return;
      }

      const nodeId = toggleButton.dataset.nodeId;
      const nodeElement = toggleButton.closest('.node');
      if (!nodeElement) {
        return;
      }

      if (this.state.expandedNodes.has(nodeId)) {
        this.state.expandedNodes.delete(nodeId);
        this.setToggleButtonState(toggleButton, false);
        const childrenElement = getDirectChildrenElement(nodeElement);
        if (childrenElement) {
          childrenElement.hidden = true;
        }
      } else {
        this.state.expandedNodes.add(nodeId);
        this.setToggleButtonState(toggleButton, true);
        let childrenElement = getDirectChildrenElement(nodeElement);
        if (!childrenElement) {
          const node = this.state.nodeIndex.get(nodeId);
          if (node) {
            const depth = Number(nodeElement.dataset.depth || 0);
            childrenElement = renderChildren(node, depth, this.state);
            if (childrenElement) {
              nodeElement.append(childrenElement);
            }
          }
        } else {
          childrenElement.hidden = false;
        }
      }
    });

    document.addEventListener('paste', (event) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      const text = event.clipboardData?.getData('text')?.trim();
      if (!text) {
        return;
      }

      try {
        this.loadFromText(text, 'pasted-content', 'pasted content');
      } catch (_error) {
        // Ignore non-lockfile content.
      }
    });
  }

  loadFromText(text, sourceName, sourceLabel) {
    const parsed = this.parseInput(text, sourceName);
    this.state.roots = parsed.roots;
    this.state.formatLabel = parsed.formatLabel;
    this.state.sourceLabel = sourceLabel;
    this.state.expandedNodes = new Set(parsed.roots.map((node) => node.id));
    this.state.nodeIndex = indexNodes(parsed.roots);

    const plural = parsed.roots.length === 1 ? '' : 's';
    this.setStatus(`Loaded ${parsed.roots.length} root package${plural} from ${sourceName}.`, 'success');
    this.render();
  }

  parseInput(text, sourceName = '') {
    const content = String(text || '').trim();
    if (!content) {
      throw new Error('The input was empty.');
    }

    const nameHint = sourceName.toLowerCase();
    const isYamlHint = nameHint.endsWith('.yaml') || nameHint.endsWith('.yml') || nameHint.includes('pnpm-lock');

    if (isYamlHint) {
      return parsePnpmLock(content);
    }

    try {
      const json = JSON.parse(content);
      return this.parseJsonInput(json);
    } catch (jsonError) {
      if (content.includes('importers:') && content.includes('packages:')) {
        return parsePnpmLock(content);
      }
      throw new Error('Unable to parse input. Expected package-lock.json, pnpm-lock.yaml, or npm ls JSON output.');
    }
  }

  parseJsonInput(json) {
    if (json && typeof json === 'object' && json.packages && typeof json.packages === 'object') {
      return parsePackageLockWithPackages(json);
    }

    if (json && typeof json === 'object' && json.dependencies && typeof json.dependencies === 'object') {
      return parseNestedDependencies(json);
    }

    throw new Error('Unsupported JSON shape.');
  }

  normalizeGithubUrl(inputUrl) {
    const url = new URL(inputUrl);

    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        const [owner, repo, _kind, branch, ...pathParts] = parts;
        if (!pathParts.length) {
          throw new Error('GitHub URL must point to a file.');
        }
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join('/')}`;
      }
    }

    return url.toString();
  }

  getFileNameFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      return segments[segments.length - 1] || 'remote-lockfile';
    } catch (_error) {
      return 'remote-lockfile';
    }
  }

  setStatus(message, type = '') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status${type ? ` ${type}` : ''}`;
  }

  setToggleButtonState(toggleButton, isExpanded) {
    toggleButton.textContent = isExpanded ? '−' : '+';
    toggleButton.setAttribute('aria-expanded', String(isExpanded));
  }

  render() {
    this.renderStats();
    this.renderSourceInfo();
    this.renderTree();
  }

  renderSourceInfo() {
    if (!this.state.roots.length) {
      this.elements.sourceInfo.textContent = 'No lockfile loaded.';
      return;
    }

    this.elements.sourceInfo.textContent = `${this.state.formatLabel} from ${this.state.sourceLabel}`;
  }

  renderStats() {
    const direct = this.state.roots.length;
    const total = countNodes(this.state.roots);
    const visible = countVisibleNodes(getVisibleRoots(this.state.roots, this.state), this.state);

    this.elements.directCount.textContent = `${direct} direct`;
    this.elements.totalCount.textContent = `${total} total`;
    this.elements.visibleCount.textContent = `${visible} visible`;
  }

  renderTree() {
    const roots = getVisibleRoots(this.state.roots, this.state);
    this.elements.treeContainer.innerHTML = '';

    if (!roots.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = this.state.roots.length
        ? '<h3>No matches</h3><p>Try another search term or filter.</p>'
        : '<h3>No dependency tree yet</h3><p>Upload a lockfile or load one from a URL.</p>';
      this.elements.treeContainer.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const node of roots) {
      fragment.append(renderNode(node, 0, this.state));
    }

    this.elements.treeContainer.append(fragment);
  }
}
