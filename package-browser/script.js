'use strict';

class PackageBrowser {
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
        const childrenElement = this.getDirectChildrenElement(nodeElement);
        if (childrenElement) {
          childrenElement.hidden = true;
        }
      } else {
        this.state.expandedNodes.add(nodeId);
        this.setToggleButtonState(toggleButton, true);
        let childrenElement = this.getDirectChildrenElement(nodeElement);
        if (!childrenElement) {
          const node = this.state.nodeIndex.get(nodeId);
          if (node) {
            const depth = Number(nodeElement.dataset.depth || 0);
            childrenElement = this.renderChildren(node, depth);
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
    this.state.nodeIndex = this.indexNodes(parsed.roots);

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
      return this.parsePnpmLock(content);
    }

    try {
      const json = JSON.parse(content);
      return this.parseJsonInput(json);
    } catch (jsonError) {
      if (content.includes('importers:') && content.includes('packages:')) {
        return this.parsePnpmLock(content);
      }
      throw new Error('Unable to parse input. Expected package-lock.json, pnpm-lock.yaml, or npm ls JSON output.');
    }
  }

  parseJsonInput(json) {
    if (json && typeof json === 'object' && json.packages && typeof json.packages === 'object') {
      return this.parsePackageLockWithPackages(json);
    }

    if (json && typeof json === 'object' && json.dependencies && typeof json.dependencies === 'object') {
      return this.parseNestedDependencies(json);
    }

    throw new Error('Unsupported JSON shape.');
  }

  parsePackageLockWithPackages(lock) {
    const packages = lock.packages || {};
    const rootInfo = packages[''] || {};
    const roots = [];

    let rootDependencies = this.collectRootDependencies(rootInfo);
    if (!rootDependencies.length) {
      rootDependencies = this.inferTopLevelPackageLockDependencies(packages);
    }
    for (const dependency of rootDependencies) {
      roots.push(this.buildPackageLockNode({
        depName: dependency.name,
        requestedRef: dependency.ref,
        parentKey: '',
        rootType: dependency.type,
        packages,
        path: dependency.name,
        ancestry: new Set()
      }));
    }

    if (!roots.length && lock.dependencies && typeof lock.dependencies === 'object') {
      return this.parseNestedDependencies(lock);
    }

    return {
      roots,
      formatLabel: 'package-lock.json'
    };
  }

  collectRootDependencies(rootInfo) {
    const result = [];
    const seen = new Set();

    const addEntries = (entries, type) => {
      if (!entries || typeof entries !== 'object') {
        return;
      }
      for (const [name, ref] of Object.entries(entries)) {
        if (seen.has(name)) {
          continue;
        }
        seen.add(name);
        result.push({ name, ref, type });
      }
    };

    addEntries(rootInfo.dependencies, 'prod');
    addEntries(rootInfo.devDependencies, 'dev');
    addEntries(rootInfo.optionalDependencies, 'optional');

    return result;
  }

  inferTopLevelPackageLockDependencies(packages) {
    const inferred = [];

    for (const [key, entry] of Object.entries(packages)) {
      if (!key.startsWith('node_modules/')) {
        continue;
      }
      if (key.slice('node_modules/'.length).includes('/node_modules/')) {
        continue;
      }

      const name = key.slice('node_modules/'.length);
      if (!name) {
        continue;
      }

      inferred.push({
        name,
        ref: entry?.version || '',
        type: 'prod'
      });
    }

    return inferred;
  }

  buildPackageLockNode({ depName, requestedRef, parentKey, rootType, packages, path, ancestry }) {
    const resolvedKey = this.resolvePackageLockDependency(packages, parentKey, depName);
    const packageEntry = resolvedKey ? packages[resolvedKey] : null;
    const version = this.getPackageLockVersion(packageEntry, requestedRef);
    const nodeToken = resolvedKey || `${depName}@${version}`;

    const node = {
      id: `lock:${path}`,
      name: depName,
      version,
      rootType,
      children: [],
      unresolved: !packageEntry,
      circular: false
    };

    if (ancestry.has(nodeToken)) {
      node.circular = true;
      return node;
    }

    if (!packageEntry) {
      return node;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(nodeToken);

    const childDependencies = this.mergeDependencyMaps(packageEntry, ['dependencies', 'optionalDependencies']);
    for (const [childName, childRef] of Object.entries(childDependencies)) {
      node.children.push(this.buildPackageLockNode({
        depName: childName,
        requestedRef: childRef,
        parentKey: resolvedKey,
        rootType,
        packages,
        path: `${path}>${childName}`,
        ancestry: nextAncestry
      }));
    }

    return node;
  }

  resolvePackageLockDependency(packages, parentKey, depName) {
    let cursor = parentKey || '';

    while (true) {
      const candidate = cursor ? `${cursor}/node_modules/${depName}` : `node_modules/${depName}`;
      if (packages[candidate]) {
        return candidate;
      }

      const nextCursor = this.ascendPackagePath(cursor);
      if (nextCursor === null) {
        break;
      }
      cursor = nextCursor;
    }

    const topLevel = `node_modules/${depName}`;
    return packages[topLevel] ? topLevel : null;
  }

  ascendPackagePath(path) {
    if (!path) {
      return null;
    }

    const marker = '/node_modules/';
    const index = path.lastIndexOf(marker);
    if (index === -1) {
      return '';
    }

    return path.slice(0, index);
  }

  getPackageLockVersion(packageEntry, requestedRef) {
    if (packageEntry && typeof packageEntry.version === 'string') {
      return packageEntry.version;
    }
    if (packageEntry && packageEntry.link) {
      return 'link';
    }
    if (requestedRef) {
      return String(requestedRef);
    }
    return 'unknown';
  }

  parseNestedDependencies(data) {
    const roots = [];
    const dependencies = data.dependencies || {};

    for (const [name, dependency] of Object.entries(dependencies)) {
      const rootType = dependency?.dev ? 'dev' : dependency?.optional ? 'optional' : 'prod';
      roots.push(this.buildNestedNode(name, dependency, rootType, name, new Set()));
    }

    return {
      roots,
      formatLabel: 'npm dependency JSON'
    };
  }

  buildNestedNode(name, dependency, rootType, path, ancestry) {
    const version = String(dependency?.version || dependency?.resolved || 'unknown');
    const token = `${name}@${version}`;

    const node = {
      id: `nested:${path}`,
      name,
      version,
      rootType,
      children: [],
      unresolved: false,
      circular: false
    };

    if (ancestry.has(token)) {
      node.circular = true;
      return node;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(token);

    const childDependencies = dependency?.dependencies || {};
    for (const [childName, childDependency] of Object.entries(childDependencies)) {
      node.children.push(this.buildNestedNode(childName, childDependency, rootType, `${path}>${childName}`, nextAncestry));
    }

    return node;
  }

  parsePnpmLock(yamlText) {
    const parsed = this.parsePnpmYaml(yamlText);
    const importerNames = Object.keys(parsed.importers);
    if (!importerNames.length) {
      throw new Error('No pnpm importers found.');
    }

    const importerNamesWithDependencies = importerNames.filter((name) => this.importerHasDependencies(parsed.importers[name]));
    let selectedImporters = [];
    if (parsed.importers['.'] && this.importerHasDependencies(parsed.importers['.'])) {
      selectedImporters = ['.'];
    } else if (importerNamesWithDependencies.length) {
      selectedImporters = importerNamesWithDependencies;
    } else {
      selectedImporters = [importerNames[0]];
    }

    const indexes = this.buildPnpmIndexes(parsed.packages);
    const roots = [];
    const seen = new Set();

    const addImporterType = (typeKey, typeLabel) => {
      for (const importerName of selectedImporters) {
        const importer = parsed.importers[importerName];
        const entries = importer?.[typeKey];
        if (!entries || typeof entries !== 'object') {
          continue;
        }
        for (const [name, ref] of Object.entries(entries)) {
          if (seen.has(name)) {
            continue;
          }
          seen.add(name);
          roots.push(this.buildPnpmNode({
            depName: name,
            ref,
            rootType: typeLabel,
            packages: parsed.packages,
            indexes,
            path: name,
            ancestry: new Set()
          }));
        }
      }
    };

    addImporterType('dependencies', 'prod');
    addImporterType('devDependencies', 'dev');
    addImporterType('optionalDependencies', 'optional');

    const formatSuffix = selectedImporters.length === 1
      ? selectedImporters[0]
      : `${selectedImporters.length} importers merged`;

    return {
      roots,
      formatLabel: `pnpm-lock.yaml (${formatSuffix})`
    };
  }

  importerHasDependencies(importer) {
    if (!importer || typeof importer !== 'object') {
      return false;
    }

    const dependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies'];
    return dependencyKeys.some((key) => importer[key] && Object.keys(importer[key]).length > 0);
  }

  parsePnpmYaml(yamlText) {
    const lines = yamlText.replace(/\t/g, '  ').split(/\r?\n/);
    const result = {
      importers: {},
      packages: {}
    };

    let section = '';

    let importerName = '';
    let importerDepType = '';
    let importerDepName = '';

    let packageKey = '';
    let packageDepType = '';

    for (const rawLine of lines) {
      if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
        continue;
      }

      const indent = rawLine.length - rawLine.trimStart().length;
      const line = rawLine.trim();

      if (indent === 0 && line.endsWith(':')) {
        section = this.stripQuotes(line.slice(0, -1));
        importerName = '';
        importerDepType = '';
        importerDepName = '';
        packageKey = '';
        packageDepType = '';
        continue;
      }

      if (section === 'importers') {
        if (indent === 2 && line.endsWith(':')) {
          importerName = this.stripQuotes(line.slice(0, -1));
          result.importers[importerName] = {
            dependencies: {},
            devDependencies: {},
            optionalDependencies: {}
          };
          importerDepType = '';
          importerDepName = '';
          continue;
        }

        if (!importerName) {
          continue;
        }

        if (indent === 4 && line.endsWith(':')) {
          const key = this.stripQuotes(line.slice(0, -1));
          importerDepType = ['dependencies', 'devDependencies', 'optionalDependencies'].includes(key) ? key : '';
          importerDepName = '';
          continue;
        }

        if (!importerDepType) {
          continue;
        }

        if (indent === 6) {
          const pair = this.parseYamlPair(line);
          if (!pair) {
            continue;
          }

          if (!pair.value) {
            importerDepName = pair.key;
            result.importers[importerName][importerDepType][importerDepName] = '';
          } else {
            importerDepName = '';
            result.importers[importerName][importerDepType][pair.key] = pair.value;
          }
          continue;
        }

        if (indent === 8 && importerDepName) {
          const pair = this.parseYamlPair(line);
          if (pair && pair.key === 'version') {
            result.importers[importerName][importerDepType][importerDepName] = pair.value;
          }
          continue;
        }

        continue;
      }

      if (section === 'packages') {
        if (indent === 2 && line.endsWith(':')) {
          packageKey = this.stripQuotes(line.slice(0, -1));
          result.packages[packageKey] = {
            dependencies: {},
            optionalDependencies: {}
          };
          packageDepType = '';
          continue;
        }

        if (!packageKey) {
          continue;
        }

        if (indent === 4 && line.endsWith(':')) {
          const key = this.stripQuotes(line.slice(0, -1));
          packageDepType = ['dependencies', 'optionalDependencies'].includes(key) ? key : '';
          continue;
        }

        if (indent === 4 && !line.endsWith(':')) {
          const pair = this.parseYamlPair(line);
          if (pair && pair.key === 'version') {
            result.packages[packageKey].version = pair.value;
          }
          continue;
        }

        if (indent === 6 && packageDepType) {
          const pair = this.parseYamlPair(line);
          if (pair) {
            result.packages[packageKey][packageDepType][pair.key] = pair.value;
          }
          continue;
        }
      }
    }

    return result;
  }

  parseYamlPair(line) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      return null;
    }

    const key = this.stripQuotes(line.slice(0, colon).trim());
    const value = this.stripQuotes(line.slice(colon + 1).trim());

    return { key, value };
  }

  stripQuotes(value) {
    if (!value) {
      return value;
    }

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  buildPnpmIndexes(packages) {
    const specIndex = new Map();
    const nameIndex = new Map();

    for (const key of Object.keys(packages)) {
      const spec = this.stripPnpmPeerSuffix(key).replace(/^\//, '');
      const parsed = this.parsePnpmNameAndVersion(spec);
      if (!parsed) {
        continue;
      }

      if (!specIndex.has(spec)) {
        specIndex.set(spec, []);
      }
      specIndex.get(spec).push(key);

      if (!nameIndex.has(parsed.name)) {
        nameIndex.set(parsed.name, []);
      }
      nameIndex.get(parsed.name).push(key);
    }

    return { specIndex, nameIndex };
  }

  buildPnpmNode({ depName, ref, rootType, packages, indexes, path, ancestry }) {
    const resolution = this.resolvePnpmDependency(depName, ref, packages, indexes);
    const packageEntry = resolution.key ? packages[resolution.key] : null;
    const version = packageEntry?.version || this.getPnpmVersionFromKey(resolution.key) || resolution.version || 'unknown';
    const token = resolution.key || `${depName}@${version}`;

    const node = {
      id: `pnpm:${path}`,
      name: depName,
      version,
      rootType,
      children: [],
      unresolved: !packageEntry && !resolution.special,
      circular: false
    };

    if (ancestry.has(token)) {
      node.circular = true;
      return node;
    }

    if (!packageEntry) {
      return node;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(token);

    const childDependencies = this.mergeDependencyMaps(packageEntry, ['dependencies', 'optionalDependencies']);
    for (const [childName, childRef] of Object.entries(childDependencies)) {
      node.children.push(this.buildPnpmNode({
        depName: childName,
        ref: childRef,
        rootType,
        packages,
        indexes,
        path: `${path}>${childName}`,
        ancestry: nextAncestry
      }));
    }

    return node;
  }

  resolvePnpmDependency(depName, ref, _packages, indexes) {
    const raw = String(ref || '').trim();
    if (!raw) {
      const fallbackKey = this.findPnpmByName(depName, indexes);
      return {
        key: fallbackKey,
        version: this.getPnpmVersionFromKey(fallbackKey) || 'unknown',
        special: false
      };
    }

    if (raw.startsWith('workspace:') || raw.startsWith('link:') || raw.startsWith('file:')) {
      return {
        key: null,
        version: raw,
        special: true
      };
    }

    let normalized = raw;
    if (normalized.startsWith('npm:')) {
      normalized = normalized.slice(4);
    }
    if (normalized.startsWith('/')) {
      normalized = normalized.slice(1);
    }
    normalized = this.stripPnpmPeerSuffix(normalized);

    const candidateSpecs = [];
    if (this.looksLikePnpmSpec(normalized)) {
      candidateSpecs.push(normalized);
    } else if (normalized) {
      candidateSpecs.push(`${depName}@${normalized}`);
    }

    for (const spec of candidateSpecs) {
      const candidates = indexes.specIndex.get(spec) || [];
      if (!candidates.length) {
        continue;
      }

      const exactName = candidates.find((candidate) => {
        const parsed = this.parsePnpmNameAndVersion(this.stripPnpmPeerSuffix(candidate).replace(/^\//, ''));
        return parsed && parsed.name === depName;
      });

      const key = exactName || candidates[0];
      return {
        key,
        version: this.getPnpmVersionFromKey(key) || this.getVersionFromSpec(spec),
        special: false
      };
    }

    const fallbackKey = this.findPnpmByName(depName, indexes);
    return {
      key: fallbackKey,
      version: this.getPnpmVersionFromKey(fallbackKey) || this.getVersionFromSpec(candidateSpecs[0]) || normalized || raw,
      special: false
    };
  }

  findPnpmByName(depName, indexes) {
    const candidates = indexes.nameIndex.get(depName) || [];
    return candidates[0] || null;
  }

  looksLikePnpmSpec(value) {
    if (!value) {
      return false;
    }

    const at = value.lastIndexOf('@');
    return at > 0 || value.includes('/');
  }

  parsePnpmNameAndVersion(spec) {
    const at = spec.lastIndexOf('@');
    if (at > 0) {
      const name = spec.slice(0, at);
      const version = spec.slice(at + 1);
      if (name && version) {
        return { name, version };
      }
    }

    const slash = spec.lastIndexOf('/');
    if (slash > 0) {
      const name = spec.slice(0, slash);
      const version = spec.slice(slash + 1);
      if (name && version) {
        return { name, version };
      }
    }

    return null;
  }

  getVersionFromSpec(spec) {
    if (!spec) {
      return '';
    }

    const parsed = this.parsePnpmNameAndVersion(spec);
    return parsed?.version || '';
  }

  getPnpmVersionFromKey(key) {
    if (!key) {
      return '';
    }

    const normalized = this.stripPnpmPeerSuffix(String(key).replace(/^\//, ''));
    const parsed = this.parsePnpmNameAndVersion(normalized);
    return parsed?.version || '';
  }

  stripPnpmPeerSuffix(value) {
    if (!value) {
      return value;
    }

    const parenIndex = value.indexOf('(');
    if (parenIndex !== -1) {
      return value.slice(0, parenIndex);
    }

    return value;
  }

  mergeDependencyMaps(entry, keys) {
    const merged = {};
    if (!entry || typeof entry !== 'object') {
      return merged;
    }

    for (const key of keys) {
      if (!entry[key] || typeof entry[key] !== 'object') {
        continue;
      }
      Object.assign(merged, entry[key]);
    }

    return merged;
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
    const total = this.countNodes(this.state.roots);
    const visible = this.countVisibleNodes(this.getVisibleRoots());

    this.elements.directCount.textContent = `${direct} direct`;
    this.elements.totalCount.textContent = `${total} total`;
    this.elements.visibleCount.textContent = `${visible} visible`;
  }

  countNodes(nodes) {
    let count = 0;
    const stack = [...nodes];

    while (stack.length) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      count += 1;
      for (const child of current.children) {
        stack.push(child);
      }
    }

    return count;
  }

  countVisibleNodes(nodes) {
    let count = 0;
    const stack = [...nodes];

    while (stack.length) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      count += 1;
      for (const child of current.children) {
        if (this.matchesSearch(child)) {
          stack.push(child);
        }
      }
    }

    return count;
  }

  getVisibleRoots() {
    return this.state.roots.filter((root) => this.matchesFilter(root) && this.matchesSearch(root));
  }

  matchesFilter(node) {
    if (this.state.activeFilter === 'all') {
      return true;
    }
    return node.rootType === this.state.activeFilter;
  }

  matchesSearch(node) {
    const term = this.state.searchTerm;
    if (!term) {
      return true;
    }

    if (node.name.toLowerCase().includes(term) || node.version.toLowerCase().includes(term)) {
      return true;
    }

    return node.children.some((child) => this.matchesSearch(child));
  }

  renderTree() {
    const roots = this.getVisibleRoots();
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
      fragment.append(this.renderNode(node, 0));
    }

    this.elements.treeContainer.append(fragment);
  }

  renderNode(node, depth) {
    const wrapper = document.createElement('div');
    wrapper.className = 'node';
    wrapper.dataset.nodeId = node.id;
    wrapper.dataset.depth = String(depth);
    wrapper.style.setProperty('--depth', String(depth));

    const row = document.createElement('div');
    row.className = 'node-row';

    const hasVisibleChildren = node.children.some((child) => this.matchesSearch(child));
    const isExpanded = this.state.searchTerm ? true : this.state.expandedNodes.has(node.id);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `toggle-btn${hasVisibleChildren ? '' : ' is-leaf'}`;
    toggle.dataset.nodeId = node.id;
    toggle.textContent = hasVisibleChildren ? (isExpanded ? '−' : '+') : '·';
    toggle.setAttribute('aria-expanded', String(hasVisibleChildren && isExpanded));
    row.append(toggle);

    const name = document.createElement('span');
    name.className = 'pkg-name';
    name.textContent = node.name;
    row.append(name);

    const version = document.createElement('span');
    version.className = 'pkg-version';
    version.textContent = `v${node.version}`;
    row.append(version);

    if (depth === 0) {
      const badge = document.createElement('span');
      badge.className = `badge ${node.rootType}`;
      badge.textContent = node.rootType === 'prod'
        ? 'production'
        : node.rootType === 'dev'
          ? 'development'
          : 'optional';
      row.append(badge);
    }

    if (node.unresolved || node.circular) {
      const warn = document.createElement('span');
      warn.className = 'badge warn';
      warn.textContent = node.circular ? 'circular' : 'unresolved';
      row.append(warn);
    }

    wrapper.append(row);

    if (hasVisibleChildren && isExpanded) {
      const children = this.renderChildren(node, depth);
      if (children) {
        wrapper.append(children);
      }
    }

    return wrapper;
  }

  renderChildren(node, depth) {
    const children = document.createElement('div');
    children.className = 'children';
    children.dataset.ownerId = node.id;

    let hasRenderedChild = false;
    for (const child of node.children) {
      if (!this.matchesSearch(child)) {
        continue;
      }
      children.append(this.renderNode(child, depth + 1));
      hasRenderedChild = true;
    }

    return hasRenderedChild ? children : null;
  }

  getDirectChildrenElement(nodeElement) {
    const childElement = Array.from(nodeElement.children).find((element) => element.classList.contains('children'));
    return childElement || null;
  }

  setToggleButtonState(toggleButton, isExpanded) {
    toggleButton.textContent = isExpanded ? '−' : '+';
    toggleButton.setAttribute('aria-expanded', String(isExpanded));
  }

  indexNodes(roots) {
    const index = new Map();
    const stack = [...roots];

    while (stack.length) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      index.set(node.id, node);
      for (const child of node.children) {
        stack.push(child);
      }
    }

    return index;
  }
}

new PackageBrowser();
