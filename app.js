/* ============================================================
   FlowLab v23 — Logica applicazione completa
   Novità:
   - Zoom centrato (mantiene il punto centrale fisso)
   - Pinch-to-zoom con due dita su mobile
   - Pannelli esclusivi su mobile (uno alla volta)
   ============================================================ */
'use strict';

const APP = {
  name: 'FlowLab',
  version: '23.0',
  storageKey: 'flowlab.project.v23',
  maxSteps: 5000,
  maxConsole: 800,
};

/* ============================================================
   DEFINIZIONE BLOCCHI
   ============================================================ */
const DEFS = {
  start:   { label:'Start',    shape:'oval',          color:'#9370DB', fill:'#E8D5F5', editable:false, deletable:false },
  end:     { label:'End',      shape:'oval',          color:'#9370DB', fill:'#E8D5F5', editable:false, deletable:false },
  input:   { label:'Input',    shape:'parallelogram', color:'#1976D2', fill:'#D6E8F5', editable:true,  deletable:true,  ph:'nome' },
  output:  { label:'Output',   shape:'parallelogram', color:'#2E7D32', fill:'#D4F1D4', editable:true,  deletable:true,  ph:'"Ciao" & nome' },
  declare: { label:'Dichiara', shape:'rect-dashed',   color:'#B8860B', fill:'#FFF9C4', editable:true,  deletable:true,  ph:'nome' },
  assign:  { label:'Assegna',  shape:'rect',          color:'#F9A825', fill:'#FFF9C4', editable:true,  deletable:true,  ph:'x = x + 1' },
  if:      { label:'If',       shape:'diamond',       color:'#C2185B', fill:'#FFD9E0', editable:true,  deletable:true,  ph:'x > 5' },
  else:    { label:'Else',     shape:'marker',        color:'#C2185B', fill:'#FFE8EE', editable:false, deletable:true },
  endif:   { label:'EndIf',    shape:'marker',        color:'#C2185B', fill:'#FFE8EE', editable:false, deletable:true },
  for:     { label:'For',      shape:'hex',           color:'#E65100', fill:'#FFE4C4', editable:false, deletable:true },
  while:   { label:'While',    shape:'hex',           color:'#E65100', fill:'#FFE4C4', editable:true,  deletable:true,  ph:'i < 10' },
  dowhile: { label:'Do-While', shape:'hex',           color:'#E65100', fill:'#FFE4C4', editable:true,  deletable:true,  ph:'i < 10' },
  endloop: { label:'End Loop', shape:'marker',        color:'#E65100', fill:'#FFE4C4', editable:false, deletable:true },
  break:   { label:'Break',    shape:'hex',           color:'#E65100', fill:'#FFE4C4', editable:false, deletable:true },
  comment: { label:'Commento', shape:'comment',       color:'#757575', fill:'#EEEEEE', editable:true,  deletable:true,  ph:'// nota...' },
};

const SPEEDS = { 1: 1200, 2: 700, 3: 350, 4: 150, 5: 40 };
const SPEED_NAMES = { 1: 'Lenta', 2: 'Lenta', 3: 'Normale', 4: 'Veloce', 5: 'Turbo' };
const TYPE_DEFAULTS = { Integer: 0, Real: 0.0, String: '', Boolean: false, Character: '\0' };
const VALID_TYPE_RE = /^(Integer|Real|String|Boolean|Character|Int|Float|Double|Bool|Char|Str|Num|Long)$/i;

const VGAP = 55;
const BRANCH_OFFSET = 220;
const MIN_NODE_W = 200;
const MAX_NODE_W = 380;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;

const STR_PRE = '\uE000';
const STR_SUF = '\uE001';

const HANDLE_DB = 'flowlab-handles';
const HANDLE_STORE = 'handles';
const FILE_HANDLE_KEY = 'flowlab-file';

/* ============================================================
   STATO GLOBALE
   ============================================================ */
const state = {
  nodes: [],
  variables: {},
  varDefs: {},
  history: [],
  histIdx: -1,
  running: false,
  paused: false,
  currentIndex: -1,
  totalSteps: 0,
  zoom: 1,
  selectedId: null,
  insertAt: -1,
  insertMode: null,
  speed: 3,
  codeLang: 'c',
  dirty: false,
  currentFileName: 'programma.fl',
  fileHandle: null,
  editingForId: null,
};

/* ============================================================
   DOM
   ============================================================ */
const $ = id => document.getElementById(id);
const canvasEl   = $('canvas');
const canvasWrap = $('canvasWrap');
const nodesEl    = $('nodes');
const linksEl    = $('links');
const overlayEl  = $('overlay');
const varListEl  = $('varList');
const consoleEl  = $('console');
const statusText = $('statusText');
const statusSteps= $('statusSteps');
const pickerEl   = $('picker');
const toastEl    = $('toast');
const varModal   = $('varModal');
const cModal     = $('cModal');
const typeModal  = $('typeModal');
const forModal   = $('forModal');

/* ============================================================
   UTILS
   ============================================================ */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let toastTimer = null;
function toast(msg, ms = 2000) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}
function haptic() {
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
}
function svgClose() {
  return '<svg viewBox="0 0 24 24" class="ico"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';
}
function svgPlus() {
  return '<svg viewBox="0 0 24 24" class="ico"><path d="M11 5 H13 V11 H19 V13 H13 V19 H11 V13 H5 V11 H11 Z" fill="currentColor"/></svg>';
}

function clog(text, cls = 'out') {
  const line = document.createElement('div');
  line.className = 'line ' + cls;
  line.textContent = text;
  consoleEl.appendChild(line);
  while (consoleEl.children.length > APP.maxConsole) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
function cclear() { consoleEl.innerHTML = ''; }

/* ============================================================
   DIRTY FLAG
   ============================================================ */
function updateSaveIndicator() {
  const btn = $('btnSave');
  if (!btn) return;
  btn.classList.toggle('tb-dirty', state.dirty);
  btn.title = state.dirty ? 'Salva (modifiche non salvate)' : 'Salva';
}
function markSaved() {
  state.dirty = false;
  updateSaveIndicator();
}

/* ============================================================
   INDEXEDDB — HANDLE FILE
   ============================================================ */
function openHandleDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveHandleToDB(key, handle) {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}
async function loadHandleFromDB(key) {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}
async function clearHandleFromDB(key) {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

/* ============================================================
   TIPI
   ============================================================ */
function normalizeType(t) {
  if (!t) return null;
  const s = String(t).trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function canonicalType(t) {
  const n = normalizeType(t);
  switch (n) {
    case 'Int': case 'Integer': case 'Long': return 'Integer';
    case 'Float': case 'Double': case 'Real': case 'Num': return 'Real';
    case 'Str': case 'String': return 'String';
    case 'Bool': case 'Boolean': return 'Boolean';
    case 'Char': case 'Character': return 'Character';
    default: return n;
  }
}

/* ============================================================
   ANCHOR TOP PER LINEE ENTRANTI
   ============================================================ */
function anchorTopFor(node, y, h) {
  const def = DEFS[node.type];
  if (!def) return y;
  switch (def.shape) {
    case 'diamond':
    case 'hex':
    case 'parallelogram':
      return y + h * 0.05;
    default:
      return y;
  }
}

/* ============================================================
   FORMATTAZIONE TESTO FOR
   ============================================================ */
function formatForText(node) {
  const d = node.forData;
  if (!d || !d.variable) return 'Configura...';
  const dir = d.direction === 'dec' ? 'downto' : 'to';
  const stepNum = Number(d.step) || 1;
  const stepText = stepNum !== 1 ? ` step ${stepNum}` : '';
  const s = d.start === '' || d.start === undefined ? '0' : d.start;
  const e = d.end === '' || d.end === undefined ? '10' : d.end;
  return `${d.variable} = ${s} ${dir} ${e}${stepText}`;
}

/* ============================================================
   MISURA TESTO
   ============================================================ */
const _mc = document.createElement('canvas').getContext('2d');
function measureTextWidth(text, font) {
  if (!text) return 0;
  _mc.font = font || '13px ui-monospace, monospace';
  const lines = String(text).split('\n');
  let max = 0;
  for (const l of lines) max = Math.max(max, _mc.measureText(l).width);
  return max;
}
function measureNode(node) {
  const def = DEFS[node.type];
  if (!def) return { w: MIN_NODE_W, h: 60 };
  const labelW = measureTextWidth(def.label.toUpperCase(), 'bold 10px system-ui, sans-serif');
  let contentW = 0;
  if (node.type === 'for') {
    contentW = measureTextWidth(formatForText(node), '13px ui-monospace, monospace');
  } else if (def.editable) {
    contentW = measureTextWidth(node.text || def.ph || '', '13px ui-monospace, monospace');
  }
  let padX = 46;
  switch (def.shape) {
    case 'parallelogram': padX = 100; break;
    case 'diamond':       padX = 120; break;
    case 'hex':           padX = 100; break;
  }
  const extraH = node.declareType ? 16 : 0;
  let w = Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, Math.max(labelW, contentW) + padX));
  let h = 56 + extraH;
  if (def.shape === 'diamond') h = 110;
  else if (def.shape === 'oval') h = 52;
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

/* ============================================================
   PARSER / VALUTATORE
   ============================================================ */
function valueLiteral(name) {
  if (!(name in state.variables)) throw new Error('Variabile "' + name + '" non definita');
  const v = state.variables[name].value;
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : '0';
  return JSON.stringify(String(v));
}
function evaluate(src) {
  if (src === undefined || src === null) return undefined;
  let code = String(src).trim();
  if (!code) return undefined;
  code = code.replace(/&([a-zA-Z_]\w*)/g, (m, name) => valueLiteral(name));
  const strings = [];
  code = code.replace(/"((?:[^"\\]|\\.)*)"/g, (m, s) => {
    const u = s.replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '"' ? '"' : c === '\\' ? '\\' : c);
    strings.push(u);
    return STR_PRE + (strings.length - 1) + STR_SUF;
  });
  const BUILTINS = {
    abs:'Math.abs', min:'Math.min', max:'Math.max', sqrt:'Math.sqrt', pow:'Math.pow',
    floor:'Math.floor', ceil:'Math.ceil', round:'Math.round',
    sin:'Math.sin', cos:'Math.cos', tan:'Math.tan',
    log:'Math.log', log2:'Math.log2', log10:'Math.log10', exp:'Math.exp',
    sign:'Math.sign', random:'Math.random', PI:'(Math.PI)', E:'(Math.E)',
    Integer:'Math.trunc', Real:'parseFloat', String:'String', Boolean:'Boolean',
    Length:'(x => x.length)', LengthOf:'(x => x.length)',
  };
  code = code.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (name) => {
    if (name === 'true' || name === 'false' || name === 'null' || name === 'undefined') return name;
    if (name === 'AND' || name === 'OR' || name === 'NOT') return name;
    if (name === 'To' || name === 'Step') return name;
    if (BUILTINS[name]) return BUILTINS[name];
    if (name in state.variables) {
      const v = state.variables[name].value;
      if (typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (v === null || v === undefined) return 'null';
      if (typeof v === 'number') return isFinite(v) ? String(v) : '0';
      return JSON.stringify(String(v));
    }
    throw new Error('Variabile "' + name + '" non definita');
  });
  strings.forEach((s, i) => {
    code = code.split(STR_PRE + i + STR_SUF).join(JSON.stringify(s));
  });
  code = code.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!').replace(/<>/g, '!=');
  try {
    const fn = new Function('"use strict"; return (' + code + ');');
    return fn();
  } catch (e) {
    throw new Error('Errore sintassi in "' + src + '": ' + e.message);
  }
}
function splitOnConcat(src) {
  const parts = [];
  let cur = '', inStr = false, sc = '', depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      cur += c;
      if (c === '\\' && i + 1 < src.length) { cur += src[++i]; continue; }
      if (c === sc) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; sc = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && (c === '+' || c === '&')) {
      if (c === '&' && /[a-zA-Z_]/.test(src[i + 1] || '')) { cur += c; continue; }
      parts.push(cur); cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}
function evaluateOutput(src) {
  if (!src || !src.trim()) return '';
  src = src.trim().replace(/^(output|mostra|print|scrivi|stampa|write)\s+/i, '').trim();
  if (!src) return '';
  const parts = splitOnConcat(src);
  if (parts.length > 1) {
    return parts.map(p => {
      const t = p.trim();
      if (!t) return '';
      const m = t.match(/^"((?:[^"\\]|\\.)*)"$/);
      if (m) return m[1].replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c);
      const v = evaluate(t);
      if (v === undefined || v === null) return '';
      return typeof v === 'string' ? v : String(v);
    }).join('');
  }
  const v = evaluate(src);
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/* ============================================================
   SHAPE SVG
   ============================================================ */
function makeShapeEl(type) {
  const def = DEFS[type];
  if (!def) return null;
  const SHAPES = {
    diamond: '50,3 97,30 50,57 3,30',
    hex: '16,3 84,3 97,30 84,57 16,57 3,30',
    parallelogram: '18,3 97,3 82,57 3,57',
  };
  const pts = SHAPES[def.shape];
  if (!pts) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'node-shape');
  svg.setAttribute('viewBox', '0 0 100 60');
  svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', def.fill || '#ffffff');
  poly.setAttribute('stroke', def.color);
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-linejoin', 'round');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(poly);
  return svg;
}

/* ============================================================
   CREAZIONE NODO
   ============================================================ */
function createNodeEl(node, idx) {
  const def = DEFS[node.type];
  if (!def) return document.createElement('div');
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = node.id;
  el.dataset.type = node.type;
  el.dataset.index = idx;

  const shape = makeShapeEl(node.type);
  if (shape) el.appendChild(shape);

  if (def.shape === 'oval' || def.shape === 'rect' || def.shape === 'rect-dashed' ||
      def.shape === 'comment' || def.shape === 'marker') {
    const box = document.createElement('div');
    box.className = 'node-box';
    el.appendChild(box);
  }

  const body = document.createElement('div');
  body.className = 'node-body';

  const label = document.createElement('span');
  label.className = 'node-label';
  label.textContent = def.label;
  body.appendChild(label);

  if (node.type === 'declare' && node.declareType) {
    const sub = document.createElement('span');
    sub.className = 'node-sublabel';
    sub.textContent = node.declareType;
    sub.title = 'Clicca per cambiare il tipo';
    sub.addEventListener('click', e => {
      e.stopPropagation();
      openTypePicker(node.declareType, (newType) => {
        const n = state.nodes.find(x => x.id === node.id);
        if (!n) return;
        const oldName = (n.text || '').trim();
        n.declareType = newType;
        if (oldName && state.varDefs[oldName]) {
          state.varDefs[oldName].type = newType;
          if (state.variables[oldName]) state.variables[oldName].type = newType;
        }
        renderVars();
        render();
        scheduleSave();
        state.dirty = true; updateSaveIndicator();
        toast('Tipo cambiato in ' + newType);
      });
    });
    body.appendChild(sub);
  }

  if (node.type === 'for') {
    const display = document.createElement('div');
    display.className = 'node-input for-display';
    display.textContent = formatForText(node);
    display.title = 'Clicca per configurare';
    display.addEventListener('click', e => {
      e.stopPropagation();
      openForDialog(node);
    });
    display.addEventListener('mousedown', e => e.stopPropagation());
    display.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    body.appendChild(display);
  } else if (def.editable) {
    const input = document.createElement('input');
    input.className = 'node-input';
    input.type = 'text';
    input.value = node.text || '';
    input.placeholder = def.ph || '';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      const n = state.nodes.find(x => x.id === node.id);
      if (!n) return;
      const oldName = (n.text || '').trim();
      n.text = input.value;
      const newName = input.value.trim();
      if (n.type === 'declare' && n.declareType) {
        if (oldName && oldName !== newName) {
          if (state.varDefs[oldName]) {
            state.varDefs[newName] = state.varDefs[oldName];
            delete state.varDefs[oldName];
          }
          if (state.variables[oldName]) {
            state.variables[newName] = state.variables[oldName];
            delete state.variables[oldName];
          }
        }
        if (newName) {
          state.varDefs[newName] = { type: n.declareType, default: TYPE_DEFAULTS[n.declareType] };
        }
        renderVars();
      }
      requestAnimationFrame(layoutAll);
      scheduleSave();
      state.dirty = true;
      updateSaveIndicator();
    });
    input.addEventListener('mousedown', e => e.stopPropagation());
    input.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    body.appendChild(input);
  }

  el.appendChild(body);

  if (def.deletable) {
    const del = document.createElement('button');
    del.className = 'node-del';
    del.innerHTML = svgClose();
    del.title = 'Elimina';
    del.addEventListener('click', e => { e.stopPropagation(); deleteNode(node.id); });
    el.appendChild(del);
  }

  el.addEventListener('click', e => {
    if (e.target.tagName === 'INPUT' || e.target.closest('.node-del') ||
        e.target.closest('.node-sublabel') || e.target.classList.contains('for-display')) return;
    selectNode(node.id);
  });

  return el;
}

/* ============================================================
   PARSER STRUTTURALE
   ============================================================ */
function parseBlock(nodes, start, end) {
  const items = [];
  let i = start;
  while (i < end) {
    const n = nodes[i];
    if (!n) break;

    if (n.type === 'if') {
      let depth = 0, elseIdx = -1, endifIdx = end;
      for (let j = i + 1; j < end; j++) {
        const t = nodes[j].type;
        if (t === 'if') depth++;
        if (t === 'endif') { if (depth === 0) { endifIdx = j; break; } depth--; }
        if (t === 'else' && depth === 0 && elseIdx === -1) elseIdx = j;
      }
      const trueEnd = elseIdx >= 0 ? elseIdx : endifIdx;
      const falseStart = elseIdx >= 0 ? elseIdx + 1 : endifIdx;
      items.push({
        kind: 'if', node: n, flatIndex: i,
        trueBranch: parseBlock(nodes, i + 1, trueEnd),
        falseBranch: elseIdx >= 0 ? parseBlock(nodes, falseStart, endifIdx) : [],
        hasElse: elseIdx >= 0, endifIndex: endifIdx, elseIndex: elseIdx,
        trueInsertAt: i + 1,
        falseInsertAt: elseIdx >= 0 ? elseIdx + 1 : endifIdx,
      });
      i = endifIdx + 1;
      continue;
    }

    if (n.type === 'for' || n.type === 'while' || n.type === 'dowhile') {
      let depth = 0, endloopIdx = end;
      for (let j = i + 1; j < end; j++) {
        const t = nodes[j].type;
        if (['for','while','dowhile'].includes(t)) depth++;
        if (t === 'endloop') { if (depth === 0) { endloopIdx = j; break; } depth--; }
      }
      items.push({
        kind: 'loop', node: n, flatIndex: i,
        body: parseBlock(nodes, i + 1, endloopIdx),
        endloopIndex: endloopIdx, bodyInsertAt: i + 1,
      });
      i = endloopIdx + 1;
      continue;
    }

    if (n.type === 'else' || n.type === 'endif' || n.type === 'endloop') { i++; continue; }
    items.push({ kind: 'simple', node: n, flatIndex: i });
    i++;
  }
  return items;
}
function firstNodeOf(items) { for (const it of items) if (it.node) return it.node; return null; }

/* ============================================================
   LAYOUT
   ============================================================ */
function buildLayout() {
  const sizes = new Map();
  state.nodes.forEach(n => {
    const s = measureNode(n);
    sizes.set(n.id, s);
    const el = nodesEl.querySelector('.node[data-id="' + n.id + '"]');
    if (el) { el.style.width = s.w + 'px'; el.style.minHeight = s.h + 'px'; }
  });

  const viewportW = canvasWrap.clientWidth || 900;
  const minNeeded = 2 * BRANCH_OFFSET + 240;
  const baseW = Math.max(viewportW, minNeeded);
  const centerX = baseW / 2;

  const positions = new Map();
  const links = [];
  const merges = [];
  const labels = [];
  const plusPts = [];

  function layoutItems(items, cx, startY) {
    let y = startY;
    let lastId = null, lastCX = cx, lastBottomY = startY;

    for (const item of items) {
      if (item.kind === 'simple') {
        const s = sizes.get(item.node.id);
        const x = cx - s.w / 2;
        positions.set(item.node.id, { x, y, w: s.w, h: s.h });
        if (lastId) {
          links.push({
            from: { x: lastCX, y: lastBottomY, id: lastId },
            to:   { x: cx, y: anchorTopFor(item.node, y, s.h), id: item.node.id },
            type: 'normal', corners: [],
            insertAt: item.flatIndex,
          });
          plusPts.push({ x: cx, y: (lastBottomY + y) / 2, insertAt: item.flatIndex });
        }
        lastId = item.node.id;
        lastCX = cx;
        lastBottomY = y + s.h;
        y += s.h + VGAP;
        continue;
      }

      if (item.kind === 'if') {
        const s = sizes.get(item.node.id);
        const ifX = cx - s.w / 2;
        positions.set(item.node.id, { x: ifX, y, w: s.w, h: s.h });
        if (lastId) {
          links.push({
            from: { x: lastCX, y: lastBottomY, id: lastId },
            to:   { x: cx, y: anchorTopFor(item.node, y, s.h), id: item.node.id },
            type: 'normal', corners: [],
            insertAt: item.flatIndex,
          });
          plusPts.push({ x: cx, y: (lastBottomY + y) / 2, insertAt: item.flatIndex });
        }
        const ifCY = y + s.h / 2;
        const ifBottom = y + s.h;
        const branchTopY = ifBottom + VGAP;
        const rightVX = ifX + s.w * 0.97;
        const leftVX  = ifX + s.w * 0.03;
        const trueCX  = cx + BRANCH_OFFSET;
        const falseCX = cx - BRANCH_OFFSET;

        let trueEnd = { bottomY: branchTopY, lastId: null, lastCX: trueCX, lastBottomY: branchTopY };
        if (item.trueBranch.length > 0) {
          const first = firstNodeOf(item.trueBranch);
          if (first) {
            const firstSize = sizes.get(first.id) || { w: MIN_NODE_W, h: 56 };
            links.push({
              from: { x: rightVX, y: ifCY, id: item.node.id },
              to:   { x: trueCX, y: anchorTopFor(first, branchTopY, firstSize.h), id: first.id },
              type: 'true',
              corners: [{ x: trueCX, y: ifCY }],
              insertAt: item.trueInsertAt,
            });
            plusPts.push({ x: trueCX, y: (ifCY + branchTopY) / 2, insertAt: item.trueInsertAt });
          }
          trueEnd = layoutItems(item.trueBranch, trueCX, branchTopY);
        }

        let falseEnd = { bottomY: branchTopY, lastId: null, lastCX: falseCX, lastBottomY: branchTopY };
        if (item.falseBranch.length > 0) {
          const first = firstNodeOf(item.falseBranch);
          if (first) {
            const firstSize = sizes.get(first.id) || { w: MIN_NODE_W, h: 56 };
            links.push({
              from: { x: leftVX, y: ifCY, id: item.node.id },
              to:   { x: falseCX, y: anchorTopFor(first, branchTopY, firstSize.h), id: first.id },
              type: 'false',
              corners: [{ x: falseCX, y: ifCY }],
              insertAt: item.falseInsertAt,
            });
            plusPts.push({ x: falseCX, y: (ifCY + branchTopY) / 2, insertAt: item.falseInsertAt });
          }
          falseEnd = layoutItems(item.falseBranch, falseCX, branchTopY);
        }

        const mergeY = Math.max(trueEnd.bottomY, falseEnd.bottomY, branchTopY) + 20;
        const mergeId = 'merge_' + item.node.id;
        merges.push({ id: mergeId, x: cx, y: mergeY });

        if (trueEnd.lastId) {
          links.push({
            from: { x: trueCX, y: trueEnd.lastBottomY, id: trueEnd.lastId },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'true',
            corners: [{ x: trueCX, y: mergeY }],
            insertAt: item.endifIndex,
          });
        } else {
          links.push({
            from: { x: rightVX, y: ifCY, id: item.node.id },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'true',
            corners: [{ x: trueCX, y: ifCY }, { x: trueCX, y: mergeY }],
            insertAt: item.trueInsertAt,
            insertMode: null,
          });
          plusPts.push({ x: trueCX, y: (ifCY + mergeY) / 2, insertAt: item.trueInsertAt, insertMode: null });
        }

        if (falseEnd.lastId) {
          links.push({
            from: { x: falseCX, y: falseEnd.lastBottomY, id: falseEnd.lastId },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'false',
            corners: [{ x: falseCX, y: mergeY }],
            insertAt: item.falseInsertAt,
          });
        } else {
          const falseMode = item.hasElse ? null : 'false-no-else';
          links.push({
            from: { x: leftVX, y: ifCY, id: item.node.id },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'false',
            corners: [{ x: falseCX, y: ifCY }, { x: falseCX, y: mergeY }],
            insertAt: item.falseInsertAt,
            insertMode: falseMode,
          });
          plusPts.push({ x: falseCX, y: (ifCY + mergeY) / 2, insertAt: item.falseInsertAt, insertMode: falseMode });
        }

        labels.push({ x: rightVX + 38, y: ifCY - 16, text: 'Vero',  type: 'true'  });
        labels.push({ x: leftVX - 38,  y: ifCY - 16, text: 'Falso', type: 'false' });
        lastId = mergeId; lastCX = cx; lastBottomY = mergeY + 10;
        y = mergeY + VGAP + 20;
        continue;
      }

      if (item.kind === 'loop') {
        const s = sizes.get(item.node.id);
        const lX = cx - s.w / 2;
        positions.set(item.node.id, { x: lX, y, w: s.w, h: s.h });
        if (lastId) {
          links.push({
            from: { x: lastCX, y: lastBottomY, id: lastId },
            to:   { x: cx, y: anchorTopFor(item.node, y, s.h), id: item.node.id },
            type: 'normal', corners: [],
            insertAt: item.flatIndex,
          });
          plusPts.push({ x: cx, y: (lastBottomY + y) / 2, insertAt: item.flatIndex });
        }
        const loopCY = y + s.h / 2;
        const loopBottom = y + s.h;
        const bodyTopY = loopBottom + VGAP;
        const bodyCX = cx + BRANCH_OFFSET;
        const rightVX = lX + s.w * 0.97;
        const leftVX = lX + s.w * 0.03;

        let bodyEnd = { bottomY: bodyTopY, lastId: null, lastCX: bodyCX, lastBottomY: bodyTopY };
        if (item.body.length > 0) {
          const first = firstNodeOf(item.body);
          if (first) {
            const firstSize = sizes.get(first.id) || { w: MIN_NODE_W, h: 56 };
            links.push({
              from: { x: rightVX, y: loopCY, id: item.node.id },
              to:   { x: bodyCX, y: anchorTopFor(first, bodyTopY, firstSize.h), id: first.id },
              type: 'loop',
              corners: [{ x: bodyCX, y: loopCY }],
              insertAt: item.bodyInsertAt,
            });
            plusPts.push({ x: bodyCX, y: (loopCY + bodyTopY) / 2, insertAt: item.bodyInsertAt });
          }
          bodyEnd = layoutItems(item.body, bodyCX, bodyTopY);
        }

        const mergeY = Math.max(bodyEnd.bottomY, bodyTopY) + 20;
        const mergeId = 'merge_' + item.node.id;
        merges.push({ id: mergeId, x: cx, y: mergeY });

        if (bodyEnd.lastId) {
          links.push({
            from: { x: bodyCX, y: bodyEnd.lastBottomY, id: bodyEnd.lastId },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'loop',
            corners: [{ x: bodyCX, y: mergeY }],
            insertAt: item.endloopIndex,
          });
        } else {
          links.push({
            from: { x: rightVX, y: loopCY, id: item.node.id },
            to:   { x: cx, y: mergeY, id: mergeId, isMerge: true },
            type: 'loop',
            corners: [{ x: bodyCX, y: loopCY }, { x: bodyCX, y: mergeY }],
            insertAt: item.bodyInsertAt,
          });
          plusPts.push({ x: bodyCX, y: (loopCY + mergeY) / 2, insertAt: item.bodyInsertAt });
        }

        const leftBackX = cx - BRANCH_OFFSET;
        links.push({
          from: { x: cx, y: mergeY, id: mergeId, isMerge: true },
          to:   { x: leftVX, y: loopCY, id: item.node.id },
          type: 'loop', loopBack: true, leftX: leftBackX,
          corners: [{ x: leftBackX, y: mergeY }, { x: leftBackX, y: loopCY }],
        });

        labels.push({ x: rightVX + 38, y: loopCY - 16, text: 'Vero', type: 'loop' });
        labels.push({ x: leftBackX - 30, y: (mergeY + loopCY) / 2, text: 'Loop', type: 'loop' });
        lastId = mergeId; lastCX = cx; lastBottomY = mergeY + 10;
        y = mergeY + VGAP + 20;
        continue;
      }
    }
    return { bottomY: lastBottomY, lastId, lastCX, lastBottomY };
  }

  const tree = parseBlock(state.nodes, 0, state.nodes.length);
  layoutItems(tree, centerX, 40);

  let minX = Infinity, maxX = -Infinity, maxY = 0;
  positions.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  });
  merges.forEach(m => {
    minX = Math.min(minX, m.x - 20);
    maxX = Math.max(maxX, m.x + 20);
    maxY = Math.max(maxY, m.y + 20);
  });
  labels.forEach(lb => {
    minX = Math.min(minX, lb.x - 40);
    maxX = Math.max(maxX, lb.x + 40);
  });

  const totalW = maxX - minX;
  const targetLeft = Math.max(20, (viewportW - totalW) / 2);
  const shiftX = targetLeft - minX;
  if (shiftX !== 0) {
    positions.forEach(p => p.x += shiftX);
    merges.forEach(m => m.x += shiftX);
    links.forEach(l => {
      if (l.from) l.from.x += shiftX;
      if (l.to) l.to.x += shiftX;
      if (l.corners) l.corners.forEach(c => c.x += shiftX);
      if (typeof l.leftX === 'number') l.leftX += shiftX;
    });
    labels.forEach(lb => lb.x += shiftX);
    plusPts.forEach(p => p.x += shiftX);
    minX += shiftX; maxX += shiftX;
  }

  return { positions, links, merges, labels, plusPts, minX, maxX, maxY, centerX: (minX + maxX) / 2 };
}

/* ============================================================
   RENDER LINKS
   ============================================================ */
function renderLinks(layout) {
  linksEl.innerHTML = '';
  overlayEl.innerHTML = '';
  const W = Math.max(layout.maxX + 80, 100);
  const H = Math.max(layout.maxY + 80, 100);
  linksEl.setAttribute('width', W);
  linksEl.setAttribute('height', H);
  linksEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  overlayEl.style.width = W + 'px';
  overlayEl.style.height = H + 'px';

  layout.links.forEach(link => {
    const { from, to, type, corners } = link;
    if (!from || !to) return;
    let d = 'M ' + from.x + ' ' + from.y;
    if (corners && corners.length) for (const c of corners) d += ' L ' + c.x + ' ' + c.y;
    d += ' L ' + to.x + ' ' + to.y;

    const cls = 'link ' + (type === 'true' ? 'true' : type === 'false' ? 'false' : type === 'loop' ? 'loop' : 'normal');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    path.dataset.fromId = from.id || '';
    path.dataset.toId = to.id || '';
    if (typeof link.insertAt === 'number' && link.insertAt >= 0) {
      path.dataset.clickable = '1';
      path.dataset.insertAt = link.insertAt;
      if (link.insertMode) path.dataset.insertMode = link.insertMode;
      path.addEventListener('click', e => {
        e.stopPropagation();
        const at = parseInt(path.dataset.insertAt, 10);
        const mode = path.dataset.insertMode || null;
        requestInsert(at, mode);
      });
    }
    linksEl.appendChild(path);

    let lastPt = from;
    if (corners && corners.length) lastPt = corners[corners.length - 1];
    let dx = to.x - lastPt.x, dy = to.y - lastPt.y;
    if (dx === 0 && dy === 0) { dx = 0; dy = 1; }
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const aLen = 10, aW = 5;
    const bx = to.x - ux * aLen, by = to.y - uy * aLen;

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', to.x + ',' + to.y + ' ' + (bx + px * aW) + ',' + (by + py * aW) + ' ' + (bx - px * aW) + ',' + (by - py * aW));
    let aCls = 'link-arrow';
    if (type === 'true') aCls += ' true';
    else if (type === 'false') aCls += ' false';
    else if (type === 'loop') aCls += ' loop';
    else aCls += ' normal';
    arrow.setAttribute('class', aCls);
    linksEl.appendChild(arrow);
  });

  layout.merges.forEach(m => {
    const c = document.createElement('div');
    c.className = 'merge-circle';
    c.dataset.id = m.id;
    c.style.left = m.x + 'px';
    c.style.top = m.y + 'px';
    overlayEl.appendChild(c);
  });
  layout.labels.forEach(l => {
    const el = document.createElement('div');
    el.className = 'branch-label ' + l.type;
    el.textContent = l.text;
    el.style.left = l.x + 'px';
    el.style.top = l.y + 'px';
    overlayEl.appendChild(el);
  });
  layout.plusPts.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'plus-area';
    wrap.style.left = p.x + 'px';
    wrap.style.top = p.y + 'px';
    const btn = document.createElement('button');
    btn.className = 'plus';
    btn.innerHTML = svgPlus();
    btn.title = 'Aggiungi blocco qui';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      requestInsert(p.insertAt, p.insertMode || null);
    });
    wrap.appendChild(btn);
    overlayEl.appendChild(wrap);
  });
}

/* ============================================================
   LAYOUT ALL
   ============================================================ */
function layoutAll() {
  const layout = buildLayout();
  layout.positions.forEach((p, id) => {
    const el = nodesEl.querySelector('.node[data-id="' + id + '"]');
    if (el) {
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      el.style.width = p.w + 'px';
      el.style.minHeight = p.h + 'px';
    }
  });
  const totalH = layout.maxY + 100;
  const totalW = layout.maxX + 100;
  nodesEl.style.height = totalH + 'px';
  nodesEl.style.width = totalW + 'px';
  renderLinks(layout);
}

function render() {
  nodesEl.innerHTML = '';
  state.nodes.forEach((n, i) => {
    if (n.type === 'else' || n.type === 'endif' || n.type === 'endloop') return;
    nodesEl.appendChild(createNodeEl(n, i));
  });
  void nodesEl.offsetHeight;
  layoutAll();
  requestAnimationFrame(() => { layoutAll(); setTimeout(layoutAll, 80); });
}

/* ============================================================
   POPUP TIPO VARIABILE
   ============================================================ */
function openTypePicker(currentType, onConfirm) {
  typeModal.hidden = false;
  typeModal.querySelectorAll('.type-btn').forEach(b => {
    b.style.borderColor = (b.dataset.type === currentType) ? 'var(--accent)' : '';
    b.style.background  = (b.dataset.type === currentType) ? 'var(--bg-soft)' : '';
  });
  const handler = (e) => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    const chosen = btn.dataset.type;
    close();
    onConfirm(chosen);
  };
  const close = () => {
    typeModal.hidden = true;
    typeModal.removeEventListener('click', handler);
  };
  typeModal.addEventListener('click', handler);
  typeModal._close = close;
}
function closeTypePicker() {
  if (typeModal._close) typeModal._close();
  else typeModal.hidden = true;
}

/* ============================================================
   POPUP FOR
   ============================================================ */
function openForDialog(node) {
  state.editingForId = node.id;
  const d = node.forData || {};
  $('forVar').value = d.variable || '';
  $('forStart').value = d.start !== undefined && d.start !== '' ? d.start : '0';
  $('forEnd').value = d.end !== undefined && d.end !== '' ? d.end : '10';
  $('forStep').value = d.step !== undefined && d.step !== '' ? d.step : '1';
  const dir = d.direction || 'inc';
  forModal.querySelectorAll('input[name="forDirection"]').forEach(r => {
    r.checked = (r.value === dir);
  });
  forModal.hidden = false;
  setTimeout(() => $('forVar').focus(), 80);
}
function closeForDialog() {
  forModal.hidden = true;
  state.editingForId = null;
}
function confirmForDialog() {
  const id = state.editingForId;
  if (!id) { closeForDialog(); return; }
  const node = state.nodes.find(n => n.id === id);
  if (!node) { closeForDialog(); return; }
  const variable = $('forVar').value.trim();
  if (!variable) { toast('Inserisci il nome della variabile'); return; }
  if (!/^[a-zA-Z_]\w*$/.test(variable)) { toast('Nome variabile non valido'); return; }
  const dir = forModal.querySelector('input[name="forDirection"]:checked');
  const direction = dir ? dir.value : 'inc';
  const step = String(Math.max(1, parseInt($('forStep').value, 10) || 1));
  node.forData = {
    variable: variable,
    start: $('forStart').value.trim() || '0',
    end: $('forEnd').value.trim() || '10',
    direction: direction,
    step: step,
  };
  state.varDefs[variable] = state.varDefs[variable] || { type: 'Integer', default: 0 };
  renderVars();
  render();
  pushHistory();
  scheduleSave();
  state.dirty = true; updateSaveIndicator();
  closeForDialog();
  toast('For configurato');
}

/* ============================================================
   INSERIMENTO
   ============================================================ */
function requestInsert(atIndex, mode) {
  state.insertAt = atIndex;
  state.insertMode = mode || null;
  pickerEl.hidden = false;
}

/* ============================================================
   GESTIONE NODI
   ============================================================ */
function addNode(type, atIndex, opts) {
  opts = opts || {};
  const def = DEFS[type];
  if (!def) { toast('Tipo sconosciuto'); return; }
  if (atIndex === undefined || atIndex === null || atIndex < 0) atIndex = state.nodes.length - 1;
  atIndex = Math.max(1, Math.min(state.nodes.length - 1, atIndex));

  if (opts.mode === 'false-no-else') {
    state.nodes.splice(atIndex, 0, { id: uid(), type: 'else', text: '' });
    atIndex = atIndex + 1;
  }

  const node = { id: uid(), type, text: '' };
  if (opts.declareType) node.declareType = opts.declareType;
  if (type === 'for') node.forData = { variable: '', start: '0', end: '10', direction: 'inc', step: '1' };
  state.nodes.splice(atIndex, 0, node);

  if (type === 'if') {
    state.nodes.splice(atIndex + 1, 0, { id: uid(), type: 'endif', text: '' });
  } else if (type === 'for' || type === 'while' || type === 'dowhile') {
    state.nodes.splice(atIndex + 1, 0, { id: uid(), type: 'endloop', text: '' });
  } else if (type === 'else') {
    let hasEndif = false;
    for (let j = atIndex + 1; j < state.nodes.length; j++) {
      if (state.nodes[j].type === 'endif') { hasEndif = true; break; }
      if (state.nodes[j].type === 'if') break;
    }
    if (!hasEndif) state.nodes.splice(atIndex + 1, 0, { id: uid(), type: 'endif', text: '' });
  }

  pushHistory();
  render();
  scheduleSave();
  toast(def.label + ' aggiunto');

  if (type === 'for') {
    setTimeout(() => openForDialog(node), 200);
  }
}

function deleteNode(id) {
  const i = state.nodes.findIndex(n => n.id === id);
  if (i === -1) return;
  const n = state.nodes[i];
  if (!DEFS[n.type].deletable) { toast('Blocco non eliminabile'); return; }

  if (n.type === 'if') {
    let depth = 0;
    for (let j = i + 1; j < state.nodes.length; j++) {
      const t = state.nodes[j].type;
      if (t === 'if') depth++;
      if (t === 'endif') { if (depth === 0) { state.nodes.splice(j, 1); break; } depth--; }
    }
  }
  if (n.type === 'for' || n.type === 'while' || n.type === 'dowhile') {
    let depth = 0;
    for (let j = i + 1; j < state.nodes.length; j++) {
      const t = state.nodes[j].type;
      if (['for','while','dowhile'].includes(t)) depth++;
      if (t === 'endloop') { if (depth === 0) { state.nodes.splice(j, 1); break; } depth--; }
    }
  }

  if (n.type === 'declare') {
    const vn = (n.text || '').trim();
    if (vn) {
      delete state.varDefs[vn];
      delete state.variables[vn];
      renderVars();
    }
  }

  const idxNow = state.nodes.findIndex(x => x.id === id);
  if (idxNow !== -1) state.nodes.splice(idxNow, 1);
  pushHistory();
  render();
  scheduleSave();
}

function selectNode(id) {
  state.selectedId = id;
  nodesEl.querySelectorAll('.node').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
}

function ensureStartEnd() {
  const start = state.nodes.find(n => n.type === 'start');
  const end = state.nodes.find(n => n.type === 'end');
  const mid = state.nodes.filter(n => n.type !== 'start' && n.type !== 'end');
  const s = start || { id: uid(), type: 'start', text: '' };
  const e = end || { id: uid(), type: 'end', text: '' };
  state.nodes = [s].concat(mid).concat([e]);
}

/* ============================================================
   VARIABILI
   ============================================================ */
function setVar(name, value, type) {
  const t = type || (state.varDefs[name] && state.varDefs[name].type) || inferType(value);
  state.variables[name] = { value, type: t };
  if (!state.varDefs[name]) state.varDefs[name] = { type: t, default: value };
  renderVars();
}
function inferType(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? 'Integer' : 'Real';
  if (typeof v === 'boolean') return 'Boolean';
  if (typeof v === 'string') return v.length === 1 ? 'Character' : 'String';
  return 'String';
}
function resetVars() {
  state.variables = {};
  for (const name in state.varDefs) {
    const def = state.varDefs[name];
    const dv = def.default !== undefined ? def.default : (TYPE_DEFAULTS[def.type] !== undefined ? TYPE_DEFAULTS[def.type] : 0);
    state.variables[name] = { value: dv, type: def.type };
  }
  renderVars();
}
function renderVars() {
  const names = Object.keys(state.variables).sort();
  if (names.length === 0) { varListEl.innerHTML = '<p class="empty">Nessuna variabile</p>'; return; }
  varListEl.innerHTML = names.map(n => {
    const v = state.variables[n];
    let val;
    if (typeof v.value === 'string') val = '"' + v.value + '"';
    else if (typeof v.value === 'boolean') val = v.value ? 'true' : 'false';
    else val = String(v.value);
    return '<div class="var-row" data-name="' + esc(n) + '">'
      + '<span class="vn">' + esc(n) + '</span>'
      + '<span class="vt">' + (v.type || '?') + '</span>'
      + '<span class="vv">' + esc(val) + '</span>'
      + '<button class="vd" data-del="' + esc(n) + '" title="Elimina">' + svgClose() + '</button>'
      + '</div>';
  }).join('');
  varListEl.querySelectorAll('.vd').forEach(b => {
    b.addEventListener('click', function() {
      const n = b.dataset.del;
      delete state.variables[n];
      delete state.varDefs[n];
      renderVars();
      scheduleSave();
      state.dirty = true; updateSaveIndicator();
    });
  });
}

/* ============================================================
   INPUT UTENTE
   ============================================================ */
function requestInput(prompt) {
  return new Promise(resolve => {
    clog(prompt, 'in');
    const row = document.createElement('div');
    row.style.cssText = 'padding:4px 0;display:flex;gap:6px;align-items:center;';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Risposta...';
    inp.style.cssText = 'flex:1;min-width:0;padding:6px 8px;border:1px solid #2563eb;border-radius:4px;font-family:inherit;font-size:14px;outline:none;box-sizing:border-box;';
    const ok = document.createElement('button');
    ok.textContent = '↵';
    ok.style.cssText = 'padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:700;min-height:36px;';
    row.appendChild(inp);
    row.appendChild(ok);
    consoleEl.appendChild(row);
    consoleEl.scrollTop = consoleEl.scrollHeight;
    setTimeout(() => inp.focus(), 50);

    const finish = () => {
      const raw = inp.value;
      const num = Number(raw);
      const v = (raw.trim() !== '' && !isNaN(num)) ? num : raw;
      clog('> ' + raw, 'out');
      row.remove();
      resolve(v);
    };
    ok.addEventListener('click', finish);
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
    });
  });
}

/* ============================================================
   HIGHLIGHT
   ============================================================ */
function highlight(id, cls) {
  cls = cls || 'running';
  nodesEl.querySelectorAll('.node').forEach(el => el.classList.remove('running', 'error'));
  linksEl.querySelectorAll('.link').forEach(p => p.classList.remove('active'));
  overlayEl.querySelectorAll('.merge-circle').forEach(c => c.classList.remove('active'));
  if (!id) return;

  if (id.indexOf('merge_') === 0) {
    const mc = overlayEl.querySelector('.merge-circle[data-id="' + id + '"]');
    if (mc) mc.classList.add('active');
    return;
  }

  const el = nodesEl.querySelector('.node[data-id="' + id + '"]');
  if (el) {
    el.classList.add(cls);
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    linksEl.querySelectorAll('.link[data-to-id="' + id + '"]').forEach(l => l.classList.add('active'));
  }
}

/* ============================================================
   COERCIZIONE
   ============================================================ */
function coerceValue(v, type) {
  if (type === 'Integer') {
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'string') return parseInt(v, 10) || 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  }
  if (type === 'Real') {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  }
  if (type === 'String') {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return '';
    return String(v);
  }
  if (type === 'Boolean') {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return /^(true|1|sì|si|yes)$/i.test(v);
    return Boolean(v);
  }
  if (type === 'Character') {
    const s = String(v);
    return s.length > 0 ? s[0] : '\0';
  }
  return v;
}

/* ============================================================
   ESECUZIONE SEMPLICE
   ============================================================ */
async function execSimple(node) {
  const text = (node.text || '').trim();
  switch (node.type) {
    case 'start': clog('START', 'info'); return 'ok';
    case 'end': clog('END', 'info'); return 'stop';
    case 'comment':
      if (text) clog(text.startsWith('//') ? text : '// ' + text, 'step');
      return 'ok';

    case 'input': {
      const m = text.match(/^&?([a-zA-Z_]\w*)(?:\[(.+?)\])?$/);
      if (!m) throw new Error('Input: usa "Input nome" (' + text + ')');
      const name = m[1], idxExpr = m[2];
      const prompt = 'Inserisci ' + name + (idxExpr ? '[' + idxExpr + ']' : '') + ':';
      const raw = await requestInput(prompt);
      if (idxExpr) {
        const arr = state.variables[name];
        if (!arr || !Array.isArray(arr.value)) throw new Error('Array "' + name + '" non definito');
        const i = Number(evaluate(idxExpr));
        if (!Number.isInteger(i) || i < 0 || i >= arr.value.length) throw new Error('Indice array fuori range');
        const baseType = arr.type.replace(/\[\]$/, '');
        arr.value[i] = coerceValue(raw, baseType);
        renderVars();
      } else {
        const t = state.varDefs[name] && state.varDefs[name].type;
        const v = coerceValue(raw, t);
        setVar(name, v, t);
      }
      return 'ok';
    }

    case 'output': {
      clog(evaluateOutput(text), 'out');
      return 'ok';
    }

    case 'declare': {
      if (node.declareType && text && /^[a-zA-Z_]\w*$/.test(text)) {
        const type = node.declareType;
        const name = text;
        const v = TYPE_DEFAULTS[type];
        state.varDefs[name] = { type, default: v };
        state.variables[name] = { value: v, type };
        renderVars();
        clog(type + ' ' + name, 'step');
        return 'ok';
      }
      const arrM = text.match(/^([a-zA-Z]+)\s+([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]\s*$/);
      if (arrM && VALID_TYPE_RE.test(arrM[1])) {
        const type = canonicalType(arrM[1]);
        const name = arrM[2];
        const size = parseInt(arrM[3], 10);
        const arr = new Array(size).fill(TYPE_DEFAULTS[type]);
        state.varDefs[name] = { type: type + '[]', default: arr.slice() };
        state.variables[name] = { value: arr, type: type + '[]' };
        renderVars();
        clog(type + ' ' + name + '[' + size + ']', 'step');
        return 'ok';
      }
      const m = text.match(/^([a-zA-Z]+)\s+&?([a-zA-Z_]\w*)(?:\s*=\s*(.+))?$/);
      if (!m || !VALID_TYPE_RE.test(m[1])) {
        throw new Error('Dichiara: usa "Integer x = 5" oppure seleziona il tipo dal popup');
      }
      const type = canonicalType(m[1]);
      const name = m[2];
      const expr = m[3];
      let v = expr !== undefined ? evaluate(expr) : TYPE_DEFAULTS[type];
      v = coerceValue(v, type);
      state.varDefs[name] = { type, default: v };
      state.variables[name] = { value: v, type };
      renderVars();
      clog(type + ' ' + name + ' = ' + JSON.stringify(v), 'step');
      return 'ok';
    }

    case 'assign': {
      if (!text) return 'ok';
      const inc = text.match(/^&?([a-zA-Z_]\w*)\s*(\+\+|--)$/);
      if (inc) {
        const name = inc[1], op = inc[2];
        if (!(name in state.variables)) throw new Error('Variabile "' + name + '" non definita');
        const cur = state.variables[name].value;
        const nv = op === '++' ? cur + 1 : cur - 1;
        setVar(name, nv);
        clog(name + ' ' + op + ' → ' + nv, 'step');
        return 'ok';
      }
      const arrM = text.match(/^&?([a-zA-Z_]\w*)\s*\[(.+?)\]\s*=\s*(.+)$/);
      if (arrM) {
        const name = arrM[1], idxExpr = arrM[2], expr = arrM[3];
        const arr = state.variables[name];
        if (!arr || !Array.isArray(arr.value)) throw new Error('Array "' + name + '" non definito');
        const i = Number(evaluate(idxExpr));
        if (!Number.isInteger(i) || i < 0 || i >= arr.value.length) throw new Error('Indice array fuori range');
        const v = evaluate(expr);
        const baseType = arr.type.replace(/\[\]$/, '');
        arr.value[i] = coerceValue(v, baseType);
        renderVars();
        clog(name + '[' + i + '] = ' + JSON.stringify(arr.value[i]), 'step');
        return 'ok';
      }
      const m = text.match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+)$/);
      if (!m) throw new Error('Assegna: usa "x = 5"');
      const name = m[1], expr = m[2];
      const v = evaluate(expr);
      const t = state.varDefs[name] && state.varDefs[name].type;
      setVar(name, v, t);
      clog(name + ' = ' + JSON.stringify(state.variables[name]?.value ?? v), 'step');
      return 'ok';
    }

    case 'break': clog('Break', 'warn'); return 'break';
    default: return 'ok';
  }
}

/* ============================================================
   ESECUZIONE BLOCCO (albero)
   ============================================================ */
async function executeBlock(items, ctx) {
  for (let i = 0; i < items.length; i++) {
    if (!state.running) return 'stop';
    if (state.paused) { await sleep(80); i--; continue; }

    const item = items[i];
    state.totalSteps++;
    statusSteps.textContent = state.totalSteps + ' step';

    if (item.kind === 'simple') {
      highlight(item.node.id);
      const res = await execSimple(item.node);
      if (res === 'stop') return 'stop';
      if (res === 'break') return 'break';
      await sleep(SPEEDS[state.speed] || 350);
      continue;
    }

    if (item.kind === 'if') {
      highlight(item.node.id);
      const condText = (item.node.text || '').trim();
      const cond = condText ? Boolean(evaluate(condText)) : false;
      clog('If (' + condText + ') → ' + (cond ? 'Vero' : 'Falso'), 'info');
      await sleep(SPEEDS[state.speed] || 350);

      const branch = cond ? item.trueBranch : item.falseBranch;
      if (branch.length > 0) {
        const res = await executeBlock(branch, ctx);
        if (res === 'stop') return 'stop';
      }
      highlight('merge_' + item.node.id);
      await sleep(SPEEDS[state.speed] / 2 || 200);
      continue;
    }

    if (item.kind === 'loop') {
      const loopNode = item.node;

      if (loopNode.type === 'for') {
        let name, start, end, step;
        const fd = loopNode.forData;
        if (fd && fd.variable) {
          name = fd.variable;
          start = Number(evaluate(fd.start));
          end = Number(evaluate(fd.end));
          const stepAbs = Math.abs(Number(fd.step) || 1);
          step = fd.direction === 'dec' ? -stepAbs : stepAbs;
        } else {
          const m = (loopNode.text || '').match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(.+))?$/i);
          if (!m) throw new Error('For non configurato (clicca il blocco per configurarlo)');
          name = m[1];
          start = Number(evaluate(m[2]));
          end = Number(evaluate(m[3]));
          step = m[4] !== undefined ? Number(evaluate(m[4])) : (start <= end ? 1 : -1);
        }
        state.varDefs[name] = state.varDefs[name] || { type: 'Integer', default: 0 };
        state.variables[name] = { value: start, type: 'Integer' };
        renderVars();

        let iter = 0;
        while (state.running) {
          if (++iter > 10000) throw new Error('Loop infinito (For)');
          const cur = state.variables[name].value;
          const cont = step > 0 ? cur <= end : cur >= end;
          highlight(loopNode.id);
          clog('For ' + name + ' = ' + cur + ' → ' + end + ' [' + (step > 0 ? '+' : '') + step + '] ' + (cont ? 'Vero' : 'Falso'), 'info');
          await sleep(SPEEDS[state.speed] || 350);
          if (!cont) break;

          if (item.body.length > 0) {
            const res = await executeBlock(item.body, ctx);
            if (res === 'stop') return 'stop';
            if (res === 'break') break;
          }
          state.variables[name].value += step;
          renderVars();
          highlight('merge_' + loopNode.id);
          await sleep(SPEEDS[state.speed] / 3 || 150);
        }
        continue;
      }

      if (loopNode.type === 'while') {
        let iter = 0;
        while (state.running) {
          if (++iter > 10000) throw new Error('Loop infinito (While)');
          highlight(loopNode.id);
          const cond = Boolean(evaluate(loopNode.text || ''));
          clog('While (' + loopNode.text + ') → ' + (cond ? 'Vero' : 'Falso'), 'info');
          await sleep(SPEEDS[state.speed] || 350);
          if (!cond) break;

          if (item.body.length > 0) {
            const res = await executeBlock(item.body, ctx);
            if (res === 'stop') return 'stop';
            if (res === 'break') break;
          }
          highlight('merge_' + loopNode.id);
          await sleep(SPEEDS[state.speed] / 3 || 150);
        }
        continue;
      }

      if (loopNode.type === 'dowhile') {
        let iter = 0;
        while (state.running) {
          if (++iter > 10000) throw new Error('Loop infinito (Do-While)');
          if (item.body.length > 0) {
            const res = await executeBlock(item.body, ctx);
            if (res === 'stop') return 'stop';
            if (res === 'break') break;
          }
          highlight(loopNode.id);
          const cond = Boolean(evaluate(loopNode.text || ''));
          clog('Do-While (' + loopNode.text + ') → ' + (cond ? 'Vero' : 'Falso'), 'info');
          await sleep(SPEEDS[state.speed] || 350);
          if (!cond) break;
          highlight('merge_' + loopNode.id);
          await sleep(SPEEDS[state.speed] / 3 || 150);
        }
        continue;
      }
    }
  }
  return 'ok';
}

/* ============================================================
   RUN ALL
   ============================================================ */
async function runAll() {
  if (state.running) return;
  const start = state.nodes.find(n => n.type === 'start');
  if (!start) { toast('Nessun blocco Start'); return; }

  state.running = true;
  state.paused = false;
  state.totalSteps = 0;
  toggleRunUI(true);
  cclear();
  resetVars();
  clog('Avvio esecuzione', 'info');

  try {
    const tree = parseBlock(state.nodes, 0, state.nodes.length);
    await executeBlock(tree, {});
    clog('Programma terminato', 'info');
  } catch (err) {
    clog('ERRORE: ' + err.message, 'err');
    toast('Errore: ' + err.message, 3500);
  } finally {
    state.running = false;
    state.paused = false;
    toggleRunUI(false);
    highlight(null);
    statusText.textContent = 'Terminato';
    statusSteps.textContent = state.totalSteps + ' step';
  }
}

/* ============================================================
   STEP ONCE
   ============================================================ */
async function stepOnce() {
  if (!state.running) {
    state.running = true;
    state.paused = true;
    state.currentIndex = -1;
    state.totalSteps = 0;
    toggleRunUI(true);
    cclear();
    resetVars();
    clog('Passo-passo', 'info');
  }

  const next = state.currentIndex + 1;
  if (next >= state.nodes.length) {
    clog('Fine', 'info');
    state.running = false;
    toggleRunUI(false);
    return;
  }

  const node = state.nodes[next];
  state.currentIndex = next;
  highlight(node.id);

  try {
    const res = await execSimple(node);
    state.totalSteps++;
    statusSteps.textContent = state.totalSteps + ' step';
    if (res === 'stop') {
      state.running = false;
      toggleRunUI(false);
      highlight(null);
    }
  } catch (err) {
    clog('ERRORE: ' + err.message, 'err');
    const el = nodesEl.querySelector('.node[data-id="' + node.id + '"]');
    if (el) el.classList.add('error');
  }
}

function toggleRunUI(running) {
  $('btnRun').disabled = running;
  $('btnStep').disabled = running;
  $('btnStop').disabled = !running;
  const mtab = $('mtabRun');
  if (mtab) mtab.disabled = running;
}

/* ============================================================
   HISTORY
   ============================================================ */
function snapshot() { return clone({ nodes: state.nodes, varDefs: state.varDefs }); }
function pushHistory() {
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push(snapshot());
  state.histIdx = state.history.length - 1;
  if (state.history.length > 60) { state.history.shift(); state.histIdx--; }
  state.dirty = true;
  updateSaveIndicator();
}
function undo() {
  if (state.histIdx <= 0) { toast('Niente da annullare'); return; }
  state.histIdx--;
  const s = state.history[state.histIdx];
  state.nodes = clone(s.nodes);
  state.varDefs = clone(s.varDefs);
  ensureStartEnd();
  render(); resetVars();
  state.dirty = true; updateSaveIndicator();
  toast('Annullato');
}
function redo() {
  if (state.histIdx >= state.history.length - 1) { toast('Niente da ripetere'); return; }
  state.histIdx++;
  const s = state.history[state.histIdx];
  state.nodes = clone(s.nodes);
  state.varDefs = clone(s.varDefs);
  ensureStartEnd();
  render(); resetVars();
  state.dirty = true; updateSaveIndicator();
  toast('Ripetuto');
}

/* ============================================================
   SALVA / CARICA
   ============================================================ */
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAuto, 500);
}
function getProjectData() {
  return {
    app: APP.name,
    format: 'flowlab',
    version: APP.version,
    savedAt: new Date().toISOString(),
    nodes: state.nodes,
    varDefs: state.varDefs,
  };
}
function saveAuto() {
  try { localStorage.setItem(APP.storageKey, JSON.stringify(getProjectData())); } catch (e) {}
}
function loadAuto() {
  try {
    const raw = localStorage.getItem(APP.storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.nodes)) return false;
    state.nodes = data.nodes;
    state.varDefs = data.varDefs || {};
    ensureStartEnd();
    state.variables = {};
    for (const name in state.varDefs) {
      const d = state.varDefs[name];
      state.variables[name] = {
        value: d.default !== undefined ? d.default : (TYPE_DEFAULTS[d.type] !== undefined ? TYPE_DEFAULTS[d.type] : 0),
        type: d.type,
      };
    }
    return true;
  } catch (e) { return false; }
}

async function saveToFile() {
  const text = JSON.stringify(getProjectData(), null, 2);
  const fileName = state.currentFileName || 'programma.fl';

  if (state.fileHandle) {
    try {
      const perm = await state.fileHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted' || (await state.fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
        const w = await state.fileHandle.createWritable();
        await w.write(text);
        await w.close();
        state.currentFileName = state.fileHandle.name;
        markSaved();
        toast('Salvato: ' + state.fileHandle.name);
        return;
      }
    } catch (e) { console.warn('Save with memory handle failed:', e); }
    state.fileHandle = null;
  }

  const stored = await loadHandleFromDB(FILE_HANDLE_KEY);
  if (stored) {
    try {
      const perm = await stored.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted' || (await stored.requestPermission({ mode: 'readwrite' })) === 'granted') {
        const w = await stored.createWritable();
        await w.write(text);
        await w.close();
        state.fileHandle = stored;
        state.currentFileName = stored.name;
        markSaved();
        toast('Salvato: ' + stored.name);
        return;
      }
    } catch (e) { console.warn('Save with DB handle failed:', e); }
  }

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'FlowLab', accept: { 'application/json': ['.fl'] } }],
      });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      state.fileHandle = handle;
      state.currentFileName = handle.name || fileName;
      await saveHandleToDB(FILE_HANDLE_KEY, handle);
      markSaved();
      toast('Salvato: ' + state.currentFileName);
      return;
    } catch (err) { if (err.name === 'AbortError') return; }
  }

  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  markSaved();
  toast('Progetto scaricato come ' + fileName);
}

async function loadFromFile() {
  if (window.showOpenFilePicker) {
    try {
      const arr = await window.showOpenFilePicker({
        types: [{ description: 'FlowLab', accept: { 'application/json': ['.fl'] } }],
        multiple: false,
      });
      const handle = arr[0];
      const f = await handle.getFile();
      parseProject(await f.text(), f.name);
      state.fileHandle = handle;
      state.currentFileName = f.name;
      await saveHandleToDB(FILE_HANDLE_KEY, handle);
      return;
    } catch (err) { if (err.name === 'AbortError') return; }
  }
  $('fileInput').click();
}

function parseProject(text, filename) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.nodes)) throw new Error('Formato non valido');
    state.nodes = data.nodes;
    state.varDefs = data.varDefs || {};
    ensureStartEnd();
    render(); resetVars(); pushHistory(); saveAuto();
    markSaved();
    toast('Caricato' + (filename ? ': ' + filename : ''));
  } catch (e) { toast('Errore: ' + e.message, 3500); }
}

/* ============================================================
   NUOVO PROGETTO
   ============================================================ */
function doNewProject() {
  state.nodes = [
    { id: uid(), type: 'start', text: '' },
    { id: uid(), type: 'end', text: '' },
  ];
  state.varDefs = {};
  state.variables = {};
  state.history = [];
  state.histIdx = -1;
  state.currentFileName = 'programma.fl';
  state.fileHandle = null;
  clearHandleFromDB(FILE_HANDLE_KEY);
  state.dirty = false;
  render();
  renderVars();
  state.history = [snapshot()];
  state.histIdx = 0;
  saveAuto();
  updateSaveIndicator();
  statusText.textContent = 'Pronto';
  statusSteps.textContent = '0 step';
  toast('Nuovo progetto creato');
}
async function newProject() {
  if (state.dirty) {
    const answer = confirm('Ci sono modifiche non salvate.\n\nOK = Salva e crea nuovo\nAnnulla = Esci senza salvare');
    if (answer) {
      try { await saveToFile(); }
      catch (e) { toast('Errore salvataggio: ' + e.message); return; }
    }
  }
  doNewProject();
}

/* ============================================================
   EXPORT PNG
   ============================================================ */
function exportPNG() {
  const layout = buildLayout();
  if (state.nodes.length === 0) { toast('Niente da esportare'); return; }
  const SCALE = 2, PAD = 60;
  const minX = layout.minX - PAD, maxX = layout.maxX + PAD;
  const minY = 0, maxY = layout.maxY + PAD;
  const W = (maxX - minX) * SCALE, H = (maxY - minY) * SCALE;
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.scale(SCALE, SCALE); ctx.translate(-minX, -minY);

  layout.links.forEach(link => {
    const { from, to, type, corners } = link;
    if (!from || !to) return;
    let stroke = '#64748b';
    if (type === 'true') stroke = '#16a34a';
    else if (type === 'false') stroke = '#dc2626';
    else if (type === 'loop') stroke = '#db2777';
    ctx.strokeStyle = stroke; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    if (corners) for (const c of corners) ctx.lineTo(c.x, c.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    let lastPt = from;
    if (corners && corners.length) lastPt = corners[corners.length - 1];
    let dx = to.x - lastPt.x, dy = to.y - lastPt.y;
    if (dx === 0 && dy === 0) { dx = 0; dy = 1; }
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const aLen = 10, aW = 5;
    const bx = to.x - ux * aLen, by = to.y - uy * aLen;
    ctx.fillStyle = stroke;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(bx + px * aW, by + py * aW);
    ctx.lineTo(bx - px * aW, by - py * aW);
    ctx.closePath(); ctx.fill();
  });

  layout.merges.forEach(m => {
    ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke();
  });

  layout.positions.forEach((p, id) => {
    const n = state.nodes.find(x => x.id === id);
    if (!n) return;
    const def = DEFS[n.type];
    const { x, y, w, h } = p;
    ctx.strokeStyle = def.color; ctx.fillStyle = def.fill || '#fff';
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (def.shape) {
      case 'oval': ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI * 2); break;
      case 'diamond': ctx.moveTo(x + w*0.5, y + h*0.05); ctx.lineTo(x + w*0.97, y + h*0.5); ctx.lineTo(x + w*0.5, y + h*0.95); ctx.lineTo(x + w*0.03, y + h*0.5); ctx.closePath(); break;
      case 'hex': ctx.moveTo(x + w*0.16, y + h*0.05); ctx.lineTo(x + w*0.84, y + h*0.05); ctx.lineTo(x + w*0.97, y + h*0.5); ctx.lineTo(x + w*0.84, y + h*0.95); ctx.lineTo(x + w*0.16, y + h*0.95); ctx.lineTo(x + w*0.03, y + h*0.5); ctx.closePath(); break;
      case 'parallelogram': ctx.moveTo(x + w*0.18, y + h*0.05); ctx.lineTo(x + w*0.97, y + h*0.05); ctx.lineTo(x + w*0.82, y + h*0.95); ctx.lineTo(x + w*0.03, y + h*0.95); ctx.closePath(); break;
      case 'rect-dashed': ctx.setLineDash([6, 4]); ctx.rect(x, y, w, h); break;
      default: ctx.rect(x, y, w, h);
    }
    ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    if (n.type === 'declare') { ctx.beginPath(); ctx.moveTo(x + 14, y); ctx.lineTo(x + 14, y + h); ctx.stroke(); }
    ctx.fillStyle = def.color;
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.label.toUpperCase(), x + w/2 + (n.type === 'declare' ? 7 : 0), y + 14);
    if (n.type === 'declare' && n.declareType) {
      ctx.fillStyle = '#B8860B';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.fillText(n.declareType, x + w/2 + 7, y + 28);
    }
    let txt = '';
    if (n.type === 'for') txt = formatForText(n);
    else if (n.text) txt = n.text;
    if (txt) {
      ctx.fillStyle = '#1f2937';
      ctx.font = '13px ui-monospace, monospace';
      const offY = (n.type === 'declare' && n.declareType) ? 12 : 8;
      ctx.fillText(txt, x + w/2 + (n.type === 'declare' ? 7 : 0), y + h/2 + offY);
    }
  });

  ctx.restore();
  cvs.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'flowlab-' + Date.now() + '.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('PNG esportato');
  }, 'image/png');
}

/* ============================================================
   GENERAZIONE CODICE C
   ============================================================ */
function cTypeOf(t) {
  switch (t) {
    case 'Integer': return 'int'; case 'Real': return 'double';
    case 'String': return 'char*'; case 'Boolean': return 'int';
    case 'Character': return 'char'; default: return 'int';
  }
}
function cExpr(expr) {
  let e = String(expr).trim();
  e = e.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!');
  e = e.replace(/&([a-zA-Z_]\w*)/g, '$1');
  return e;
}
function guessTypeOf(expr) {
  const m = String(expr).trim().match(/^&?([a-zA-Z_]\w*)$/);
  if (m) { const t = state.varDefs[m[1]]?.type; if (t) return t.replace(/\[\]$/, ''); }
  if (/^-?\d+$/.test(String(expr).trim())) return 'Integer';
  if (/^-?\d+\.\d+$/.test(String(expr).trim())) return 'Real';
  return 'String';
}
function generateC() {
  const lines = [];
  lines.push('/* Generato da FlowLab ' + APP.version + ' — linguaggio C */');
  lines.push('#include <stdio.h>');
  lines.push('#include <string.h>');
  lines.push('');
  lines.push('int main(void) {');
  const declared = {};

  state.nodes.forEach(n => {
    if (n.type !== 'declare') return;
    const t = (n.text || '').trim();
    if (n.declareType && /^[a-zA-Z_]\w*$/.test(t)) {
      if (!declared[t]) { lines.push('    ' + cTypeOf(n.declareType) + ' ' + t + ';'); declared[t] = true; }
      return;
    }
    const arrM = t.match(/^([a-zA-Z]+)\s+([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]\s*$/);
    if (arrM && VALID_TYPE_RE.test(arrM[1])) {
      const ct = canonicalType(arrM[1]);
      if (!declared[arrM[2]]) { lines.push('    ' + cTypeOf(ct) + ' ' + arrM[2] + '[' + arrM[3] + '];'); declared[arrM[2]] = true; }
      return;
    }
    const m = t.match(/^([a-zA-Z]+)\s+&?([a-zA-Z_]\w*)(?:\s*=\s*(.+))?$/);
    if (m && VALID_TYPE_RE.test(m[1]) && !declared[m[2]]) {
      const ct = cTypeOf(canonicalType(m[1]));
      const name = m[2];
      if (m[3] !== undefined) lines.push('    ' + ct + ' ' + name + ' = ' + cExpr(m[3]) + ';');
      else lines.push('    ' + ct + ' ' + name + ';');
      declared[name] = true;
    }
  });

  state.nodes.forEach(n => {
    if (n.type === 'for' && n.forData && n.forData.variable && !declared[n.forData.variable]) {
      lines.push('    int ' + n.forData.variable + ';');
      declared[n.forData.variable] = true;
    }
  });

  if (Object.keys(declared).length) lines.push('');

  state.nodes.forEach(n => {
    if (['declare','start','end','else','endif','endloop'].includes(n.type)) return;
    const t = (n.text || '').trim();
    switch (n.type) {
      case 'comment': if (t) lines.push('    ' + (t.startsWith('//') ? t : '// ' + t)); break;
      case 'assign': {
        if (!t) break;
        const inc = t.match(/^&?([a-zA-Z_]\w*)\s*(\+\+|--)$/);
        if (inc) { lines.push('    ' + inc[1] + inc[2] + ';'); break; }
        const arrM = t.match(/^&?([a-zA-Z_]\w*)\s*\[(.+?)\]\s*=\s*(.+)$/);
        if (arrM) { lines.push('    ' + arrM[1] + '[' + cExpr(arrM[2]) + '] = ' + cExpr(arrM[3]) + ';'); break; }
        const m = t.match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (m) lines.push('    ' + m[1] + ' = ' + cExpr(m[2]) + ';');
        break;
      }
      case 'input': {
        const m = t.match(/^&?([a-zA-Z_]\w*)(?:\[(.+?)\])?$/);
        if (m) {
          const name = m[1], idx = m[2];
          const type = state.varDefs[name]?.type || 'Integer';
          const base = type.replace(/\[\]$/, '');
          const dest = idx ? name + '[' + cExpr(idx) + ']' : name;
          if (base === 'Integer') lines.push('    scanf("%d", &' + dest + ');');
          else if (base === 'Real') lines.push('    scanf("%lf", &' + dest + ');');
          else if (base === 'Character') lines.push('    scanf(" %c", &' + dest + ');');
          else lines.push('    scanf("%s", ' + dest + ');');
        }
        break;
      }
      case 'output': {
        const expr = t.replace(/^(output|mostra|print|scrivi|stampa|write)\s+/i, '').trim();
        if (!expr) break;
        const parts = splitOnConcat(expr);
        let fmt = ''; const args = [];
        for (const p of parts) {
          const sm = p.match(/^"((?:[^"\\]|\\.)*)"$/);
          if (sm) fmt += sm[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          else {
            const type = guessTypeOf(p.trim());
            if (type === 'Integer' || type === 'Boolean') fmt += '%d';
            else if (type === 'Real') fmt += '%g';
            else if (type === 'Character') fmt += '%c';
            else fmt += '%s';
            args.push(cExpr(p.trim()));
          }
        }
        lines.push('    printf("' + fmt + '\\n"' + (args.length ? ', ' + args.join(', ') : '') + ');');
        break;
      }
      case 'if': if (t) lines.push('    if (' + cExpr(t) + ') {'); break;
      case 'else': lines.push('    } else {'); break;
      case 'endif': lines.push('    }'); break;
      case 'while': if (t) lines.push('    while (' + cExpr(t) + ') {'); break;
      case 'dowhile': lines.push('    do {'); break;
      case 'endloop': lines.push('    }'); break;
      case 'for': {
        const fd = n.forData;
        if (fd && fd.variable) {
          const step = Math.abs(Number(fd.step) || 1);
          const op = fd.direction === 'dec' ? '-=' : '+=';
          const cmp = fd.direction === 'dec' ? '>=' : '<=';
          lines.push('    for (' + fd.variable + ' = ' + cExpr(fd.start) + '; ' + fd.variable + ' ' + cmp + ' ' + cExpr(fd.end) + '; ' + fd.variable + ' ' + op + ' ' + step + ') {');
        } else {
          const m = t.match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(.+))?$/i);
          if (m) {
            const name = m[1], start = cExpr(m[2]), end = cExpr(m[3]);
            const step = m[4] !== undefined ? cExpr(m[4]) : '1';
            lines.push('    for (' + name + ' = ' + start + '; ' + name + ' <= ' + end + '; ' + name + ' += ' + step + ') {');
          }
        }
        break;
      }
      case 'break': lines.push('    break;'); break;
    }
  });

  lines.push('');
  lines.push('    return 0;');
  lines.push('}');
  return lines.join('\n');
}

/* ============================================================
   GENERAZIONE CODICE PYTHON
   ============================================================ */
function pyExpr(expr) {
  let e = String(expr).trim();
  e = e.replace(/\bAND\b/g, 'and').replace(/\bOR\b/g, 'or').replace(/\bNOT\b/g, 'not');
  e = e.replace(/&([a-zA-Z_]\w*)/g, '$1');
  e = e.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');
  return e;
}
function pyInputCast(varName) {
  const t = state.varDefs[varName]?.type || 'String';
  if (t === 'Integer') return 'int';
  if (t === 'Real') return 'float';
  if (t === 'Boolean') return 'bool';
  return 'str';
}
function generatePython() {
  const lines = [];
  lines.push('# Generato da FlowLab ' + APP.version + ' — linguaggio Python');
  lines.push('');
  lines.push('def main():');
  let hasContent = false;

  state.nodes.forEach(n => {
    if (['start','end','else','endif','endloop'].includes(n.type)) return;
    const t = (n.text || '').trim();
    switch (n.type) {
      case 'comment':
        if (t) { lines.push('    # ' + t.replace(/^\/\//, '').trim()); hasContent = true; }
        break;
      case 'declare': {
        if (n.declareType && /^[a-zA-Z_]\w*$/.test(t)) {
          let def = '0';
          if (n.declareType === 'String' || n.declareType === 'Character') def = '""';
          else if (n.declareType === 'Boolean') def = 'False';
          lines.push('    ' + t + ' = ' + def);
          hasContent = true;
          return;
        }
        const arrM = t.match(/^([a-zA-Z]+)\s+([a-zA-Z_]\w*)\s*\[\s*(\d+)\s*\]\s*$/);
        if (arrM && VALID_TYPE_RE.test(arrM[1])) {
          const ct = canonicalType(arrM[1]);
          const def = (ct === 'Integer' || ct === 'Real') ? '0' : (ct === 'Boolean' ? 'False' : '""');
          lines.push('    ' + arrM[2] + ' = [' + def + '] * ' + arrM[3]);
          hasContent = true;
          return;
        }
        const m = t.match(/^([a-zA-Z]+)\s+&?([a-zA-Z_]\w*)(?:\s*=\s*(.+))?$/);
        if (m && VALID_TYPE_RE.test(m[1])) {
          const ct = canonicalType(m[1]);
          const name = m[2];
          let def;
          if (m[3] !== undefined) def = pyExpr(m[3]);
          else if (ct === 'Integer' || ct === 'Real') def = '0';
          else if (ct === 'Boolean') def = 'False';
          else def = '""';
          lines.push('    ' + name + ' = ' + def);
          hasContent = true;
        }
        break;
      }
      case 'assign': {
        if (!t) break;
        const inc = t.match(/^&?([a-zA-Z_]\w*)\s*(\+\+|--)$/);
        if (inc) { lines.push('    ' + inc[1] + (inc[2] === '++' ? ' += 1' : ' -= 1')); hasContent = true; break; }
        const arrM = t.match(/^&?([a-zA-Z_]\w*)\s*\[(.+?)\]\s*=\s*(.+)$/);
        if (arrM) { lines.push('    ' + arrM[1] + '[' + pyExpr(arrM[2]) + '] = ' + pyExpr(arrM[3])); hasContent = true; break; }
        const m = t.match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+)$/);
        if (m) { lines.push('    ' + m[1] + ' = ' + pyExpr(m[2])); hasContent = true; }
        break;
      }
      case 'input': {
        const m = t.match(/^&?([a-zA-Z_]\w*)(?:\[(.+?)\])?$/);
        if (m) {
          const name = m[1], idx = m[2];
          const cast = pyInputCast(name);
          if (idx) lines.push('    ' + name + '[' + pyExpr(idx) + '] = ' + cast + '(input())');
          else lines.push('    ' + name + ' = ' + cast + '(input())');
          hasContent = true;
        }
        break;
      }
      case 'output': {
        const expr = t.replace(/^(output|mostra|print|scrivi|stampa|write)\s+/i, '').trim();
        if (!expr) break;
        const parts = splitOnConcat(expr);
        const args = [];
        for (const p of parts) {
          const tt = p.trim(); if (!tt) continue;
          const sm = tt.match(/^"((?:[^"\\]|\\.)*)"$/);
          if (sm) args.push('"' + sm[1].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
          else args.push(pyExpr(tt));
        }
        lines.push('    print(' + args.join(', ') + ')');
        hasContent = true;
        break;
      }
      case 'if': if (t) { lines.push('    if ' + pyExpr(t) + ':'); hasContent = true; } break;
      case 'else': lines.push('    else:'); break;
      case 'endif': break;
      case 'while': if (t) { lines.push('    while ' + pyExpr(t) + ':'); hasContent = true; } break;
      case 'dowhile': lines.push('    while True:'); break;
      case 'for': {
        const fd = n.forData;
        if (fd && fd.variable) {
          const step = Math.abs(Number(fd.step) || 1);
          const stepArg = step !== 1 ? ', ' + (fd.direction === 'dec' ? '-' : '') + step : '';
          if (fd.direction === 'dec') {
            lines.push('    for ' + fd.variable + ' in range(' + pyExpr(fd.start) + ', ' + pyExpr(fd.end) + ' - 1, -' + step + '):');
          } else {
            lines.push('    for ' + fd.variable + ' in range(' + pyExpr(fd.start) + ', ' + pyExpr(fd.end) + ' + 1' + stepArg + '):');
          }
          hasContent = true;
        } else {
          const m = t.match(/^&?([a-zA-Z_]\w*)\s*=\s*(.+?)\s+To\s+(.+?)(?:\s+Step\s+(.+))?$/i);
          if (m) {
            const name = m[1], start = pyExpr(m[2]), end = pyExpr(m[3]);
            const step = m[4] !== undefined ? pyExpr(m[4]) : '1';
            lines.push('    for ' + name + ' in range(' + start + ', ' + end + ' + 1, ' + step + '):');
            hasContent = true;
          }
        }
        break;
      }
      case 'endloop': break;
      case 'break': lines.push('    break'); hasContent = true; break;
    }
  });

  if (!hasContent) lines.push('    pass');
  lines.push(''); lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push('    main()');
  return lines.join('\n');
}

/* ============================================================
   ZOOM — v23: centrato sul viewport + pinch mobile
   ============================================================ */
function setZoom(z) {
  const wrapW = canvasWrap.clientWidth;
  const wrapH = canvasWrap.clientHeight;
  const z1 = state.zoom;
  const z2 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  if (Math.abs(z2 - z1) < 0.001) return;

  /* Punto (in coordinat del contenuto) attualmente al centro dello schermo */
  const s1x = canvasEl.scrollLeft;
  const s1y = canvasEl.scrollTop;

  state.zoom = z2;
  canvasEl.style.transform = 'scale(' + z2 + ')';
  canvasEl.style.transformOrigin = '0 0';
  canvasEl.style.width  = (100 / z2) + '%';
  canvasEl.style.height = (100 / z2) + '%';
  $('ctZoom').textContent = Math.round(z2 * 100) + '%';

  /* Nuovo scroll per mantenere lo stesso punto al centro */
  const s2x = s1x + (wrapW / 2) * (1 / z1 - 1 / z2);
  const s2y = s1y + (wrapH / 2) * (1 / z1 - 1 / z2);

  /* Applica dopo il reflow */
  requestAnimationFrame(() => {
    canvasEl.scrollLeft = s2x;
    canvasEl.scrollTop = s2y;
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) { toast('Fullscreen non supportato'); return; }
    try { fn.call(el); } catch (e) { toast('Errore: ' + e.message); }
  } else {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (fn) { try { fn.call(document); } catch (e) {} }
  }
}

/* ============================================================
   PINCH-TO-ZOOM (mobile, due dita)
   ============================================================ */
let pinchState = null;

canvasEl.addEventListener('touchstart', function(e) {
  if (e.touches.length === 2) {
    /* Calcola distanza iniziale tra le due dita */
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    pinchState = {
      lastDist: Math.hypot(dx, dy),
      originalTouchAction: canvasEl.style.touchAction,
    };
    /* Blocca scroll nativo durante il pinch */
    canvasEl.style.touchAction = 'none';
  }
}, { passive: true });

canvasEl.addEventListener('touchmove', function(e) {
  if (!pinchState || e.touches.length !== 2) return;
  e.preventDefault();

  const t1 = e.touches[0], t2 = e.touches[1];
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  const dist = Math.hypot(dx, dy);

  if (pinchState.lastDist > 0) {
    const ratio = dist / pinchState.lastDist;
    setZoom(state.zoom * ratio);
  }
  pinchState.lastDist = dist;
}, { passive: false });

function endPinch(e) {
  if (!pinchState) return;
  if (e.touches && e.touches.length >= 2) return;
  /* Ripristina touch-action originale */
  canvasEl.style.touchAction = pinchState.originalTouchAction || 'pan-x pan-y';
  pinchState = null;
}
canvasEl.addEventListener('touchend', endPinch);
canvasEl.addEventListener('touchcancel', endPinch);

/* ============================================================
   MENU MOBILE ⋯
   ============================================================ */
function closeMobileMenu() {
  const menu = $('mobileMenu');
  if (menu) menu.hidden = true;
}
function openMobileMenu() {
  const menu = $('mobileMenu');
  if (!menu) return;
  const s = $('mmSpeed');
  if (s) s.value = state.speed;
  const l = $('mmSpeedLabel');
  if (l) l.textContent = SPEED_NAMES[state.speed];
  menu.hidden = false;
}
function toggleMobileMenu() {
  const menu = $('mobileMenu');
  if (!menu) return;
  if (menu.hidden) openMobileMenu(); else closeMobileMenu();
}

/* ============================================================
   PANNELLI MOBILE — esclusivi
   ============================================================ */
function closeAllPanels() {
  ['panelLeft', 'panelRight'].forEach(id => {
    const el = $(id);
    if (el) el.classList.remove('open');
  });
  document.querySelectorAll('.mtab[data-toggle]').forEach(t => {
    t.classList.remove('mtab-active');
  });
}
function closeOtherPanel(exceptId) {
  ['panelLeft', 'panelRight'].forEach(id => {
    if (id === exceptId) return;
    const el = $(id);
    if (el) el.classList.remove('open');
    const tab = document.querySelector('.mtab[data-toggle="' + id + '"]');
    if (tab) tab.classList.remove('mtab-active');
  });
}
function togglePanel(panelId, tabEl) {
  const panel = $(panelId);
  if (!panel) return;
  const willOpen = !panel.classList.contains('open');

  closeOtherPanel(panelId);
  if (willOpen) {
    panel.classList.add('open');
    if (tabEl) tabEl.classList.add('mtab-active');
  } else {
    panel.classList.remove('open');
    if (tabEl) tabEl.classList.remove('mtab-active');
  }
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */

/* Toolbar principale */
$('btnRun').addEventListener('click', runAll);
$('btnStep').addEventListener('click', stepOnce);
$('btnStop').addEventListener('click', function() {
  state.running = false;
  state.paused = false;
  clog('Interrotto', 'warn');
  toggleRunUI(false);
  highlight(null);
});
$('btnNew').addEventListener('click', newProject);
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);
$('btnSave').addEventListener('click', () => saveToFile().catch(e => toast('Errore: ' + e.message)));
$('btnLoad').addEventListener('click', () => loadFromFile().catch(e => toast('Errore: ' + e.message)));
$('btnExportPNG').addEventListener('click', exportPNG);
$('btnFullscreen').addEventListener('click', toggleFullscreen);

$('btnExportC').addEventListener('click', function() {
  try {
    state.codeLang = 'c';
    $('cOutput').textContent = generateC();
    cModal.hidden = false;
  } catch (e) { toast('Errore: ' + e.message); }
});
$('btnExportPy').addEventListener('click', function() {
  try {
    state.codeLang = 'python';
    $('cOutput').textContent = generatePython();
    cModal.hidden = false;
  } catch (e) { toast('Errore: ' + e.message); }
});

$('cClose').addEventListener('click', () => { cModal.hidden = true; });
$('cCloseBtn').addEventListener('click', () => { cModal.hidden = true; });
$('cCopy').addEventListener('click', function() {
  navigator.clipboard.writeText($('cOutput').textContent).then(
    () => toast('Copiato'),
    () => toast('Errore')
  );
});
$('cDownload').addEventListener('click', function() {
  const code = $('cOutput').textContent;
  const ext = state.codeLang === 'python' ? '.py' : '.c';
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'flowlab' + ext; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  toast('File scaricato');
});

$('btnReset').addEventListener('click', function() {
  if (!confirm('Reset completo del progetto?')) return;
  doNewProject();
});

$('speedRange').addEventListener('input', function(e) {
  state.speed = parseInt(e.target.value, 10);
  $('speedLabel').textContent = SPEED_NAMES[state.speed];
});

$('ctZoomIn').addEventListener('click', () => setZoom(state.zoom + 0.15));
$('ctZoomOut').addEventListener('click', () => setZoom(state.zoom - 0.15));
$('ctReset').addEventListener('click', () => {
  setZoom(1);
  /* Reset scroll al centro */
  requestAnimationFrame(() => {
    canvasEl.scrollLeft = 0;
    canvasEl.scrollTop = 0;
  });
});
$('btnClearConsole').addEventListener('click', cclear);

/* Menu mobile ⋯ */
$('btnMenu').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMobileMenu();
});

$('mobileMenuBackdrop').addEventListener('click', closeMobileMenu);

document.querySelectorAll('.mm-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    closeMobileMenu();
    switch (action) {
      case 'undo':       undo(); break;
      case 'redo':       redo(); break;
      case 'new':        newProject(); break;
      case 'save':       saveToFile().catch(e => toast('Errore: ' + e.message)); break;
      case 'load':       loadFromFile().catch(e => toast('Errore: ' + e.message)); break;
      case 'exportPNG':  exportPNG(); break;
      case 'exportC':    $('btnExportC').click(); break;
      case 'exportPy':   $('btnExportPy').click(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'reset':
        if (confirm('Reset completo del progetto?')) doNewProject();
        break;
    }
  });
});

const mmSpeedEl = $('mmSpeed');
if (mmSpeedEl) {
  mmSpeedEl.addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    state.speed = v;
    const lbl = SPEED_NAMES[v];
    $('mmSpeedLabel').textContent = lbl;
    $('speedRange').value = v;
    $('speedLabel').textContent = lbl;
  });
}

/* For modal */
$('forOk').addEventListener('click', confirmForDialog);
$('forCancel').addEventListener('click', closeForDialog);
$('forClose').addEventListener('click', closeForDialog);
forModal.addEventListener('click', e => { if (e.target === forModal) closeForDialog(); });
['forVar','forStart','forEnd','forStep'].forEach(id => {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmForDialog(); }
    if (e.key === 'Escape') { e.preventDefault(); closeForDialog(); }
  });
});

/* Card dalla sidebar */
document.querySelectorAll('.card[data-add]').forEach(function(c) {
  c.addEventListener('click', function() {
    const type = c.dataset.add;
    const atIndex = state.nodes.length - 1;
    if (type === 'declare') {
      openTypePicker(null, (tipo) => {
        addNode('declare', atIndex, { declareType: tipo });
        haptic();
        if (window.innerWidth <= 800) closeAllPanels();
      });
      return;
    }
    addNode(type, atIndex);
    haptic();
    if (window.innerWidth <= 800) closeAllPanels();
  });
});

/* Pick dal picker */
document.querySelectorAll('.pick[data-add]').forEach(function(b) {
  b.addEventListener('click', function() {
    const type = b.dataset.add;
    pickerEl.hidden = true;
    const at = state.insertAt >= 0 ? state.insertAt : state.nodes.length - 1;
    const mode = state.insertMode || null;
    state.insertAt = -1;
    state.insertMode = null;
    if (type === 'declare') {
      openTypePicker(null, (tipo) => {
        addNode('declare', at, { declareType: tipo, mode: mode });
        haptic();
      });
      return;
    }
    addNode(type, at, { mode: mode });
    haptic();
  });
});

$('pickerClose').addEventListener('click', () => { pickerEl.hidden = true; state.insertAt = -1; state.insertMode = null; });
pickerEl.addEventListener('click', e => { if (e.target === pickerEl) { pickerEl.hidden = true; state.insertAt = -1; state.insertMode = null; } });

$('typeClose').addEventListener('click', closeTypePicker);
$('typeCancel').addEventListener('click', closeTypePicker);
typeModal.addEventListener('click', e => { if (e.target === typeModal) closeTypePicker(); });

/* Bottom tab mobile — esclusivi */
document.querySelectorAll('.mtab[data-toggle]').forEach(function(t) {
  t.addEventListener('click', function() {
    togglePanel(t.dataset.toggle, t);
  });
});

/* Chiudi pannelli al tocco sul canvas (mobile) */
canvasEl.addEventListener('pointerdown', function() {
  if (window.innerWidth > 800) return;
  if (document.querySelector('.panel.open')) {
    closeAllPanels();
  }
});

/* Panel close button */
document.querySelectorAll('.panel-toggle[data-close]').forEach(function(b) {
  b.addEventListener('click', function() {
    const id = b.dataset.close;
    const panel = $(id);
    if (panel) panel.classList.remove('open');
    const tab = document.querySelector('.mtab[data-toggle="' + id + '"]');
    if (tab) tab.classList.remove('mtab-active');
  });
});

const mtabRun = $('mtabRun');
if (mtabRun) mtabRun.addEventListener('click', runAll);

/* Var modal */
$('btnAddVar').addEventListener('click', function() {
  $('varName').value = '';
  $('varType').value = 'Integer';
  $('varValue').value = '0';
  varModal.hidden = false;
  setTimeout(() => $('varName').focus(), 50);
});
$('varClose').addEventListener('click', () => { varModal.hidden = true; });
$('varCancel').addEventListener('click', () => { varModal.hidden = true; });
varModal.addEventListener('click', e => { if (e.target === varModal) varModal.hidden = true; });

$('varOk').addEventListener('click', function() {
  const name = $('varName').value.trim().replace(/^&/, '');
  const type = $('varType').value;
  const raw = $('varValue').value.trim();
  if (!name) { toast('Nome richiesto'); return; }
  if (!/^[a-zA-Z_]\w*$/.test(name)) { toast('Nome non valido'); return; }
  if (state.varDefs[name]) { toast('Variabile esistente'); return; }
  let val;
  if (type === 'Integer') val = parseInt(raw, 10) || 0;
  else if (type === 'Real') val = parseFloat(raw) || 0;
  else if (type === 'Boolean') val = /^(true|1|sì|si|yes)$/i.test(raw);
  else if (type === 'Character') val = raw.length > 0 ? raw[0] : '\0';
  else val = String(raw);
  state.varDefs[name] = { type, default: val };
  state.variables[name] = { value: val, type };
  renderVars();
  varModal.hidden = true;
  scheduleSave();
  state.dirty = true;
  updateSaveIndicator();
  toast('Variabile creata');
});

$('fileInput').addEventListener('change', function(e) {
  const f = e.target.files && e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = () => { parseProject(r.result, f.name); state.currentFileName = f.name; };
    r.readAsText(f);
  }
  e.target.value = '';
});

/* Keyboard */
document.addEventListener('keydown', function(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newProject(); return; }
  if (e.key === 'F10') { e.preventDefault(); stepOnce(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveToFile(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runAll(); return; }
  if (e.key === 'Escape') {
    pickerEl.hidden = true;
    varModal.hidden = true;
    cModal.hidden = true;
    closeTypePicker();
    closeForDialog();
    closeMobileMenu();
    closeAllPanels();
    state.insertAt = -1;
    state.insertMode = null;
  }
}, true);

/* Resize */
let resizeTimer = null;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth > 800) {
      closeAllPanels();
      closeMobileMenu();
    }
    layoutAll();
  }, 100);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

document.addEventListener('fullscreenchange', function() {
  const isFs = !!document.fullscreenElement;
  $('btnFullscreen').title = isFs ? 'Esci' : 'Schermo intero';
  setTimeout(layoutAll, 100);
});

window.addEventListener('beforeunload', function(e) {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  clog('FlowLab v' + APP.version + ' — pronto', 'sys');

  (async () => {
    const stored = await loadHandleFromDB(FILE_HANDLE_KEY);
    if (stored) {
      try {
        const perm = await stored.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          state.fileHandle = stored;
          state.currentFileName = stored.name;
          clog('File attivo: ' + stored.name, 'sys');
        }
      } catch (e) {}
    }
  })();

  /* Service Worker */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => clog('Service Worker attivo: ' + reg.scope, 'sys'))
        .catch(err => clog('SW error: ' + err.message, 'warn'));
    });
  }

  const loaded = loadAuto();
  if (!loaded || state.nodes.length === 0) {
    state.nodes = [
      { id: uid(), type: 'start', text: '' },
      { id: uid(), type: 'end', text: '' },
    ];
  }
  ensureStartEnd();

  render();
  setTimeout(layoutAll, 300);
  setTimeout(layoutAll, 600);

  requestAnimationFrame(function() {
    renderVars();
    state.history = [snapshot()];
    state.histIdx = 0;
    state.dirty = false;
    updateSaveIndicator();
    statusText.textContent = 'Pronto';
    statusSteps.textContent = '0 step';
    if (!loaded) saveAuto();
    clog('Zoom: usa + / − o pinch con due dita', 'sys');
    clog('Clicca sul blocco For per configurarlo', 'sys');
  });

  try {
    localStorage.setItem('__fl__', '1');
    localStorage.removeItem('__fl__');
  } catch (e) {
    clog('localStorage non disponibile', 'warn');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}