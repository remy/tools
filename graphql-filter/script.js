'use strict';

const THEME_KEY = 'graphql-filter-theme';
const BUILTIN_SCALARS = new Set(['Int', 'Float', 'String', 'Boolean', 'ID']);
const OP_ORDER = ['query', 'mutation', 'subscription'];
const OP_LABEL = { query: 'Query', mutation: 'Mutation', subscription: 'Subscription' };

// ── GRAPHQL LIB (lazy ESM) ────────────────────────────────
let gqlPromise = null;
const loadGraphql = () =>
  (gqlPromise ??= import('./vendor/graphql.browser.mjs'));
let gql = null;

// ── STATE ─────────────────────────────────────────────────
const state = {
  schema: null,
  ast: null,                 // DocumentNode
  inputKind: 'sdl',          // 'sdl' | 'introspection'
  originalText: '',
  registry: new Map(),       // typeName -> { kind, fields:Map, interfaces:[], referencedTypes:Set }
  rootFields: [],            // { id, op, name, returnTypeName, returnLabel, args, description }
  rootTypeNames: {},         // { query, mutation, subscription }
  selectedRoots: new Set(),  // root field ids `${op}.${name}`
  prunedFields: new Map(),   // typeName -> Set<fieldName> (explicitly deselected)
  searchTerm: '',
  groupByOp: true,
  collapsedGroups: new Set(),
};

// ── ELEMENTS ──────────────────────────────────────────────
const el = {
  themeBtn: document.getElementById('theme-btn'),
  iconSun: document.getElementById('icon-sun'),
  iconMoon: document.getElementById('icon-moon'),
  inputPanel: document.getElementById('input-panel'),
  inputSummaryLabel: document.getElementById('input-summary-label'),
  inputMeta: document.getElementById('input-meta'),
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  schemaInput: document.getElementById('schema-input'),
  parseStatus: document.getElementById('parse-status'),
  loadSampleBtn: document.getElementById('load-sample-btn'),
  clearBtn: document.getElementById('clear-btn'),
  fieldsPanel: document.getElementById('fields-panel'),
  fieldsList: document.getElementById('fields-list'),
  selectionMeta: document.getElementById('selection-meta'),
  searchInput: document.getElementById('search-input'),
  selectAllBtn: document.getElementById('select-all-btn'),
  selectNoneBtn: document.getElementById('select-none-btn'),
  groupByOp: document.getElementById('group-by-op'),
  outputPanel: document.getElementById('output-panel'),
  outputMeta: document.getElementById('output-meta'),
  outputPreview: document.getElementById('output-preview'),
  outputDocs: document.getElementById('output-docs'),
  tabDocs: document.getElementById('tab-docs'),
  tabSdl: document.getElementById('tab-sdl'),
  tabJson: document.getElementById('tab-json'),
  copyBtn: document.getElementById('copy-btn'),
  downloadBtn: document.getElementById('download-btn'),
};

let activeTab = 'docs';

// ── THEME ─────────────────────────────────────────────────
function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
  const isDark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
  el.iconSun.hidden = isDark;
  el.iconMoon.hidden = !isDark;
}

function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const next = !current
    ? (systemDark ? 'light' : 'dark')
    : (current === 'dark' ? 'light' : 'dark');
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

applyTheme(localStorage.getItem(THEME_KEY));
el.themeBtn.addEventListener('click', cycleTheme);

// ── UTIL ──────────────────────────────────────────────────
function setStatus(message, kind) {
  el.parseStatus.textContent = message;
  el.parseStatus.classList.toggle('is-error', kind === 'error');
  el.parseStatus.classList.toggle('is-success', kind === 'success');
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isPruned(typeName, fieldName) {
  return state.prunedFields.get(typeName)?.has(fieldName) === true;
}

function setPruned(typeName, fieldName, pruned) {
  let set = state.prunedFields.get(typeName);
  if (pruned) {
    if (!set) state.prunedFields.set(typeName, (set = new Set()));
    set.add(fieldName);
  } else if (set) {
    set.delete(fieldName);
    if (set.size === 0) state.prunedFields.delete(typeName);
  }
}

// ── PARSING ───────────────────────────────────────────────
async function parseSchema(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    reset();
    setStatus('Waiting for input.');
    return;
  }

  if (!gql) {
    setStatus('Loading GraphQL parser…');
    try {
      gql = await loadGraphql();
    } catch (err) {
      setStatus(`Failed to load GraphQL parser: ${err.message}`, 'error');
      return;
    }
  }

  // Detect introspection JSON vs SDL.
  let introspectionData = null;
  try {
    const json = JSON.parse(trimmed);
    if (json && typeof json === 'object') {
      if (json.__schema) introspectionData = json;
      else if (json.data && json.data.__schema) introspectionData = json.data;
      else if (json.data === undefined && json.errors) {
        hidePanels();
        setStatus('Introspection result contains errors and no schema.', 'error');
        return;
      }
    }
  } catch {
    /* not JSON → treat as SDL */
  }

  let schema, ast, inputKind;
  try {
    if (introspectionData) {
      schema = gql.buildClientSchema(introspectionData);
      ast = gql.parse(gql.printSchema(schema));
      inputKind = 'introspection';
    } else {
      ast = gql.parse(trimmed);
      schema = gql.buildASTSchema(ast);
      inputKind = 'sdl';
    }
  } catch (err) {
    hidePanels();
    setStatus(`Could not parse schema: ${err.message}`, 'error');
    return;
  }

  state.schema = schema;
  state.ast = ast;
  state.inputKind = inputKind;
  state.originalText = trimmed;
  buildRegistry(schema);
  extractRootFields(schema);

  // Preserve still-valid selections.
  const validRoots = new Set(state.rootFields.map(f => f.id));
  state.selectedRoots = new Set([...state.selectedRoots].filter(id => validRoots.has(id)));
  for (const typeName of [...state.prunedFields.keys()]) {
    if (!state.registry.has(typeName)) state.prunedFields.delete(typeName);
  }

  const qName = state.rootTypeNames.query || '—';
  el.inputMeta.textContent =
    `${inputKind === 'introspection' ? 'Introspection' : 'SDL'} · ${state.rootFields.length} root fields · ${state.registry.size} types`;
  el.inputMeta.hidden = false;
  el.inputMeta.classList.add('is-success');
  el.clearBtn.hidden = false;
  setStatus(`Loaded ${state.rootFields.length} root fields (root query: ${qName}).`, 'success');

  el.inputPanel.open = false;
  el.fieldsPanel.hidden = false;
  renderList();
  updateOutput();
}

function buildRegistry(schema) {
  const reg = new Map();
  const typeMap = schema.getTypeMap();
  for (const [name, type] of Object.entries(typeMap)) {
    if (name.startsWith('__')) continue;
    if (gql.isScalarType(type) && BUILTIN_SCALARS.has(name)) continue;

    const entry = { kind: 'scalar', fields: new Map(), interfaces: [], referencedTypes: new Set() };

    if (gql.isObjectType(type) || gql.isInterfaceType(type)) {
      entry.kind = gql.isInterfaceType(type) ? 'interface' : 'object';
      const fields = type.getFields();
      for (const fname of Object.keys(fields)) {
        const field = fields[fname];
        const rt = gql.getNamedType(field.type);
        const args = field.args.map(a => {
          const at = gql.getNamedType(a.type);
          return {
            name: a.name,
            typeName: at.name,
            typeLabel: String(a.type),
            required: String(a.type).endsWith('!'),
            description: a.description || '',
            defaultValue: a.defaultValue,
          };
        });
        entry.fields.set(fname, {
          returnTypeName: rt.name,
          returnLabel: String(field.type),
          args,
          description: field.description || '',
        });
        entry.referencedTypes.add(rt.name);
        args.forEach(a => entry.referencedTypes.add(a.typeName));
      }
      if (typeof type.getInterfaces === 'function') {
        entry.interfaces = type.getInterfaces().map(i => i.name);
        entry.interfaces.forEach(n => entry.referencedTypes.add(n));
      }
    } else if (gql.isUnionType(type)) {
      entry.kind = 'union';
      type.getTypes().forEach(t => entry.referencedTypes.add(t.name));
    } else if (gql.isInputObjectType(type)) {
      entry.kind = 'input';
      const fields = type.getFields();
      for (const fname of Object.keys(fields)) {
        const field = fields[fname];
        const rt = gql.getNamedType(field.type);
        entry.fields.set(fname, {
          returnTypeName: rt.name,
          returnLabel: String(field.type),
          args: [],
          description: field.description || '',
        });
        entry.referencedTypes.add(rt.name);
      }
    } else if (gql.isEnumType(type)) {
      entry.kind = 'enum';
    } else if (gql.isScalarType(type)) {
      entry.kind = 'scalar';
    }
    reg.set(name, entry);
  }
  state.registry = reg;
}

function extractRootFields(schema) {
  const rootFields = [];
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  const subscriptionType = schema.getSubscriptionType();
  state.rootTypeNames = {
    query: queryType?.name,
    mutation: mutationType?.name,
    subscription: subscriptionType?.name,
  };
  const ops = [['query', queryType], ['mutation', mutationType], ['subscription', subscriptionType]];
  for (const [op, type] of ops) {
    if (!type) continue;
    const fields = type.getFields();
    for (const fname of Object.keys(fields)) {
      const field = fields[fname];
      const rt = gql.getNamedType(field.type);
      rootFields.push({
        id: `${op}.${fname}`,
        op,
        name: fname,
        ownerType: type.name,
        returnTypeName: rt.name,
        returnLabel: String(field.type),
        args: field.args.map(a => ({
          name: a.name,
          typeName: gql.getNamedType(a.type).name,
          typeLabel: String(a.type),
          required: String(a.type).endsWith('!'),
          description: a.description || '',
          defaultValue: a.defaultValue,
        })),
        description: field.description || '',
      });
    }
  }
  state.rootFields = rootFields;
}

// ── CLOSURE ───────────────────────────────────────────────
function rootFieldById(id) {
  return state.rootFields.find(f => f.id === id);
}

// BFS over the type graph from selected root fields.
// honorPruning=true → skip the return/arg types of pruned fields.
function computeClosure(honorPruning, extraSeeds) {
  const visited = new Set();
  const pending = [];
  const enqueue = (name) => {
    if (!name || BUILTIN_SCALARS.has(name) || name.startsWith('__')) return;
    if (!visited.has(name)) pending.push(name);
  };

  for (const id of state.selectedRoots) {
    const rf = rootFieldById(id);
    if (!rf) continue;
    enqueue(rf.returnTypeName);
    rf.args.forEach(a => enqueue(a.typeName));
  }
  if (extraSeeds) extraSeeds.forEach(enqueue);

  const kept = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const entry = state.registry.get(name);
    if (!entry) continue;
    kept.add(name);

    if (entry.kind === 'object' || entry.kind === 'interface') {
      entry.interfaces.forEach(enqueue);
      for (const [fname, f] of entry.fields) {
        if (honorPruning && isPruned(name, fname)) continue;
        enqueue(f.returnTypeName);
        f.args.forEach(a => enqueue(a.typeName));
      }
    } else {
      entry.referencedTypes.forEach(enqueue);
    }
  }
  return kept;
}

// ── RENDER LIST ───────────────────────────────────────────
function rootMatches(rf) {
  const term = state.searchTerm.toLowerCase();
  if (!term) return true;
  return rf.name.toLowerCase().includes(term)
    || rf.returnTypeName.toLowerCase().includes(term)
    || rf.op.includes(term)
    || rf.description.toLowerCase().includes(term);
}

function typeFieldMatches(typeName, fname, f) {
  const term = state.searchTerm.toLowerCase();
  if (!term) return true;
  return fname.toLowerCase().includes(term)
    || typeName.toLowerCase().includes(term)
    || f.returnTypeName.toLowerCase().includes(term)
    || f.description.toLowerCase().includes(term);
}

function renderList() {
  const list = el.fieldsList;
  list.innerHTML = '';

  if (state.rootFields.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No root fields found in this schema.';
    list.appendChild(empty);
    return;
  }

  let renderedAny = false;

  if (state.groupByOp) {
    for (const op of OP_ORDER) {
      const items = state.rootFields.filter(rf => rf.op === op && rootMatches(rf));
      if (items.length === 0) continue;
      renderedAny = true;
      list.appendChild(renderRootGroup(OP_LABEL[op], items));
    }
  } else {
    const items = state.rootFields.filter(rootMatches);
    if (items.length > 0) {
      renderedAny = true;
      list.appendChild(renderRootGroup('Root fields', items));
    }
  }

  // Per-type field pruning groups for the unpruned closure of selected roots.
  if (state.selectedRoots.size > 0) {
    const closure = computeClosure(false);
    const rootNames = new Set(Object.values(state.rootTypeNames).filter(Boolean));
    const typeNames = [...closure]
      .filter(n => !rootNames.has(n))
      .filter(n => {
        const e = state.registry.get(n);
        return e && (e.kind === 'object' || e.kind === 'interface' || e.kind === 'input');
      })
      .sort((a, b) => a.localeCompare(b));

    for (const name of typeNames) {
      const entry = state.registry.get(name);
      const fieldRows = [...entry.fields.entries()]
        .filter(([fname, f]) => typeFieldMatches(name, fname, f));
      if (fieldRows.length === 0) continue;
      renderedAny = true;
      list.appendChild(renderTypeGroup(name, entry, fieldRows));
    }
  }

  if (!renderedAny) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No fields match the filter.';
    list.appendChild(empty);
  }

  updateSelectionMeta();
}

function groupShell(name, kindLabel, selected, total) {
  const group = document.createElement('div');
  group.className = 'field-group';

  const header = document.createElement('div');
  header.className = 'field-group-header';
  const collapsed = state.collapsedGroups.has(name);
  if (collapsed) header.classList.add('is-collapsed');
  header.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
    <span class="group-name"></span>
    <span class="group-kind"></span>
    <span class="group-count"></span>
  `;
  header.querySelector('.group-name').textContent = name;
  header.querySelector('.group-kind').textContent = kindLabel || '';
  header.querySelector('.group-count').textContent = `${selected}/${total}`;
  header.addEventListener('click', () => {
    if (state.collapsedGroups.has(name)) state.collapsedGroups.delete(name);
    else state.collapsedGroups.add(name);
    renderList();
  });
  group.appendChild(header);
  return { group, collapsed };
}

function renderRootGroup(name, items) {
  const selected = items.filter(rf => state.selectedRoots.has(rf.id)).length;
  const { group, collapsed } = groupShell(name, '', selected, items.length);
  if (!collapsed) for (const rf of items) group.appendChild(renderRootRow(rf));
  return group;
}

function renderRootRow(rf) {
  const row = document.createElement('label');
  row.className = 'field-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = state.selectedRoots.has(rf.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) state.selectedRoots.add(rf.id);
    else state.selectedRoots.delete(rf.id);
    renderList();
    updateOutput();
  });
  row.appendChild(checkbox);

  const op = document.createElement('span');
  op.className = 'field-op';
  op.dataset.op = rf.op;
  op.textContent = rf.op;
  row.appendChild(op);

  const name = document.createElement('span');
  name.className = 'field-name';
  name.textContent = rf.name;
  row.appendChild(name);

  const type = document.createElement('span');
  type.className = 'field-type';
  type.textContent = rf.returnLabel;
  row.appendChild(type);

  if (rf.description) {
    const d = document.createElement('span');
    d.className = 'field-desc';
    d.textContent = rf.description;
    d.title = rf.description;
    row.appendChild(d);
  }
  return row;
}

function renderTypeGroup(typeName, entry, fieldRows) {
  const total = entry.fields.size;
  const kept = [...entry.fields.keys()].filter(fn => !isPruned(typeName, fn)).length;
  const { group, collapsed } = groupShell(typeName, entry.kind, kept, total);
  if (!collapsed) {
    for (const [fname, f] of fieldRows) {
      group.appendChild(renderTypeFieldRow(typeName, fname, f));
    }
  }
  return group;
}

function renderTypeFieldRow(typeName, fname, f) {
  const row = document.createElement('label');
  row.className = 'field-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = !isPruned(typeName, fname);
  checkbox.addEventListener('change', () => {
    setPruned(typeName, fname, !checkbox.checked);
    renderList();
    updateOutput();
  });
  row.appendChild(checkbox);

  const name = document.createElement('span');
  name.className = 'field-name';
  name.textContent = fname;
  row.appendChild(name);

  const type = document.createElement('span');
  type.className = 'field-type';
  type.textContent = f.returnLabel;
  row.appendChild(type);

  if (f.description) {
    const d = document.createElement('span');
    d.className = 'field-desc';
    d.textContent = f.description;
    d.title = f.description;
    row.appendChild(d);
  }
  return row;
}

function updateSelectionMeta() {
  el.selectionMeta.textContent = `${state.selectedRoots.size} selected`;
}

// ── TRIM ──────────────────────────────────────────────────
function placeholderField() {
  return {
    kind: 'FieldDefinition',
    description: { kind: 'StringValue', value: 'Placeholder: all fields pruned', block: true },
    name: { kind: 'Name', value: '_' },
    arguments: [],
    type: { kind: 'NamedType', name: { kind: 'Name', value: 'Boolean' } },
    directives: [],
  };
}

const BUILTIN_DIRECTIVES = new Set(['skip', 'include', 'deprecated', 'specifiedBy']);

function namedTypeName(typeNode) {
  let t = typeNode;
  while (t && (t.kind === 'ListType' || t.kind === 'NonNullType')) t = t.type;
  return t?.name?.value;
}

function collectDirectiveNames(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectDirectiveNames(n, out);
    return;
  }
  if (Array.isArray(node.directives)) {
    for (const d of node.directives) {
      const n = d?.name?.value;
      if (n && !BUILTIN_DIRECTIVES.has(n)) out.add(n);
    }
  }
  for (const key of ['fields', 'arguments', 'values', 'types', 'interfaces', 'operationTypes']) {
    if (Array.isArray(node[key])) collectDirectiveNames(node[key], out);
  }
}

function buildTrimmedSchema() {
  if (!state.ast || state.selectedRoots.size === 0) return null;

  const rootByOp = { query: new Set(), mutation: new Set(), subscription: new Set() };
  for (const id of state.selectedRoots) {
    const dot = id.indexOf('.');
    rootByOp[id.slice(0, dot)].add(id.slice(dot + 1));
  }
  const rootNameToOp = {};
  for (const op of OP_ORDER) {
    if (state.rootTypeNames[op]) rootNameToOp[state.rootTypeNames[op]] = op;
  }

  const directiveDefByName = new Map();
  for (const def of state.ast.definitions) {
    if (def.kind === 'DirectiveDefinition') directiveDefByName.set(def.name.value, def);
  }

  // Fixed point: directives used by kept nodes pull their argument types into
  // Preserve directives from an explicit `schema { ... }` definition, if any.
  let schemaDef = state.ast.definitions.find(d => d.kind === 'SchemaDefinition') || null;

  // the closure, which can keep more types/fields, which can use more directives.
  let closure = computeClosure(true);
  let defs = [];
  let keptDirectiveDefs = [];
  for (let pass = 0; pass < 8; pass++) {
    defs = [];
    for (const def of state.ast.definitions) {
      const kind = def.kind;
      const name = def.name?.value;
      if (kind === 'SchemaDefinition' || kind === 'SchemaExtension'
        || kind === 'DirectiveDefinition') continue;

      if (kind === 'ObjectTypeDefinition' || kind === 'InterfaceTypeDefinition') {
        const op = rootNameToOp[name];
        if (op) {
          const wanted = rootByOp[op];
          if (!wanted || wanted.size === 0) continue;
          const fields = (def.fields || []).filter(f => wanted.has(f.name.value));
          if (fields.length === 0) continue;
          defs.push({ ...def, fields });
          continue;
        }
        if (!closure.has(name)) continue;
        let fields = (def.fields || []).filter(f => !isPruned(name, f.name.value));
        if (fields.length === 0) fields = [placeholderField()];
        defs.push({ ...def, fields });
        continue;
      }
      if (kind === 'UnionTypeDefinition' || kind === 'EnumTypeDefinition'
        || kind === 'ScalarTypeDefinition' || kind === 'InputObjectTypeDefinition') {
        if (closure.has(name)) defs.push(def);
      }
    }

    const usedDirectives = new Set();
    collectDirectiveNames(defs, usedDirectives);
    keptDirectiveDefs = [...usedDirectives]
      .map(n => directiveDefByName.get(n))
      .filter(Boolean);

    const extraSeeds = [];
    for (const dd of keptDirectiveDefs) {
      for (const arg of dd.arguments || []) {
        const tn = namedTypeName(arg.type);
        if (tn && !closure.has(tn) && !BUILTIN_SCALARS.has(tn)) extraSeeds.push(tn);
      }
    }
    if (extraSeeds.length === 0) break;
    const next = computeClosure(true, extraSeeds);
    const before = closure.size;
    closure = new Set([...closure, ...next]);
    if (closure.size === before) break;
  }

  // Reconstruct a schema definition limited to operations that survived.
  const opTypes = [];
  for (const op of OP_ORDER) {
    const tName = state.rootTypeNames[op];
    if (tName && rootByOp[op] && rootByOp[op].size > 0) {
      opTypes.push({
        kind: 'OperationTypeDefinition',
        operation: op,
        type: { kind: 'NamedType', name: { kind: 'Name', value: tName } },
      });
    }
  }
  if (opTypes.length > 0) {
    schemaDef = {
      kind: 'SchemaDefinition',
      directives: schemaDef?.directives || [],
      operationTypes: opTypes,
    };
  } else {
    schemaDef = null;
  }

  const body = [...keptDirectiveDefs, ...defs];
  const definitions = schemaDef ? [schemaDef, ...body] : body;
  const filteredDoc = { kind: 'Document', definitions };

  let sdl;
  try {
    sdl = gql.print(filteredDoc);
  } catch (err) {
    return { error: `Failed to print schema: ${err.message}` };
  }

  // Always derive a trimmed introspection JSON so the slice can be exported
  // as JSON regardless of the input format. Requires a valid schema, so this
  // is null only when the selection has no Query root type.
  let introspection = null;
  try {
    introspection = gql.introspectionFromSchema(gql.buildASTSchema(filteredDoc));
  } catch {
    introspection = null;
  }
  return { sdl, introspection };
}

// ── OUTPUT ────────────────────────────────────────────────
let currentOutput = null;

function updateOutput() {
  const out = buildTrimmedSchema();
  currentOutput = out;

  if (!out) {
    el.outputPanel.hidden = true;
    return;
  }
  el.outputPanel.hidden = false;

  if (out.error) {
    el.outputMeta.textContent = 'error';
    el.outputPreview.textContent = out.error;
    el.tabJson.hidden = true;
    renderDocs();
    setActiveTab(activeTab);
    return;
  }

  const bytes = new Blob([out.sdl]).size;
  const originalBytes = new Blob([state.originalText]).size;
  const pct = originalBytes ? Math.round((bytes / originalBytes) * 100) : 0;
  el.outputMeta.textContent = `${formatBytes(bytes)} · ${pct}% of original`;

  el.tabJson.hidden = !out.introspection;
  if (activeTab === 'json' && el.tabJson.hidden) activeTab = 'sdl';

  renderDocs();
  setActiveTab(activeTab);
}

function currentText() {
  if (!currentOutput || currentOutput.error) return currentOutput?.error || '';
  if (activeTab === 'json' && currentOutput.introspection) {
    return JSON.stringify(currentOutput.introspection, null, 2);
  }
  return currentOutput.sdl;
}

function renderPreview() {
  const text = currentText();
  const MAX = 400_000;
  el.outputPreview.textContent = text.length > MAX
    ? text.slice(0, MAX) + `\n\n… (${formatBytes(text.length - MAX)} more, use Copy or Download)`
    : text;
}

function setActiveTab(tab) {
  if (tab === 'json' && el.tabJson.hidden) tab = 'sdl';
  activeTab = tab;
  const isDocs = tab === 'docs';
  el.tabDocs.classList.toggle('is-active', isDocs);
  el.tabSdl.classList.toggle('is-active', tab === 'sdl');
  el.tabJson.classList.toggle('is-active', tab === 'json');
  el.tabDocs.setAttribute('aria-selected', String(isDocs));
  el.tabSdl.setAttribute('aria-selected', String(tab === 'sdl'));
  el.tabJson.setAttribute('aria-selected', String(tab === 'json'));
  el.outputDocs.hidden = !isDocs;
  el.outputPreview.hidden = isDocs;
  el.copyBtn.textContent = tab === 'json' ? 'Copy JSON' : 'Copy SDL';
  if (!isDocs) renderPreview();
}

el.tabDocs.addEventListener('click', () => setActiveTab('docs'));
el.tabSdl.addEventListener('click', () => setActiveTab('sdl'));
el.tabJson.addEventListener('click', () => setActiveTab('json'));

// ── DOCS RENDERER ─────────────────────────────────────────
function renderDocs() {
  const root = el.outputDocs;
  root.replaceChildren();
  if (state.selectedRoots.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'docs-empty';
    empty.textContent = 'Select root fields to see their documentation.';
    root.appendChild(empty);
    return;
  }
  const ids = [...state.selectedRoots].sort();
  for (const id of ids) {
    const rf = rootFieldById(id);
    if (rf) root.appendChild(renderRootFieldDoc(rf));
  }
}

function renderRootFieldDoc(rf) {
  const article = document.createElement('article');
  article.className = 'field-doc';

  const header = document.createElement('div');
  header.className = 'field-doc-header';
  const op = document.createElement('span');
  op.className = 'field-op';
  op.dataset.op = rf.op;
  op.textContent = rf.op;
  const nm = document.createElement('span');
  nm.className = 'field-doc-name';
  nm.textContent = rf.name;
  const rt = document.createElement('span');
  rt.className = 'field-doc-return';
  rt.textContent = rf.returnLabel;
  header.append(op, nm, rt);
  article.appendChild(header);

  if (rf.description) {
    const d = document.createElement('p');
    d.className = 'field-doc-description';
    d.textContent = rf.description;
    article.appendChild(d);
  }

  if (rf.args.length > 0) {
    const section = document.createElement('section');
    section.className = 'field-doc-section';
    const h = document.createElement('h4');
    h.textContent = 'Arguments';
    section.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'schema-props';
    for (const a of rf.args) {
      ul.appendChild(renderProp(a.name, a.typeLabel, a.required, a.typeName, a.description,
        a.defaultValue !== undefined ? `default: ${JSON.stringify(a.defaultValue)}` : '', new Set()));
    }
    section.appendChild(ul);
  }

  const section = document.createElement('section');
  section.className = 'field-doc-section';
  const h = document.createElement('h4');
  h.textContent = 'Returns';
  section.appendChild(h);
  const wrap = document.createElement('div');
  renderTypeBody(wrap, rf.returnTypeName, new Set());
  section.appendChild(wrap);
  article.appendChild(section);

  return article;
}

function renderTypeBody(container, typeName, ancestors) {
  const entry = state.registry.get(typeName);
  if (!entry) {
    const m = document.createElement('div');
    m.className = 'prop-meta';
    m.textContent = BUILTIN_SCALARS.has(typeName) ? typeName : `${typeName} (scalar)`;
    container.appendChild(m);
    return;
  }
  if (entry.kind === 'scalar' || entry.kind === 'enum') {
    const m = document.createElement('div');
    m.className = 'prop-meta';
    m.textContent = `${typeName} (${entry.kind})`;
    container.appendChild(m);
    return;
  }
  if (entry.kind === 'union') {
    const m = document.createElement('div');
    m.className = 'prop-meta';
    m.textContent = `union: ${[...entry.referencedTypes].join(' | ')}`;
    container.appendChild(m);
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'schema-props';
  for (const [fname, f] of entry.fields) {
    if ((entry.kind === 'object' || entry.kind === 'interface') && isPruned(typeName, fname)) continue;
    ul.appendChild(renderProp(fname, f.returnLabel, false, f.returnTypeName, f.description, '', ancestors));
  }
  container.appendChild(ul);
}

function renderProp(name, typeLabel, required, childTypeName, description, meta, ancestors) {
  const li = document.createElement('li');
  li.className = 'schema-prop';

  const childEntry = childTypeName ? state.registry.get(childTypeName) : null;
  const isCycle = childTypeName && ancestors.has(childTypeName);
  const expandable = !isCycle && childEntry
    && (childEntry.kind === 'object' || childEntry.kind === 'interface' || childEntry.kind === 'input')
    && childEntry.fields.size > 0;

  const fillSummary = (host) => {
    const n = document.createElement('span');
    n.className = 'prop-name';
    n.textContent = name;
    host.appendChild(n);

    const t = document.createElement('span');
    t.className = 'prop-type';
    t.textContent = typeLabel + (isCycle ? ' ↻' : '');
    host.appendChild(t);

    if (required) {
      const r = document.createElement('span');
      r.className = 'prop-required';
      r.textContent = 'required';
      host.appendChild(r);
    }
    if (description) {
      const d = document.createElement('span');
      d.className = 'prop-inline-desc';
      d.textContent = description;
      host.appendChild(d);
    }
  };

  if (expandable) {
    const det = document.createElement('details');
    const sm = document.createElement('summary');
    sm.className = 'prop-summary';
    fillSummary(sm);
    det.appendChild(sm);
    const body = document.createElement('div');
    body.className = 'prop-body';
    let rendered = false;
    det.addEventListener('toggle', () => {
      if (!det.open || rendered) return;
      rendered = true;
      renderTypeBody(body, childTypeName, new Set([...ancestors, childTypeName]));
    });
    det.appendChild(body);
    li.appendChild(det);
  } else {
    const row = document.createElement('div');
    row.className = 'prop-row';
    fillSummary(row);
    li.appendChild(row);
    if (meta) {
      const m = document.createElement('div');
      m.className = 'prop-meta';
      m.textContent = meta;
      li.appendChild(m);
    }
  }
  return li;
}

// ── COPY / DOWNLOAD ───────────────────────────────────────
async function copyOutput() {
  if (!currentOutput || currentOutput.error) return;
  try {
    await navigator.clipboard.writeText(currentText());
    flashButton(el.copyBtn, 'Copied!');
  } catch {
    flashButton(el.copyBtn, 'Copy failed');
  }
}

function downloadOutput() {
  if (!currentOutput || currentOutput.error) return;
  const isJson = activeTab === 'json' && currentOutput.introspection;
  const text = currentText();
  const blob = new Blob([text], { type: isJson ? 'application/json' : 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildFileName(isJson ? 'json' : 'graphql');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildFileName(ext) {
  const base = (state.rootTypeNames.query || 'schema').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'schema';
  return `${base}-trimmed.${ext}`;
}

function flashButton(btn, label) {
  const orig = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1200);
}

// ── PANEL HELPERS ─────────────────────────────────────────
function hidePanels() {
  el.fieldsPanel.hidden = true;
  el.outputPanel.hidden = true;
  el.inputMeta.hidden = true;
  el.inputMeta.classList.remove('is-success');
}

function reset() {
  state.schema = null;
  state.ast = null;
  state.registry = new Map();
  state.rootFields = [];
  state.selectedRoots.clear();
  state.prunedFields.clear();
  state.collapsedGroups.clear();
  currentOutput = null;
  hidePanels();
  el.clearBtn.hidden = true;
  el.inputPanel.open = true;
}

// ── INPUT WIRING ──────────────────────────────────────────
let parseTimer = null;
el.schemaInput.addEventListener('input', () => {
  clearTimeout(parseTimer);
  parseTimer = setTimeout(() => { parseSchema(el.schemaInput.value); }, 250);
});

el.dropZone.addEventListener('click', () => el.fileInput.click());
el.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  el.dropZone.classList.add('dragover');
});
el.dropZone.addEventListener('dragleave', () => {
  el.dropZone.classList.remove('dragover');
});
el.dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  el.dropZone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) await loadFile(file);
});

el.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (file) await loadFile(file);
  e.target.value = '';
});

async function loadFile(file) {
  try {
    const text = await file.text();
    el.schemaInput.value = text;
    await parseSchema(text);
  } catch (err) {
    setStatus(`Failed to read file: ${err.message}`, 'error');
  }
}

el.clearBtn.addEventListener('click', () => {
  el.schemaInput.value = '';
  reset();
  setStatus('Waiting for input.');
});

el.loadSampleBtn.addEventListener('click', () => {
  el.schemaInput.value = SAMPLE_SCHEMA;
  parseSchema(el.schemaInput.value);
});

el.searchInput.addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderList();
});

el.selectAllBtn.addEventListener('click', () => {
  for (const rf of state.rootFields) {
    if (rootMatches(rf)) state.selectedRoots.add(rf.id);
  }
  renderList();
  updateOutput();
});

el.selectNoneBtn.addEventListener('click', () => {
  state.selectedRoots.clear();
  renderList();
  updateOutput();
});

el.groupByOp.addEventListener('change', (e) => {
  state.groupByOp = e.target.checked;
  renderList();
});

el.copyBtn.addEventListener('click', copyOutput);
el.downloadBtn.addEventListener('click', downloadOutput);

// ── SAMPLE SCHEMA ─────────────────────────────────────────
const SAMPLE_SCHEMA = `"""A scalar for ISO-8601 timestamps."""
scalar DateTime

directive @auth(role: Role = USER) on FIELD_DEFINITION

"""How a pet is feeling today."""
enum Mood {
  HAPPY
  SLEEPY
  GRUMPY
}

enum Role {
  USER
  ADMIN
}

"""Anything that has a name."""
interface Named {
  name: String!
}

type Owner implements Named {
  id: ID!
  name: String!
  pets: [Pet!]!
}

type Pet implements Named {
  id: ID!
  name: String!
  mood: Mood!
  owner: Owner
  bornAt: DateTime
}

union SearchResult = Pet | Owner

input NewPet {
  name: String!
  ownerId: ID
}

type Query {
  """Fetch a single pet by id."""
  pet(id: ID!): Pet
  """List every pet."""
  pets: [Pet!]!
  owners: [Owner!]!
  search(term: String!): [SearchResult!]!
}

type Mutation {
  """Create a new pet."""
  createPet(input: NewPet!): Pet! @auth(role: ADMIN)
  deletePet(id: ID!): Boolean!
}

type Subscription {
  petAdded: Pet!
}
`;
