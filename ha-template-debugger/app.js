import JinjaJS from './jinja2.mjs';

// Utilities
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (unsafe) => {
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// --- Editor Class ---
class Editor {
    constructor(containerId, language = 'jinja2') {
        this.container = document.getElementById(containerId);
        this.input = this.container.querySelector('.editor-input');
        this.highlightLayer = this.container.querySelector('.editor-highlight');
        this.language = language;

        this.input.addEventListener('input', () => this.update());
        this.input.addEventListener('scroll', () => this.syncScroll());
        this.input.addEventListener('keydown', (e) => this.handleKey(e));

        this.update();
    }

    getValue() {
        return this.input.value;
    }

    setValue(val) {
        this.input.value = val;
        this.update();
    }

    setLanguage(lang) {
        this.language = lang;
        this.update();
    }

    update() {
        const text = this.input.value;
        // Highlight logic
        let highlighted = '';
        if (this.language === 'jinja2') {
            highlighted = this.highlightJinja(text);
        } else if (this.language === 'json') {
            highlighted = this.highlightJSON(text);
        } else if (this.language === 'yaml') {
            highlighted = this.highlightYAML(text);
        }

        // Ensure trailing newline is handled for scrolling
        if (text.endsWith('\n')) highlighted += '\n';

        this.highlightLayer.innerHTML = highlighted;
        this.syncScroll();

        // Trigger app logic
        document.dispatchEvent(new CustomEvent('editor-change'));
    }

    syncScroll() {
        this.highlightLayer.scrollTop = this.input.scrollTop;
        this.highlightLayer.scrollLeft = this.input.scrollLeft;
    }

    handleKey(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.input.selectionStart;
            const end = this.input.selectionEnd;
            const value = this.input.value;
            this.input.value = value.substring(0, start) + "  " + value.substring(end);
            this.input.selectionStart = this.input.selectionEnd = start + 2;
            this.update();
        }
    }

    highlightJinja(text) {
        let html = escapeHtml(text);
        // Improved regex for highlighting tags
        html = html.replace(/(\{\{)([\s\S]*?)(\}\} )/g,
            '<span class="token-bracket">$1</span><span class="token-variable">$2</span><span class="token-bracket">$3</span>');
        html = html.replace(/(\{%)([\s\S]*?)(%\})/g,
            '<span class="token-bracket">$1</span><span class="token-keyword">$2</span><span class="token-bracket">$3</span>');
        html = html.replace(/(\{#)([\s\S]*?)(#\})/g,
            '<span class="token-comment">$1$2$3</span>');
        return html;
    }

    highlightJSON(text) {
        let html = escapeHtml(text);
        html = html.replace(/(&quot;.*?&quot;)/g, '<span class="token-string">$1</span>');
        html = html.replace(/\b(\d+)\b/g, '<span class="token-number">$1</span>');
        html = html.replace(/\b(true|false|null)\b/g, '<span class="token-keyword">$1</span>');
        return html;
    }

    highlightYAML(text) {
        let lines = text.split('\n');
        return lines.map(line => {
            const escaped = escapeHtml(line);
            if (escaped.trim().startsWith('#')) return `<span class="token-comment">${escaped}</span>`;
            const match = escaped.match(/^(\s*)(.*?)(:)(.*)$/);
            if (match) {
                return `${match[1]}<span class="token-keyword">${match[2]}</span>${match[3]}<span class="token-string">${match[4]}</span>`;
            }
            return escaped;
        }).join('\n');
    }
}

// --- App Controller ---
const App = {
    init() {
        this.templateEditor = new Editor('template-editor', 'jinja2');
        this.variablesEditor = new Editor('variables-editor', 'yaml');

        this.outputEl = document.getElementById('output');
        this.renderErrorEl = document.getElementById('render-error');
        this.varErrorEl = document.getElementById('variables-error');
        this.formatSelect = document.getElementById('variables-format');

        // Defaults
        let defaultFormat = 'yaml';
        let defaultVars = `trigger:
  id: '0'
  idx: '0'
  alias: null
  platform: conversation
  sentence: Remind me to look at solutions for image server.
  details:
    task:
      name: task
      text: look
      value: look
    time:
      name: time
      text: solutions for image server
      value: solutions for image server
  slots:
    task: look
    time: solutions for image server
  device_id: 01eef35b54fbcf434e297652c46de011
  satellite_id: assist_satellite.home_assistant_voice_0a483f_assist_satellite
  user_input:
    text: Remind me to look at solutions for image server.
    context:
      id: 01KFJT9KN6SHNXMTAGS41YAC8K
      parent_id: null
      user_id: null
    conversation_id: 01KFJT9KN6P8YBDQCF1QNC4J8S
    device_id: 01eef35b54fbcf434e297652c46de011
    satellite_id: assist_satellite.home_assistant_voice_0a483f_assist_satellite
    language: en-GB
    agent_id: conversation.chatgpt
    extra_system_prompt: null`;
        let defaultTemplate = `{% set t = trigger.slots.task %}
{% set stop_words = [' on ', ' at ', ' in ', ' next ', ' tomorrow'] %}
{% set cleaned = namespace(task=t) %}

{% for word in stop_words %}
  {% if word in cleaned.task.lower() %}
    {% set cleaned.task = cleaned.task.lower().split(word)[0] %}
  {% endif %}
{% endfor %}

Result:
{{ cleaned.task | trim | capitalize }}`;

        // Load from Session Storage
        if (sessionStorage.getItem('ha-debug-format')) {
            defaultFormat = sessionStorage.getItem('ha-debug-format');
            defaultVars = sessionStorage.getItem('ha-debug-vars') || defaultVars;
            defaultTemplate = sessionStorage.getItem('ha-debug-template') || defaultTemplate;
        }

        this.formatSelect.value = defaultFormat;
        this.variablesEditor.setLanguage(defaultFormat);
        this.variablesEditor.setValue(defaultVars);
        this.templateEditor.setValue(defaultTemplate);

        this.formatSelect.addEventListener('change', (e) => {
            this.variablesEditor.setLanguage(e.target.value);
            this.run();
        });

        document.addEventListener('editor-change', () => this.run());

        this.run();
    },

    run() {
        const templateStr = this.templateEditor.getValue();
        const varsStr = this.variablesEditor.getValue();
        const format = this.formatSelect.value;

        // Save state
        sessionStorage.setItem('ha-debug-format', format);
        sessionStorage.setItem('ha-debug-vars', varsStr);
        sessionStorage.setItem('ha-debug-template', templateStr);

        let context = {};
        this.varErrorEl.textContent = '';
        this.varErrorEl.classList.add('hidden');

        // Parse Variables
        try {
            if (format === 'json') {
                context = JSON.parse(varsStr);
            } else {
                context = jsyaml.load(varsStr);
            }
        } catch (e) {
            this.varErrorEl.textContent = `Error parsing variables: ${e.message}`;
            this.varErrorEl.classList.remove('hidden');
            return;
        }

        // Mock HA Context
        const haContext = {
            ...context,
            namespace: function(obj) {
                // If called as namespace(task=t) in Nunjucks, it passed an object.
                // In our custom JinjaJS _evaluate, it uses new Function, so it depends on how it's called.
                // If the user writes namespace({task: t}), it works.
                // Jinja syntax namespace(task=t) will be transformed by our evaluator if we want.
                // For now, let's assume it passes an object or we handle it.
                return obj || {};
            },
            states: (entityId) => {
                if (!entityId) return "unknown";
                const parts = entityId.split('.');
                if (context.states && context.states[entityId]) return context.states[entityId];
                if (context.states && context.states[parts[0]] && context.states[parts[0]][parts[1]]) return context.states[parts[0]][parts[1]];
                return "unknown";
            },
            is_state: (entityId, state) => {
               const val = haContext.states(entityId);
               return val === state;
            }
        };

        // Render Template
        this.renderErrorEl.textContent = '';
        this.renderErrorEl.classList.add('hidden');

        try {
            const engine = new JinjaJS();
            const { output, errors } = engine.render(templateStr, haContext);
            this.outputEl.textContent = output.trim();

            if (errors && errors.length > 0) {
                this.renderErrorEl.textContent = 'Errors during rendering:\n' + errors.map(e => `- ${e.message} ${e.expr ? '(' + e.expr + ')' : ''}`).join('\n');
                this.renderErrorEl.classList.remove('hidden');
            }
        } catch (e) {
            this.outputEl.textContent = '';
            this.renderErrorEl.textContent = `Render Error: ${e.message}\nStack: ${e.stack}`;
            this.renderErrorEl.classList.remove('hidden');
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
