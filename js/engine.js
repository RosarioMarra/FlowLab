/* ============================================================
   FlowLab — Engine
   Lexer, parser di espressioni (sintassi Flowgorithm),
   valutatore tipizzato e interprete asincrono con chiamate
   di funzione, array, breakpoint ed esecuzione passo-passo.
   ============================================================ */
'use strict';

(function(){
const FL = window.FL = window.FL || {};

/* ---------- Tipi ---------- */
const TYPES = ['Integer', 'Real', 'String', 'Boolean', 'Character'];
const TYPE_ALIASES = {
  integer:'Integer', int:'Integer', long:'Integer',
  real:'Real', float:'Real', double:'Real', num:'Real',
  string:'String', str:'String',
  boolean:'Boolean', bool:'Boolean',
  character:'Character', char:'Character'
};
function canonType(t){ return TYPE_ALIASES[String(t || '').trim().toLowerCase()] || null; }

class FLError extends Error {
  constructor(msg, nodeId){ super(msg); this.name = 'FLError'; this.nodeId = nodeId || null; this.fi = null; }
}
const STOP = { stop: true };

/* ---------- Lexer ---------- */
const OPS2 = ['==', '!=', '<>', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/='];
const OPS1 = ['=', '<', '>', '+', '-', '*', '/', '%', '^', '&', '!', '(', ')', '[', ']', ','];
const WORD_OPS = { and:'and', or:'or', not:'not', mod:'%' };

function lex(src){
  const s = String(src == null ? '' : src);
  const toks = [];
  let i = 0;
  while(i < s.length){
    const c = s[i];
    if(/\s/.test(c)){ i++; continue; }
    // numeri
    if(/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i+1] || ''))){
      let j = i, real = false;
      while(j < s.length && /[0-9]/.test(s[j])) j++;
      if(s[j] === '.' && /[0-9]/.test(s[j+1] || '')){ real = true; j++; while(j < s.length && /[0-9]/.test(s[j])) j++; }
      if(/[eE]/.test(s[j] || '') && /[0-9]/.test((s[j+1] === '+' || s[j+1] === '-') ? (s[j+2] || '') : (s[j+1] || ''))){
        real = true; j += (s[j+1] === '+' || s[j+1] === '-') ? 2 : 1;
        while(j < s.length && /[0-9]/.test(s[j])) j++;
      }
      toks.push({ k:'num', v:Number(s.slice(i, j)), real, p:i });
      i = j; continue;
    }
    // stringhe
    if(c === '"' || c === "'"){
      let j = i + 1, out = '';
      while(j < s.length && s[j] !== c){
        if(s[j] === '\\' && j + 1 < s.length && /[nt"'\\]/.test(s[j+1])){
          const n = s[j+1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2; continue;
        }
        out += s[j++];
      }
      if(j >= s.length) throw new FLError('Stringa non chiusa: manca ' + c);
      toks.push({ k:'str', v:out, q:c, p:i });
      i = j + 1; continue;
    }
    // identificatori / parole chiave
    if(/[A-Za-z_\u00C0-\u024F]/.test(c)){
      let j = i + 1;
      while(j < s.length && /[A-Za-z0-9_\u00C0-\u024F]/.test(s[j])) j++;
      const w = s.slice(i, j), lw = w.toLowerCase();
      if(lw === 'true' || lw === 'false') toks.push({ k:'bool', v:lw === 'true', p:i });
      else if(WORD_OPS[lw]) toks.push({ k:'op', v:WORD_OPS[lw], p:i });
      else toks.push({ k:'id', v:w, p:i });
      i = j; continue;
    }
    const two = s.substr(i, 2);
    if(OPS2.includes(two)){ toks.push({ k:'op', v:two, p:i }); i += 2; continue; }
    if(OPS1.includes(c)){ toks.push({ k:'op', v:c, p:i }); i++; continue; }
    if(c === '←'){ toks.push({ k:'op', v:'=', p:i }); i++; continue; }
    if(c === '≠'){ toks.push({ k:'op', v:'!=', p:i }); i++; continue; }
    if(c === '≤'){ toks.push({ k:'op', v:'<=', p:i }); i++; continue; }
    if(c === '≥'){ toks.push({ k:'op', v:'>=', p:i }); i++; continue; }
    throw new FLError('Carattere non valido: "' + c + '"');
  }
  return toks;
}

/* ---------- Parser (Pratt) ----------
   Precedenza (bassa → alta):
   or/||  <  and/&&  <  = == != <> < <= > >=  <  &  <  + -  <  * / % mod  <  ^  <  unari (- ! not)
*/
const BIN = {
  'or':[1,'or'], '||':[1,'or'],
  'and':[2,'and'], '&&':[2,'and'],
  '=':[3,'=='], '==':[3,'=='], '!=':[3,'!='], '<>':[3,'!='], '<':[3,'<'], '<=':[3,'<='], '>':[3,'>'], '>=':[3,'>='],
  '&':[4,'&'],
  '+':[5,'+'], '-':[5,'-'],
  '*':[6,'*'], '/':[6,'/'], '%':[6,'%'],
  '^':[7,'^']
};

class Parser {
  constructor(toks){ this.t = toks; this.i = 0; }
  peek(o){ return this.t[this.i + (o || 0)]; }
  next(){ return this.t[this.i++]; }
  eof(){ return this.i >= this.t.length; }
  isOp(v){ const t = this.peek(); return t && t.k === 'op' && t.v === v; }
  expect(v){
    const t = this.next();
    if(!t || t.k !== 'op' || t.v !== v) throw new FLError('Atteso "' + v + '"' + (t ? ' invece di "' + tokText(t) + '"' : ' alla fine'));
    return t;
  }
  expr(minPrec){
    let left = this.unary();
    for(;;){
      const t = this.peek();
      if(!t || t.k !== 'op' || !BIN[t.v]) break;
      const [prec, op] = BIN[t.v];
      if(prec < minPrec) break;
      this.next();
      const right = this.expr(op === '^' ? prec : prec + 1);
      left = { t:'bin', op, l:left, r:right };
    }
    return left;
  }
  unary(){
    const t = this.peek();
    if(!t) throw new FLError('Espressione incompleta');
    if(t.k === 'op'){
      if(t.v === '-'){ this.next(); return { t:'neg', e:this.expr(7) }; }
      if(t.v === '+'){ this.next(); return this.expr(7); }
      if(t.v === '!' || t.v === 'not'){ this.next(); return { t:'not', e:this.expr(7) }; }
      if(t.v === '&'){ this.next(); return this.unary(); } /* compat: &var */
    }
    return this.primary();
  }
  primary(){
    const t = this.next();
    if(!t) throw new FLError('Espressione incompleta');
    if(t.k === 'num') return { t:'num', v:t.v, real:t.real };
    if(t.k === 'str') return { t:'str', v:t.v, q:t.q };
    if(t.k === 'bool') return { t:'bool', v:t.v };
    if(t.k === 'op' && t.v === '('){ const e = this.expr(0); this.expect(')'); return { t:'par', e }; }
    if(t.k === 'id'){
      if(this.isOp('(')){
        this.next();
        const args = [];
        if(!this.isOp(')')){
          for(;;){ args.push(this.expr(0)); if(this.isOp(',')){ this.next(); continue; } break; }
        }
        this.expect(')');
        return { t:'call', name:t.v, args };
      }
      if(this.isOp('[')){
        this.next();
        const index = this.expr(0);
        this.expect(']');
        return { t:'idx', name:t.v, index };
      }
      return { t:'var', name:t.v };
    }
    throw new FLError('Simbolo inatteso "' + tokText(t) + '"');
  }
}
function tokText(t){ return t.k === 'str' ? t.q + t.v + t.q : String(t.v); }

const exprCache = new Map();
function parseExpr(src){
  const key = String(src == null ? '' : src).trim();
  if(!key) throw new FLError('Espressione vuota');
  if(exprCache.has(key)) return exprCache.get(key);
  const p = new Parser(lex(key));
  const e = p.expr(0);
  if(!p.eof()) throw new FLError('Simbolo inatteso "' + tokText(p.peek()) + '" in: ' + key);
  if(exprCache.size > 2000) exprCache.clear();
  exprCache.set(key, e);
  return e;
}

/* Target: variabile o elemento di array */
function parseTarget(p){
  const t = p.next();
  if(!t || t.k !== 'id') throw new FLError('Atteso il nome di una variabile');
  if(p.isOp('[')){ p.next(); const index = p.expr(0); p.expect(']'); return { t:'idx', name:t.v, index }; }
  return { t:'var', name:t.v };
}

/* Assegnazione: "x = espr", "a[i] = espr" (compat: x++, x--, x += e) */
function parseAssign(src){
  const text = String(src || '').trim();
  if(!text) throw new FLError('Assegnazione vuota');
  const toks = lex(text);
  if(toks[0] && toks[0].k === 'op' && toks[0].v === '&') toks.shift();
  const p = new Parser(toks);
  const target = parseTarget(p);
  const op = p.next();
  if(!op || op.k !== 'op') throw new FLError('Assegnazione: usa "variabile = espressione"');
  if(op.v === '++' || op.v === '--'){
    if(!p.eof()) throw new FLError('Simbolo inatteso dopo ' + op.v);
    return { target, expr:{ t:'bin', op:op.v === '++' ? '+' : '-', l:target, r:{ t:'num', v:1 } } };
  }
  const compound = { '+=':'+', '-=':'-', '*=':'*', '/=':'/' };
  if(op.v !== '=' && op.v !== '==' && !compound[op.v]) throw new FLError('Assegnazione: usa "variabile = espressione"');
  const e = p.expr(0);
  if(!p.eof()) throw new FLError('Simbolo inatteso "' + tokText(p.peek()) + '"');
  return { target, expr: compound[op.v] ? { t:'bin', op:compound[op.v], l:target, r:e } : e };
}

function parseInputTarget(src){
  const text = String(src || '').trim().replace(/^&/, '');
  if(!text) throw new FLError('Input: indica la variabile da leggere');
  const p = new Parser(lex(text));
  const t = parseTarget(p);
  if(!p.eof()) throw new FLError('Input: indica una sola variabile (es. "Input nome")');
  return t;
}

/* Dichiarazione: "a, b, v[10]" → [{name, size}] */
function parseDeclare(src){
  const text = String(src || '').trim();
  if(!text) return [];
  const p = new Parser(lex(text));
  const out = [];
  for(;;){
    const t = p.next();
    if(!t || t.k !== 'id') throw new FLError('Dichiarazione: nome di variabile non valido');
    let size = null;
    if(p.isOp('[')){ p.next(); size = p.expr(0); p.expect(']'); }
    out.push({ name:t.v, size, sizeText: size ? exprToSource(size) : null });
    if(p.eof()) break;
    p.expect(',');
  }
  return out;
}
/* versione tollerante usata dall'editor */
function declaredNames(src){
  try{ return parseDeclare(src); }catch(e){ return []; }
}

function parseCallStmt(src){
  const text = String(src || '').trim().replace(/^call\s+/i, '');
  if(!text) throw new FLError('Call: indica la funzione da chiamare, es. Saluta()');
  const p = new Parser(lex(text));
  const tk = p.peek();
  let e;
  if(tk && tk.k === 'id' && !p.peek(1)){ p.next(); e = { t:'call', name:tk.v, args:[] }; }
  else e = p.expr(0);
  if(!p.eof() || e.t !== 'call') throw new FLError('Call: usa "NomeFunzione(argomenti)"');
  return e;
}

/* For: compat testo "i = 1 To 10 Step 2" */
function parseForText(text){
  const m = String(text || '').match(/^\s*&?([A-Za-z_]\w*)\s*=\s*(.+?)\s+to\s+(.+?)(?:\s+step\s+(.+))?\s*$/i);
  if(!m) return null;
  return { variable:m[1], start:m[2], end:m[3], step:m[4] || '1', direction:'inc' };
}

/* AST → sorgente FlowLab normalizzato */
function exprToSource(a){
  switch(a.t){
    case 'num': return String(a.v) + (a.real && Number.isInteger(a.v) ? '.0' : '');
    case 'str': return JSON.stringify(a.v);
    case 'bool': return a.v ? 'true' : 'false';
    case 'var': return a.name;
    case 'idx': return a.name + '[' + exprToSource(a.index) + ']';
    case 'par': return '(' + exprToSource(a.e) + ')';
    case 'neg': return '-' + exprToSource(a.e);
    case 'not': return 'not ' + exprToSource(a.e);
    case 'call': return a.name + '(' + a.args.map(exprToSource).join(', ') + ')';
    case 'bin': {
      const op = { '==':'=', '!=':'<>', '%':'mod' }[a.op] || a.op;
      return exprToSource(a.l) + ' ' + op + ' ' + exprToSource(a.r);
    }
  }
  return '';
}

/* ---------- Albero strutturato da lista piatta ---------- */
function parseBlock(nodes, start, end){
  if(start === undefined){ start = 0; end = nodes.length; }
  const items = []; let i = start;
  while(i < end){
    const n = nodes[i]; if(!n) break;
    if(n.type === 'if'){
      let depth = 0, elseIdx = -1, endifIdx = end;
      for(let j = i + 1; j < end; j++){
        const t = nodes[j].type;
        if(t === 'if') depth++;
        if(t === 'endif'){ if(depth === 0){ endifIdx = j; break; } depth--; }
        if(t === 'else' && depth === 0 && elseIdx === -1) elseIdx = j;
      }
      const trueEnd = elseIdx >= 0 ? elseIdx : endifIdx;
      const falseStart = elseIdx >= 0 ? elseIdx + 1 : endifIdx;
      items.push({
        kind:'if', node:n, flatIndex:i,
        trueBranch:parseBlock(nodes, i + 1, trueEnd),
        falseBranch:elseIdx >= 0 ? parseBlock(nodes, falseStart, endifIdx) : [],
        hasElse:elseIdx >= 0, endifIndex:endifIdx, elseIndex:elseIdx,
        trueInsertAt:i + 1, falseInsertAt:elseIdx >= 0 ? elseIdx + 1 : endifIdx,
        trueEndInsertAt:elseIdx >= 0 ? elseIdx : endifIdx, falseEndInsertAt:endifIdx
      });
      i = endifIdx + 1; continue;
    }
    if(n.type === 'for' || n.type === 'while' || n.type === 'dowhile'){
      let depth = 0, endloopIdx = end;
      for(let j = i + 1; j < end; j++){
        const t = nodes[j].type;
        if(t === 'for' || t === 'while' || t === 'dowhile') depth++;
        if(t === 'endloop'){ if(depth === 0){ endloopIdx = j; break; } depth--; }
      }
      items.push({ kind:'loop', node:n, flatIndex:i, body:parseBlock(nodes, i + 1, endloopIdx), endloopIndex:endloopIdx, bodyInsertAt:i + 1 });
      i = endloopIdx + 1; continue;
    }
    if(n.type === 'else' || n.type === 'endif' || n.type === 'endloop'){ i++; continue; }
    items.push({ kind:'simple', node:n, flatIndex:i });
    i++;
  }
  return items;
}

/* Indice finale (incluso) della struttura che inizia in i */
function structEnd(nodes, i){
  const n = nodes[i]; if(!n) return i;
  if(n.type === 'if'){
    let depth = 0;
    for(let j = i + 1; j < nodes.length; j++){
      const t = nodes[j].type;
      if(t === 'if') depth++;
      if(t === 'endif'){ if(depth === 0) return j; depth--; }
    }
  }
  if(n.type === 'for' || n.type === 'while' || n.type === 'dowhile'){
    let depth = 0;
    for(let j = i + 1; j < nodes.length; j++){
      const t = nodes[j].type;
      if(t === 'for' || t === 'while' || t === 'dowhile') depth++;
      if(t === 'endloop'){ if(depth === 0) return j; depth--; }
    }
  }
  return i;
}

/* ---------- Valori ---------- */
function fmtNum(v){
  if(!isFinite(v)) return v > 0 ? 'Infinity' : v < 0 ? '-Infinity' : 'NaN';
  if(Number.isInteger(v)) return String(v);
  return String(parseFloat(v.toPrecision(15)));
}
function formatValue(v, type){
  if(v === undefined || v === null) return '';
  if(typeof v === 'boolean') return v ? 'true' : 'false';
  if(typeof v === 'number'){
    if(type === 'Real' && Number.isInteger(v)) return v.toFixed(1);
    return fmtNum(v);
  }
  return String(v);
}
function typeOfValue(v){
  if(typeof v === 'number') return Number.isInteger(v) ? 'Integer' : 'Real';
  if(typeof v === 'boolean') return 'Boolean';
  return 'String';
}
function defaultOf(type){
  switch(type){ case 'Integer': case 'Real': return 0; case 'Boolean': return false; case 'Character': return ' '; default: return ''; }
}

function coerce(v, type, ctx){
  const where = ctx ? ' (' + ctx + ')' : '';
  switch(type){
    case 'Integer':
      if(typeof v === 'number'){ if(!isFinite(v)) throw new FLError('Valore numerico non valido' + where); return Math.trunc(v); }
      throw new FLError('Tipo non compatibile: impossibile assegnare ' + typeOfValue(v) + ' a Integer' + where + '. Usa ToInteger()');
    case 'Real':
      if(typeof v === 'number') return v;
      throw new FLError('Tipo non compatibile: impossibile assegnare ' + typeOfValue(v) + ' a Real' + where + '. Usa ToReal()');
    case 'String':
      if(typeof v === 'string') return v;
      throw new FLError('Tipo non compatibile: impossibile assegnare ' + typeOfValue(v) + ' a String' + where + '. Usa ToString() oppure &');
    case 'Character':
      if(typeof v === 'string'){
        if(v.length === 1) return v;
        throw new FLError('Un Character deve contenere un solo carattere' + where);
      }
      throw new FLError('Tipo non compatibile: impossibile assegnare ' + typeOfValue(v) + ' a Character' + where);
    case 'Boolean':
      if(typeof v === 'boolean') return v;
      throw new FLError('Tipo non compatibile: impossibile assegnare ' + typeOfValue(v) + ' a Boolean' + where);
  }
  return v;
}
function parseInputValue(raw, type){
  const s = String(raw);
  switch(type){
    case 'Integer': {
      const t = s.trim();
      if(!/^[+-]?\d+$/.test(t)) throw new FLError('Input non valido: "' + s + '" non è un Integer');
      return parseInt(t, 10);
    }
    case 'Real': {
      const t = s.trim().replace(',', '.');
      if(t === '' || isNaN(Number(t))) throw new FLError('Input non valido: "' + s + '" non è un numero Real');
      return Number(t);
    }
    case 'Boolean': {
      const t = s.trim().toLowerCase();
      if(['true', 'vero', 'si', 'sì', '1', 'yes'].includes(t)) return true;
      if(['false', 'falso', 'no', '0'].includes(t)) return false;
      throw new FLError('Input non valido: "' + s + '" non è un Boolean (true/false)');
    }
    case 'Character':
      if(s.length < 1) throw new FLError('Input non valido: inserisci un carattere');
      return s[0];
    default: return s;
  }
}

function needNum(v, op){
  if(typeof v !== 'number') throw new FLError('L\'operatore ' + op + ' richiede numeri (ricevuto ' + typeOfValue(v) + ')');
  return v;
}
function toBool(v, ctx){
  if(typeof v === 'boolean') return v;
  throw new FLError((ctx || 'La condizione') + ' deve essere Boolean (ricevuto ' + typeOfValue(v) + ': ' + formatValue(v) + ')');
}
function binop(op, a, b){
  switch(op){
    case '+':
      if(typeof a === 'number' && typeof b === 'number') return a + b;
      if(typeof a === 'string' || typeof b === 'string') return formatValue(a) + formatValue(b);
      throw new FLError('L\'operatore + richiede numeri');
    case '-': return needNum(a, '-') - needNum(b, '-');
    case '*': return needNum(a, '*') * needNum(b, '*');
    case '/': needNum(a, '/'); if(needNum(b, '/') === 0) throw new FLError('Divisione per zero'); return a / b;
    case '%': needNum(a, 'mod'); if(needNum(b, 'mod') === 0) throw new FLError('Modulo per zero'); return a % b;
    case '^': return Math.pow(needNum(a, '^'), needNum(b, '^'));
    case '&': return formatValue(a) + formatValue(b);
    case '==': case '!=': {
      let eq;
      if(typeof a === typeof b) eq = a === b;
      else throw new FLError('Confronto tra tipi diversi: ' + typeOfValue(a) + ' e ' + typeOfValue(b));
      return op === '==' ? eq : !eq;
    }
    case '<': case '<=': case '>': case '>=': {
      if(typeof a !== typeof b || typeof a === 'boolean') throw new FLError('Confronto ' + op + ' non valido tra ' + typeOfValue(a) + ' e ' + typeOfValue(b));
      if(op === '<') return a < b;
      if(op === '<=') return a <= b;
      if(op === '>') return a > b;
      return a >= b;
    }
  }
  throw new FLError('Operatore sconosciuto ' + op);
}

/* ---------- Funzioni intrinseche (stile Flowgorithm) ---------- */
function nArg(args, n, name){ if(args.length !== n) throw new FLError(name + '() richiede ' + n + ' argoment' + (n === 1 ? 'o' : 'i')); }
const INTRINSICS = {
  abs:     { n:1, f:a => Math.abs(needNum(a[0], 'Abs')) },
  arccos:  { n:1, f:a => Math.acos(needNum(a[0], 'Arccos')) },
  arcsin:  { n:1, f:a => Math.asin(needNum(a[0], 'Arcsin')) },
  arctan:  { n:1, f:a => Math.atan(needNum(a[0], 'Arctan')) },
  cos:     { n:1, f:a => Math.cos(needNum(a[0], 'Cos')) },
  sin:     { n:1, f:a => Math.sin(needNum(a[0], 'Sin')) },
  tan:     { n:1, f:a => Math.tan(needNum(a[0], 'Tan')) },
  int:     { n:1, f:a => Math.trunc(needNum(a[0], 'Int')) },
  log:     { n:1, f:a => { if(needNum(a[0], 'Log') <= 0) throw new FLError('Log() richiede un numero positivo'); return Math.log(a[0]); } },
  log10:   { n:1, f:a => { if(needNum(a[0], 'Log10') <= 0) throw new FLError('Log10() richiede un numero positivo'); return Math.log10(a[0]); } },
  sgn:     { n:1, f:a => Math.sign(needNum(a[0], 'Sgn')) },
  sqrt:    { n:1, f:a => { if(needNum(a[0], 'Sqrt') < 0) throw new FLError('Sqrt() di un numero negativo'); return Math.sqrt(a[0]); } },
  random:  { n:-1, f:a => {
    if(a.length === 0) return Math.random();
    const m = Math.trunc(needNum(a[0], 'Random'));
    if(m <= 0) throw new FLError('Random(n) richiede n > 0');
    return Math.floor(Math.random() * m);
  } },
  char:    { n:2, f:a => {
    if(typeof a[0] !== 'string') throw new FLError('Char(s, i): s deve essere String');
    const i = Math.trunc(needNum(a[1], 'Char'));
    if(i < 0 || i >= a[0].length) throw new FLError('Char(): indice ' + i + ' fuori dalla stringa (lunghezza ' + a[0].length + ')');
    return a[0][i];
  } },
  len:     { n:1, f:a => { if(typeof a[0] !== 'string') throw new FLError('Len() richiede una String'); return a[0].length; } },
  mid:     { n:3, f:a => {
    if(typeof a[0] !== 'string') throw new FLError('Mid() richiede una String');
    const st = Math.trunc(needNum(a[1], 'Mid')), ct = Math.trunc(needNum(a[2], 'Mid'));
    if(st < 0 || ct < 0) throw new FLError('Mid(): argomenti negativi');
    return a[0].substr(st, ct);
  } },
  tochar:  { n:1, f:a => String.fromCharCode(Math.trunc(needNum(a[0], 'ToChar'))) },
  tocode:  { n:1, f:a => { if(typeof a[0] !== 'string' || !a[0].length) throw new FLError('ToCode() richiede un carattere'); return a[0].charCodeAt(0); } },
  tofixed: { n:2, f:a => needNum(a[0], 'ToFixed').toFixed(Math.max(0, Math.min(20, Math.trunc(needNum(a[1], 'ToFixed'))))) },
  tointeger:{ n:1, f:a => {
    if(typeof a[0] === 'number') return Math.trunc(a[0]);
    if(typeof a[0] === 'boolean') return a[0] ? 1 : 0;
    const t = String(a[0]).trim();
    if(!/^[+-]?\d+(\.\d+)?$/.test(t)) throw new FLError('ToInteger(): "' + a[0] + '" non è un numero');
    return Math.trunc(Number(t));
  } },
  toreal:  { n:1, f:a => {
    if(typeof a[0] === 'number') return a[0];
    const t = String(a[0]).trim().replace(',', '.');
    if(t === '' || isNaN(Number(t))) throw new FLError('ToReal(): "' + a[0] + '" non è un numero');
    return Number(t);
  } },
  tostring:{ n:1, f:a => formatValue(a[0]) },
  /* Estensioni FlowLab */
  min:     { n:-1, f:a => { if(!a.length) throw new FLError('Min() richiede argomenti'); return Math.min(...a.map(x => needNum(x, 'Min'))); } },
  max:     { n:-1, f:a => { if(!a.length) throw new FLError('Max() richiede argomenti'); return Math.max(...a.map(x => needNum(x, 'Max'))); } },
  pow:     { n:2, f:a => Math.pow(needNum(a[0], 'Pow'), needNum(a[1], 'Pow')) },
  round:   { n:1, f:a => Math.round(needNum(a[0], 'Round')) },
  floor:   { n:1, f:a => Math.floor(needNum(a[0], 'Floor')) },
  ceil:    { n:1, f:a => Math.ceil(needNum(a[0], 'Ceil')) },
  exp:     { n:1, f:a => Math.exp(needNum(a[0], 'Exp')) },
  toupper: { n:1, f:a => String(a[0]).toUpperCase() },
  tolower: { n:1, f:a => String(a[0]).toLowerCase() },
  trim:    { n:1, f:a => String(a[0]).trim() },
  isnumber:{ n:1, f:a => typeof a[0] === 'number' || (String(a[0]).trim() !== '' && !isNaN(Number(String(a[0]).trim()))) },
};
const INTRINSIC_NAMES = ['Abs','Arccos','Arcsin','Arctan','Char','Cos','Int','Len','Log','Log10','Mid','Random','Sgn','Sin','Size','Sqrt','Tan','ToChar','ToCode','ToFixed','ToInteger','ToReal','ToString','Min','Max','Pow','Round','Floor','Ceil','Exp','ToUpper','ToLower','Trim','IsNumber'];

/* Procedure grafiche (usabili nel blocco Call) */
const GRAPHICS = {
  clearcanvas:-1, setcolor:1, setfill:1, setlinewidth:1, drawline:4, drawrect:4, fillrect:4,
  drawcircle:3, fillcircle:3, drawtext:3, drawpoint:2,
  forward:1, back:1, turnleft:1, turnright:1, turn:1, penup:0, pendown:0, home:0, setposition:2, setheading:1,
  plot:2, plotpoint:2, plotbar:2, clearplot:0, wait:1
};
const GRAPHICS_NAMES = ['ClearCanvas','SetColor','SetFill','SetLineWidth','DrawLine','DrawRect','FillRect','DrawCircle','FillCircle','DrawText','DrawPoint','Forward','Back','TurnLeft','TurnRight','PenUp','PenDown','Home','SetPosition','SetHeading','Plot','PlotBar','ClearPlot','Wait'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- Interprete ---------- */
class Runner {
  constructor(project, hooks, opts){
    this.project = project;
    this.h = hooks || {};
    this.opts = Object.assign({ maxSteps:500000, maxDepth:400 }, opts || {});
    this.steps = 0;
    this.counts = Object.create(null);
    this.stack = [];
    this.paused = false;
    this.stopped = false;
    this._resume = null;
    this.lastLine = '';
    this.outputs = 0;
  }
  funcIndex(name){
    const l = String(name).toLowerCase();
    return this.project.funcs.findIndex(f => f.name.toLowerCase() === l);
  }
  /* controllo esecuzione */
  pause(){ this.paused = true; }
  resume(){ this.paused = false; const r = this._resume; this._resume = null; if(r) r(); }
  step(){ this.paused = true; const r = this._resume; this._resume = null; if(r) r(); }
  stop(){ this.stopped = true; const r = this._resume; this._resume = null; if(r) r(); if(this.h.onAbortInput) this.h.onAbortInput(); }

  async tick(fr, node){
    if(this.stopped) throw STOP;
    this.steps++;
    if(this.steps > this.opts.maxSteps) throw new FLError('Superato il limite di ' + this.opts.maxSteps.toLocaleString('it-IT') + ' passi: possibile ciclo infinito', node.id);
    this.counts[node.id] = (this.counts[node.id] || 0) + 1;
    if(node.bp && !this.paused){ this.paused = true; if(this.h.onBreakpoint) this.h.onBreakpoint(fr.fi, node); }
    const delay = this.h.getDelay ? this.h.getDelay() : 300;
    if(delay <= 0 && !this.paused){
      if(this.steps % 400 === 0){ if(this.h.onHighlight) this.h.onHighlight(fr.fi, node.id, this); await sleep(0); }
      return;
    }
    if(this.h.onHighlight) this.h.onHighlight(fr.fi, node.id, this);
    if(this.paused){
      if(this.h.onPaused) this.h.onPaused(fr.fi, node, this);
      await new Promise(r => { this._resume = r; });
      if(this.stopped) throw STOP;
    } else {
      await sleep(delay);
      if(this.stopped) throw STOP;
    }
  }

  async run(){
    const mi = this.funcIndex('Main');
    const fi = mi >= 0 ? mi : 0;
    const fr = this.newFrame(fi);
    this.stack.push(fr);
    this.notifyVars();
    try{
      await this.execItems(parseBlock(this.project.funcs[fi].nodes), fr);
    } finally {
      this.stack.pop();
    }
  }
  newFrame(fi){ return { fi, name:this.project.funcs[fi].name, vars:Object.create(null) }; }
  notifyVars(){ if(this.h.onVars) this.h.onVars(this.stack, this); }

  async execItems(items, fr){
    for(const it of items){
      const r = await this.execItem(it, fr);
      if(r) return r;
    }
    return null;
  }
  async execItem(it, fr){
    const n = it.node;
    try{
      if(it.kind === 'simple'){
        await this.tick(fr, n);
        return await this.execSimple(n, fr);
      }
      if(it.kind === 'if'){
        await this.tick(fr, n);
        if(!String(n.text || '').trim()) throw new FLError('Il blocco If non ha una condizione');
        const c = toBool(await this.evalSrc(n.text, fr), 'La condizione dell\'If');
        if(this.h.onTrace) this.h.onTrace('If ' + n.text + ' → ' + (c ? 'Vero' : 'Falso'));
        return await this.execItems(c ? it.trueBranch : it.falseBranch, fr);
      }
      if(it.kind === 'loop') return await this.execLoop(it, fr);
    }catch(e){
      if(e instanceof FLError && !e.nodeId){ e.nodeId = n.id; e.fi = fr.fi; }
      else if(e instanceof FLError && e.fi === null){ e.fi = fr.fi; }
      throw e;
    }
    return null;
  }

  async execLoop(it, fr){
    const n = it.node;
    if(n.type === 'while'){
      if(!String(n.text || '').trim()) throw new FLError('Il blocco While non ha una condizione');
      for(;;){
        await this.tick(fr, n);
        const c = toBool(await this.evalSrc(n.text, fr), 'La condizione del While');
        if(this.h.onTrace) this.h.onTrace('While ' + n.text + ' → ' + (c ? 'Vero' : 'Falso'));
        if(!c) break;
        const r = await this.execItems(it.body, fr);
        if(r === 'break') break;
        if(r) return r;
      }
      return null;
    }
    if(n.type === 'dowhile'){
      if(!String(n.text || '').trim()) throw new FLError('Il blocco Do non ha una condizione');
      for(;;){
        const r = await this.execItems(it.body, fr);
        if(r === 'break') break;
        if(r) return r;
        await this.tick(fr, n);
        const c = toBool(await this.evalSrc(n.text, fr), 'La condizione del Do');
        if(this.h.onTrace) this.h.onTrace('Do … While ' + n.text + ' → ' + (c ? 'Vero' : 'Falso'));
        if(!c) break;
      }
      return null;
    }
    if(n.type === 'for'){
      const fd = n.forData && n.forData.variable ? n.forData : parseForText(n.text);
      if(!fd || !fd.variable) throw new FLError('Il ciclo For non è configurato: clicca sul blocco');
      const v = fr.vars[fd.variable];
      if(!v) throw new FLError('Variabile "' + fd.variable + '" non dichiarata: aggiungi un blocco Declare (Integer ' + fd.variable + ') prima del For');
      if(v.arr) throw new FLError('"' + fd.variable + '" è un array e non può essere usato come contatore');
      if(v.type !== 'Integer' && v.type !== 'Real') throw new FLError('Il contatore del For deve essere Integer o Real');
      const start = needNum(await this.evalSrc(fd.start, fr), 'For'), end = needNum(await this.evalSrc(fd.end, fr), 'For');
      let stepAbs = Math.abs(needNum(await this.evalSrc(String(fd.step || '1'), fr), 'For'));
      if(stepAbs === 0) throw new FLError('Il passo del For non può essere 0');
      const step = fd.direction === 'dec' ? -stepAbs : stepAbs;
      this.setVar(fr, fd.variable, coerce(start, v.type, 'For'));
      for(;;){
        await this.tick(fr, n);
        const cur = v.value;
        const cont = step > 0 ? cur <= end : cur >= end;
        if(this.h.onTrace) this.h.onTrace('For ' + fd.variable + ' = ' + formatValue(cur) + (cont ? ' → Vero' : ' → Falso'));
        if(!cont) break;
        const r = await this.execItems(it.body, fr);
        if(r === 'break') break;
        if(r) return r;
        this.setVar(fr, fd.variable, coerce(v.value + step, v.type, 'For'));
      }
      return null;
    }
    return null;
  }

  setVar(fr, name, value){
    const v = fr.vars[name];
    v.value = value; v.set = true;
    if(this.h.onAssign) this.h.onAssign(fr, name, value, null, this);
    this.notifyVars();
  }

  async execSimple(n, fr){
    const text = String(n.text || '').trim();
    switch(n.type){
      case 'start': return null;
      case 'end': return null;
      case 'comment': return null;
      case 'break': return 'break';
      case 'declare': {
        const type = canonType(n.declareType);
        if(!type) throw new FLError('Declare: scegli un tipo (clicca sull\'etichetta del tipo)');
        if(!text) throw new FLError('Declare: indica il nome della variabile');
        const items = parseDeclare(text);
        for(const d of items){
          if(d.size){
            const size = needNum(await this.ev(d.size, fr), 'dimensione');
            if(!Number.isInteger(size) || size <= 0) throw new FLError('La dimensione dell\'array "' + d.name + '" deve essere un intero positivo');
            if(size > 100000) throw new FLError('Array troppo grande (max 100000 elementi)');
            fr.vars[d.name] = { type, arr:true, value:new Array(size).fill(undefined), set:true };
          } else {
            fr.vars[d.name] = { type, arr:false, value:undefined, set:false };
          }
        }
        this.notifyVars();
        return null;
      }
      case 'assign': {
        if(!text) throw new FLError('Il blocco Assign è vuoto');
        const a = parseAssign(text);
        const val = await this.ev(a.expr, fr);
        await this.store(a.target, val, fr);
        return null;
      }
      case 'input': {
        const t = parseInputTarget(text);
        const v = fr.vars[t.name];
        if(!v) throw new FLError('Variabile "' + t.name + '" non dichiarata');
        let idx = null;
        if(t.t === 'idx'){
          if(!v.arr) throw new FLError('"' + t.name + '" non è un array');
          idx = this.checkIndex(v, await this.ev(t.index, fr), t.name);
        } else if(v.arr) throw new FLError('"' + t.name + '" è un array: indica l\'elemento, es. ' + t.name + '[i]');
        const label = t.t === 'idx' ? t.name + '[' + idx + ']' : t.name;
        let val;
        for(;;){
          const raw = await this.h.onInput(label, v.type, this);
          if(this.stopped) throw STOP;
          try{ val = parseInputValue(raw, v.type); break; }
          catch(e){ if(this.h.onWarn) this.h.onWarn(e.message + ' — riprova'); }
        }
        if(t.t === 'idx'){ v.value[idx] = val; if(this.h.onAssign) this.h.onAssign(fr, t.name, val, idx, this); this.notifyVars(); }
        else this.setVar(fr, t.name, val);
        return null;
      }
      case 'output': {
        if(!text){ this.h.onOutput('', n.newline !== false); return null; }
        const v = await this.evalSrc(text, fr);
        this.h.onOutput(formatValue(v), n.newline !== false);
        return null;
      }
      case 'call': {
        const c = parseCallStmt(text);
        const lname = c.name.toLowerCase();
        const fi = this.funcIndex(c.name);
        if(fi >= 0){ await this.callFunction(fi, c.args, fr, true); return null; }
        if(lname in GRAPHICS){
          const need = GRAPHICS[lname];
          if(need >= 0 && c.args.length !== need) throw new FLError(c.name + '() richiede ' + need + ' argomenti');
          const args = [];
          for(const a of c.args) args.push(await this.ev(a, fr));
          if(lname === 'wait'){ await sleep(Math.max(0, Math.min(10000, needNum(args[0], 'Wait')))); return null; }
          if(this.h.onGraphics) this.h.onGraphics(lname, args, this);
          return null;
        }
        await this.ev(c, fr);
        return null;
      }
    }
    return null;
  }

  checkIndex(v, i, name){
    if(typeof i !== 'number' || !Number.isInteger(i)) throw new FLError('L\'indice di "' + name + '" deve essere un Integer');
    if(i < 0 || i >= v.value.length) throw new FLError('Indice ' + i + ' fuori dai limiti dell\'array "' + name + '" (0..' + (v.value.length - 1) + ')');
    return i;
  }

  async store(target, val, fr){
    const v = fr.vars[target.name];
    if(!v) throw new FLError('Variabile "' + target.name + '" non dichiarata: aggiungi un blocco Declare');
    if(target.t === 'idx'){
      if(!v.arr) throw new FLError('"' + target.name + '" non è un array');
      const i = this.checkIndex(v, await this.ev(target.index, fr), target.name);
      v.value[i] = coerce(val, v.type, target.name + '[' + i + ']');
      if(this.h.onAssign) this.h.onAssign(fr, target.name, v.value[i], i, this);
      this.notifyVars();
      return;
    }
    if(v.arr) throw new FLError('"' + target.name + '" è un array: assegna un elemento, es. ' + target.name + '[0] = …');
    this.setVar(fr, target.name, coerce(val, v.type, target.name));
  }

  async evalSrc(src, fr){ return this.ev(parseExpr(src), fr); }

  async ev(a, fr){
    switch(a.t){
      case 'num': case 'str': case 'bool': return a.v;
      case 'par': return this.ev(a.e, fr);
      case 'var': {
        const v = fr.vars[a.name];
        if(!v){
          const l = a.name.toLowerCase();
          if(l === 'pi') return Math.PI;
          if(this.funcIndex(a.name) >= 0) return this.callFunction(this.funcIndex(a.name), [], fr, false);
          throw new FLError('Variabile "' + a.name + '" non dichiarata');
        }
        if(v.arr) throw new FLError('"' + a.name + '" è un array: usa ' + a.name + '[indice]');
        if(!v.set) throw new FLError('La variabile "' + a.name + '" non ha ancora un valore');
        return v.value;
      }
      case 'idx': {
        const v = fr.vars[a.name];
        if(!v) throw new FLError('Array "' + a.name + '" non dichiarato');
        if(!v.arr) throw new FLError('"' + a.name + '" non è un array');
        const i = this.checkIndex(v, await this.ev(a.index, fr), a.name);
        const el = v.value[i];
        if(el === undefined) throw new FLError('L\'elemento ' + a.name + '[' + i + '] non ha ancora un valore');
        return el;
      }
      case 'neg': return -needNum(await this.ev(a.e, fr), '-');
      case 'not': return !toBool(await this.ev(a.e, fr), 'L\'operando di not');
      case 'bin': {
        if(a.op === 'and'){
          if(!toBool(await this.ev(a.l, fr), 'L\'operando di and')) return false;
          return toBool(await this.ev(a.r, fr), 'L\'operando di and');
        }
        if(a.op === 'or'){
          if(toBool(await this.ev(a.l, fr), 'L\'operando di or')) return true;
          return toBool(await this.ev(a.r, fr), 'L\'operando di or');
        }
        const l = await this.ev(a.l, fr);
        const r = await this.ev(a.r, fr);
        return binop(a.op, l, r);
      }
      case 'call': {
        const lname = a.name.toLowerCase();
        const fi = this.funcIndex(a.name);
        if(fi >= 0) return this.callFunction(fi, a.args, fr, false);
        if(lname === 'size'){
          if(a.args.length !== 1 || a.args[0].t !== 'var') throw new FLError('Size() richiede il nome di un array');
          const v = fr.vars[a.args[0].name];
          if(!v || !v.arr) throw new FLError('Size(): "' + a.args[0].name + '" non è un array');
          return v.value.length;
        }
        const fn = INTRINSICS[lname];
        if(!fn){
          if(lname in GRAPHICS) throw new FLError(a.name + '() è una procedura grafica: usala in un blocco Call');
          throw new FLError('Funzione "' + a.name + '" non definita');
        }
        if(fn.n >= 0) nArg(a.args, fn.n, a.name);
        const args = [];
        for(const x of a.args) args.push(await this.ev(x, fr));
        return fn.f(args);
      }
    }
    throw new FLError('Espressione non valida');
  }

  async callFunction(fi, argAsts, fr, asStatement){
    const f = this.project.funcs[fi];
    const params = f.params || [];
    if(argAsts.length !== params.length) throw new FLError(f.name + '() richiede ' + params.length + ' argomenti (ricevuti ' + argAsts.length + ')');
    if(!asStatement && (!f.returnType || f.returnType === 'None')) throw new FLError('La funzione ' + f.name + ' non restituisce un valore: usala in un blocco Call');
    if(this.stack.length >= this.opts.maxDepth) throw new FLError('Ricorsione troppo profonda (oltre ' + this.opts.maxDepth + ' chiamate)');
    const nf = this.newFrame(fi);
    for(let k = 0; k < params.length; k++){
      const p = params[k], ast = argAsts[k];
      const type = canonType(p.type) || 'Integer';
      if(p.array){
        if(ast.t !== 'var' || !fr.vars[ast.name] || !fr.vars[ast.name].arr) throw new FLError('Il parametro "' + p.name + '" di ' + f.name + ' richiede un array');
        nf.vars[p.name] = fr.vars[ast.name]; /* array per riferimento */
      } else {
        const val = await this.ev(ast, fr);
        nf.vars[p.name] = { type, arr:false, value:coerce(val, type, 'parametro ' + p.name), set:true };
      }
    }
    this.stack.push(nf);
    if(this.h.onCall) this.h.onCall(nf, this);
    this.notifyVars();
    let ret;
    try{
      await this.execItems(parseBlock(f.nodes), nf);
      if(f.returnType && f.returnType !== 'None'){
        const rv = nf.vars[f.returnVar];
        if(!f.returnVar) throw new FLError('La funzione ' + f.name + ' non ha una variabile di ritorno');
        if(!rv) throw new FLError('La variabile di ritorno "' + f.returnVar + '" non è dichiarata in ' + f.name);
        if(!rv.set) throw new FLError('La variabile di ritorno "' + f.returnVar + '" non ha un valore');
        ret = rv.value;
      }
    } catch(e){
      if(e instanceof FLError && e.fi === null){ e.fi = fi; }
      throw e;
    } finally {
      this.stack.pop();
      if(this.h.onReturn) this.h.onReturn(fr, this);
      this.notifyVars();
    }
    return ret;
  }
}

/* ---------- Analisi statica ---------- */
/* restituisce mappa nome → {type, arr} per una funzione */
function collectVars(func){
  const vars = Object.create(null);
  (func.params || []).forEach(p => { vars[p.name] = { type:canonType(p.type) || 'Integer', arr:!!p.array, param:true }; });
  (func.nodes || []).forEach(n => {
    if(n.type !== 'declare') return;
    const type = canonType(n.declareType) || 'Integer';
    declaredNames(n.text).forEach(d => { if(!vars[d.name]) vars[d.name] = { type, arr:!!d.size, size:d.sizeText }; });
  });
  return vars;
}

/* controllo sintassi di tutti i blocchi: [{fi, nodeId, msg}] */
function checkProject(project){
  const issues = [];
  project.funcs.forEach((f, fi) => {
    f.nodes.forEach(n => {
      const t = String(n.text || '').trim();
      const push = msg => issues.push({ fi, nodeId:n.id, msg });
      try{
        switch(n.type){
          case 'assign': if(!t) push('Assign vuoto'); else parseAssign(t); break;
          case 'output': if(t) parseExpr(t); break;
          case 'input': parseInputTarget(t); break;
          case 'if': case 'while': case 'dowhile': if(!t) push('Condizione mancante'); else parseExpr(t); break;
          case 'declare': if(!t) push('Nome variabile mancante'); else parseDeclare(t); break;
          case 'call': parseCallStmt(t); break;
          case 'for': {
            const fd = n.forData && n.forData.variable ? n.forData : parseForText(n.text);
            if(!fd) push('For non configurato');
            else { parseExpr(fd.start); parseExpr(fd.end); parseExpr(String(fd.step || '1')); }
            break;
          }
        }
      }catch(e){ push(e.message); }
    });
  });
  return issues;
}

Object.assign(FL, {
  TYPES, canonType, FLError, STOP, lex, parseExpr, parseAssign, parseInputTarget, parseDeclare, declaredNames,
  parseCallStmt, parseForText, exprToSource, parseBlock, structEnd, formatValue, typeOfValue, defaultOf, coerce,
  INTRINSICS, INTRINSIC_NAMES, GRAPHICS, GRAPHICS_NAMES, Runner, collectVars, checkProject, binop
});
})();
