/**
 * JinjaJS - A standalone, lightweight Jinja2-inspired template engine for JavaScript.
 * * Updated: Support for multiline variable interpolation {{ ... }} blocks.
 */

class JinjaJS {
  constructor(options = {}) {
    const utils = {
      replace: (v, old, replacement) => String(v).split(old).join(replacement),
      as_timestamp: (v) => {
        const d = v ? new Date(v) : new Date();
        return d.getTime() / 1000;
      },
      strptime: (str, format) => new Date(str),
      timestamp_custom: (ts, format, local = true) => {
        const d = new Date(ts * 1000);
        return local ? d.toLocaleString() : d.toUTCString();
      },
      weekday: (v) => {
        const d = (v instanceof Date) ? v : (v ? new Date(v) : new Date());
        const jsDay = d.getDay();
        return jsDay === 0 ? 6 : jsDay - 1;
      }
    };

    this.filters = {
      upper: (v) => String(v).toUpperCase(),
      lower: (v) => String(v).toLowerCase(),
      capitalize: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1),
      title: (v) => String(v).split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' '),
      trim: (v) => String(v).trim(),
      length: (v) => (v ? (v.length || Object.keys(v).length) : 0),
      default: (v, d) => (v !== undefined && v !== null && v !== '' ? v : d),
      join: (v, s = ', ') => (Array.isArray(v) ? v.join(s) : v),
      replace: utils.replace,
      as_timestamp: utils.as_timestamp,
      strptime: utils.strptime,
      timestamp_custom: utils.timestamp_custom,
      weekday: utils.weekday,
      int: (v, defaultVal = 0) => {
        const res = parseInt(v, 10);
        return isNaN(res) ? defaultVal : res;
      },
      float: (v, defaultVal = 0.0) => {
        const res = parseFloat(v);
        return isNaN(res) ? defaultVal : res;
      },
      bool: (v) => !!v,
      ...options.filters,
    };

    this.globals = {
      namespace: (obj = {}) => ({ ...obj }),
      now: this._getSmartDate(new Date()),
      today_at: (timeStr) => {
        const d = new Date();
        const [h, m, s] = (timeStr || "00:00:00").split(':');
        d.setHours(parseInt(h || 0), parseInt(m || 0), parseInt(s || 0), 0);
        return this._getSmartDate(d);
      },
      timedelta: (days = 0, hours = 0, minutes = 0, seconds = 0) => {
        return (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
      },
      replace: utils.replace,
      as_timestamp: utils.as_timestamp,
      strptime: utils.strptime,
      timestamp_custom: utils.timestamp_custom,
      weekday: utils.weekday,
      None: null,
      True: true,
      False: false,
      ...options.globals
    };

    this.methodMap = {
      'lower': 'toLowerCase',
      'upper': 'toUpperCase',
      'strip': 'trim',
      'replace': 'replace',
      'index': 'indexOf',
      'strftime': 'toLocaleString'
    };

    this.macros = {};
  }

  _getSmartDate(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return date;
    Object.defineProperties(date, {
      year: { get: () => date.getFullYear() },
      month: { get: () => date.getMonth() + 1 },
      day: { get: () => date.getDate() },
      hour: { get: () => date.getHours() },
      minute: { get: () => date.getMinutes() },
      second: { get: () => date.getSeconds() }
    });
    date.weekday = () => {
      const jsDay = date.getDay();
      return jsDay === 0 ? 6 : jsDay - 1;
    };
    date.replace = (params = {}) => {
      const newDate = new Date(date);
      if (params.year !== undefined) newDate.setFullYear(params.year);
      if (params.month !== undefined) newDate.setMonth(params.month - 1);
      if (params.day !== undefined) newDate.setDate(params.day);
      if (params.hour !== undefined) newDate.setHours(params.hour);
      if (params.minute !== undefined) newDate.setMinutes(params.minute);
      if (params.second !== undefined) newDate.setSeconds(params.second);
      return this._getSmartDate(newDate);
    };
    date.strftime = (fmt) => date.toISOString().replace('T', ' ').split('.')[0];
    return date;
  }

  _evaluate(expr, context, loc = { line: 0, col: 0 }) {
    expr = expr.trim().replace(/\s+/g, ' '); // Normalize multiline expressions
    if (!expr) return undefined;

    try {
      // 1. Inline Ternary
      const ternaryMatch = expr.match(/^(.*)\s+if\s+(.*)\s+else\s+(.*)$/);
      if (ternaryMatch) {
        const condition = this._evaluate(ternaryMatch[2], context, loc);
        return condition ? this._evaluate(ternaryMatch[1], context, loc) : this._evaluate(ternaryMatch[3], context, loc);
      }

      // 2. 'is' operator
      if (/\s+is\s+/.test(expr)) {
        const parts = expr.split(/\s+is\s+/);
        const leftExpr = parts[0].trim();
        let left;
        if (parts[1].trim().includes('defined')) {
          try { left = this._resolveChain(leftExpr, context, loc); } catch(e) { left = undefined; }
        } else {
          left = this._evaluate(leftExpr, context, loc);
        }
        let right = parts[1].trim();
        let inverted = false;
        if (right.startsWith('not ')) { inverted = true; right = right.slice(4).trim(); }
        let result = false;
        if (right === 'none') result = (left === null || left === undefined);
        else if (right === 'defined') result = (left !== undefined);
        else if (right === 'undefined') result = (left === undefined);
        else if (right === 'number') result = (typeof left === 'number');
        else if (right === 'string') result = (typeof left === 'string');
        return inverted ? !result : result;
      }

      // 3. Logic
      if (expr.startsWith('not ')) return !this._evaluate(expr.slice(4), context, loc);
      if (expr.includes(' or ')) return expr.split(/\s+or\s+/).some(p => !!this._evaluate(p, context, loc));
      if (expr.includes(' and ')) return expr.split(/\s+and\s+/).every(p => !!this._evaluate(p, context, loc));

      // 4. Comparisons/Math
      const compMatch = expr.match(/(.*?)(\s*(==|!=|<=|>=|<|>)\s*)(.*)/);
      if (compMatch) {
        const left = this._evaluate(compMatch[1], context, loc), op = compMatch[3], right = this._evaluate(compMatch[4], context, loc);
        switch(op) { case '==': return left == right; case '!=': return left != right; case '<': return left < right; case '>': return left > right; case '<=': return left <= right; case '>=': return left >= right; }
      }
      const mathMatch = expr.match(/(.*?)(\s*([\+\-\*\/])\s*)(.*)/);
      if (mathMatch && !/^['"].*['"]$/.test(expr)) {
        const left = this._evaluate(mathMatch[1], context, loc), op = mathMatch[3], right = this._evaluate(mathMatch[4], context, loc);
        switch(op) { case '+': return left + right; case '-': return left - right; case '*': return left * right; case '/': return left / right; }
      }

      // 5. Pipe Filters
      if (expr.includes('|')) {
        const parts = expr.split('|');
        let val = this._evaluate(parts[0], context, loc);
        for (let i = 1; i < parts.length; i++) {
          const callMatch = parts[i].trim().match(/^(\w+)(?:\((.*)\))?$/);
          if (callMatch) {
            const name = callMatch[1], argsRaw = callMatch[2] || "";
            const filterArgs = argsRaw ? argsRaw.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(a => this._evaluate(a, context, loc)) : [];
            if (this.filters[name]) val = this.filters[name](val, ...filterArgs);
            else throw new Error(`Filter "${name}" not found`);
          }
        }
        return val;
      }

      // 6. Literals
      if (expr.startsWith('[') && expr.endsWith(']')) return expr.slice(1, -1).split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(item => this._evaluate(item, context, loc));
      if (expr.startsWith('{') && expr.endsWith('}')) {
        const obj = {};
        expr.slice(1, -1).split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).forEach(pair => {
          const splitIdx = pair.indexOf(':');
          if (splitIdx === -1) return;
          const k = pair.slice(0, splitIdx).trim(), v = pair.slice(splitIdx + 1).trim();
          obj[this._evaluate(k, context, loc)] = this._evaluate(v, context, loc);
        });
        return obj;
      }
      if (/^['"].*['"]$/.test(expr)) return expr.slice(1, -1);
      if (/^-?\d+\.?\d*$/.test(expr)) return parseFloat(expr);
      if (expr === 'true' || expr === 'True') return true;
      if (expr === 'false' || expr === 'False') return false;
      if (expr === 'null' || expr === 'None' || expr === 'none') return null;

      return this._resolveChain(expr, context, loc);
    } catch (e) {
      throw new Error(`[Line ${loc.line}, Col ${loc.col}] Evaluation failed for "${expr}": ${e.message}`);
    }
  }

  _resolveChain(expr, context, loc) {
    const parts = expr.split(/(\.|\(|\)|\[|\])/g).filter(p => p && p !== '.');
    let res = (context[parts[0]] !== undefined) ? context : (this.macros[parts[0]] !== undefined) ? this.macros : this.globals;

    let i = 0;
    while (i < parts.length) {
      let part = parts[i].trim();
      if (!part) { i++; continue; }
      if (part === '(') {
        let argStr = ""; i++;
        while(i < parts.length && parts[i] !== ')') { argStr += parts[i]; i++; }
        if (argStr.includes('=')) {
          const kwargs = {};
          argStr.split(',').forEach(p => { const parts = p.split('='); if(parts.length === 2) kwargs[parts[0].trim()] = this._evaluate(parts[1], context, loc); });
          if (typeof res === 'function') res = res(kwargs);
        } else {
          const args = argStr ? argStr.split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(a => this._evaluate(a, context, loc)) : [];
          if (typeof res === 'function') res = res(...args);
        }
        i++;
      } else if (part === '[') {
        let indexExpr = ""; i++;
        while(i < parts.length && parts[i] !== ']') { indexExpr += parts[i]; i++; }
        res = res ? res[this._evaluate(indexExpr, context, loc)] : undefined;
        i++;
      } else {
        if (i === 0) res = res[part];
        else {
          const mappedName = this.methodMap[part] || part;
          if (res !== undefined && res !== null) {
            const next = res[mappedName];
            res = (typeof next === 'function') ? next.bind(res) : next;
          } else { res = undefined; }
        }
        i++;
      }
    }
    return res;
  }

  _assign(targetPath, value, context, loc) {
    const parts = targetPath.split(/[.\[\]]/).filter(Boolean);
    if (parts.length === 1) context[parts[0]] = value;
    else {
      let obj = context[parts[0]];
      for (let i = 1; i < parts.length - 1; i++) { if (!obj) break; obj = obj[parts[i]]; }
      if (obj) obj[parts[parts.length - 1]] = value;
      else throw new Error(`[Line ${loc.line}, Col ${loc.col}] Cannot set property of undefined "${parts[0]}"`);
    }
  }

  render(template, context = {}) {
    const tokens = [], errors = [];
    // Updated regex to support multiline in both interpolation {{ }} and tags {% %}
    const re = /\{#[\s\S]*?#\}|\{\{\s*(-?)([\s\S]*?)(-?)\s*\}\}|\{\%\s*(-?)([\s\S]*?)(-?)\s*\%\}|([^{]+|\{)/g;
    let match;

    const getLoc = (index) => {
      const sub = template.substring(0, index);
      const lines = sub.split('\n');
      return { line: lines.length, col: lines[lines.length - 1].length + 1 };
    };

    while ((match = re.exec(template)) !== null) {
      const index = match.index;
      const loc = getLoc(index);
      const [full, dashLVar, varContent, dashRVar, dashLTag, tagContent, dashRTag, plainText] = match;

      if (full.startsWith('{#')) continue;

      if (plainText) {
        tokens.push({ type: 'text', value: plainText, loc });
      } else if (varContent !== undefined) {
        tokens.push({ type: 'var', value: varContent.trim(), loc, trimLeft: !!dashLVar, trimRight: !!dashRVar });
      } else if (tagContent !== undefined) {
        const raw = tagContent.trim(), parts = raw.split(/\s+/);
        tokens.push({ type: 'tag', command: parts[0], raw, loc, trimLeft: !!dashLTag, trimRight: !!dashRTag });
      }
    }

    let tokenIdx = 0;
    const execute = (ctx) => {
      let output = '';
      const validTags = ['if', 'elif', 'else', 'endif', 'for', 'endfor', 'set', 'macro', 'endmacro'];

      while (tokenIdx < tokens.length) {
        const token = tokens[tokenIdx];
        const processTrim = (t) => {
          if (t.trimLeft) output = output.trimEnd();
          if (t.trimRight) {
            let next = tokenIdx + 1;
            while(next < tokens.length && tokens[next].type !== 'text') next++;
            if(tokens[next]) tokens[next].value = tokens[next].value.trimStart();
          }
        };

        if (token.type === 'text') { output += token.value; tokenIdx++; }
        else if (token.type === 'var') {
          try {
            const val = this._evaluate(token.value, ctx, token.loc);
            processTrim(token);
            if (val !== undefined && val !== null) output += (typeof val === 'object' && !(val instanceof Date)) ? JSON.stringify(val) : val;
          } catch (e) { errors.push(e.message); }
          tokenIdx++;
        } else if (token.type === 'tag') {
          const { command, raw, loc } = token;

          if (!validTags.includes(command)) {
            errors.push(`[Line ${loc.line}, Col ${loc.col}] Syntax Error: Unknown tag "{% ${command} %}"`);
            tokenIdx++;
            continue;
          }

          try {
            if (command === 'if') {
              let conditionMet = !!this._evaluate(raw.slice(2).trim(), ctx, loc);
              processTrim(token); tokenIdx++;
              if (conditionMet) {
                output += execute(ctx);
              } else {
                let depth = 1;
                while (tokenIdx < tokens.length && depth > 0) {
                  const t = tokens[tokenIdx];
                  if (t.command === 'if') depth++;
                  else if (t.command === 'endif') depth--;
                  else if (depth === 1 && (t.command === 'elif' || t.command === 'else')) break;
                  tokenIdx++;
                }
              }

              while (tokenIdx < tokens.length) {
                const subTag = tokens[tokenIdx];
                if (subTag.command === 'elif') {
                  if (!conditionMet) {
                    conditionMet = !!this._evaluate(subTag.raw.slice(4).trim(), ctx, subTag.loc);
                    tokenIdx++;
                    if (conditionMet) output += execute(ctx);
                    else {
                        let depth = 1;
                        while (tokenIdx < tokens.length && depth > 0) {
                          const t = tokens[tokenIdx];
                          if (t.command === 'if') depth++;
                          else if (t.command === 'endif') depth--;
                          else if (depth === 1 && (t.command === 'elif' || t.command === 'else')) break;
                          tokenIdx++;
                        }
                    }
                  } else {
                    tokenIdx++;
                    let depth = 1;
                    while (tokenIdx < tokens.length && depth > 0) {
                      const t = tokens[tokenIdx];
                      if (t.command === 'if') depth++;
                      else if (t.command === 'endif') depth--;
                      else if (depth === 1 && (t.command === 'elif' || t.command === 'else')) break;
                      tokenIdx++;
                    }
                  }
                } else if (subTag.command === 'else') {
                  if (!conditionMet) {
                    tokenIdx++;
                    output += execute(ctx);
                    conditionMet = true;
                  } else {
                    tokenIdx++;
                    let depth = 1;
                    while (tokenIdx < tokens.length && depth > 0) {
                      const t = tokens[tokenIdx];
                      if (t.command === 'if') depth++;
                      else if (t.command === 'endif') depth--;
                      tokenIdx++;
                    }
                  }
                } else if (subTag.command === 'endif') {
                  tokenIdx++; break;
                } else {
                  break;
                }
              }
            } else if (command === 'elif' || command === 'else' || command === 'endif' || command === 'endfor' || command === 'endmacro') {
              processTrim(token); tokenIdx++; return output;
            } else if (command === 'for') {
              const m = raw.match(/for\s+(\w+)\s+in\s+(.*)/);
              if (!m) throw new Error("Invalid for loop syntax");
              const itemVar = m[1], listExpr = m[2];
              const list = this._evaluate(listExpr, ctx, loc) || [], startIdx = tokenIdx + 1;
              processTrim(token);
              if (Array.isArray(list)) {
                list.forEach((item, idx) => {
                  tokenIdx = startIdx;
                  const loop = { index: idx + 1, index0: idx, first: idx === 0, last: idx === list.length - 1, length: list.length };
                  output += execute(Object.assign(Object.create(ctx), { [itemVar]: item, loop }));
                });
              }
              tokenIdx = startIdx;
              let depth = 1;
              while (tokenIdx < tokens.length && depth > 0) {
                if (tokens[tokenIdx].command === 'for') depth++;
                else if (tokens[tokenIdx].command === 'endfor') depth--;
                tokenIdx++;
              }
            } else if (command === 'set') {
              processTrim(token);
              const eqIdx = raw.indexOf('=');
              if (eqIdx === -1) throw new Error("Invalid set syntax");
              this._assign(raw.slice(3, eqIdx).trim(), this._evaluate(raw.slice(eqIdx + 1), ctx, loc), ctx, loc);
              tokenIdx++;
            } else if (command === 'macro') {
              const m = raw.match(/macro\s+(\w+)\((.*)\)/);
              if (!m) throw new Error("Invalid macro syntax");
              const name = m[1], argNames = m[2].split(',').map(a => a.trim()).filter(Boolean);
              tokenIdx++; const macroStart = tokenIdx;
              this.macros[name] = (...args) => {
                const prevIdx = tokenIdx; tokenIdx = macroStart;
                const macroCtx = Object.create(ctx);
                argNames.forEach((argName, i) => { macroCtx[argName] = args[i]; });
                const res = execute(macroCtx); tokenIdx = prevIdx; return res;
              };
              let d = 1; while (tokenIdx < tokens.length && d > 0) { if (tokens[tokenIdx].command === 'macro') d++; if (tokens[tokenIdx].command === 'endmacro') d--; tokenIdx++; }
            } else { tokenIdx++; }
          } catch (e) { errors.push(e.message); tokenIdx++; }
        }
      }
      return output;
    };

    const finalOutput = execute({ ...context });
    return { output: finalOutput, errors };
  }
}

export default JinjaJS;