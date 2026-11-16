/* ============================================================
   FlowLab — Applicazione (editor, layout, esecuzione, UI)
   ============================================================ */
'use strict';

const APP = { name:'FlowLab', version:'25.0', storageKey:'flowlab.project.v25', oldStorageKey:'flowlab.project.v24', maxConsole:1500 };

const DEFS = {
  start:   { label:'Start',    shape:'oval',          editable:false, deletable:false },
  end:     { label:'End',      shape:'oval',          editable:false, deletable:false },
  input:   { label:'Input',    shape:'parallelogram', editable:true,  deletable:true, ph:'nome' },
  output:  { label:'Output',   shape:'parallelogram', editable:true,  deletable:true, ph:'"Ciao " & nome' },
  declare: { label:'Declare',  shape:'declare',       editable:true,  deletable:true, ph:'a, b, v[10]' },
  assign:  { label:'Assign',   shape:'rect',          editable:true,  deletable:true, ph:'x = x + 1' },
  if:      { label:'If',       shape:'diamond',       editable:true,  deletable:true, ph:'x > 5' },
  else:    { label:'Else',     shape:'marker',        editable:false, deletable:true },
  endif:   { label:'EndIf',    shape:'marker',        editable:false, deletable:true },
  for:     { label:'For',      shape:'hex',           editable:false, deletable:true },
  while:   { label:'While',    shape:'hex',           editable:true,  deletable:true, ph:'i < 10' },
  dowhile: { label:'Do',       shape:'hex',           editable:true,  deletable:true, ph:'risposta <> 0' },
  endloop: { label:'End Loop', shape:'marker',        editable:false, deletable:true },
  break:   { label:'Break',    shape:'pill',          editable:false, deletable:true },
  call:    { label:'Call',     shape:'call',          editable:true,  deletable:true, ph:'Saluta()' },
  comment: { label:'Commento', shape:'comment',       editable:true,  deletable:true, ph:'nota…' },
};
const COLORS = {
  start:['#9370DB', '#E8D5F5'], end:['#9370DB', '#E8D5F5'], input:['#1976D2', '#D6E8F5'], output:['#2E7D32', '#D4F1D4'],
  declare:['#B8860B', '#FFF9C4'], assign:['#E0A000', '#FFF6C9'], if:['#C2185B', '#FFD9E0'], for:['#E65100', '#FFE4C4'],
  while:['#E65100', '#FFE4C4'], dowhile:['#E65100', '#FFE4C4'], break:['#E65100', '#FFE4C4'], call:['#00838F', '#D2F1F2'],
  comment:['#757575', '#F1F1F1']
};
const SPEEDS = { 1:1100, 2:650, 3:320, 4:120, 5:30, 6:0 };
const SPEED_NAMES = { 1:'Lenta', 2:'Calma', 3:'Normale', 4:'Veloce', 5:'Turbo', 6:'Istantanea' };

const VGAP = 26, HGAP = 30, MIN_HORIZ_LEN = 40, BACK_EDGE_LEN = 30, EMPTY_BRANCH_H = 20;
const MERGE_GAP = 44, LOOPBACK_GAP = 40, DW_MERGE_GAP = 55, DW_LOOPBACK_OFFSET = 12;
const MIN_NODE_W = 170, MAX_NODE_W = 2400, MIN_ZOOM = 0.10, MAX_ZOOM = 2.5;
const FONT_LABEL = "700 10px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_SUBLABEL = "700 10.5px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_CONTENT = "500 12.5px ui-monospace, 'SF Mono', Consolas, monospace";
const LABEL_LS = '0.6px';
const SHAPE_PAD_X = { oval:24, rect:22, declare:24, comment:22, marker:22, parallelogram:46, diamond:56, hex:46, call:32, pill:28 };
const INPUT_PAD_X = 8, WIDTH_SAFETY = 24, TOP_ANCHOR_Y = 24, PAN_MARGIN = 80;
const ARROW_LEN = 11, ARROW_WID = 5.5;
const HANDLE_DB = 'flowlab-handles', HANDLE_STORE = 'handles', FILE_HANDLE_KEY = 'flowlab-file';

const state = {
  name:'programma', funcs:[], cur:0,
  history:[], histIdx:-1,
  zoom:1, panX:0, panY:0, natW:800, natH:600, hasCentered:false,
  contentMinX:0, contentMaxX:0, contentMinY:0, contentMaxY:0,
  selectedId:null, insertAt:-1, insertMode:null,
  speed:3, codeLang:'python', dirty:false, heat:false,
  fileHandle:null, editingForId:null, clipboard:null,
  errorNodeId:null, errorFi:-1, counts:null, invalid:new Map(),
};
Object.defineProperty(state, 'nodes', {
  get(){ return state.funcs[state.cur].nodes; },
  set(v){ state.funcs[state.cur].nodes = v; }
});
const run = { runner:null, status:'idle', inputResolve:null, usedDraw:false, usedPlot:false, lastVarsRender:0, varsRaf:0 };

const $ = id => document.getElementById(id);
const canvasEl = $('canvas'), canvasWrap = $('canvasWrap'), canvasContentEl = $('canvasContent');
const nodesEl = $('nodes'), linksEl = $('links'), overlayEl = $('overlay');
const varListEl = $('varList'), consoleEl = $('console');
const statusText = $('statusText'), statusSteps = $('statusSteps');
const pickerEl = $('picker'), toastEl = $('toast');
const typeModal = $('typeModal'), forModal = $('forModal'), funcModal = $('funcModal'), codeModal = $('codeModal');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const isMobile = () => window.innerWidth <= 800;

/* ============================================================
   Utility UI
   ============================================================ */
let toastTimer = null;
function toast(msg, ms){ toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 2200); }
function haptic(){ if(navigator.vibrate){ try{ navigator.vibrate(8); }catch(e){} } }
function svgClose(){ return '<svg viewBox="0 0 24 24" class="ico"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>'; }
function svgPlus(){ return '<svg viewBox="0 0 24 24" class="ico"><path d="M11 5 H13 V11 H19 V13 H13 V19 H11 V13 H5 V11 H11 Z" fill="currentColor"/></svg>'; }

let _measEl = null;
function getMeasEl(){ if(_measEl) return _measEl; _measEl = document.createElement('span'); _measEl.style.cssText = 'position:absolute;left:-99999px;top:0;white-space:pre;pointer-events:none;visibility:hidden;display:inline-block;'; document.body.appendChild(_measEl); return _measEl; }
const _measCache = new Map();
function measureTextWidth(text, font, ls){
  if(!text) return 0;
  const key = (font || '') + '|' + (ls || '') + '|' + text;
  if(_measCache.has(key)) return _measCache.get(key);
  const el = getMeasEl(); el.style.font = font || FONT_CONTENT; el.style.letterSpacing = ls || 'normal';
  let max = 0;
  for(const l of String(text).split('\n')){ el.textContent = l.length ? l : ' '; const w = el.getBoundingClientRect().width; if(w > max) max = w; }
  if(_measCache.size > 3000) _measCache.clear();
  _measCache.set(key, max);
  return max;
}

/* ---------- Console ---------- */
let curLine = null;
function clog(text, cls){
  cls = cls || 'out';
  const line = document.createElement('div');
  line.className = 'line ' + cls;
  line.textContent = text;
  consoleEl.appendChild(line);
  curLine = null;
  trimConsole();
  consoleEl.scrollTop = consoleEl.scrollHeight;
  return line;
}
function cout(text, newline){
  if(curLine && curLine.isConnected) curLine.textContent += text;
  else { curLine = document.createElement('div'); curLine.className = 'line out'; curLine.textContent = text; consoleEl.appendChild(curLine); trimConsole(); }
  if(newline) curLine = null;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
function trimConsole(){ while(consoleEl.children.length > APP.maxConsole) consoleEl.removeChild(consoleEl.firstChild); }
function cclear(){ consoleEl.innerHTML = ''; curLine = null; }

function updateSaveIndicator(){ const btn = $('btnSave'); if(!btn) return; btn.classList.toggle('tb-dirty', state.dirty); btn.title = state.dirty ? 'Salva (modifiche non salvate)' : 'Salva'; }
function markDirty(){ state.dirty = true; updateSaveIndicator(); }
function markSaved(){ state.dirty = false; updateSaveIndicator(); }
function updateFileName(){ $('fileName').textContent = state.name || 'programma'; document.title = (state.name ? state.name + ' — ' : '') + 'FlowLab'; }

/* ---------- IndexedDB (handle file) ---------- */
function openHandleDB(){ return new Promise((resolve, reject) => { const req = indexedDB.open(HANDLE_DB, 1); req.onupgradeneeded = () => { const db = req.result; if(!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function saveHandleToDB(key, handle){ try{ const db = await openHandleDB(); return new Promise((res, rej) => { const tx = db.transaction(HANDLE_STORE, 'readwrite'); tx.objectStore(HANDLE_STORE).put(handle, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }catch(e){} }
async function loadHandleFromDB(key){ try{ const db = await openHandleDB(); return new Promise((res, rej) => { const tx = db.transaction(HANDLE_STORE, 'readonly'); const r = tx.objectStore(HANDLE_STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }catch(e){ return null; } }
async function clearHandleFromDB(key){ try{ const db = await openHandleDB(); return new Promise((res, rej) => { const tx = db.transaction(HANDLE_STORE, 'readwrite'); tx.objectStore(HANDLE_STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }catch(e){} }

/* ============================================================
   Testo dei nodi
   ============================================================ */
function curFunc(){ return state.funcs[state.cur]; }
function isMainFunc(f){ return f.name.toLowerCase() === 'main'; }
function funcSignature(f){
  if(isMainFunc(f)) return 'Main';
  return f.name + '(' + (f.params || []).map(p => p.type + ' ' + p.name + (p.array ? '[]' : '')).join(', ') + ')';
}
function formatForText(node){
  const d = node.forData;
  if(!d || !d.variable) return 'Configura…';
  const stepNum = String(d.step || '1');
  return d.variable + ' = ' + (d.start || '0') + (d.direction === 'dec' ? ' down to ' : ' to ') + (d.end || '0') + (stepNum !== '1' ? ' step ' + stepNum : '');
}
function staticText(node){
  const f = curFunc();
  if(node.type === 'start') return funcSignature(f);
  if(node.type === 'end') return (f.returnType && f.returnType !== 'None') ? 'Return ' + (f.returnVar || '?') : 'End';
  if(node.type === 'for') return formatForText(node);
  if(node.type === 'break') return 'Break';
  return null;
}

/* ============================================================
   Misura e creazione nodi
   ============================================================ */
function measureNode(node){
  const def = DEFS[node.type]; if(!def) return { w:MIN_NODE_W, h:56 };
  if(node.type === 'comment'){
    const raw = node.text || def.ph || '';
    const lines = String(raw).split('\n');
    let widest = 40;
    for(const l of lines) widest = Math.max(widest, Math.min(measureTextWidth(l, FONT_CONTENT), MAX_NODE_W - 40));
    const w = Math.max(MIN_NODE_W, Math.min(MAX_NODE_W, widest + 48));
    const h = 22 + 15 + lines.length * 18 + 12;
    return { w:Math.ceil(w), h:Math.ceil(h) };
  }
  const st = staticText(node);
  const labelW = (node.type === 'start' || node.type === 'end' || node.type === 'break') ? 0 : measureTextWidth(def.label.toUpperCase(), FONT_LABEL, LABEL_LS);
  const subW = (node.type === 'declare' && node.declareType) ? measureTextWidth(node.declareType, FONT_SUBLABEL) + 20 : 0;
  let contentW = 0;
  if(st !== null) contentW = measureTextWidth(st, FONT_CONTENT);
  else if(def.editable) contentW = measureTextWidth(node.text || def.ph || '', FONT_CONTENT);
  const padX = (SHAPE_PAD_X[def.shape] || 22) + INPUT_PAD_X;
  const needed = Math.max(labelW, subW, contentW) + 2 * padX + WIDTH_SAFETY;
  let w = Math.max(node.type === 'start' || node.type === 'end' || node.type === 'break' ? 130 : MIN_NODE_W, needed + (node._extraW || 0));
  w = Math.min(MAX_NODE_W, w);
  let padY = 12;
  if(['input', 'output', 'for', 'while', 'dowhile'].includes(node.type)) padY = 14;
  if(node.type === 'if') padY = 26;
  let h;
  if(node.type === 'start' || node.type === 'end' || node.type === 'break') h = 46;
  else {
    const hasSub = node.type === 'declare' && !!node.declareType;
    h = padY * 2 + 15 + 4 + 28 + (hasSub ? 4 + 15 : 0);
  }
  if(def.shape === 'diamond') h = Math.max(h, 100);
  if(node.type !== 'start' && node.type !== 'end' && node.type !== 'break') h = Math.max(56, h);
  return { w:Math.ceil(w), h:Math.ceil(h) };
}

function makeShapeEl(type){
  const def = DEFS[type]; if(!def) return null;
  const SHAPES = { diamond:'50,3 97,30 50,57 3,30', hex:'14,3 86,3 97,30 86,57 14,57 3,30', parallelogram:'16,3 97,3 84,57 3,57' };
  const pts = SHAPES[def.shape]; if(!pts) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'node-shape'); svg.setAttribute('viewBox', '0 0 100 60'); svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts); poly.setAttribute('stroke-width', '2'); poly.setAttribute('stroke-linejoin', 'round'); poly.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(poly);
  return svg;
}

function onNodeEdited(n){
  n._extraW = 0;
  validateNode(n);
  requestAnimationFrame(() => { layoutAll(); convergeLayout(); });
  scheduleSave(); markDirty();
  scheduleHistory();
}

function createNodeEl(node, idx){
  const def = DEFS[node.type]; if(!def) return document.createElement('div');
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = node.id; el.dataset.type = node.type; el.dataset.index = idx;
  const shape = makeShapeEl(node.type); if(shape) el.appendChild(shape);
  if(!shape){ const box = document.createElement('div'); box.className = 'node-box'; el.appendChild(box); }
  const body = document.createElement('div'); body.className = 'node-body';
  const st = staticText(node);
  if(node.type !== 'start' && node.type !== 'end' && node.type !== 'break'){
    const label = document.createElement('span'); label.className = 'node-label'; label.textContent = def.label; body.appendChild(label);
  }
  if(node.type === 'declare'){
    const sub = document.createElement('span'); sub.className = 'node-sublabel';
    sub.textContent = node.declareType || 'Scegli tipo'; sub.title = 'Clicca per cambiare il tipo';
    sub.addEventListener('click', e => {
      e.stopPropagation();
      openTypePicker(node.declareType, t => {
        const n = findNode(node.id); if(!n) return;
        n.declareType = t; pushHistory(); render(); scheduleSave();
        toast('Tipo: ' + t);
      });
    });
    body.appendChild(sub);
  }
  if(st !== null){
    const display = document.createElement('div');
    display.className = 'node-input node-static' + (node.type === 'for' ? ' for-display' : '');
    display.textContent = st;
    if(node.type === 'for'){
      display.title = 'Clicca per configurare il ciclo';
      display.addEventListener('click', e => { e.stopPropagation(); openForDialog(node); });
    } else if(node.type === 'start' || node.type === 'end'){
      if(!isMainFunc(curFunc())){ display.classList.add('clickable'); display.title = 'Clicca per modificare la funzione'; display.addEventListener('click', e => { e.stopPropagation(); openFuncDialog(state.cur); }); }
    }
    body.appendChild(display);
  } else if(node.type === 'comment'){
    const ta = document.createElement('textarea');
    ta.className = 'node-input node-comment'; ta.value = node.text || ''; ta.placeholder = def.ph || ''; ta.spellcheck = false; ta.rows = 1;
    ta.addEventListener('input', () => { const n = findNode(node.id); if(!n) return; n.text = ta.value; onNodeEdited(n); });
    body.appendChild(ta);
  } else if(def.editable){
    const input = document.createElement('input');
    input.className = 'node-input'; input.type = 'text'; input.value = node.text || ''; input.placeholder = def.ph || '';
    input.spellcheck = false; input.autocomplete = 'off'; input.setAttribute('autocapitalize', 'off');
    input.addEventListener('input', () => { const n = findNode(node.id); if(!n) return; n.text = input.value; onNodeEdited(n); });
    input.addEventListener('focus', () => selectNode(node.id));
    body.appendChild(input);
  }
  el.appendChild(body);
  if(node.type === 'output'){
    const nl = document.createElement('button');
    nl.className = 'node-opt' + (node.newline === false ? ' off' : '');
    nl.textContent = '↵'; nl.title = node.newline === false ? 'Senza a capo (clicca per andare a capo)' : 'Va a capo dopo l\'output (clicca per disattivare)';
    nl.addEventListener('click', e => { e.stopPropagation(); const n = findNode(node.id); if(!n) return; n.newline = n.newline === false; pushHistory(); render(); scheduleSave(); toast(n.newline ? 'Output con a capo' : 'Output senza a capo'); });
    el.appendChild(nl);
  }
  if(node.bp){ const bp = document.createElement('span'); bp.className = 'node-bp'; bp.title = 'Breakpoint'; el.appendChild(bp); }
  if(state.heat && state.counts && state.counts[node.id]){
    const b = document.createElement('span'); b.className = 'node-badge'; b.textContent = '×' + state.counts[node.id]; b.title = 'Eseguito ' + state.counts[node.id] + ' volte'; el.appendChild(b);
  }
  if(state.invalid.has(node.id)){ el.classList.add('invalid'); el.title = state.invalid.get(node.id); }
  if(state.errorNodeId === node.id && state.errorFi === state.cur) el.classList.add('error');
  if(state.selectedId === node.id) el.classList.add('selected');
  if(def.deletable){
    const del = document.createElement('button'); del.className = 'node-del'; del.innerHTML = svgClose(); del.title = 'Elimina';
    del.addEventListener('click', e => { e.stopPropagation(); deleteNode(node.id); });
    el.appendChild(del);
  }
  el.addEventListener('click', e => {
    if(e.target.closest('.node-del, .node-sublabel, .node-opt, .for-display, .clickable')) return;
    if(el.dataset.wasDragging === 'true') return;
    selectNode(node.id);
  });
  el.addEventListener('dblclick', e => { if(node.type === 'start' && !isMainFunc(curFunc())) openFuncDialog(state.cur); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); selectNode(node.id); openCtxMenu(e.clientX, e.clientY, node); });
  if(def.deletable) attachMoveDrag(el, node);
  return el;
}
function findNode(id){ return state.nodes.find(x => x.id === id); }

/* ============================================================
   Layout (posizionamento automatico stile Flowgorithm)
   ============================================================ */
function anchorTopFor(node, y, h){ const def = DEFS[node.type]; if(!def) return y; switch(def.shape){ case 'diamond': case 'hex': case 'parallelogram': return y + h * 0.05; default: return y; } }
function anchorBottomFor(node, y, h){ const def = DEFS[node.type]; if(!def) return y + h; switch(def.shape){ case 'diamond': case 'hex': case 'parallelogram': return y + h * 0.95; default: return y + h; } }
function shapeSideX(node, x, w, side){
  const def = DEFS[node.type]; if(!def) return side === 'left' ? x : x + w;
  switch(def.shape){
    case 'parallelogram': return side === 'left' ? x + w * 0.095 : x + w * 0.905;
    case 'hex': case 'diamond': return side === 'left' ? x + w * 0.03 : x + w * 0.97;
    default: return side === 'left' ? x : x + w;
  }
}
const firstNodeOf = items => { for(const it of items) if(it.node) return it.node; return null; };

function buildLayout(){
  const sizes = new Map();
  state.nodes.forEach(n => { const s = measureNode(n); sizes.set(n.id, s); });
  const positions = new Map();
  const links = [], merges = [], labels = [], plusPts = [];
  const infoCache = new Map();

  function subtreeInfo(items){
    if(infoCache.has(items)) return infoCache.get(items);
    let left = 0, right = 0;
    for(const it of items){
      if(it.kind === 'simple'){ const sw = sizes.get(it.node.id).w; left = Math.max(left, sw / 2); right = Math.max(right, sw / 2); }
      else if(it.kind === 'if'){
        const sw = sizes.get(it.node.id).w;
        const fInfo = subtreeInfo(it.falseBranch), tInfo = subtreeInfo(it.trueBranch);
        const minAB = MIN_HORIZ_LEN + sw * 0.485;
        const ABmin = Math.max(2 * minAB, fInfo.right + tInfo.left + HGAP);
        let A = (ABmin + tInfo.right - fInfo.left) / 2, B = ABmin - A;
        if(A < minAB){ A = minAB; B = ABmin - A; } if(B < minAB){ B = minAB; A = ABmin - B; }
        left = Math.max(left, Math.max(sw / 2, A + fInfo.left)); right = Math.max(right, Math.max(sw / 2, B + tInfo.right));
      } else if(it.kind === 'loop'){
        const sw = sizes.get(it.node.id).w;
        const bInfo = subtreeInfo(it.body);
        if(it.node.type === 'dowhile'){
          const bodyRight = it.body.length > 0 ? sw / 2 + HGAP + bInfo.left + bInfo.right + DW_LOOPBACK_OFFSET : sw / 2 + DW_LOOPBACK_OFFSET + MIN_HORIZ_LEN;
          left = Math.max(left, sw / 2); right = Math.max(right, sw / 2, bodyRight);
        } else {
          const B = sw / 2 + HGAP + bInfo.left;
          left = Math.max(left, Math.max(sw / 2, BACK_EDGE_LEN, B - bInfo.left)); right = Math.max(right, Math.max(sw / 2, B + bInfo.right));
        }
      }
    }
    const res = { left, right }; infoCache.set(items, res); return res;
  }

  const tree = FL.parseBlock(state.nodes, 0, state.nodes.length);
  const rootInfo = subtreeInfo(tree);
  const centerX = 40 + rootInfo.left;

  function connect(lastId, lastCX, lastBottomY, lastType, node, cx, y, h, flatIndex){
    if(!lastId) return;
    const ty = anchorTopFor(node, y, h);
    links.push({ from:{ x:lastCX, y:lastBottomY, id:lastId }, to:{ x:cx, y:ty, id:node.id }, type:lastType || 'normal', corners:lastCX !== cx ? [{ x:lastCX, y:(lastBottomY + ty) / 2 }, { x:cx, y:(lastBottomY + ty) / 2 }] : [], insertAt:flatIndex });
    plusPts.push({ x:cx, y:(lastBottomY + ty) / 2, insertAt:flatIndex });
  }

  function layoutItems(items, cx, startY){
    let y = startY;
    let lastId = null, lastCX = cx, lastBottomY = startY, lastType = 'normal';
    for(const item of items){
      if(item.kind === 'simple'){
        const s = sizes.get(item.node.id);
        positions.set(item.node.id, { x:cx - s.w / 2, y, w:s.w, h:s.h });
        connect(lastId, lastCX, lastBottomY, lastType, item.node, cx, y, s.h, item.flatIndex);
        lastId = item.node.id; lastCX = cx; lastBottomY = anchorBottomFor(item.node, y, s.h); lastType = 'normal';
        y += s.h + VGAP; continue;
      }
      if(item.kind === 'if'){
        const s = sizes.get(item.node.id);
        const ifX = cx - s.w / 2;
        positions.set(item.node.id, { x:ifX, y, w:s.w, h:s.h });
        connect(lastId, lastCX, lastBottomY, lastType, item.node, cx, y, s.h, item.flatIndex);
        const ifCY = y + s.h / 2, branchTopY = y + s.h + VGAP;
        const rightVX = ifX + s.w * 0.97, leftVX = ifX + s.w * 0.03;
        const fInfo = subtreeInfo(item.falseBranch), tInfo = subtreeInfo(item.trueBranch);
        const minAB = MIN_HORIZ_LEN + s.w * 0.485;
        const ABmin = Math.max(2 * minAB, fInfo.right + tInfo.left + HGAP);
        let A = (ABmin + tInfo.right - fInfo.left) / 2, B = ABmin - A;
        if(A < minAB){ A = minAB; B = ABmin - A; } if(B < minAB){ B = minAB; A = ABmin - B; }
        const falseCX = cx - A, trueCX = cx + B;
        let falseBottomY, falseLastId, falseLastBottomY, falseLastCX = falseCX;
        if(item.falseBranch.length > 0){
          const first = firstNodeOf(item.falseBranch);
          if(first){ const fs = sizes.get(first.id); links.push({ from:{ x:leftVX, y:ifCY, id:item.node.id }, to:{ x:falseCX, y:anchorTopFor(first, branchTopY, fs.h), id:first.id }, type:'false', corners:[{ x:falseCX, y:ifCY }], insertAt:item.falseInsertAt }); plusPts.push({ x:falseCX, y:(ifCY + branchTopY) / 2 + 8, insertAt:item.falseInsertAt }); }
          const fEnd = layoutItems(item.falseBranch, falseCX, branchTopY);
          falseBottomY = fEnd.bottomY; falseLastId = fEnd.lastId; falseLastBottomY = fEnd.lastBottomY; falseLastCX = fEnd.lastCX;
        } else { falseBottomY = branchTopY + EMPTY_BRANCH_H; falseLastId = null; falseLastBottomY = falseBottomY; }
        let trueBottomY, trueLastId, trueLastBottomY, trueLastCX = trueCX;
        if(item.trueBranch.length > 0){
          const first = firstNodeOf(item.trueBranch);
          if(first){ const fs = sizes.get(first.id); links.push({ from:{ x:rightVX, y:ifCY, id:item.node.id }, to:{ x:trueCX, y:anchorTopFor(first, branchTopY, fs.h), id:first.id }, type:'true', corners:[{ x:trueCX, y:ifCY }], insertAt:item.trueInsertAt }); plusPts.push({ x:trueCX, y:(ifCY + branchTopY) / 2 + 8, insertAt:item.trueInsertAt }); }
          const tEnd = layoutItems(item.trueBranch, trueCX, branchTopY);
          trueBottomY = tEnd.bottomY; trueLastId = tEnd.lastId; trueLastBottomY = tEnd.lastBottomY; trueLastCX = tEnd.lastCX;
        } else { trueBottomY = branchTopY + EMPTY_BRANCH_H; trueLastId = null; trueLastBottomY = trueBottomY; }
        const mergeY = Math.max(trueBottomY, falseBottomY, branchTopY) + MERGE_GAP;
        const mergeId = 'merge_' + item.node.id;
        merges.push({ id:mergeId, x:cx, y:mergeY });
        if(falseLastId){ links.push({ from:{ x:falseLastCX, y:falseLastBottomY, id:falseLastId }, to:{ x:cx, y:mergeY, id:mergeId, isMerge:true }, type:'false', corners:[{ x:falseLastCX, y:mergeY }], insertAt:item.falseEndInsertAt }); }
        else {
          const falseMode = item.hasElse ? null : 'false-no-else';
          links.push({ from:{ x:leftVX, y:ifCY, id:item.node.id }, to:{ x:cx, y:mergeY, id:mergeId, isMerge:true }, type:'false', corners:[{ x:falseCX, y:ifCY }, { x:falseCX, y:mergeY }], insertAt:item.falseInsertAt, insertMode:falseMode });
          plusPts.push({ x:falseCX, y:(ifCY + mergeY) / 2, insertAt:item.falseInsertAt, insertMode:falseMode });
        }
        if(trueLastId){ links.push({ from:{ x:trueLastCX, y:trueLastBottomY, id:trueLastId }, to:{ x:cx, y:mergeY, id:mergeId, isMerge:true }, type:'true', corners:[{ x:trueLastCX, y:mergeY }], insertAt:item.trueEndInsertAt }); }
        else {
          links.push({ from:{ x:rightVX, y:ifCY, id:item.node.id }, to:{ x:cx, y:mergeY, id:mergeId, isMerge:true }, type:'true', corners:[{ x:trueCX, y:ifCY }, { x:trueCX, y:mergeY }], insertAt:item.trueInsertAt });
          plusPts.push({ x:trueCX, y:(ifCY + mergeY) / 2, insertAt:item.trueInsertAt });
        }
        labels.push({ x:(leftVX + falseCX) / 2, y:ifCY - 14, text:'Falso', type:'false' });
        labels.push({ x:(rightVX + trueCX) / 2, y:ifCY - 14, text:'Vero', type:'true' });
        lastId = mergeId; lastCX = cx; lastBottomY = mergeY + 8; lastType = 'normal';
        y = mergeY + VGAP; continue;
      }
      if(item.kind === 'loop'){
        const s = sizes.get(item.node.id);
        const lX = cx - s.w / 2;
        if(item.node.type === 'dowhile'){
          const loopY = y + DW_MERGE_GAP;
          const mergeId = 'merge_' + item.node.id;
          merges.push({ id:mergeId, x:cx, y:y });
          positions.set(item.node.id, { x:lX, y:loopY, w:s.w, h:s.h });
          if(lastId){
            links.push({ from:{ x:lastCX, y:lastBottomY, id:lastId }, to:{ x:cx, y:y - 8, id:mergeId, isMerge:true }, type:lastType || 'normal', corners:lastCX !== cx ? [{ x:lastCX, y:(lastBottomY + y - 8) / 2 }, { x:cx, y:(lastBottomY + y - 8) / 2 }] : [], insertAt:item.flatIndex });
            plusPts.push({ x:cx, y:(lastBottomY + (y - 8)) / 2, insertAt:item.flatIndex });
          }
          const hexTopY = anchorTopFor(item.node, loopY, s.h);
          links.push({ from:{ x:cx, y:y + 8, id:mergeId, isMerge:true }, to:{ x:cx, y:hexTopY, id:item.node.id }, type:'loop', corners:[] });
          const loopCY = loopY + s.h / 2, loopBottom = anchorBottomFor(item.node, loopY, s.h), rightVX = lX + s.w * 0.97;
          const bInfo = subtreeInfo(item.body);
          const bodyCX = cx + s.w / 2 + HGAP + bInfo.left;
          let bodyEnd;
          if(item.body.length > 0){
            const first = firstNodeOf(item.body); const fSize = sizes.get(first.id);
            const bodyStartY = loopY + (s.h - fSize.h) / 2;
            const firstLeftX = shapeSideX(first, bodyCX - fSize.w / 2, fSize.w, 'left');
            links.push({ from:{ x:rightVX, y:loopCY, id:item.node.id }, to:{ x:firstLeftX, y:loopCY, id:first.id }, type:'loop', corners:[], insertAt:item.bodyInsertAt });
            plusPts.push({ x:(rightVX + firstLeftX) / 2, y:loopCY, insertAt:item.bodyInsertAt });
            bodyEnd = layoutItems(item.body, bodyCX, bodyStartY);
          } else bodyEnd = { bottomY:loopY + EMPTY_BRANCH_H, lastId:null, lastBottomY:loopY, lastCX:bodyCX, lastType:'loop' };
          const loopBackX = item.body.length > 0 ? Math.max(cx + s.w / 2 + DW_LOOPBACK_OFFSET, bodyCX + bInfo.right + DW_LOOPBACK_OFFSET) : rightVX + MIN_HORIZ_LEN;
          if(bodyEnd.lastId){
            const lastNode = state.nodes.find(n => n.id === bodyEnd.lastId);
            const lastSize = lastNode ? sizes.get(lastNode.id) : null;
            const lastRightY = lastSize ? bodyEnd.lastBottomY - lastSize.h / 2 : bodyEnd.lastBottomY;
            const lastRightX = lastSize ? shapeSideX(lastNode, bodyEnd.lastCX - lastSize.w / 2, lastSize.w, 'right') : bodyEnd.lastCX;
            links.push({ from:{ x:lastRightX, y:lastRightY, id:bodyEnd.lastId }, to:{ x:cx + 8, y:y, id:mergeId, isMerge:true }, type:'loop', corners:[{ x:loopBackX, y:lastRightY }, { x:loopBackX, y:y }], insertAt:item.endloopIndex });
            plusPts.push({ x:loopBackX, y:(y + lastRightY) / 2, insertAt:item.endloopIndex });
          } else {
            links.push({ from:{ x:rightVX, y:loopCY, id:item.node.id }, to:{ x:cx + 8, y:y, id:mergeId, isMerge:true }, type:'loop', corners:[{ x:loopBackX, y:loopCY }, { x:loopBackX, y:y }], insertAt:item.endloopIndex });
            plusPts.push({ x:loopBackX, y:(y + loopCY) / 2, insertAt:item.endloopIndex });
          }
          labels.push({ x:cx - 28, y:loopBottom + 12, text:'Falso', type:'false' });
          labels.push({ x:loopBackX + 34, y:(loopCY + y) / 2, text:'Vero', type:'loop' });
          lastId = item.node.id; lastCX = cx; lastBottomY = loopBottom; lastType = 'false';
          y = Math.max(loopBottom, bodyEnd.bottomY) + VGAP;
          continue;
        }
        /* WHILE / FOR */
        const loopY = y;
        positions.set(item.node.id, { x:lX, y:loopY, w:s.w, h:s.h });
        connect(lastId, lastCX, lastBottomY, lastType, item.node, cx, y, s.h, item.flatIndex);
        const loopCY = loopY + s.h / 2, loopBottom = loopY + s.h, blockEdgeY = anchorBottomFor(item.node, loopY, s.h);
        const bodyTopY = loopBottom + VGAP, rightVX = lX + s.w * 0.97, repeatX = lX + s.w * 0.72;
        const bInfo = subtreeInfo(item.body);
        const bodyCX = cx + s.w / 2 + HGAP + bInfo.left;
        let bodyEnd;
        if(item.body.length > 0){
          const first = firstNodeOf(item.body); const fSize = sizes.get(first.id);
          links.push({ from:{ x:rightVX, y:loopCY, id:item.node.id }, to:{ x:bodyCX, y:anchorTopFor(first, bodyTopY, fSize.h), id:first.id }, type:'loop', corners:[{ x:bodyCX, y:loopCY }], insertAt:item.bodyInsertAt });
          plusPts.push({ x:(rightVX + bodyCX) / 2, y:loopCY, insertAt:item.bodyInsertAt });
          bodyEnd = layoutItems(item.body, bodyCX, bodyTopY);
        } else {
          bodyEnd = { bottomY:bodyTopY + EMPTY_BRANCH_H, lastId:null, lastBottomY:bodyTopY + EMPTY_BRANCH_H, lastCX:bodyCX, lastType:'loop' };
        }
        const backY = Math.max(bodyEnd.bottomY, loopBottom) + LOOPBACK_GAP;
        if(bodyEnd.lastId){
          links.push({ from:{ x:bodyEnd.lastCX, y:bodyEnd.lastBottomY, id:bodyEnd.lastId }, to:{ x:repeatX, y:blockEdgeY, id:item.node.id }, type:'loop', corners:[{ x:bodyEnd.lastCX, y:backY }, { x:repeatX, y:backY }], insertAt:item.endloopIndex });
          plusPts.push({ x:bodyEnd.lastCX, y:(bodyEnd.lastBottomY + backY) / 2, insertAt:item.endloopIndex });
        } else {
          links.push({ from:{ x:rightVX, y:loopCY, id:item.node.id }, to:{ x:repeatX, y:blockEdgeY, id:item.node.id }, type:'loop', corners:[{ x:bodyCX, y:loopCY }, { x:bodyCX, y:backY }, { x:repeatX, y:backY }], insertAt:item.bodyInsertAt });
          plusPts.push({ x:bodyCX, y:(loopCY + backY) / 2, insertAt:item.bodyInsertAt });
        }
        labels.push({ x:(rightVX + bodyCX) / 2, y:loopCY - 18, text:'Vero', type:'loop' });
        labels.push({ x:cx - 26, y:loopBottom + 12, text:'Falso', type:'false' });
        lastId = item.node.id; lastCX = cx; lastBottomY = blockEdgeY; lastType = 'false';
        y = backY + VGAP;
        continue;
      }
    }
    const bottomY = lastId ? (y - VGAP) : startY;
    return { bottomY, lastId, lastCX, lastBottomY, lastType };
  }

  layoutItems(tree, centerX, 40);

  let minX = Infinity, maxX = -Infinity, maxY = 0;
  positions.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h); });
  merges.forEach(m => { minX = Math.min(minX, m.x - 20); maxX = Math.max(maxX, m.x + 20); maxY = Math.max(maxY, m.y + 20); });
  labels.forEach(lb => { minX = Math.min(minX, lb.x - 40); maxX = Math.max(maxX, lb.x + 40); maxY = Math.max(maxY, lb.y + 12); });
  links.forEach(l => {
    [l.from, l.to].concat(l.corners || []).forEach(c => { if(c){ minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); } });
  });
  plusPts.forEach(p => { minX = Math.min(minX, p.x - 20); maxX = Math.max(maxX, p.x + 20); maxY = Math.max(maxY, p.y + 20); });
  const shiftX = 40 - minX;
  if(shiftX !== 0){
    positions.forEach(p => p.x += shiftX);
    merges.forEach(m => m.x += shiftX);
    links.forEach(l => { if(l.from) l.from.x += shiftX; if(l.to) l.to.x += shiftX; if(l.corners) l.corners.forEach(c => c.x += shiftX); });
    labels.forEach(lb => lb.x += shiftX);
    plusPts.forEach(p => p.x += shiftX);
    minX += shiftX; maxX += shiftX;
  }
  return { positions, links, merges, labels, plusPts, minX, maxX, maxY, sizes };
}

function renderLinks(layout){
  linksEl.innerHTML = ''; overlayEl.innerHTML = '';
  const W = state.natW || 800, H = state.natH || 600;
  linksEl.setAttribute('width', W); linksEl.setAttribute('height', H); linksEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  overlayEl.style.width = W + 'px'; overlayEl.style.height = H + 'px';
  const frag = document.createDocumentFragment();
  layout.links.forEach(link => {
    const { from, to, type, corners } = link; if(!from || !to) return;
    let d = 'M ' + from.x + ' ' + from.y;
    if(corners && corners.length) for(const c of corners) d += ' L ' + c.x + ' ' + c.y;
    d += ' L ' + to.x + ' ' + to.y;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); path.setAttribute('class', 'link ' + (type === 'true' || type === 'false' || type === 'loop' ? type : 'normal'));
    path.dataset.fromId = from.id || ''; path.dataset.toId = to.id || '';
    if(typeof link.insertAt === 'number' && link.insertAt >= 0){
      path.dataset.clickable = '1';
      path.addEventListener('click', e => { e.stopPropagation(); requestInsert(link.insertAt, link.insertMode || null); });
    }
    frag.appendChild(path);
  });
  const drawn = [];
  layout.links.forEach(link => {
    if(link.noArrow) return;
    const { from, to, type, corners } = link; if(!from || !to) return;
    const lastPt = corners && corners.length ? corners[corners.length - 1] : from;
    const dx = to.x - lastPt.x, dy = to.y - lastPt.y;
    const len = Math.hypot(dx, dy); if(len < ARROW_LEN * 1.5) return;
    const ux = dx / len, uy = dy / len;
    if(drawn.some(a => Math.abs(a.x - to.x) < 15 && Math.abs(a.y - to.y) < 15 && Math.abs(a.ux - ux) < 0.4 && Math.abs(a.uy - uy) < 0.4)) return;
    drawn.push({ x:to.x, y:to.y, ux, uy });
    const px = -uy, py = ux, bx = to.x - ux * ARROW_LEN, by = to.y - uy * ARROW_LEN;
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points', to.x + ',' + to.y + ' ' + (bx + px * ARROW_WID) + ',' + (by + py * ARROW_WID) + ' ' + (bx - px * ARROW_WID) + ',' + (by - py * ARROW_WID));
    arrow.setAttribute('class', 'link-arrow ' + (type === 'true' || type === 'false' || type === 'loop' ? type : 'normal'));
    frag.appendChild(arrow);
  });
  linksEl.appendChild(frag);
  const ofrag = document.createDocumentFragment();
  layout.merges.forEach(m => { const c = document.createElement('div'); c.className = 'merge-circle'; c.dataset.id = m.id; c.style.left = m.x + 'px'; c.style.top = m.y + 'px'; ofrag.appendChild(c); });
  layout.labels.forEach(l => { const el = document.createElement('div'); el.className = 'branch-label ' + l.type; el.textContent = l.text; el.style.left = l.x + 'px'; el.style.top = l.y + 'px'; ofrag.appendChild(el); });
  layout.plusPts.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'plus-area'; wrap.style.left = p.x + 'px'; wrap.style.top = p.y + 'px';
    wrap.dataset.insertAt = p.insertAt; if(p.insertMode) wrap.dataset.insertMode = p.insertMode;
    const btn = document.createElement('button');
    btn.className = 'plus'; btn.innerHTML = svgPlus(); btn.title = 'Aggiungi blocco qui';
    btn.addEventListener('click', e => { e.stopPropagation(); requestInsert(p.insertAt, p.insertMode || null); });
    wrap.appendChild(btn);
    wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('drop-hover'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-hover'));
    wrap.addEventListener('drop', e => {
      e.preventDefault(); wrap.classList.remove('drop-hover'); canvasEl.classList.remove('dnd-active');
      const type = e.dataTransfer.getData('text/flowlab-type');
      if(type) insertFromPalette(type, p.insertAt, p.insertMode || null);
    });
    ofrag.appendChild(wrap);
  });
  overlayEl.appendChild(ofrag);
}

function layoutAll(){
  const layout = buildLayout();
  layout.positions.forEach((p, id) => {
    const el = nodesEl.querySelector('.node[data-id="' + id + '"]');
    if(!el) return;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
    if(el.dataset.type === 'comment'){ const ta = el.querySelector('textarea'); if(ta) ta.style.height = Math.max(20, p.h - 40) + 'px'; }
  });
  state.natW = Math.max(layout.maxX + 200, 200);
  state.natH = Math.max(layout.maxY + 200, 200);
  state.contentMinX = layout.minX; state.contentMaxX = layout.maxX;
  state.contentMinY = 0; state.contentMaxY = layout.maxY;
  canvasContentEl.style.width = state.natW + 'px';
  canvasContentEl.style.height = state.natH + 'px';
  renderLinks(layout);
  if(!state.hasCentered){ fitToView(); state.hasCentered = true; } else { clampPan(); applyTransform(); }
}

let _convToken = 0;
function convergeLayout(){
  const my = ++_convToken; let iter = 0;
  const step = () => {
    if(my !== _convToken) return;
    let changed = false;
    state.nodes.forEach(n => {
      if(n.type === 'comment') return;
      const el = nodesEl.querySelector('.node[data-id="' + n.id + '"]'); if(!el) return;
      const inp = el.querySelector('input.node-input');
      if(!inp) return;
      const over = inp.scrollWidth - inp.clientWidth;
      if(over > 1){ n._extraW = (n._extraW || 0) + over + 8; changed = true; }
    });
    if(changed && iter < 5){ iter++; layoutAll(); requestAnimationFrame(step); }
  };
  step();
}

function render(){
  const focusId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.node') ? document.activeElement.closest('.node').dataset.id : null;
  validateFunc();
  nodesEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.nodes.forEach((n, i) => {
    if(n.type === 'else' || n.type === 'endif' || n.type === 'endloop') return;
    frag.appendChild(createNodeEl(n, i));
  });
  nodesEl.appendChild(frag);
  layoutAll();
  renderFuncTabs();
  requestAnimationFrame(() => { layoutAll(); convergeLayout(); });
  if(focusId){ const inp = nodesEl.querySelector('.node[data-id="' + focusId + '"] .node-input'); if(inp && inp.focus) inp.focus(); }
}

/* ---------- Validazione live ---------- */
function validateNode(n){
  const one = { funcs:[{ nodes:[n] }] };
  const iss = FL.checkProject(one);
  const el = nodesEl.querySelector('.node[data-id="' + n.id + '"]');
  if(iss.length){ state.invalid.set(n.id, iss[0].msg); if(el){ el.classList.add('invalid'); el.title = iss[0].msg; } }
  else { state.invalid.delete(n.id); if(el){ el.classList.remove('invalid'); el.title = ''; } }
}
function validateFunc(){
  state.invalid = new Map();
  FL.checkProject({ funcs:[curFunc()] }).forEach(i => { if(!state.invalid.has(i.nodeId)) state.invalid.set(i.nodeId, i.msg); });
}

/* ============================================================
   Zoom / pan
   ============================================================ */
function applyTransform(){ canvasContentEl.style.transform = 'translate(' + state.panX + 'px, ' + state.panY + 'px) scale(' + state.zoom + ')'; $('ctZoom').textContent = Math.round(state.zoom * 100) + '%'; }
function clampPan(){
  const wrapW = canvasEl.clientWidth, wrapH = canvasEl.clientHeight;
  const visW = state.natW * state.zoom, visH = state.natH * state.zoom, m = PAN_MARGIN;
  let minX, maxX, minY, maxY;
  if(visW <= wrapW){ minX = -m; maxX = wrapW - visW + m; } else { minX = wrapW - visW - m; maxX = m; }
  if(visH <= wrapH){ minY = -m; maxY = wrapH - visH + m; } else { minY = wrapH - visH - m; maxY = m; }
  state.panX = Math.max(minX, Math.min(maxX, state.panX));
  state.panY = Math.max(minY, Math.min(maxY, state.panY));
}
function fitToView(){
  const wrapW = canvasEl.clientWidth, wrapH = canvasEl.clientHeight;
  if(!wrapW || !wrapH) return;
  const contentW = Math.max(1, state.contentMaxX - state.contentMinX), contentH = Math.max(1, state.contentMaxY - state.contentMinY);
  const z = Math.max(MIN_ZOOM, Math.min(1, Math.min((wrapW - 30) / contentW, (wrapH - TOP_ANCHOR_Y - 15) / contentH)));
  state.zoom = z;
  state.panX = wrapW / 2 - (state.contentMinX + state.contentMaxX) / 2 * z;
  state.panY = TOP_ANCHOR_Y;
  clampPan(); applyTransform();
}
function zoomTo(newZ, ax, ay){
  const oldZ = state.zoom, z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZ));
  if(Math.abs(z - oldZ) < 0.001) return;
  const wx = (ax - state.panX) / oldZ, wy = (ay - state.panY) / oldZ;
  state.zoom = z; state.panX = ax - wx * z; state.panY = ay - wy * z;
  clampPan(); applyTransform();
}
function zoomToCenter(z){ zoomTo(z, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2); }

let mousePan = null;
canvasEl.addEventListener('mousedown', e => {
  if(e.button !== 1 && !(e.button === 0 && !e.target.closest('.node, .plus, .node-del, .node-sublabel, .for-display'))) return;
  e.preventDefault();
  if(document.activeElement && document.activeElement.blur && e.button === 0) document.activeElement.blur();
  if(e.button === 0) selectNode(null);
  mousePan = { x:e.clientX, y:e.clientY, px:state.panX, py:state.panY };
  canvasEl.classList.add('panning');
});
document.addEventListener('mousemove', e => {
  if(!mousePan) return;
  state.panX = mousePan.px + (e.clientX - mousePan.x); state.panY = mousePan.py + (e.clientY - mousePan.y);
  clampPan(); applyTransform();
});
document.addEventListener('mouseup', () => { if(!mousePan) return; mousePan = null; canvasEl.classList.remove('panning'); });
canvasEl.addEventListener('auxclick', e => { if(e.button === 1) e.preventDefault(); });
canvasEl.addEventListener('wheel', e => {
  e.preventDefault();
  if(!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6 && e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && e.deltaX !== 0){
    state.panX -= e.deltaX; state.panY -= e.deltaY; clampPan(); applyTransform(); return;
  }
  const r = canvasEl.getBoundingClientRect();
  let d = e.deltaY; if(e.deltaMode === 1) d *= 16; else if(e.deltaMode === 2) d *= 100;
  zoomTo(state.zoom * Math.exp(-d * 0.0015), e.clientX - r.left, e.clientY - r.top);
}, { passive:false });

let touchState = null;
canvasEl.addEventListener('touchstart', e => {
  if(e.touches.length === 2){
    const t1 = e.touches[0], t2 = e.touches[1], r = canvasEl.getBoundingClientRect();
    touchState = { mode:'pinch', d:Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY), z:state.zoom, mx:(t1.clientX + t2.clientX) / 2 - r.left, my:(t1.clientY + t2.clientY) / 2 - r.top, px:state.panX, py:state.panY };
    if(moveDrag) cancelMoveDrag();
    e.preventDefault(); return;
  }
  if(e.touches.length === 1){
    if(e.target.closest('.node, .plus, .node-del, .node-sublabel, .for-display')) return;
    const t = e.touches[0];
    touchState = { mode:'pan', x:t.clientX, y:t.clientY, px:state.panX, py:state.panY };
  }
}, { passive:false });
canvasEl.addEventListener('touchmove', e => {
  if(!touchState) return;
  if(touchState.mode === 'pinch' && e.touches.length >= 2){
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1], r = canvasEl.getBoundingClientRect();
    const d = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    const mx = (t1.clientX + t2.clientX) / 2 - r.left, my = (t1.clientY + t2.clientY) / 2 - r.top;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchState.z * d / touchState.d));
    const wx = (touchState.mx - touchState.px) / touchState.z, wy = (touchState.my - touchState.py) / touchState.z;
    state.zoom = z; state.panX = mx - wx * z; state.panY = my - wy * z;
    clampPan(); applyTransform(); return;
  }
  if(touchState.mode === 'pan' && e.touches.length === 1){
    e.preventDefault();
    const t = e.touches[0];
    state.panX = touchState.px + (t.clientX - touchState.x); state.panY = touchState.py + (t.clientY - touchState.y);
    clampPan(); applyTransform();
  }
}, { passive:false });
function endTouch(e){
  if(!touchState) return;
  if(touchState.mode === 'pinch' && e.touches.length === 1){ const t = e.touches[0]; touchState = { mode:'pan', x:t.clientX, y:t.clientY, px:state.panX, py:state.panY }; return; }
  if(e.touches.length === 0) touchState = null;
}
canvasEl.addEventListener('touchend', endTouch);
canvasEl.addEventListener('touchcancel', endTouch);

/* ============================================================
   Trascinamento blocchi (spostamento su un "+")
   ============================================================ */
let moveDrag = null;
function attachMoveDrag(el, node){
  const start = (cx, cy, touch, e) => {
    if(e.target.closest('input, textarea, .node-del, .node-sublabel, .node-opt, .for-display, .clickable')) return;
    if(run.status !== 'idle') return;
    moveDrag = { el, node, sx:cx, sy:cy, active:false, touch, ghost:null };
    el.dataset.wasDragging = 'false';
  };
  el.addEventListener('mousedown', e => { if(e.button !== 0) return; start(e.clientX, e.clientY, false, e); if(moveDrag) e.stopPropagation(); });
  el.addEventListener('touchstart', e => { if(e.touches.length !== 1) return; const t = e.touches[0]; start(t.clientX, t.clientY, true, e); }, { passive:true });
}
function moveDragMove(cx, cy, e){
  if(!moveDrag) return;
  const th = moveDrag.touch ? 14 : 8;
  if(!moveDrag.active){
    if(Math.abs(cx - moveDrag.sx) < th && Math.abs(cy - moveDrag.sy) < th) return;
    moveDrag.active = true;
    moveDrag.el.classList.add('dragging');
    canvasEl.classList.add('dnd-active');
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.textContent = DEFS[moveDrag.node.type].label + (moveDrag.node.text ? ': ' + moveDrag.node.text : '');
    document.body.appendChild(g);
    moveDrag.ghost = g;
  }
  if(e && e.cancelable) e.preventDefault();
  moveDrag.ghost.style.left = cx + 'px'; moveDrag.ghost.style.top = cy + 'px';
  overlayEl.querySelectorAll('.plus-area.drop-hover').forEach(p => p.classList.remove('drop-hover'));
  const t = dropTargetAt(cx, cy); if(t) t.classList.add('drop-hover');
}
function dropTargetAt(cx, cy){
  let best = null, bd = 34;
  overlayEl.querySelectorAll('.plus-area').forEach(p => {
    const r = p.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
    if(d < bd){ bd = d; best = p; }
  });
  return best;
}
function moveDragEnd(cx, cy){
  if(!moveDrag) return;
  const md = moveDrag; moveDrag = null;
  if(!md.active) return;
  md.el.dataset.wasDragging = 'true';
  setTimeout(() => { md.el.dataset.wasDragging = 'false'; }, 60);
  const t = dropTargetAt(cx, cy);
  cleanupDrag(md);
  if(t) moveNode(md.node.id, parseInt(t.dataset.insertAt, 10), t.dataset.insertMode || null);
}
function cleanupDrag(md){
  if(md.ghost) md.ghost.remove();
  md.el.classList.remove('dragging');
  canvasEl.classList.remove('dnd-active');
  overlayEl.querySelectorAll('.plus-area.drop-hover').forEach(p => p.classList.remove('drop-hover'));
}
function cancelMoveDrag(){ if(moveDrag){ cleanupDrag(moveDrag); moveDrag = null; } }
document.addEventListener('mousemove', e => { if(moveDrag && !moveDrag.touch) moveDragMove(e.clientX, e.clientY, e); });
document.addEventListener('mouseup', e => { if(moveDrag && !moveDrag.touch) moveDragEnd(e.clientX, e.clientY); });
document.addEventListener('touchmove', e => { if(moveDrag && moveDrag.touch && e.touches.length === 1) moveDragMove(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive:false });
document.addEventListener('touchend', e => { if(moveDrag && moveDrag.touch){ const t = e.changedTouches[0]; moveDragEnd(t.clientX, t.clientY); } });
window.addEventListener('blur', cancelMoveDrag);

/* drag dalla palette (HTML5 DnD) */
document.querySelectorAll('.card[data-add]').forEach(c => {
  c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/flowlab-type', c.dataset.add); e.dataTransfer.effectAllowed = 'copy'; canvasEl.classList.add('dnd-active'); });
  c.addEventListener('dragend', () => canvasEl.classList.remove('dnd-active'));
});

/* ============================================================
   Operazioni sui blocchi
   ============================================================ */
function makeNode(type, opts){
  const node = { id:uid(), type, text:'' };
  if(opts && opts.declareType) node.declareType = opts.declareType;
  if(type === 'for') node.forData = { variable:'', start:'1', end:'10', direction:'inc', step:'1' };
  if(type === 'output') node.newline = true;
  return node;
}
function addNode(type, atIndex, opts){
  opts = opts || {};
  if(!DEFS[type]){ toast('Tipo sconosciuto'); return; }
  const nodes = state.nodes;
  if(atIndex === undefined || atIndex === null || atIndex < 0) atIndex = nodes.length - 1;
  atIndex = Math.max(1, Math.min(nodes.length - 1, atIndex));
  if(opts.mode === 'false-no-else'){ nodes.splice(atIndex, 0, { id:uid(), type:'else', text:'' }); atIndex++; }
  const node = makeNode(type, opts);
  nodes.splice(atIndex, 0, node);
  if(type === 'if') nodes.splice(atIndex + 1, 0, { id:uid(), type:'endif', text:'' });
  else if(type === 'for' || type === 'while' || type === 'dowhile') nodes.splice(atIndex + 1, 0, { id:uid(), type:'endloop', text:'' });
  state.selectedId = node.id;
  pushHistory(); render(); scheduleSave();
  if(type === 'for') setTimeout(() => openForDialog(node), 120);
  else setTimeout(() => { const inp = nodesEl.querySelector('.node[data-id="' + node.id + '"] .node-input:not(.node-static)'); if(inp && !isMobile()) inp.focus(); }, 60);
  return node;
}
function insertFromPalette(type, at, mode){
  if(type === 'declare'){ openTypePicker(null, t => { addNode('declare', at, { declareType:t, mode }); haptic(); }); return; }
  addNode(type, at, { mode }); haptic();
}
function deleteNode(id){
  const nodes = state.nodes;
  const i = nodes.findIndex(n => n.id === id); if(i === -1) return;
  const n = nodes[i];
  if(!DEFS[n.type].deletable){ toast('Blocco non eliminabile'); return; }
  const j = FL.structEnd(nodes, i);
  const inner = j - i - 1;
  if(inner > 1 && !confirm('Eliminare il blocco ' + DEFS[n.type].label + ' e tutti i blocchi al suo interno?')) return;
  nodes.splice(i, j - i + 1);
  cleanupEmptyElse();
  if(state.selectedId === id) state.selectedId = null;
  pushHistory(); render(); scheduleSave();
}
/* rimuove gli Else rimasti senza blocchi */
function cleanupEmptyElse(){
  const nodes = state.nodes;
  for(let k = nodes.length - 1; k >= 0; k--){
    if(nodes[k].type === 'else' && nodes[k + 1] && nodes[k + 1].type === 'endif'){
      /* verifica che sia l'else del proprio if */
      nodes.splice(k, 1);
    }
  }
}
function moveNode(id, at, mode){
  const nodes = state.nodes;
  const i = nodes.findIndex(n => n.id === id); if(i < 0) return;
  const j = FL.structEnd(nodes, i);
  if(at > i && at <= j + 1 && !(at === j + 1 && mode)){ if(at > i && at <= j) toast('Non puoi spostare un blocco dentro se stesso'); return; }
  if(at === i && !mode) return;
  const seg = nodes.splice(i, j - i + 1);
  if(at > j) at -= seg.length;
  if(mode === 'false-no-else'){ nodes.splice(at, 0, { id:uid(), type:'else', text:'' }); at++; }
  nodes.splice(at, 0, ...seg);
  cleanupEmptyElse();
  pushHistory(); render(); scheduleSave();
  toast('Blocco spostato');
}
function copyNode(id){
  const nodes = state.nodes, i = nodes.findIndex(n => n.id === id); if(i < 0) return;
  if(!DEFS[nodes[i].type].deletable){ toast('Questo blocco non si può copiare'); return; }
  state.clipboard = clone(nodes.slice(i, FL.structEnd(nodes, i) + 1));
  $('pickPaste').disabled = false;
  toast('Copiato');
}
function pasteAt(at){
  if(!state.clipboard){ toast('Niente da incollare'); return; }
  const seg = clone(state.clipboard).map(n => Object.assign(n, { id:uid(), bp:false }));
  const nodes = state.nodes;
  at = Math.max(1, Math.min(nodes.length - 1, at));
  nodes.splice(at, 0, ...seg);
  state.selectedId = seg[0].id;
  pushHistory(); render(); scheduleSave();
  toast('Incollato');
}
function pasteAfter(id){
  const nodes = state.nodes, i = nodes.findIndex(n => n.id === id);
  pasteAt(i < 0 ? nodes.length - 1 : FL.structEnd(nodes, i) + 1);
}
function duplicateNode(id){ const keep = state.clipboard; copyNode(id); pasteAfter(id); state.clipboard = keep || state.clipboard; }
function toggleBreakpoint(id){
  const n = findNode(id); if(!n) return;
  if(['start', 'end', 'comment'].includes(n.type) && n.type !== 'end'){ toast('Breakpoint non disponibile su questo blocco'); return; }
  n.bp = !n.bp;
  render(); scheduleSave(); markDirty();
  toast(n.bp ? 'Breakpoint attivato' : 'Breakpoint rimosso');
}
function selectNode(id){
  state.selectedId = id;
  nodesEl.querySelectorAll('.node').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
}
function requestInsert(at, mode){ state.insertAt = at; state.insertMode = mode || null; $('pickPaste').disabled = !state.clipboard; pickerEl.hidden = false; }
function ensureStartEnd(f){
  const nodes = f.nodes;
  const start = nodes.find(n => n.type === 'start'), end = nodes.find(n => n.type === 'end');
  const mid = nodes.filter(n => n.type !== 'start' && n.type !== 'end');
  f.nodes = [start || { id:uid(), type:'start', text:'' }].concat(mid, [end || { id:uid(), type:'end', text:'' }]);
}

/* ---------- Menu contestuale ---------- */
const ctxMenu = $('ctxMenu');
let ctxNodeId = null;
function openCtxMenu(x, y, node){
  ctxNodeId = node.id;
  ctxMenu.hidden = false;
  const r = ctxMenu.getBoundingClientRect();
  ctxMenu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
  ctxMenu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  const del = DEFS[node.type].deletable;
  ctxMenu.querySelector('[data-ctx="copy"]').disabled = !del;
  ctxMenu.querySelector('[data-ctx="dup"]').disabled = !del;
  ctxMenu.querySelector('[data-ctx="del"]').disabled = !del;
  ctxMenu.querySelector('[data-ctx="paste"]').disabled = !state.clipboard || node.type === 'end';
}
function closeCtxMenu(){ ctxMenu.hidden = true; ctxNodeId = null; }
ctxMenu.addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b || !ctxNodeId) return;
  const id = ctxNodeId; closeCtxMenu();
  ({ bp:() => toggleBreakpoint(id), copy:() => copyNode(id), dup:() => duplicateNode(id), paste:() => pasteAfter(id), del:() => deleteNode(id) })[b.dataset.ctx]();
});
document.addEventListener('mousedown', e => { if(!ctxMenu.hidden && !e.target.closest('.ctx-menu')) closeCtxMenu(); });

/* ============================================================
   Dialoghi
   ============================================================ */
function openTypePicker(currentType, onConfirm){
  typeModal.hidden = false;
  typeModal.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('current', b.dataset.type === currentType));
  typeModal._cb = onConfirm;
}
function closeTypePicker(){ typeModal.hidden = true; typeModal._cb = null; }
typeModal.addEventListener('click', e => {
  if(e.target === typeModal){ closeTypePicker(); return; }
  const btn = e.target.closest('.type-btn'); if(!btn) return;
  const cb = typeModal._cb; closeTypePicker(); if(cb) cb(btn.dataset.type);
});
$('typeClose').addEventListener('click', closeTypePicker);

function openForDialog(node){
  state.editingForId = node.id;
  const d = node.forData || {};
  $('forVar').value = d.variable || '';
  $('forStart').value = d.start !== undefined && d.start !== '' ? d.start : '1';
  $('forEnd').value = d.end !== undefined && d.end !== '' ? d.end : '10';
  $('forStep').value = d.step || '1';
  const dir = d.direction || 'inc';
  forModal.querySelectorAll('input[name="forDirection"]').forEach(r => { r.checked = r.value === dir; });
  const vars = FL.collectVars(curFunc());
  $('forVarList').innerHTML = Object.keys(vars).filter(k => !vars[k].arr && (vars[k].type === 'Integer' || vars[k].type === 'Real')).map(k => '<option value="' + esc(k) + '">').join('');
  forModal.hidden = false;
  setTimeout(() => $('forVar').focus(), 60);
}
function closeForDialog(){ forModal.hidden = true; state.editingForId = null; }
function confirmForDialog(){
  const node = findNode(state.editingForId); if(!node){ closeForDialog(); return; }
  const variable = $('forVar').value.trim();
  if(!/^[A-Za-z_]\w*$/.test(variable)){ toast('Nome variabile non valido'); return; }
  const start = $('forStart').value.trim() || '0', end = $('forEnd').value.trim() || '0', step = $('forStep').value.trim() || '1';
  try{ FL.parseExpr(start); FL.parseExpr(end); FL.parseExpr(step); }catch(e){ toast('Espressione non valida: ' + e.message, 3000); return; }
  const dir = forModal.querySelector('input[name="forDirection"]:checked');
  node.forData = { variable, start, end, direction:dir ? dir.value : 'inc', step };
  node._extraW = 0;
  if($('forAutoDeclare').checked && !FL.collectVars(curFunc())[variable]){
    const nodes = state.nodes;
    nodes.splice(1, 0, { id:uid(), type:'declare', declareType:'Integer', text:variable });
    toast('Dichiarata Integer ' + variable);
  }
  pushHistory(); render(); scheduleSave();
  closeForDialog();
}
$('forOk').addEventListener('click', confirmForDialog);
$('forCancel').addEventListener('click', closeForDialog);
$('forClose').addEventListener('click', closeForDialog);
forModal.addEventListener('click', e => { if(e.target === forModal) closeForDialog(); });
['forVar', 'forStart', 'forEnd', 'forStep'].forEach(id => $(id).addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); confirmForDialog(); } }));

/* ---------- Funzioni ---------- */
let funcEditIdx = -1;
function paramRowHTML(p){
  return '<div class="param-row"><input class="p-name" type="text" placeholder="nome" value="' + esc(p.name || '') + '" spellcheck="false" autocomplete="off" />'
    + '<select class="p-type">' + FL.TYPES.map(t => '<option' + (t === (p.type || 'Integer') ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>'
    + '<label class="chk"><input type="checkbox" class="p-arr"' + (p.array ? ' checked' : '') + ' /> array</label>'
    + '<button class="mini-btn p-del" type="button" title="Rimuovi">×</button></div>';
}
function openFuncDialog(idx){
  funcEditIdx = idx;
  const f = idx >= 0 ? state.funcs[idx] : { name:'', params:[], returnType:'None', returnVar:'' };
  $('funcModalTitle').textContent = idx >= 0 ? 'Modifica funzione' : 'Nuova funzione';
  $('funcName').value = f.name;
  $('funcName').disabled = idx >= 0 && isMainFunc(f);
  $('funcParams').innerHTML = (f.params || []).map(paramRowHTML).join('');
  $('funcRetType').value = f.returnType || 'None';
  $('funcRetVar').value = f.returnVar || '';
  $('funcDelete').hidden = !(idx >= 0 && !isMainFunc(f));
  updateRetVarState();
  funcModal.hidden = false;
  setTimeout(() => $('funcName').focus(), 60);
}
function updateRetVarState(){ const none = $('funcRetType').value === 'None'; $('funcRetVar').disabled = none; $('funcRetHint').style.opacity = none ? .5 : 1; }
$('funcRetType').addEventListener('change', updateRetVarState);
$('funcAddParam').addEventListener('click', () => { $('funcParams').insertAdjacentHTML('beforeend', paramRowHTML({ type:'Integer' })); const ins = $('funcParams').querySelectorAll('.p-name'); ins[ins.length - 1].focus(); });
$('funcParams').addEventListener('click', e => { const d = e.target.closest('.p-del'); if(d) d.closest('.param-row').remove(); });
function closeFuncDialog(){ funcModal.hidden = true; }
$('funcClose').addEventListener('click', closeFuncDialog);
$('funcCancel').addEventListener('click', closeFuncDialog);
funcModal.addEventListener('click', e => { if(e.target === funcModal) closeFuncDialog(); });
$('funcOk').addEventListener('click', () => {
  const name = $('funcName').value.trim();
  const isEdit = funcEditIdx >= 0;
  const old = isEdit ? state.funcs[funcEditIdx] : null;
  if(!/^[A-Za-z_]\w*$/.test(name)){ toast('Nome funzione non valido'); return; }
  if(FL.INTRINSICS[name.toLowerCase()] || name.toLowerCase() in FL.GRAPHICS || name.toLowerCase() === 'size'){ toast('"' + name + '" è il nome di una funzione intrinseca'); return; }
  if(state.funcs.some((f, i) => i !== funcEditIdx && f.name.toLowerCase() === name.toLowerCase())){ toast('Esiste già una funzione ' + name); return; }
  const params = [];
  for(const row of $('funcParams').querySelectorAll('.param-row')){
    const pn = row.querySelector('.p-name').value.trim();
    if(!pn) continue;
    if(!/^[A-Za-z_]\w*$/.test(pn)){ toast('Parametro non valido: ' + pn); return; }
    if(params.some(p => p.name === pn)){ toast('Parametro duplicato: ' + pn); return; }
    params.push({ name:pn, type:row.querySelector('.p-type').value, array:row.querySelector('.p-arr').checked });
  }
  const returnType = $('funcRetType').value;
  let returnVar = $('funcRetVar').value.trim();
  if(returnType !== 'None'){
    if(!returnVar) returnVar = 'risultato';
    if(!/^[A-Za-z_]\w*$/.test(returnVar)){ toast('Variabile di ritorno non valida'); return; }
  } else returnVar = '';
  let f;
  if(isEdit){
    f = old;
    if(old.name !== name) renameFuncRefs(old.name, name);
    Object.assign(f, { name, params, returnType, returnVar });
  } else {
    f = { name, params, returnType, returnVar, nodes:[{ id:uid(), type:'start', text:'' }, { id:uid(), type:'end', text:'' }] };
    state.funcs.push(f);
  }
  if(returnType !== 'None'){
    const vars = FL.collectVars(f);
    const isParam = params.some(p => p.name === returnVar);
    if(!vars[returnVar] && !isParam) f.nodes.splice(1, 0, { id:uid(), type:'declare', declareType:returnType, text:returnVar });
  }
  closeFuncDialog();
  state.cur = state.funcs.indexOf(f);
  state.hasCentered = false;
  pushHistory(); render(); scheduleSave();
  toast(isEdit ? 'Funzione aggiornata' : 'Funzione ' + name + ' creata');
});
$('funcDelete').addEventListener('click', () => {
  const f = state.funcs[funcEditIdx]; if(!f || isMainFunc(f)) return;
  if(!confirm('Eliminare la funzione ' + f.name + '?')) return;
  state.funcs.splice(funcEditIdx, 1);
  state.cur = Math.max(0, state.funcs.findIndex(isMainFunc));
  closeFuncDialog();
  state.hasCentered = false;
  pushHistory(); render(); scheduleSave();
});
function renameFuncRefs(oldName, newName){
  const re = new RegExp('\\b' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'g');
  state.funcs.forEach(f => f.nodes.forEach(n => { if(n.text) n.text = n.text.replace(re, newName + '('); }));
}
function switchFunc(i, keepView){
  if(i === state.cur || !state.funcs[i]) return;
  state.funcs[state.cur]._view = { zoom:state.zoom, panX:state.panX, panY:state.panY };
  state.cur = i;
  const v = state.funcs[i]._view;
  if(v && keepView !== false){ state.zoom = v.zoom; state.panX = v.panX; state.panY = v.panY; state.hasCentered = true; }
  else state.hasCentered = false;
  state.selectedId = null;
  render();
}
function renderFuncTabs(){
  const el = $('funcTabs');
  el.innerHTML = state.funcs.map((f, i) => '<button class="ftab' + (i === state.cur ? ' active' : '') + (isMainFunc(f) ? ' main' : '') + '" data-i="' + i + '" role="tab" title="' + esc(funcSignature(f)) + (isMainFunc(f) ? '' : ' — doppio clic per modificare') + '">' + (isMainFunc(f) ? '<b>Main</b>' : esc(f.name)) + '</button>').join('');
}
$('funcTabs').addEventListener('click', e => { const b = e.target.closest('.ftab'); if(b) switchFunc(+b.dataset.i); });
$('funcTabs').addEventListener('dblclick', e => { const b = e.target.closest('.ftab'); if(b) openFuncDialog(+b.dataset.i); });
$('btnAddFunc').addEventListener('click', () => openFuncDialog(-1));
$('cardNewFunc').addEventListener('click', () => { openFuncDialog(-1); if(isMobile()) closeAllPanels(); });

/* ============================================================
   Esecuzione
   ============================================================ */
function setRunStatus(s){
  run.status = s;
  document.body.dataset.run = s;
  const idle = s === 'idle';
  $('btnStop').disabled = idle; $('mtabStop').disabled = idle;
  $('btnRunLbl').textContent = s === 'running' ? 'Pausa' : s === 'paused' ? 'Continua' : 'Esegui';
  $('btnRun').title = s === 'running' ? 'Pausa (Ctrl+Invio)' : s === 'paused' ? 'Continua (Ctrl+Invio)' : 'Esegui (Ctrl+Invio)';
  statusText.textContent = s === 'running' ? 'In esecuzione…' : s === 'paused' ? 'In pausa — usa Passo o Continua' : statusText.textContent;
}
function runOrPause(){
  if(run.status === 'idle') return startRun(false);
  if(run.status === 'running'){ run.runner.pause(); setRunStatus('paused'); return; }
  if(run.status === 'paused'){ run.runner.resume(); setRunStatus('running'); }
}
function stepOnce(){
  if(run.status === 'idle') return startRun(true);
  if(run.status === 'running'){ run.runner.pause(); setRunStatus('paused'); return; }
  run.runner.step();
}
function stopRun(){
  if(!run.runner) return;
  run.runner.stop();
}
function getProject(){ return { name:state.name, funcs:state.funcs }; }
function showError(msg, fi, nodeId){
  $('errorText').textContent = msg;
  $('errorBanner').hidden = false;
  state.errorNodeId = nodeId || null; state.errorFi = fi;
  if(fi >= 0 && fi !== state.cur) switchFunc(fi);
  else render();
  if(nodeId) scrollToNode(nodeId);
}
function hideError(){ $('errorBanner').hidden = true; if(state.errorNodeId){ state.errorNodeId = null; nodesEl.querySelectorAll('.node.error').forEach(e => e.classList.remove('error')); } }
$('errorClose').addEventListener('click', hideError);

async function startRun(stepMode){
  if(run.status !== 'idle') return;
  hideError();
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  const project = getProject();
  const issues = FL.checkProject(project);
  if(issues.length){
    const it = issues[0];
    clog('Errore di sintassi in ' + project.funcs[it.fi].name + ': ' + it.msg, 'err');
    showError('Sintassi: ' + it.msg, it.fi, it.nodeId);
    showPane('console');
    return;
  }
  cclear();
  FL.Charts.reset(); FL.Charts.gfxReset();
  run.usedDraw = false; run.usedPlot = false;
  state.counts = null;
  clog('▶ Esecuzione avviata' + (stepMode ? ' (passo-passo)' : ''), 'sys');
  const r = new FL.Runner(project, runnerHooks(), { maxSteps:SPEEDS[state.speed] === 0 ? 5000000 : 500000 });
  run.runner = r;
  if(stepMode) r.paused = true;
  setRunStatus(stepMode ? 'paused' : 'running');
  const t0 = performance.now();
  let ok = true;
  try{
    await r.run();
  } catch(e){
    if(e === FL.STOP){ ok = false; clog('■ Esecuzione interrotta', 'warn'); }
    else if(e instanceof FL.FLError){
      ok = false;
      const fname = e.fi !== null && project.funcs[e.fi] ? project.funcs[e.fi].name : '';
      clog('Errore' + (fname ? ' in ' + fname : '') + ': ' + e.message, 'err');
      showError(e.message, e.fi !== null ? e.fi : state.cur, e.nodeId);
      showPane('console');
    } else { ok = false; console.error(e); clog('Errore interno: ' + (e && e.message), 'err'); }
  } finally {
    flushConsoleInput();
    state.counts = r.counts;
    run.runner = null;
    setRunStatus('idle');
    highlight(null);
    statusSteps.textContent = r.steps.toLocaleString('it-IT') + ' passi';
    statusText.textContent = ok ? 'Terminato' : 'Interrotto';
    if(ok) clog('✔ Programma terminato (' + r.steps.toLocaleString('it-IT') + ' passi, ' + Math.round(performance.now() - t0) + ' ms)', 'sys');
    renderVarsNow(r.lastStack || []);
    FL.Charts.scheduleRedraw();
    if(state.heat) render();
  }
}

function runnerHooks(){
  return {
    getDelay:() => SPEEDS[state.speed],
    onHighlight:(fi, id, r) => {
      if(fi !== state.cur && SPEEDS[state.speed] > 0) switchFunc(fi);
      else if(fi !== state.cur && r.paused) switchFunc(fi);
      if(fi === state.cur) highlight(id);
      statusSteps.textContent = r.steps.toLocaleString('it-IT') + ' passi';
    },
    onPaused:(fi, node) => { if(fi !== state.cur) switchFunc(fi); highlight(node.id); setRunStatus('paused'); renderVarsNow(run.runner ? run.runner.stack : []); },
    onBreakpoint:(fi, node) => { clog('● Breakpoint: ' + DEFS[node.type].label + (node.text ? ' ' + node.text : ''), 'warn'); setRunStatus('paused'); },
    onOutput:(text, nl) => cout(text, nl),
    onWarn:msg => clog(msg, 'warn'),
    onTrace:msg => { if($('chkTrace').checked) clog(msg, 'step'); },
    onInput:(label, type) => requestConsoleInput(label, type),
    onAbortInput:() => flushConsoleInput(),
    onVars:(stack, r) => { r.lastStack = stack.slice(); scheduleVars(stack); if(stack.length) FL.Charts.setFrame(stack[stack.length - 1]); },
    onAssign:(fr, name, value, idx, r) => FL.Charts.trackAssign(fr.name, r.stack.indexOf(fr), name, value, idx, r.steps),
    onGraphics:(name, args) => {
      const kind = FL.Charts.gfx(name, args);
      if(kind === 'draw' && !run.usedDraw){ run.usedDraw = true; showPane('draw'); }
      if(kind === 'plot' && !run.usedPlot){ run.usedPlot = true; if(!run.usedDraw) showPane('charts'); }
    }
  };
}

function highlight(id){
  nodesEl.querySelectorAll('.node.running').forEach(el => el.classList.remove('running'));
  linksEl.querySelectorAll('.link.active').forEach(p => p.classList.remove('active'));
  if(!id) return;
  const el = nodesEl.querySelector('.node[data-id="' + id + '"]');
  if(el){
    el.classList.add('running');
    linksEl.querySelectorAll('.link[data-to-id="' + id + '"]').forEach(l => l.classList.add('active'));
    scrollToNode(id, true);
  }
}
function scrollToNode(id, soft){
  const el = nodesEl.querySelector('.node[data-id="' + id + '"]'); if(!el) return;
  const wrapW = canvasEl.clientWidth, wrapH = canvasEl.clientHeight;
  const wx = parseFloat(el.style.left) + el.offsetWidth / 2, wy = parseFloat(el.style.top) + el.offsetHeight / 2;
  const sx = state.panX + wx * state.zoom, sy = state.panY + wy * state.zoom;
  const m = soft ? 60 : 120;
  if(sx < m || sx > wrapW - m || sy < m || sy > wrapH - m){
    state.panX = wrapW / 2 - wx * state.zoom; state.panY = wrapH / 2 - wy * state.zoom;
    clampPan(); applyTransform();
  }
}

/* ---------- Input da console ---------- */
function requestConsoleInput(label, type){
  return new Promise(resolve => {
    showPane('console', true);
    const form = $('consoleInputForm'), inp = $('consoleInput');
    $('ciPrompt').textContent = label + ' (' + type + ') ›';
    inp.value = ''; inp.placeholder = 'Valore ' + type + ' e Invio';
    inp.inputMode = (type === 'Integer' || type === 'Real') ? 'decimal' : 'text';
    form.hidden = false;
    run.inputResolve = resolve;
    statusText.textContent = 'In attesa di input: ' + label;
    setTimeout(() => inp.focus(), 40);
  });
}
function flushConsoleInput(){
  const form = $('consoleInputForm');
  if(run.inputResolve){ const r = run.inputResolve; run.inputResolve = null; r(''); }
  form.hidden = true;
}
$('consoleInputForm').addEventListener('submit', e => {
  e.preventDefault();
  if(!run.inputResolve) return;
  const v = $('consoleInput').value;
  clog($('ciPrompt').textContent.replace(/ ›$/, '') + ' = ' + v, 'in');
  const r = run.inputResolve; run.inputResolve = null;
  $('consoleInputForm').hidden = true;
  if(run.status === 'running') statusText.textContent = 'In esecuzione…';
  r(v);
});

/* ---------- Pannello variabili ---------- */
function scheduleVars(stack){
  run.pendingStack = stack;
  if(run.varsRaf) return;
  const now = performance.now();
  const delay = SPEEDS[state.speed] === 0 ? 200 : 0;
  run.varsRaf = setTimeout(() => { run.varsRaf = 0; renderVarsNow(run.pendingStack); }, Math.max(0, delay - (now - run.lastVarsRender)));
}
function fmtVal(v, type){
  if(v === undefined) return '<span class="unset">—</span>';
  if(type === 'String') return '<span class="vs">"' + esc(v) + '"</span>';
  if(type === 'Character') return '<span class="vs">\'' + esc(v) + '\'</span>';
  if(type === 'Boolean') return '<span class="vb">' + (v ? 'true' : 'false') + '</span>';
  return '<span class="vnum">' + esc(FL.formatValue(v, type)) + '</span>';
}
function renderVarsNow(stack){
  run.lastVarsRender = performance.now();
  if(!stack || !stack.length){ if(run.status === 'idle' && !varListEl.querySelector('.frame')) varListEl.innerHTML = '<p class="empty">Le variabili compaiono qui durante l\'esecuzione.</p>'; return; }
  let html = '';
  for(let k = stack.length - 1; k >= 0; k--){
    const fr = stack[k];
    const names = Object.keys(fr.vars);
    const top = k === stack.length - 1;
    if(!top && k < stack.length - 6){ if(k === stack.length - 7) html += '<div class="frame-more">… altre ' + (k + 1) + ' chiamate</div>'; continue; }
    html += '<div class="frame' + (top ? ' top' : '') + '"><div class="frame-head"><span>' + esc(fr.name) + '</span><span class="frame-depth">' + (k === 0 ? 'programma' : 'chiamata ' + k) + '</span></div>';
    if(!names.length) html += '<div class="var-empty">nessuna variabile</div>';
    names.forEach(n => {
      const v = fr.vars[n];
      if(v.arr){
        const shown = v.value.slice(0, 60).map(x => x === undefined ? '—' : (v.type === 'String' ? '"' + x + '"' : FL.formatValue(x, v.type)));
        html += '<div class="var-row arr"><span class="vn">' + esc(n) + '<small>[' + v.value.length + ']</small></span><span class="vt">' + v.type + '</span><span class="vv arrv" title="' + esc(shown.join(', ')) + '">' + esc(shown.join(', ')) + (v.value.length > 60 ? ' …' : '') + '</span></div>';
      } else {
        html += '<div class="var-row"><span class="vn">' + esc(n) + '</span><span class="vt">' + v.type + '</span><span class="vv">' + (v.set ? fmtVal(v.value, v.type) : '<span class="unset">non assegnata</span>') + '</span></div>';
      }
    });
    html += '</div>';
  }
  varListEl.innerHTML = html;
}

/* ---------- Pannello destro (schede) ---------- */
let curPane = 'console';
function showPane(name, openOnMobile){
  curPane = name;
  document.querySelectorAll('.rtab').forEach(t => t.classList.toggle('active', t.dataset.pane === name));
  document.querySelectorAll('.rpane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
  FL.Charts.setVisible(name === 'charts');
  if(openOnMobile && isMobile()){ const p = $('panelRight'); if(!p.classList.contains('open')) togglePanel('panelRight', document.querySelector('.mtab[data-toggle="panelRight"]')); }
  try{ localStorage.setItem('flowlab.pane', name); }catch(e){}
}
document.querySelectorAll('.rtab').forEach(t => t.addEventListener('click', () => showPane(t.dataset.pane)));
$('varLegend').addEventListener('click', e => { const b = e.target.closest('.lg-item'); if(b) FL.Charts.toggleSeries(b.dataset.k); });
$('btnGfxClear').addEventListener('click', () => FL.Charts.gfxReset());
$('btnGfxSave').addEventListener('click', () => downloadDataURL(FL.Charts.gfxPNG(), (state.name || 'disegno') + '-disegno.png'));

/* ============================================================
   Storia (annulla/ripeti) e salvataggio
   ============================================================ */
function snapshot(){ return JSON.stringify({ funcs:state.funcs.map(f => ({ name:f.name, params:f.params, returnType:f.returnType, returnVar:f.returnVar, nodes:f.nodes.map(n => { const c = Object.assign({}, n); delete c._extraW; return c; }) })), cur:state.cur }); }
let histTimer = null;
function scheduleHistory(){ clearTimeout(histTimer); histTimer = setTimeout(pushHistory, 600); }
function pushHistory(){
  clearTimeout(histTimer);
  const snap = snapshot();
  if(state.history[state.histIdx] === snap) return;
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push(snap);
  state.histIdx = state.history.length - 1;
  if(state.history.length > 100){ state.history.shift(); state.histIdx--; }
  markDirty();
}
function restore(snap){
  const s = JSON.parse(snap);
  state.funcs = s.funcs; state.cur = Math.min(s.cur || 0, state.funcs.length - 1);
  state.funcs.forEach(ensureStartEnd);
  render(); scheduleSave(); markDirty();
}
function undo(){
  if(run.status !== 'idle') return;
  clearTimeout(histTimer);
  if(state.history[state.histIdx] !== snapshot()) pushHistory();
  if(state.histIdx <= 0){ toast('Niente da annullare'); return; }
  state.histIdx--; restore(state.history[state.histIdx]); toast('Annullato');
}
function redo(){
  if(run.status !== 'idle') return;
  if(state.histIdx >= state.history.length - 1){ toast('Niente da ripetere'); return; }
  state.histIdx++; restore(state.history[state.histIdx]); toast('Ripetuto');
}

let saveTimer = null;
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveAuto, 400); }
function getProjectData(){
  return {
    app:APP.name, format:'flowlab', version:APP.version, savedAt:new Date().toISOString(), name:state.name,
    funcs:state.funcs.map(f => ({ name:f.name, params:f.params || [], returnType:f.returnType || 'None', returnVar:f.returnVar || '', nodes:f.nodes.map(n => { const c = Object.assign({}, n); delete c._extraW; return c; }) }))
  };
}
function saveAuto(){ try{ localStorage.setItem(APP.storageKey, JSON.stringify(Object.assign(getProjectData(), { cur:state.cur, dirty:state.dirty }))); }catch(e){} }

/* ---------- Migrazione dal formato v24 ---------- */
function migrateProject(data){
  if(Array.isArray(data.funcs)){
    const funcs = data.funcs.map(f => ({ name:f.name || 'Main', params:f.params || [], returnType:f.returnType || 'None', returnVar:f.returnVar || '', nodes:(f.nodes || []).map(n => Object.assign({}, n, { id:n.id || uid() })) }));
    funcs.forEach(ensureStartEnd);
    if(!funcs.some(isMainFunc)) funcs[0].name = 'Main';
    return { name:data.name || 'programma', funcs };
  }
  if(!Array.isArray(data.nodes)) throw new Error('Formato non valido');
  /* vecchio formato: lista nodi + varDefs */
  const nodes = data.nodes.map(n => Object.assign({}, n, { id:n.id || uid() }));
  const out = [];
  nodes.forEach(n => {
    if(n.type === 'declare' && !n.declareType){
      const m = String(n.text || '').match(/^\s*([A-Za-z]+)\s+(.+)$/);
      const t = m && FL.canonType(m[1]);
      if(t){
        const rest = m[2];
        const init = rest.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
        if(init){ out.push(Object.assign(n, { declareType:t, text:init[1] })); out.push({ id:uid(), type:'assign', text:init[1] + ' = ' + init[2] }); return; }
        out.push(Object.assign(n, { declareType:t, text:rest.trim() })); return;
      }
    }
    if(n.type === 'output' && n.newline === undefined) n.newline = true;
    out.push(n);
  });
  const f = { name:'Main', params:[], returnType:'None', returnVar:'', nodes:out };
  ensureStartEnd(f);
  const declared = FL.collectVars(f);
  const extra = {};
  Object.keys(data.varDefs || {}).forEach(k => {
    if(declared[k]) return;
    const t = FL.canonType(String(data.varDefs[k].type || '').replace('[]', '')) || 'Integer';
    (extra[t] = extra[t] || []).push(k);
  });
  f.nodes.forEach(n => {
    if(n.type !== 'for') return;
    const fd = n.forData && n.forData.variable ? n.forData : FL.parseForText(n.text);
    if(fd && fd.variable && !declared[fd.variable] && !Object.values(extra).some(a => a.includes(fd.variable))) (extra.Integer = extra.Integer || []).push(fd.variable);
  });
  let pos = 1;
  Object.keys(extra).forEach(t => { f.nodes.splice(pos++, 0, { id:uid(), type:'declare', declareType:t, text:extra[t].join(', ') }); });
  return { name:data.name || 'programma', funcs:[f] };
}
function applyProject(p, opts){
  opts = opts || {};
  state.name = p.name || 'programma';
  state.funcs = p.funcs;
  state.cur = Math.max(0, Math.min(opts.cur || 0, state.funcs.length - 1));
  if(opts.cur === undefined) state.cur = Math.max(0, state.funcs.findIndex(isMainFunc));
  state.hasCentered = false; state.selectedId = null; state.counts = null;
  hideError();
  updateFileName();
  statusText.textContent = 'Pronto'; statusSteps.textContent = '0 passi';
  render();
  state.history = [snapshot()]; state.histIdx = 0;
}
function loadAuto(){
  try{
    let raw = localStorage.getItem(APP.storageKey);
    let old = false;
    if(!raw){ raw = localStorage.getItem(APP.oldStorageKey); old = !!raw; }
    if(!raw) return false;
    const data = JSON.parse(raw);
    const p = migrateProject(data);
    applyProject(p, { cur:data.cur });
    if(old) clog('Progetto della versione precedente convertito al nuovo formato.', 'sys');
    state.dirty = !!data.dirty; updateSaveIndicator();
    return true;
  }catch(e){ console.warn(e); return false; }
}

function safeFileName(){ return (state.name || 'programma').replace(/[\\/:*?"<>|]+/g, '_'); }
function downloadText(text, name, mime){
  const blob = new Blob([text], { type:mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadDataURL(url, name){ const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

async function writeHandle(h, text){
  const perm = await h.queryPermission({ mode:'readwrite' });
  if(perm !== 'granted' && (await h.requestPermission({ mode:'readwrite' })) !== 'granted') return false;
  const w = await h.createWritable(); await w.write(text); await w.close();
  return true;
}
async function saveToFile(forceAs){
  const text = JSON.stringify(getProjectData(), null, 2);
  const fileName = safeFileName() + '.fl';
  if(!forceAs && state.fileHandle){
    try{ if(await writeHandle(state.fileHandle, text)){ markSaved(); saveAuto(); toast('Salvato: ' + state.fileHandle.name); return; } }catch(e){}
    state.fileHandle = null;
  }
  if(window.showSaveFilePicker){
    try{
      const handle = await window.showSaveFilePicker({ suggestedName:fileName, types:[{ description:'Progetto FlowLab', accept:{ 'application/json':['.fl'] } }] });
      await writeHandle(handle, text);
      state.fileHandle = handle;
      await saveHandleToDB(FILE_HANDLE_KEY, handle);
      const base = handle.name.replace(/\.fl$/i, ''); if(base) { state.name = base; updateFileName(); }
      markSaved(); saveAuto(); toast('Salvato: ' + handle.name); return;
    }catch(err){ if(err.name === 'AbortError') return; }
  }
  downloadText(text, fileName, 'application/json');
  markSaved(); saveAuto(); toast('Progetto scaricato: ' + fileName);
}
async function loadFromFile(){
  if(!(await confirmDiscard())) return;
  if(window.showOpenFilePicker){
    try{
      const arr = await window.showOpenFilePicker({ types:[{ description:'FlowLab / Flowgorithm', accept:{ 'application/json':['.fl', '.json'], 'application/xml':['.fprg'] } }], multiple:false });
      const handle = arr[0]; const f = await handle.getFile();
      const isFl = parseProjectText(await f.text(), f.name);
      if(isFl){ state.fileHandle = handle; await saveHandleToDB(FILE_HANDLE_KEY, handle); } else { state.fileHandle = null; }
      return;
    }catch(err){ if(err.name === 'AbortError') return; }
  }
  $('fileInput').click();
}
function parseProjectText(text, filename){
  try{
    let p, isFl = true;
    const t = text.trim();
    if(/\.fprg$/i.test(filename || '') || t.startsWith('<')){ p = FL.fprg.importFprg(t); isFl = false; p.funcs.forEach(ensureStartEnd); }
    else p = migrateProject(JSON.parse(t));
    if(filename) p.name = filename.replace(/\.(fl|fprg|json)$/i, '') || p.name;
    applyProject(p);
    saveAuto(); markSaved();
    if(!isFl) markDirty();
    toast('Aperto: ' + (filename || p.name));
    clog('Aperto ' + (filename || p.name) + (isFl ? '' : ' (importato da Flowgorithm)'), 'sys');
    return isFl;
  }catch(e){ toast('Errore: ' + e.message, 4000); return false; }
}
async function confirmDiscard(){
  if(!state.dirty) return true;
  return confirm('Ci sono modifiche non salvate che andranno perse. Continuare?');
}
async function newProject(){
  if(!(await confirmDiscard())) return;
  state.fileHandle = null; clearHandleFromDB(FILE_HANDLE_KEY);
  applyProject({ name:'programma', funcs:[{ name:'Main', params:[], returnType:'None', returnVar:'', nodes:[{ id:uid(), type:'start', text:'' }, { id:uid(), type:'end', text:'' }] }] });
  cclear(); FL.Charts.reset(); FL.Charts.gfxReset(); renderVarsNow([]);
  saveAuto(); markSaved();
  statusText.textContent = 'Pronto'; statusSteps.textContent = '0 passi';
  toast('Nuovo progetto');
}
function renameProject(){
  const m = $('nameModal'), inp = $('nameInput');
  inp.value = state.name || 'programma';
  m.hidden = false;
  setTimeout(() => { inp.focus(); inp.select(); }, 40);
}
function confirmRename(){
  state.name = $('nameInput').value.trim() || 'programma';
  $('nameModal').hidden = true;
  updateFileName(); markDirty(); scheduleSave();
}
$('nameOk').addEventListener('click', confirmRename);
$('nameCancel').addEventListener('click', () => { $('nameModal').hidden = true; });
$('nameInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); confirmRename(); } });
$('fileName').addEventListener('click', renameProject);

/* ============================================================
   Esportazione PNG del diagramma
   ============================================================ */
function exportPNG(){
  const layout = buildLayout();
  const SCALE = 2, PAD = 50;
  const minX = layout.minX - PAD, maxX = layout.maxX + PAD, maxY = layout.maxY + PAD;
  const W = (maxX - minX) * SCALE, H = (maxY + 10) * SCALE;
  const cvs = document.createElement('canvas'); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.scale(SCALE, SCALE); ctx.translate(-minX, 0);
  const col = t => t === 'true' ? '#16a34a' : t === 'false' ? '#dc2626' : t === 'loop' ? '#db2777' : '#64748b';
  layout.links.forEach(l => {
    if(!l.from || !l.to) return;
    ctx.strokeStyle = col(l.type); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(l.from.x, l.from.y); (l.corners || []).forEach(c => ctx.lineTo(c.x, c.y)); ctx.lineTo(l.to.x, l.to.y); ctx.stroke();
  });
  const drawn = [];
  layout.links.forEach(l => {
    if(l.noArrow || !l.from || !l.to) return;
    const lp = l.corners && l.corners.length ? l.corners[l.corners.length - 1] : l.from;
    const dx = l.to.x - lp.x, dy = l.to.y - lp.y, len = Math.hypot(dx, dy);
    if(len < ARROW_LEN * 1.5) return;
    const ux = dx / len, uy = dy / len;
    if(drawn.some(a => Math.abs(a.x - l.to.x) < 15 && Math.abs(a.y - l.to.y) < 15 && Math.abs(a.ux - ux) < .4 && Math.abs(a.uy - uy) < .4)) return;
    drawn.push({ x:l.to.x, y:l.to.y, ux, uy });
    const px = -uy, py = ux, bx = l.to.x - ux * ARROW_LEN, by = l.to.y - uy * ARROW_LEN;
    ctx.fillStyle = col(l.type); ctx.beginPath(); ctx.moveTo(l.to.x, l.to.y); ctx.lineTo(bx + px * ARROW_WID, by + py * ARROW_WID); ctx.lineTo(bx - px * ARROW_WID, by - py * ARROW_WID); ctx.closePath(); ctx.fill();
  });
  layout.merges.forEach(m => { ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2; ctx.stroke(); });
  layout.labels.forEach(lb => {
    ctx.font = '700 11px system-ui, sans-serif'; const tw = ctx.measureText(lb.text).width;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = col(lb.type); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(lb.x - tw / 2 - 6, lb.y - 9, tw + 12, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col(lb.type); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lb.text, lb.x, lb.y);
  });
  layout.positions.forEach((p, id) => {
    const n = state.nodes.find(x => x.id === id); if(!n) return;
    const def = DEFS[n.type], [stroke, fill] = COLORS[n.type] || ['#64748b', '#fff'];
    const { x, y, w, h } = p;
    ctx.strokeStyle = stroke; ctx.fillStyle = fill; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    switch(def.shape){
      case 'oval': case 'pill': { const r = h / 2; ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); break; }
      case 'diamond': ctx.moveTo(x + w * .5, y + h * .05); ctx.lineTo(x + w * .97, y + h * .5); ctx.lineTo(x + w * .5, y + h * .95); ctx.lineTo(x + w * .03, y + h * .5); ctx.closePath(); break;
      case 'hex': ctx.moveTo(x + w * .14, y + h * .05); ctx.lineTo(x + w * .86, y + h * .05); ctx.lineTo(x + w * .97, y + h * .5); ctx.lineTo(x + w * .86, y + h * .95); ctx.lineTo(x + w * .14, y + h * .95); ctx.lineTo(x + w * .03, y + h * .5); ctx.closePath(); break;
      case 'parallelogram': ctx.moveTo(x + w * .16, y + h * .05); ctx.lineTo(x + w * .97, y + h * .05); ctx.lineTo(x + w * .84, y + h * .95); ctx.lineTo(x + w * .03, y + h * .95); ctx.closePath(); break;
      default: ctx.rect(x, y, w, h);
    }
    if(def.shape === 'comment'){ ctx.fill(); ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
    else { ctx.fill(); ctx.stroke(); }
    if(def.shape === 'declare'){ ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + 10, y + h); ctx.moveTo(x, y + 10); ctx.lineTo(x + w, y + 10); ctx.lineWidth = 1.2; ctx.stroke(); }
    if(def.shape === 'call'){ ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 8, y + h); ctx.moveTo(x + w - 8, y); ctx.lineTo(x + w - 8, y + h); ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const st = staticText(n);
    if(st !== null && (n.type === 'start' || n.type === 'end' || n.type === 'break')){
      ctx.fillStyle = '#1f2937'; ctx.font = "600 12.5px ui-monospace, Consolas, monospace"; ctx.fillText(st, x + w / 2, y + h / 2);
      return;
    }
    ctx.fillStyle = stroke; ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(def.label.toUpperCase(), x + w / 2, y + (n.type === 'if' ? h * .3 : 16));
    let ty = y + h / 2 + 7;
    if(n.type === 'declare' && n.declareType){ ctx.font = '700 10.5px system-ui, sans-serif'; ctx.fillText(n.declareType, x + w / 2, y + 30); ty = y + h - 18; }
    const txt = st !== null ? st : (n.text || '');
    ctx.fillStyle = '#1f2937'; ctx.font = "500 12.5px ui-monospace, Consolas, monospace";
    if(n.type === 'comment'){ ctx.textAlign = 'left'; ctx.textBaseline = 'top'; String(txt).split('\n').forEach((ln, i) => ctx.fillText(ln, x + 16, y + 30 + i * 18)); }
    else ctx.fillText(txt, x + w / 2, ty);
  });
  ctx.restore();
  cvs.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    downloadDataURL(url, safeFileName() + (isMainFunc(curFunc()) ? '' : '-' + curFunc().name) + '.png');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Immagine esportata');
  }, 'image/png');
}

/* ============================================================
   Codice generato
   ============================================================ */
const KW = {
  python:'def|return|if|else|elif|while|for|in|range|break|pass|import|and|or|not|True|False|print|input|int|float|str|len',
  c:'int|double|char|bool|void|return|if|else|while|for|do|break|include|printf|scanf|true|false|sizeof|static',
  cpp:'int|double|char|bool|void|return|if|else|while|for|do|break|include|std|string|cout|cin|endl|true|false|template|typename|auto',
  java:'public|static|void|int|double|char|boolean|String|return|if|else|while|for|do|break|new|class|import|final|true|false',
  csharp:'using|class|static|void|int|double|char|bool|string|return|if|else|while|for|do|break|new|readonly|true|false',
  javascript:'function|let|const|return|if|else|while|for|do|break|new|require|true|false',
  pseudo:'Inizio|Fine|Funzione|FineFunzione|Dichiara|Leggi|Scrivi|Se|Allora|Altrimenti|FineSe|Mentre|Esegui|FineMentre|Per|Da|A|Passo|FinePer|Restituisci|E|O|NON|vero|falso'
};
function highlightCode(code, lang){
  const kw = new RegExp('^(?:' + KW[lang] + ')$');
  const cm = lang === 'python' ? /^#.*/ : /^(\/\/.*|\/\*[\s\S]*?\*\/)/;
  let out = '', i = 0;
  while(i < code.length){
    const rest = code.slice(i);
    let m;
    if((m = rest.match(cm))){ out += '<span class="hl-c">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
    if(lang === 'c' || lang === 'cpp'){ if((m = rest.match(/^#\w+/))){ out += '<span class="hl-k">' + esc(m[0]) + '</span>'; i += m[0].length; continue; } }
    if((m = rest.match(/^("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/))){ out += '<span class="hl-s">' + esc(m[0]) + '</span>'; i += m[0].length; continue; }
    if((m = rest.match(/^\d+(\.\d+)?/))){ out += '<span class="hl-n">' + m[0] + '</span>'; i += m[0].length; continue; }
    if((m = rest.match(/^[A-Za-z_À-ÿ][\wÀ-ÿ]*/))){
      const w = m[0];
      if(kw.test(w)) out += '<span class="hl-k">' + w + '</span>';
      else if(rest[w.length] === '(') out += '<span class="hl-f">' + w + '</span>';
      else out += esc(w);
      i += w.length; continue;
    }
    out += esc(code[i]); i++;
  }
  return out;
}
function openCodeModal(lang){
  if(lang) state.codeLang = lang;
  const langs = FL.codegen.LANGS;
  if(!langs[state.codeLang]) state.codeLang = 'python';
  $('codeTabs').innerHTML = Object.keys(langs).map(k => '<button class="ctab' + (k === state.codeLang ? ' active' : '') + '" data-lang="' + k + '">' + langs[k].label + '</button>').join('');
  let code;
  try{ code = FL.codegen.generate(getProject(), state.codeLang); }
  catch(e){ code = '// Errore nella generazione: ' + e.message; }
  $('codeOutput').innerHTML = highlightCode(code, state.codeLang);
  $('codeOutput').dataset.raw = code;
  const notes = { c:'Le stringhe usano buffer char[256]; la grafica non è tradotta.', javascript:'Per Node.js: legge l\'input da stdin.', java:'Classe Main con Scanner per l\'input.', pseudo:'Pseudocodice in italiano per lo studio.' };
  $('codeNote').textContent = notes[state.codeLang] || '';
  codeModal.hidden = false;
  try{ localStorage.setItem('flowlab.codeLang', state.codeLang); }catch(e){}
}
$('codeTabs').addEventListener('click', e => { const b = e.target.closest('.ctab'); if(b) openCodeModal(b.dataset.lang); });
$('codeCopy').addEventListener('click', () => {
  const code = $('codeOutput').dataset.raw || '';
  (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast('Codice copiato'), () => {
    const r = document.createRange(); r.selectNodeContents($('codeOutput')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Premi Ctrl+C per copiare');
  });
});
$('codeDownload').addEventListener('click', () => {
  const d = FL.codegen.LANGS[state.codeLang];
  const base = state.codeLang === 'java' ? 'Main' : safeFileName();
  downloadText($('codeOutput').dataset.raw || '', base + '.' + d.ext);
  toast('File scaricato');
});

/* ============================================================
   Esempi
   ============================================================ */
function renderExamples(){
  $('exGrid').innerHTML = FL.examples.list.map(ex => '<button class="ex-card" data-id="' + ex.id + '"><span class="ex-level lv-' + esc(ex.level.toLowerCase()) + '">' + esc(ex.level) + '</span><strong>' + esc(ex.title) + '</strong><span class="ex-desc">' + esc(ex.desc) + '</span><span class="ex-tags">' + ex.tags.map(t => '<i>' + esc(t) + '</i>').join('') + '</span></button>').join('');
}
$('exGrid').addEventListener('click', async e => {
  const b = e.target.closest('.ex-card'); if(!b) return;
  const ex = FL.examples.list.find(x => x.id === b.dataset.id); if(!ex) return;
  if(!(await confirmDiscard())) return;
  const funcs = clone(ex.funcs);
  funcs.forEach(f => f.nodes.forEach(n => { n.id = uid(); }));
  state.fileHandle = null;
  applyProject({ name:ex.title, funcs });
  $('examplesModal').hidden = true;
  cclear(); FL.Charts.reset(); FL.Charts.gfxReset(); renderVarsNow([]);
  clog('Esempio caricato: ' + ex.title + ' — premi Esegui ▶', 'sys');
  if(ex.tags.includes('Grafici') || ex.tags.includes('Plot')) showPane('charts');
  else if(ex.tags.includes('Disegno')) showPane('draw');
  else showPane('console');
  saveAuto(); markSaved();
});

/* ============================================================
   Tema, schermo intero, pannelli mobile
   ============================================================ */
function currentTheme(){
  const a = document.documentElement.getAttribute('data-theme');
  return a || 'light';
}
function toggleTheme(){
  const t = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('flowlab.theme', t); }catch(e){}
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#0f172a' : '#0A6EFF');
  FL.Charts.scheduleRedraw();
}
function toggleFullscreen(){
  if(!document.fullscreenElement){
    const el = document.documentElement, fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if(!fn){ toast('Schermo intero non supportato'); return; }
    try{ fn.call(el); }catch(e){}
  } else { const fn = document.exitFullscreen || document.webkitExitFullscreen; if(fn) try{ fn.call(document); }catch(e){} }
}
function closeMobileMenu(){ $('mobileMenu').hidden = true; }
function openMobileMenu(){ $('mmSpeed').value = state.speed; $('mmSpeedLabel').textContent = SPEED_NAMES[state.speed]; $('mobileMenu').hidden = false; }
function closeAllPanels(){ ['panelLeft', 'panelRight'].forEach(id => $(id).classList.remove('open')); document.querySelectorAll('.mtab[data-toggle]').forEach(t => t.classList.remove('mtab-active')); }
function togglePanel(id, tab){
  const p = $(id), willOpen = !p.classList.contains('open');
  closeAllPanels();
  if(willOpen){ p.classList.add('open'); if(tab) tab.classList.add('mtab-active'); if(id === 'panelRight') FL.Charts.scheduleRedraw(); }
}
function setSpeed(v){
  state.speed = v;
  $('speedRange').value = v; $('mmSpeed').value = v;
  $('speedLabel').textContent = SPEED_NAMES[v]; $('mmSpeedLabel').textContent = SPEED_NAMES[v];
  try{ localStorage.setItem('flowlab.speed', v); }catch(e){}
}

/* ============================================================
   Eventi
   ============================================================ */
$('btnRun').addEventListener('click', runOrPause);
$('btnStep').addEventListener('click', stepOnce);
$('btnStop').addEventListener('click', stopRun);
$('mtabRun').addEventListener('click', runOrPause);
$('mtabStep').addEventListener('click', stepOnce);
$('mtabStop').addEventListener('click', stopRun);
$('btnNew').addEventListener('click', newProject);
$('btnUndo').addEventListener('click', undo);
$('btnRedo').addEventListener('click', redo);
$('btnSave').addEventListener('click', () => saveToFile().catch(e => toast('Errore: ' + e.message)));
$('btnLoad').addEventListener('click', () => loadFromFile().catch(e => toast('Errore: ' + e.message)));
$('btnExamples').addEventListener('click', () => { $('examplesModal').hidden = false; });
$('btnCode').addEventListener('click', () => openCodeModal());
$('btnHelp').addEventListener('click', () => { $('helpModal').hidden = false; });
$('hintMore').addEventListener('click', () => { $('helpModal').hidden = false; });
$('btnTheme').addEventListener('click', toggleTheme);
$('btnFullscreen').addEventListener('click', toggleFullscreen);
$('btnExport').addEventListener('click', e => {
  e.stopPropagation();
  const m = $('exportMenu');
  if(!m.hidden){ m.hidden = true; return; }
  m.hidden = false;
  const r = $('btnExport').getBoundingClientRect();
  m.style.top = (r.bottom + 2) + 'px';
  m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
});
document.addEventListener('click', e => { if(!e.target.closest('.dropdown')) $('exportMenu').hidden = true; });
function doAction(a){
  switch(a){
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'new': newProject(); break;
    case 'save': saveToFile().catch(e => toast('Errore: ' + e.message)); break;
    case 'saveAs': saveToFile(true).catch(e => toast('Errore: ' + e.message)); break;
    case 'load': loadFromFile().catch(e => toast('Errore: ' + e.message)); break;
    case 'examples': $('examplesModal').hidden = false; break;
    case 'code': openCodeModal(); break;
    case 'exportPNG': exportPNG(); break;
    case 'exportFprg': downloadText(FL.fprg.exportFprg(getProject()), safeFileName() + '.fprg', 'application/xml'); toast('Esportato per Flowgorithm'); break;
    case 'exportGfx': downloadDataURL(FL.Charts.gfxPNG(), safeFileName() + '-disegno.png'); break;
    case 'theme': toggleTheme(); break;
    case 'help': $('helpModal').hidden = false; break;
    case 'fullscreen': toggleFullscreen(); break;
  }
}
$('exportMenu').addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; $('exportMenu').hidden = true; doAction(b.dataset.action); });
document.querySelectorAll('.mm-item').forEach(b => b.addEventListener('click', () => { closeMobileMenu(); doAction(b.dataset.action); }));
$('btnMenu').addEventListener('click', e => { e.stopPropagation(); if($('mobileMenu').hidden) openMobileMenu(); else closeMobileMenu(); });
$('mobileMenuBackdrop').addEventListener('click', closeMobileMenu);
$('speedRange').addEventListener('input', e => setSpeed(parseInt(e.target.value, 10)));
$('mmSpeed').addEventListener('input', e => setSpeed(parseInt(e.target.value, 10)));
$('ctZoomIn').addEventListener('click', () => zoomToCenter(state.zoom * 1.2));
$('ctZoomOut').addEventListener('click', () => zoomToCenter(state.zoom / 1.2));
$('ctReset').addEventListener('click', fitToView);
$('ctHeat').addEventListener('click', () => {
  state.heat = !state.heat;
  $('ctHeat').classList.toggle('active', state.heat);
  if(state.heat && !state.counts) toast('Esegui il programma per vedere i conteggi');
  render();
});
$('btnClearConsole').addEventListener('click', cclear);
document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { $(b.dataset.closeModal).hidden = true; }));
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if(e.target === m && ['picker', 'codeModal', 'examplesModal', 'helpModal', 'nameModal'].includes(m.id)) m.hidden = true; }));

document.querySelectorAll('.card[data-add]').forEach(c => c.addEventListener('click', () => {
  insertFromPalette(c.dataset.add, state.nodes.length - 1, null);
  if(isMobile()) closeAllPanels();
}));
document.querySelectorAll('.pick[data-add]').forEach(b => b.addEventListener('click', () => {
  pickerEl.hidden = true;
  const at = state.insertAt >= 0 ? state.insertAt : state.nodes.length - 1, mode = state.insertMode;
  state.insertAt = -1; state.insertMode = null;
  if(b.dataset.add === 'paste'){
    if(mode === 'false-no-else'){ state.nodes.splice(at, 0, { id:uid(), type:'else', text:'' }); pasteAt(at + 1); }
    else pasteAt(at);
    return;
  }
  insertFromPalette(b.dataset.add, at, mode);
}));
document.querySelectorAll('.mtab[data-toggle]').forEach(t => t.addEventListener('click', () => togglePanel(t.dataset.toggle, t)));
document.querySelectorAll('.panel-toggle[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).classList.remove('open'); document.querySelectorAll('.mtab[data-toggle="' + b.dataset.close + '"]').forEach(t => t.classList.remove('mtab-active')); }));
$('fileInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if(f){ const r = new FileReader(); r.onload = () => { parseProjectText(r.result, f.name); state.fileHandle = null; }; r.readAsText(f); }
  e.target.value = '';
});

document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if(mod && k === 's'){ e.preventDefault(); saveToFile().catch(() => {}); return; }
  if(mod && k === 'enter'){ e.preventDefault(); runOrPause(); return; }
  if(e.key === 'F10'){ e.preventDefault(); stepOnce(); return; }
  if(e.key === 'F1'){ e.preventDefault(); $('helpModal').hidden = false; return; }
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'){
    if(e.key === 'Escape') e.target.blur();
    if(e.key === 'Enter' && e.target.classList.contains('node-input') && tag === 'INPUT') e.target.blur();
    return;
  }
  if(mod && k === 'n'){ e.preventDefault(); newProject(); return; }
  if(mod && k === 'o'){ e.preventDefault(); loadFromFile(); return; }
  if(mod && k === 'z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
  if(mod && (k === 'y' || (e.shiftKey && k === 'z'))){ e.preventDefault(); redo(); return; }
  if(state.selectedId && run.status === 'idle'){
    if(e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteNode(state.selectedId); return; }
    if(mod && k === 'c'){ e.preventDefault(); copyNode(state.selectedId); return; }
    if(mod && k === 'v'){ e.preventDefault(); pasteAfter(state.selectedId); return; }
    if(mod && k === 'd'){ e.preventDefault(); duplicateNode(state.selectedId); return; }
  }
  if(e.key === 'F9' && state.selectedId){ e.preventDefault(); toggleBreakpoint(state.selectedId); return; }
  if(e.key === 'Escape'){
    const open = document.querySelector('.modal-overlay:not([hidden])');
    if(open){ open.hidden = true; state.insertAt = -1; state.insertMode = null; return; }
    if(!ctxMenu.hidden){ closeCtxMenu(); return; }
    if(run.status !== 'idle'){ stopRun(); return; }
    closeMobileMenu(); closeAllPanels(); selectNode(null);
  }
  if(e.key === '+' || e.key === '='){ zoomToCenter(state.zoom * 1.15); }
  if(e.key === '-'){ zoomToCenter(state.zoom / 1.15); }
  if(e.key === '0'){ fitToView(); }
});

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if(!isMobile()){ closeAllPanels(); closeMobileMenu(); } clampPan(); applyTransform(); FL.Charts.scheduleRedraw(); }, 100); });
document.addEventListener('fullscreenchange', () => setTimeout(() => { clampPan(); applyTransform(); }, 100));
window.addEventListener('beforeunload', e => { saveAuto(); if(state.dirty && state.fileHandle){ e.preventDefault(); e.returnValue = ''; } });

/* ============================================================
   Avvio
   ============================================================ */
function init(){
  FL.Charts.init({
    varCard:$('varCard'), varCanvas:$('varCanvas'), varLegend:$('varLegend'),
    arrCard:$('arrCard'), arrWrap:$('arrWrap'), plotCard:$('plotCard'), plotCanvas:$('plotCanvas'),
    gfxCanvas:$('gfxCanvas'), gfxTurtle:$('gfxTurtle')
  });
  renderExamples();
  try{ const sp = parseInt(localStorage.getItem('flowlab.speed'), 10); if(SPEEDS[sp] !== undefined) setSpeed(sp); }catch(e){}
  try{ const cl = localStorage.getItem('flowlab.codeLang'); if(cl) state.codeLang = cl; }catch(e){}
  clog('FlowLab ' + APP.version + ' — sintassi Flowgorithm. Premi F1 per la guida.', 'sys');
  const loaded = loadAuto();
  if(!loaded){
    const ex = FL.examples.list[0];
    const funcs = clone(ex.funcs); funcs.forEach(f => f.nodes.forEach(n => { n.id = uid(); }));
    applyProject({ name:'programma', funcs });
    saveAuto(); markSaved();
    clog('Ecco un primo esempio: premi ▶ Esegui. Trovi altri programmi in “Esempi”.', 'sys');
  }
  try{ const p = localStorage.getItem('flowlab.pane'); if(p && !isMobile()) showPane(p); }catch(e){}
  setRunStatus('idle');
  setTimeout(() => { layoutAll(); convergeLayout(); }, 250);
  /* scorciatoie dell'app installata (manifest) */
  const action = new URLSearchParams(location.search).get('action');
  if(action){
    history.replaceState(null, '', location.pathname);
    if(action === 'new') newProject();
    else if(action === 'examples') $('examplesModal').hidden = false;
  }
  (async () => {
    const stored = await loadHandleFromDB(FILE_HANDLE_KEY);
    if(stored){ try{ if(await stored.queryPermission({ mode:'readwrite' }) === 'granted'){ state.fileHandle = stored; } }catch(e){} }
  })();
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
