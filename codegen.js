/* ============================================================
   FlowLab — Generatori di codice
   Python · C · C++ · Java · JavaScript · C# · Pseudocodice
   Basati sull'AST delle espressioni (traduzione affidabile
   di operatori, funzioni intrinseche e tipi).
   ============================================================ */
'use strict';

(function(){
const FL = window.FL;

/* ---------- Inferenza dei tipi ---------- */
const RT = {
  abs:'same', arccos:'Real', arcsin:'Real', arctan:'Real', cos:'Real', sin:'Real', tan:'Real',
  int:'Integer', log:'Real', log10:'Real', sgn:'Integer', sqrt:'Real', random:'Integer', char:'Character',
  len:'Integer', mid:'String', size:'Integer', tochar:'Character', tocode:'Integer', tofixed:'String',
  tointeger:'Integer', toreal:'Real', tostring:'String', min:'num', max:'num', pow:'Real', round:'Integer',
  floor:'Integer', ceil:'Integer', exp:'Real', toupper:'String', tolower:'String', trim:'String', isnumber:'Boolean'
};
function numMerge(a, b){ return (a === 'Integer' && b === 'Integer') ? 'Integer' : 'Real'; }
function typeOf(a, ctx){
  switch(a.t){
    case 'num': return a.real ? 'Real' : 'Integer';
    case 'str': return (a.q === "'" && a.v.length === 1) ? 'Character' : 'String';
    case 'bool': return 'Boolean';
    case 'par': return typeOf(a.e, ctx);
    case 'neg': return typeOf(a.e, ctx);
    case 'not': return 'Boolean';
    case 'var': {
      const v = ctx.vars[a.name];
      if(v) return v.type;
      if(a.name.toLowerCase() === 'pi') return 'Real';
      const f = ctx.funcByName(a.name);
      return f ? f.returnType : 'Integer';
    }
    case 'idx': { const v = ctx.vars[a.name]; return v ? v.type : 'Integer'; }
    case 'bin': {
      if(['and', 'or', '==', '!=', '<', '<=', '>', '>='].includes(a.op)) return 'Boolean';
      if(a.op === '&') return 'String';
      const l = typeOf(a.l, ctx), r = typeOf(a.r, ctx);
      if(a.op === '+' && (isStr(l) || isStr(r))) return 'String';
      if(a.op === '/' || a.op === '^') return 'Real';
      return numMerge(l, r);
    }
    case 'call': {
      const f = ctx.funcByName(a.name);
      if(f) return f.returnType;
      const r = RT[a.name.toLowerCase()];
      if(r === 'same') return a.args[0] ? typeOf(a.args[0], ctx) : 'Real';
      if(r === 'num') return a.args.reduce((t, x) => numMerge(t, typeOf(x, ctx)), 'Integer');
      if(a.name.toLowerCase() === 'random' && a.args.length === 0) return 'Real';
      return r || 'Real';
    }
  }
  return 'Integer';
}
function isStr(t){ return t === 'String' || t === 'Character'; }

const PREC = { or:1, and:2, '==':3, '!=':3, '<':3, '<=':3, '>':3, '>=':3, '&':4, '+':5, '-':5, '*':6, '/':6, '%':6, '^':7 };
function precOf(a){ return a.t === 'bin' ? PREC[a.op] : 9; }

/* flatten di concatenazione & (e + tra stringhe) */
function concatParts(a, ctx){
  if(a.t === 'par' && a.e.t === 'bin' && a.e.op === '&') return concatParts(a.e, ctx);
  if(a.t === 'bin' && (a.op === '&' || (a.op === '+' && typeOf(a, ctx) === 'String'))) return concatParts(a.l, ctx).concat(concatParts(a.r, ctx));
  return [a];
}

/* ---------- Emettitore di espressioni generico ---------- */
function makeEmitter(L){
  function E(a, ctx, parentPrec){
    parentPrec = parentPrec || 0;
    let s;
    switch(a.t){
      case 'num': s = L.num ? L.num(a) : String(a.v) + (a.real && Number.isInteger(a.v) ? '.0' : ''); break;
      case 'str': s = (a.q === "'" && a.v.length === 1 && L.char) ? L.char(a.v) : L.str(a.v); break;
      case 'bool': s = a.v ? L.T : L.F; break;
      case 'par': s = '(' + E(a.e, ctx, 0) + ')'; break;
      case 'var': {
        if(!ctx.vars[a.name] && a.name.toLowerCase() === 'pi'){ s = L.pi; break; }
        if(!ctx.vars[a.name] && ctx.funcByName(a.name)){ s = a.name + '()'; break; }
        s = a.name; break;
      }
      case 'idx': s = a.name + '[' + E(a.index, ctx, 0) + ']'; break;
      case 'neg': s = '-' + E(a.e, ctx, 8); break;
      case 'not': s = L.not(E(a.e, ctx, 8), a.e); break;
      case 'call': {
        const f = ctx.funcByName(a.name);
        if(f){ s = userCall(L, f, a.args, ctx, E); break; }
        const name = a.name.toLowerCase();
        const args = a.args.map(x => E(x, ctx, 0));
        const fn = L.fn[name];
        if(typeof fn === 'function') s = fn(args, a.args, ctx);
        else if(typeof fn === 'string') s = fn + '(' + args.join(', ') + ')';
        else s = a.name + '(' + args.join(', ') + ')';
        break;
      }
      case 'bin': {
        const p = PREC[a.op];
        if(a.op === '&' || (a.op === '+' && typeOf(a, ctx) === 'String' && L.concat)){
          const parts = concatParts(a, ctx);
          s = L.concat(parts, ctx, E);
          if(parentPrec > 4) s = '(' + s + ')';
          return s;
        }
        if(a.op === '^'){ s = L.pow(E(a.l, ctx, 8), E(a.r, ctx, 8)); break; }
        const lt = typeOf(a.l, ctx), rt = typeOf(a.r, ctx);
        if((a.op === '==' || a.op === '!=' || PREC[a.op] === 3) && isStr(lt) && isStr(rt) && L.strCmp){
          s = L.strCmp(a.op, E(a.l, ctx, p + 1), E(a.r, ctx, p + 1), lt, rt);
          break;
        }
        if(a.op === '/' && L.div){ s = L.div(E(a.l, ctx, p), E(a.r, ctx, p + 1), lt, rt); break; }
        if(a.op === '%' && L.mod){ s = L.mod(E(a.l, ctx, p), E(a.r, ctx, p + 1), lt, rt); break; }
        const op = L.ops[a.op] || a.op;
        s = E(a.l, ctx, p) + ' ' + op + ' ' + E(a.r, ctx, p + 1);
        if(p < parentPrec) s = '(' + s + ')';
        return s;
      }
    }
    return s;
  }
  return E;
}

function jsStr(v){ return JSON.stringify(v); }
function userCall(L, f, args, ctx, E){
  if(L.arrSize){
    const parts = [];
    args.forEach((x, k) => {
      parts.push(E(x, ctx, 0));
      const p = (f.params || [])[k];
      if(p && p.array && x.t === 'var') parts.push(arrSizeExpr(x.name, ctx));
    });
    return f.name + '(' + parts.join(', ') + ')';
  }
  return f.name + '(' + args.map(x => E(x, ctx, 0)).join(', ') + ')';
}
function arrSizeExpr(name, ctx){
  const v = ctx.vars[name];
  if(v && v.param) return name + '_size';
  return '(int) (sizeof(' + name + ') / sizeof(' + name + '[0]))';
}

/* ---------- Contesto per funzione ---------- */
function makeCtx(project, func){
  const vars = FL.collectVars(func);
  (func.nodes || []).forEach(n => {
    if(n.type === 'for'){
      const fd = n.forData && n.forData.variable ? n.forData : FL.parseForText(n.text);
      if(fd && fd.variable && !vars[fd.variable]) vars[fd.variable] = { type:'Integer', arr:false, implicit:true };
    }
  });
  return {
    vars, func, project,
    funcByName(name){ const l = String(name).toLowerCase(); return project.funcs.find(f => f.name.toLowerCase() === l) || null; },
    uses: {}
  };
}
function safeParse(src){ try{ return FL.parseExpr(src); }catch(e){ return null; } }
function safeAssign(src){ try{ return FL.parseAssign(src); }catch(e){ return null; } }
function forInfo(n){ return n.forData && n.forData.variable ? n.forData : FL.parseForText(n.text); }

/* ---------- Generatore strutturale comune ---------- */
function genProgram(project, L){
  const out = [];
  const funcs = project.funcs;
  const mainIdx = Math.max(0, funcs.findIndex(f => f.name.toLowerCase() === 'main'));
  const order = [mainIdx].concat(funcs.map((_, i) => i).filter(i => i !== mainIdx));
  const bodies = [];
  const uses = {};
  order.forEach(fi => {
    const f = funcs[fi];
    const ctx = makeCtx(project, f);
    ctx.uses = uses;
    const lines = [];
    const ind = L.bodyIndent || 1;
    if(L.funcPrologue) L.funcPrologue(f, ctx, lines, ind);
    genItems(FL.parseBlock(f.nodes), ctx, lines, ind, L);
    if(L.funcEpilogue) L.funcEpilogue(f, ctx, lines, ind);
    bodies.push({ f, ctx, lines, isMain:fi === mainIdx });
  });
  L.wrap(bodies, out, uses, project);
  return out.join('\n');
}
function I(n, L){ return (L.tab || '    ').repeat(n); }

function genItems(items, ctx, lines, ind, L){
  let any = false;
  for(const it of items){
    const n = it.node;
    if(it.kind === 'simple'){
      if(n.type === 'start' || n.type === 'end') continue;
      const r = genSimple(n, ctx, ind, L);
      if(r && r.length){ r.forEach(l => lines.push(I(ind, L) + l)); if(n.type !== 'comment' && !isGraphicsCall(n)) any = true; }
      continue;
    }
    any = true;
    if(it.kind === 'if'){
      const c = safeParse(n.text);
      const cond = c ? L.E(c, ctx, 0) : '/* ? */ ' + (n.text || 'false');
      lines.push(I(ind, L) + L.ifOpen(cond));
      if(!genItems(it.trueBranch, ctx, lines, ind + 1, L) && L.pass) lines.push(I(ind + 1, L) + L.pass);
      if(it.falseBranch.length){
        lines.push(I(ind, L) + L.elseLine);
        genItems(it.falseBranch, ctx, lines, ind + 1, L);
      }
      if(L.blockClose) lines.push(I(ind, L) + L.blockClose(n.type));
      continue;
    }
    if(it.kind === 'loop'){
      if(n.type === 'while'){
        const c = safeParse(n.text);
        lines.push(I(ind, L) + L.whileOpen(c ? L.E(c, ctx, 0) : (n.text || 'false')));
        if(!genItems(it.body, ctx, lines, ind + 1, L) && L.pass) lines.push(I(ind + 1, L) + L.pass);
        if(L.blockClose) lines.push(I(ind, L) + L.blockClose('while'));
      } else if(n.type === 'dowhile'){
        const c = safeParse(n.text);
        const cond = c ? L.E(c, ctx, 0) : (n.text || 'false');
        L.doWhile(it, cond, c, ctx, lines, ind, () => genItems(it.body, ctx, lines, ind + 1, L));
      } else if(n.type === 'for'){
        const fd = forInfo(n);
        if(!fd){ lines.push(I(ind, L) + L.comment('For non configurato')); continue; }
        const s = safeParse(fd.start), e = safeParse(fd.end), st = safeParse(String(fd.step || '1'));
        const S = s ? L.E(s, ctx, 0) : fd.start, EN = e ? L.E(e, ctx, 0) : fd.end, ST = st ? L.E(st, ctx, 0) : String(fd.step || 1);
        lines.push(I(ind, L) + L.forOpen(fd.variable, S, EN, ST, fd.direction === 'dec', e, st));
        if(!genItems(it.body, ctx, lines, ind + 1, L) && L.pass) lines.push(I(ind + 1, L) + L.pass);
        if(L.blockClose) lines.push(I(ind, L) + L.blockClose('for'));
      }
    }
  }
  return any;
}

function isGraphicsCall(n){
  if(n.type !== 'call') return false;
  try{ return FL.parseCallStmt(n.text).name.toLowerCase() in FL.GRAPHICS; }catch(e){ return false; }
}
function genSimple(n, ctx, ind, L){
  const t = String(n.text || '').trim();
  switch(n.type){
    case 'comment': return t ? t.split('\n').map(l => L.comment(l.replace(/^\/\/\s?/, ''))) : [];
    case 'break': return [L.breakStmt];
    case 'declare': {
      const type = FL.canonType(n.declareType) || 'Integer';
      let ds; try{ ds = FL.parseDeclare(t); }catch(e){ return [L.comment('Declare non valido: ' + t)]; }
      return L.declare(type, ds, ctx);
    }
    case 'assign': {
      const a = safeAssign(t);
      if(!a) return [L.comment('Assegnazione non valida: ' + t)];
      return L.assign(a, ctx);
    }
    case 'input': {
      let tg; try{ tg = FL.parseInputTarget(t); }catch(e){ return [L.comment('Input non valido: ' + t)]; }
      const v = ctx.vars[tg.name] || { type:'String' };
      const dest = tg.t === 'idx' ? tg.name + '[' + L.E(tg.index, ctx, 0) + ']' : tg.name;
      return L.input(dest, v.type, ctx);
    }
    case 'output': {
      const e = t ? safeParse(t) : { t:'str', v:'' };
      if(!e) return [L.comment('Output non valido: ' + t)];
      return L.output(e, n.newline !== false, ctx);
    }
    case 'call': {
      let c; try{ c = FL.parseCallStmt(t); }catch(e){ return [L.comment('Call non valida: ' + t)]; }
      const f = ctx.funcByName(c.name);
      if(f) return [userCall(L, f, c.args, ctx, L.E) + (L.semi || '')];
      if(c.name.toLowerCase() in FL.GRAPHICS) return [L.comment('Grafica FlowLab: ' + FL.exprToSource(c))];
      return [L.E(c, ctx, 0) + (L.semi || '')];
    }
  }
  return [];
}

/* ============================================================
   PYTHON
   ============================================================ */
const PY = { tab:'    ', T:'True', F:'False', pi:'math.pi', pass:'pass', elseLine:'else:', breakStmt:'break', semi:'' };
PY.str = v => jsStr(v);
PY.not = (s) => 'not ' + s;
PY.ops = { and:'and', or:'or', '==':'==', '!=':'!=', '%':'%' };
PY.pow = (a, b) => a + ' ** ' + b;
PY.concat = (parts, ctx, E) => parts.map(p => isStr(typeOf(p, ctx)) ? E(p, ctx, 5) : 'str(' + E(p, ctx, 0) + ')').join(' + ');
PY.fn = {
  abs:'abs', arccos:'math.acos', arcsin:'math.asin', arctan:'math.atan', cos:'math.cos', sin:'math.sin', tan:'math.tan',
  int:'int', log:'math.log', log10:'math.log10', sqrt:'math.sqrt', exp:'math.exp', floor:'math.floor', ceil:'math.ceil',
  round:'round', min:'min', max:'max', pow:'math.pow', len:'len', size:'len', tochar:'chr', tocode:'ord',
  tointeger:'int', toreal:'float', tostring:'str',
  sgn:a => '(1 if ' + a[0] + ' > 0 else (-1 if ' + a[0] + ' < 0 else 0))',
  random:a => a.length ? 'random.randrange(' + a[0] + ')' : 'random.random()',
  char:a => a[0] + '[' + a[1] + ']',
  mid:a => a[0] + '[' + a[1] + ':' + a[1] + ' + ' + a[2] + ']',
  tofixed:a => 'format(' + a[0] + ', ".' + '" + str(' + a[1] + ') + "f")',
  toupper:a => a[0] + '.upper()', tolower:a => a[0] + '.lower()', trim:a => a[0] + '.strip()',
  isnumber:a => 'str(' + a[0] + ').replace(".", "", 1).lstrip("-").isdigit()'
};
PY.E = makeEmitter(PY);
PY.comment = s => '# ' + s;
PY.ifOpen = c => 'if ' + c + ':';
PY.whileOpen = c => 'while ' + c + ':';
PY.forOpen = (v, s, e, st, dec) => {
  const stepN = Number(st);
  if(dec) return 'for ' + v + ' in range(' + s + ', ' + e + ' - 1, -' + st + '):';
  return 'for ' + v + ' in range(' + s + ', ' + e + ' + 1' + (stepN === 1 ? '' : ', ' + st) + '):';
};
PY.doWhile = (it, cond, c, ctx, lines, ind, body) => {
  lines.push(I(ind, PY) + 'while True:');
  body();
  lines.push(I(ind + 1, PY) + 'if not (' + cond + '):');
  lines.push(I(ind + 2, PY) + 'break');
};
PY.declare = (type, ds) => ds.map(d => {
  const dv = type === 'Integer' ? '0' : type === 'Real' ? '0.0' : type === 'Boolean' ? 'False' : '""';
  return d.size ? d.name + ' = [' + dv + '] * ' + PY.E(d.size, { vars:{}, funcByName:() => null }, 6) : d.name + ' = ' + dv;
});
PY.assign = (a, ctx) => {
  const tt = typeOf(a.target, ctx), et = typeOf(a.expr, ctx);
  let rhs = PY.E(a.expr, ctx, 0);
  if(tt === 'Integer' && et === 'Real') rhs = 'int(' + rhs + ')';
  return [PY.E(a.target, ctx, 0) + ' = ' + rhs];
};
PY.input = (dest, type) => {
  const cast = { Integer:'int', Real:'float' }[type];
  if(type === 'Boolean') return [dest + ' = input().strip().lower() in ("true", "vero", "1", "si")'];
  if(type === 'Character') return [dest + ' = input()[:1]'];
  return [dest + ' = ' + (cast ? cast + '(input())' : 'input()')];
};
PY.output = (e, nl, ctx) => {
  const parts = concatParts(e, ctx);
  const args = parts.map(p => {
    const t = typeOf(p, ctx);
    if(t === 'Boolean') return 'str(' + PY.E(p, ctx, 0) + ').lower()';
    return PY.E(p, ctx, 0);
  });
  return ['print(' + args.join(', ') + (parts.length > 1 ? ', sep=""' : '') + (nl ? '' : ', end=""') + ')'];
};
PY.funcEpilogue = (f, ctx, lines, ind) => { if(f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, PY) + 'return ' + f.returnVar); };
PY.wrap = (bodies, out, uses, project) => {
  out.push('# Generato da FlowLab — Python 3');
  out.push('import math');
  out.push('import random');
  out.push('');
  const ordered = bodies.slice(1).concat([bodies[0]]);
  ordered.forEach(b => {
    out.push('');
    out.push('def ' + (b.isMain ? 'main' : b.f.name) + '(' + (b.f.params || []).map(p => p.name).join(', ') + '):');
    const body = b.lines.filter(l => l.trim() !== '');
    if(!body.length) out.push('    pass'); else b.lines.forEach(l => out.push(l));
  });
  out.push('');
  out.push('');
  out.push('if __name__ == "__main__":');
  out.push('    main()');
};

/* ============================================================
   Famiglia C (C, C++, Java, JavaScript, C#)
   ============================================================ */
function cFamily(base){
  const L = Object.assign({ tab:'    ', T:'true', F:'false', elseLine:'} else {', breakStmt:'break;', semi:';' }, base);
  L.ops = Object.assign({ and:'&&', or:'||', '==':'==', '!=':'!=' }, base.ops || {});
  L.not = L.not || ((s, a) => '!' + ((a.t === 'bin') ? '(' + s + ')' : s));
  L.comment = L.comment || (s => '// ' + s);
  L.ifOpen = c => 'if (' + c + ') {';
  L.whileOpen = c => 'while (' + c + ') {';
  L.blockClose = () => '}';
  L.forOpen = L.forOpen || ((v, s, e, st, dec) => 'for (' + v + ' = ' + s + '; ' + v + (dec ? ' >= ' : ' <= ') + e + '; ' + v + (dec ? ' -= ' : ' += ') + st + ') {');
  L.doWhile = (it, cond, c, ctx, lines, ind, body) => {
    lines.push(I(ind, L) + 'do {');
    body();
    lines.push(I(ind, L) + '} while (' + cond + ');');
  };
  L.E = makeEmitter(L);
  return L;
}
const stub = { vars:{}, funcByName:() => null };

/* ---------- C ---------- */
const C = cFamily({
  pi:'M_PI', arrSize:true,
  str:v => jsStr(v), char:v => "'" + (v === "'" ? "\\'" : v === '\\' ? '\\\\' : v) + "'",
  pow:(a, b) => 'pow(' + a + ', ' + b + ')',
  div:(a, b, lt, rt) => (lt === 'Integer' && rt === 'Integer') ? '(double) ' + a + ' / ' + b : a + ' / ' + b,
  mod:(a, b, lt, rt) => (lt === 'Real' || rt === 'Real') ? 'fmod(' + a + ', ' + b + ')' : a + ' % ' + b,
  strCmp:(op, a, b, lt, rt) => {
    if(lt === 'Character' && rt === 'Character') return a + ' ' + ({ '==':'==', '!=':'!=' }[op] || op) + ' ' + b;
    return 'strcmp(' + a + ', ' + b + ') ' + op + ' 0';
  },
  concat:(parts) => '/* concatenazione: vedi sprintf */ ""',
  fn:{
    abs:(a, x, ctx) => (typeOf(x[0], ctx) === 'Integer' ? 'abs(' : 'fabs(') + a[0] + ')',
    arccos:'acos', arcsin:'asin', arctan:'atan', cos:'cos', sin:'sin', tan:'tan', log:'log', log10:'log10',
    sqrt:'sqrt', exp:'exp', pow:'pow', int:a => '(int) (' + a[0] + ')', floor:a => '(int) floor(' + a[0] + ')', ceil:a => '(int) ceil(' + a[0] + ')',
    round:a => '(int) round(' + a[0] + ')', len:a => '(int) strlen(' + a[0] + ')',
    size:(a, x, ctx) => x[0] && x[0].t === 'var' ? arrSizeExpr(x[0].name, ctx) : '0',
    random:a => a.length ? '(rand() % ' + a[0] + ')' : '((double) rand() / RAND_MAX)',
    char:a => a[0] + '[' + a[1] + ']', tochar:a => '(char) (' + a[0] + ')', tocode:a => '(int) (' + a[0] + ')',
    tointeger:a => 'atoi(' + a[0] + ')', toreal:a => 'atof(' + a[0] + ')',
    tostring:(a, x, ctx) => { const t = typeOf(x[0], ctx); return t === 'String' ? a[0] : t === 'Real' ? 'fl_str_d(' + a[0] + ')' : t === 'Character' ? 'fl_str_c(' + a[0] + ')' : 'fl_str_i(' + a[0] + ')'; },
    tofixed:a => 'fl_fixed(' + a[0] + ', ' + a[1] + ')',
    toupper:a => 'fl_upper(' + a[0] + ')', tolower:a => 'fl_lower(' + a[0] + ')', mid:a => 'fl_mid(' + a[0] + ', ' + a[1] + ', ' + a[2] + ')',
    sgn:a => '((' + a[0] + ' > 0) - (' + a[0] + ' < 0))',
    min:a => '(' + a[0] + ' < ' + a[1] + ' ? ' + a[0] + ' : ' + a[1] + ')',
    max:a => '(' + a[0] + ' > ' + a[1] + ' ? ' + a[0] + ' : ' + a[1] + ')'
  }
});
function cType(t){ return { Integer:'int', Real:'double', String:'char', Boolean:'bool', Character:'char' }[t] || 'int'; }
function cFmt(t){ return { Integer:'%d', Real:'%g', String:'%s', Boolean:'%d', Character:'%c' }[t] || '%d'; }
function cPrintfParts(parts, ctx){
  let fmt = ''; const args = [];
  parts.forEach(p => {
    if(p.t === 'str' && !(p.q === "'" && p.v.length === 1)){ fmt += p.v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/%/g, '%%'); return; }
    const t = typeOf(p, ctx);
    if(t === 'Boolean'){ fmt += '%s'; args.push('(' + C.E(p, ctx, 0) + ') ? "true" : "false"'); return; }
    fmt += cFmt(t); args.push(C.E(p, ctx, 0));
  });
  return { fmt, args };
}
C.declare = (type, ds) => ds.map(d => {
  if(type === 'String') return 'char ' + d.name + (d.size ? '[' + C.E(d.size, stub, 0) + '][256];' : '[256] = "";');
  return cType(type) + ' ' + d.name + (d.size ? '[' + C.E(d.size, stub, 0) + ']' : '') + ';';
});
C.assign = (a, ctx) => {
  const tt = typeOf(a.target, ctx);
  const dest = C.E(a.target, ctx, 0);
  if(tt === 'String'){
    const parts = concatParts(a.expr, ctx);
    if(parts.length === 1 && isStr(typeOf(parts[0], ctx)) && typeOf(parts[0], ctx) === 'String') return ['strcpy(' + dest + ', ' + C.E(a.expr, ctx, 0) + ');'];
    const pf = cPrintfParts(parts, ctx);
    return ['{ char tmp_[256]; sprintf(tmp_, "' + pf.fmt + '"' + (pf.args.length ? ', ' + pf.args.join(', ') : '') + '); strcpy(' + dest + ', tmp_); }'];
  }
  return [dest + ' = ' + C.E(a.expr, ctx, 0) + ';'];
};
C.input = (dest, type) => {
  if(type === 'String') return ['scanf("%255s", ' + dest + ');'];
  if(type === 'Character') return ['scanf(" %c", &' + dest + ');'];
  if(type === 'Boolean') return ['{ int tmp_; scanf("%d", &tmp_); ' + dest + ' = tmp_ != 0; }'];
  return ['scanf("' + (type === 'Real' ? '%lf' : '%d') + '", &' + dest + ');'];
};
C.output = (e, nl, ctx) => {
  const pf = cPrintfParts(concatParts(e, ctx), ctx);
  return ['printf("' + pf.fmt + (nl ? '\\n' : '') + '"' + (pf.args.length ? ', ' + pf.args.join(', ') : '') + ');'];
};
function cSig(f, isMain, typeFn, arrFn){
  if(isMain) return 'int main(void)';
  const rt = f.returnType && f.returnType !== 'None' ? typeFn(f.returnType) : 'void';
  const ps = (f.params || []).map(p => arrFn(p)).join(', ');
  return rt + ' ' + f.name + '(' + (ps || 'void') + ')';
}
C.funcEpilogue = (f, ctx, lines, ind) => {
  if(f.name.toLowerCase() === 'main'){ lines.push(''); lines.push(I(ind, C) + 'return 0;'); return; }
  if(f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, C) + 'return ' + f.returnVar + ';');
};
C.funcPrologue = (f, ctx, lines, ind) => {
  Object.keys(ctx.vars).forEach(k => { const v = ctx.vars[k]; if(v.implicit) lines.push(I(ind, C) + 'int ' + k + ';'); });
};
C.wrap = (bodies, out) => {
  const ret = t => t === 'String' ? 'char*' : cType(t);
  const par = p => {
    const t = FL.canonType(p.type) || 'Integer';
    const sz = p.array ? ', int ' + p.name + '_size' : '';
    if(t === 'String') return 'char ' + p.name + (p.array ? '[][256]' : '[]') + sz;
    return cType(t) + ' ' + p.name + (p.array ? '[]' : '') + sz;
  };
  out.push('/* Generato da FlowLab — C (C99) */');
  out.push('#include <stdio.h>', '#include <stdlib.h>', '#include <string.h>', '#include <stdbool.h>', '#include <ctype.h>', '#include <math.h>', '');
  out.push('/* funzioni di supporto per le conversioni in stringa */');
  out.push('static char fl_buf[16][64]; static int fl_bi = 0;');
  out.push('char* fl_str_i(int v) { char* b = fl_buf[fl_bi++ % 16]; sprintf(b, "%d", v); return b; }');
  out.push('char* fl_str_d(double v) { char* b = fl_buf[fl_bi++ % 16]; sprintf(b, "%g", v); return b; }');
  out.push('char* fl_str_c(char v) { char* b = fl_buf[fl_bi++ % 16]; b[0] = v; b[1] = 0; return b; }');
  out.push('char* fl_fixed(double v, int d) { char* b = fl_buf[fl_bi++ % 16]; sprintf(b, "%.*f", d, v); return b; }');
  out.push('char* fl_upper(const char* s) { char* b = fl_buf[fl_bi++ % 16]; int i = 0; for (; s[i] && i < 63; i++) b[i] = toupper((unsigned char) s[i]); b[i] = 0; return b; }');
  out.push('char* fl_lower(const char* s) { char* b = fl_buf[fl_bi++ % 16]; int i = 0; for (; s[i] && i < 63; i++) b[i] = tolower((unsigned char) s[i]); b[i] = 0; return b; }');
  out.push('char* fl_mid(const char* s, int st, int n) { char* b = fl_buf[fl_bi++ % 16]; int L = (int) strlen(s), i = 0; for (; i < n && st + i < L && i < 63; i++) b[i] = s[st + i]; b[i] = 0; return b; }');
  out.push('');
  const others = bodies.filter(b => !b.isMain);
  others.forEach(b => out.push(cSig(b.f, false, ret, par) + ';'));
  if(others.length) out.push('');
  bodies.forEach(b => {
    out.push(cSig(b.f, b.isMain, ret, par) + ' {');
    if(b.isMain && bodies.length) out.push('    srand((unsigned) time(NULL));');
    b.lines.forEach(l => out.push(l));
    out.push('}', '');
  });
  if(out.some(l => l.includes('srand('))) out.splice(out.indexOf('#include <math.h>') + 1, 0, '#include <time.h>');
};

/* ---------- C++ ---------- */
const CPP = cFamily({
  pi:'M_PI', arrSize:true,
  str:v => jsStr(v), char:v => "'" + (v === "'" ? "\\'" : v === '\\' ? '\\\\' : v) + "'",
  pow:(a, b) => 'pow(' + a + ', ' + b + ')',
  div:(a, b, lt, rt) => (lt === 'Integer' && rt === 'Integer') ? '(double) ' + a + ' / ' + b : a + ' / ' + b,
  mod:(a, b, lt, rt) => (lt === 'Real' || rt === 'Real') ? 'fmod(' + a + ', ' + b + ')' : a + ' % ' + b,
  concat:(parts, ctx, E) => parts.map((p, i) => {
    const t = typeOf(p, ctx);
    if(t === 'String') return (i === 0 && p.t === 'str') ? 'std::string(' + E(p, ctx, 0) + ')' : E(p, ctx, 5);
    if(t === 'Character') return 'std::string(1, ' + E(p, ctx, 0) + ')';
    if(t === 'Boolean') return 'std::string((' + E(p, ctx, 0) + ') ? "true" : "false")';
    return 'fl_str(' + E(p, ctx, 0) + ')';
  }).join(' + '),
  fn:{
    abs:'std::abs', arccos:'acos', arcsin:'asin', arctan:'atan', cos:'cos', sin:'sin', tan:'tan', log:'log', log10:'log10',
    sqrt:'sqrt', exp:'exp', pow:'pow', int:a => '(int) (' + a[0] + ')', floor:a => '(int) floor(' + a[0] + ')', ceil:a => '(int) ceil(' + a[0] + ')',
    round:a => '(int) round(' + a[0] + ')', len:a => '(int) ' + a[0] + '.length()', size:(a, x, ctx) => x[0] && x[0].t === 'var' ? arrSizeExpr(x[0].name, ctx) : '0',
    toupper:a => 'fl_upper(' + a[0] + ')', tolower:a => 'fl_lower(' + a[0] + ')',
    random:a => a.length ? '(rand() % ' + a[0] + ')' : '((double) rand() / RAND_MAX)',
    char:a => a[0] + '[' + a[1] + ']', mid:a => a[0] + '.substr(' + a[1] + ', ' + a[2] + ')',
    tochar:a => '(char) (' + a[0] + ')', tocode:a => '(int) (' + a[0] + ')',
    tointeger:a => 'std::stoi(' + a[0] + ')', toreal:a => 'std::stod(' + a[0] + ')', tostring:a => 'fl_str(' + a[0] + ')',
    sgn:a => '((' + a[0] + ' > 0) - (' + a[0] + ' < 0))', min:'std::min', max:'std::max',
    tofixed:a => 'fl_fixed(' + a[0] + ', ' + a[1] + ')'
  }
});
function cppType(t){ return { Integer:'int', Real:'double', String:'std::string', Boolean:'bool', Character:'char' }[t] || 'int'; }
CPP.declare = (type, ds) => ds.map(d => cppType(type) + ' ' + d.name + (d.size ? '[' + CPP.E(d.size, stub, 0) + ']' : '') + ';');
CPP.assign = (a, ctx) => [CPP.E(a.target, ctx, 0) + ' = ' + CPP.E(a.expr, ctx, 0) + ';'];
CPP.input = (dest, type) => type === 'String' ? ['std::getline(std::cin >> std::ws, ' + dest + ');'] : ['std::cin >> ' + dest + ';'];
CPP.output = (e, nl, ctx) => {
  const parts = concatParts(e, ctx).map(p => typeOf(p, ctx) === 'Boolean' ? '((' + CPP.E(p, ctx, 0) + ') ? "true" : "false")' : CPP.E(p, ctx, 4));
  return ['std::cout << ' + parts.join(' << ') + (nl ? ' << std::endl' : '') + ';'];
};
CPP.funcPrologue = C.funcPrologue;
CPP.funcEpilogue = (f, ctx, lines, ind) => {
  if(f.name.toLowerCase() === 'main'){ lines.push(''); lines.push(I(ind, CPP) + 'return 0;'); return; }
  if(f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, CPP) + 'return ' + f.returnVar + ';');
};
CPP.wrap = (bodies, out) => {
  const par = p => cppType(FL.canonType(p.type) || 'Integer') + ' ' + p.name + (p.array ? '[], int ' + p.name + '_size' : '');
  out.push('// Generato da FlowLab — C++17');
  out.push('#include <iostream>', '#include <string>', '#include <sstream>', '#include <iomanip>', '#include <algorithm>', '#include <cmath>', '#include <cstdlib>', '#include <ctime>', '');
  out.push('template <typename T> std::string fl_str(T v) { std::ostringstream s; s << v; return s.str(); }');
  out.push('std::string fl_fixed(double v, int d) { std::ostringstream s; s << std::fixed << std::setprecision(d) << v; return s.str(); }');
  out.push('std::string fl_upper(std::string s) { for (auto& c : s) c = toupper((unsigned char) c); return s; }');
  out.push('std::string fl_lower(std::string s) { for (auto& c : s) c = tolower((unsigned char) c); return s; }');
  out.push('');
  const others = bodies.filter(b => !b.isMain);
  others.forEach(b => out.push(cSig(b.f, false, cppType, par) + ';'));
  if(others.length) out.push('');
  bodies.forEach(b => {
    out.push((b.isMain ? 'int main()' : cSig(b.f, false, cppType, par)) + ' {');
    if(b.isMain) out.push('    srand((unsigned) time(nullptr));');
    b.lines.forEach(l => out.push(l));
    out.push('}', '');
  });
};

/* ---------- Java ---------- */
const JAVA = cFamily({
  pi:'Math.PI',
  str:v => jsStr(v), char:v => "'" + (v === "'" ? "\\'" : v === '\\' ? '\\\\' : v) + "'",
  pow:(a, b) => 'Math.pow(' + a + ', ' + b + ')',
  div:(a, b, lt, rt) => (lt === 'Integer' && rt === 'Integer') ? '(double) ' + a + ' / ' + b : a + ' / ' + b,
  strCmp:(op, a, b, lt, rt) => {
    if(lt === 'Character' && rt === 'Character') return a + ' ' + op + ' ' + b;
    if(op === '==') return a + '.equals(' + b + ')';
    if(op === '!=') return '!' + a + '.equals(' + b + ')';
    return a + '.compareTo(' + b + ') ' + op + ' 0';
  },
  concat:(parts, ctx, E) => {
    const s = parts.map(p => E(p, ctx, 5));
    if(!isStr(typeOf(parts[0], ctx)) || typeOf(parts[0], ctx) === 'Character') s[0] = '"" + ' + s[0];
    return s.join(' + ');
  },
  fn:{
    abs:'Math.abs', arccos:'Math.acos', arcsin:'Math.asin', arctan:'Math.atan', cos:'Math.cos', sin:'Math.sin', tan:'Math.tan',
    log:'Math.log', log10:'Math.log10', sqrt:'Math.sqrt', exp:'Math.exp', pow:'Math.pow', min:'Math.min', max:'Math.max',
    int:a => '(int) (' + a[0] + ')', floor:a => '(int) Math.floor(' + a[0] + ')', ceil:a => '(int) Math.ceil(' + a[0] + ')',
    round:a => '(int) Math.round(' + a[0] + ')', sgn:a => '(int) Math.signum(' + a[0] + ')',
    len:a => a[0] + '.length()', size:a => a[0] + '.length',
    random:a => a.length ? 'RND.nextInt(' + a[0] + ')' : 'RND.nextDouble()',
    char:a => a[0] + '.charAt(' + a[1] + ')', mid:a => a[0] + '.substring(' + a[1] + ', ' + a[1] + ' + ' + a[2] + ')',
    tochar:a => '(char) (' + a[0] + ')', tocode:a => '(int) (' + a[0] + ')',
    tointeger:a => 'Integer.parseInt(' + a[0] + ')', toreal:a => 'Double.parseDouble(' + a[0] + ')', tostring:a => 'String.valueOf(' + a[0] + ')',
    tofixed:a => 'String.format("%.' + '" + (' + a[1] + ') + "f", ' + a[0] + ')',
    toupper:a => a[0] + '.toUpperCase()', tolower:a => a[0] + '.toLowerCase()', trim:a => a[0] + '.trim()'
  }
});
function javaType(t){ return { Integer:'int', Real:'double', String:'String', Boolean:'boolean', Character:'char' }[t] || 'int'; }
JAVA.declare = (type, ds) => ds.map(d => {
  const jt = javaType(type);
  if(d.size) return jt + '[] ' + d.name + ' = new ' + jt + '[' + JAVA.E(d.size, stub, 0) + '];';
  const dv = { Integer:'0', Real:'0.0', String:'""', Boolean:'false', Character:"' '" }[type];
  return jt + ' ' + d.name + ' = ' + dv + ';';
});
JAVA.assign = (a, ctx) => {
  const tt = typeOf(a.target, ctx), et = typeOf(a.expr, ctx);
  let rhs = JAVA.E(a.expr, ctx, 0);
  if(tt === 'Integer' && et === 'Real') rhs = '(int) (' + rhs + ')';
  return [JAVA.E(a.target, ctx, 0) + ' = ' + rhs + ';'];
};
JAVA.input = (dest, type) => {
  const m = { Integer:'Integer.parseInt(SC.nextLine().trim())', Real:'Double.parseDouble(SC.nextLine().trim())', Boolean:'Boolean.parseBoolean(SC.nextLine().trim())', Character:'SC.nextLine().charAt(0)' }[type] || 'SC.nextLine()';
  return [dest + ' = ' + m + ';'];
};
JAVA.output = (e, nl, ctx) => ['System.out.' + (nl ? 'println' : 'print') + '(' + JAVA.E(e, ctx, 0) + ');'];
JAVA.funcPrologue = C.funcPrologue;
JAVA.funcEpilogue = (f, ctx, lines, ind) => { if(f.name.toLowerCase() !== 'main' && f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, JAVA) + 'return ' + f.returnVar + ';'); };
JAVA.bodyIndent = 2;
JAVA.wrap = (bodies, out) => {
  out.push('// Generato da FlowLab — Java');
  out.push('import java.util.Random;', 'import java.util.Scanner;', '');
  out.push('public class Main {');
  out.push('    static final Scanner SC = new Scanner(System.in);');
  out.push('    static final Random RND = new Random();');
  bodies.forEach(b => {
    out.push('');
    if(b.isMain) out.push('    public static void main(String[] args) {');
    else {
      const rt = b.f.returnType && b.f.returnType !== 'None' ? javaType(b.f.returnType) : 'void';
      const ps = (b.f.params || []).map(p => javaType(FL.canonType(p.type) || 'Integer') + (p.array ? '[]' : '') + ' ' + p.name).join(', ');
      out.push('    static ' + rt + ' ' + b.f.name + '(' + ps + ') {');
    }
    b.lines.forEach(l => out.push(l));
    out.push('    }');
  });
  out.push('}');
};

/* ---------- C# ---------- */
const CS = cFamily({
  pi:'Math.PI',
  str:v => jsStr(v), char:v => "'" + (v === "'" ? "\\'" : v === '\\' ? '\\\\' : v) + "'",
  pow:(a, b) => 'Math.Pow(' + a + ', ' + b + ')',
  div:(a, b, lt, rt) => (lt === 'Integer' && rt === 'Integer') ? '(double) ' + a + ' / ' + b : a + ' / ' + b,
  strCmp:(op, a, b, lt, rt) => (op === '==' || op === '!=' || (lt === 'Character' && rt === 'Character')) ? a + ' ' + op + ' ' + b : 'string.Compare(' + a + ', ' + b + ') ' + op + ' 0',
  concat:(parts, ctx, E) => { const s = parts.map(p => E(p, ctx, 5)); if(typeOf(parts[0], ctx) !== 'String') s[0] = '"" + ' + s[0]; return s.join(' + '); },
  fn:{
    abs:'Math.Abs', arccos:'Math.Acos', arcsin:'Math.Asin', arctan:'Math.Atan', cos:'Math.Cos', sin:'Math.Sin', tan:'Math.Tan',
    log:'Math.Log', log10:'Math.Log10', sqrt:'Math.Sqrt', exp:'Math.Exp', pow:'Math.Pow', min:'Math.Min', max:'Math.Max',
    int:a => '(int) (' + a[0] + ')', floor:a => '(int) Math.Floor(' + a[0] + ')', ceil:a => '(int) Math.Ceiling(' + a[0] + ')',
    round:a => '(int) Math.Round(' + a[0] + ')', sgn:'Math.Sign', len:a => a[0] + '.Length', size:a => a[0] + '.Length',
    random:a => a.length ? 'Rnd.Next(' + a[0] + ')' : 'Rnd.NextDouble()', char:a => a[0] + '[' + a[1] + ']',
    mid:a => a[0] + '.Substring(' + a[1] + ', ' + a[2] + ')', tochar:a => '(char) (' + a[0] + ')', tocode:a => '(int) (' + a[0] + ')',
    tointeger:a => 'int.Parse(' + a[0] + ')', toreal:a => 'double.Parse(' + a[0] + ')', tostring:a => 'Convert.ToString(' + a[0] + ')',
    tofixed:a => a[0] + '.ToString("F" + ' + a[1] + ')', toupper:a => a[0] + '.ToUpper()', tolower:a => a[0] + '.ToLower()', trim:a => a[0] + '.Trim()'
  }
});
function csType(t){ return { Integer:'int', Real:'double', String:'string', Boolean:'bool', Character:'char' }[t] || 'int'; }
CS.declare = (type, ds) => ds.map(d => {
  const t = csType(type);
  if(d.size) return t + '[] ' + d.name + ' = new ' + t + '[' + CS.E(d.size, stub, 0) + '];';
  return t + ' ' + d.name + ' = ' + ({ Integer:'0', Real:'0.0', String:'""', Boolean:'false', Character:"' '" }[type]) + ';';
});
CS.assign = (a, ctx) => {
  const tt = typeOf(a.target, ctx), et = typeOf(a.expr, ctx);
  let rhs = CS.E(a.expr, ctx, 0);
  if(tt === 'Integer' && et === 'Real') rhs = '(int) (' + rhs + ')';
  return [CS.E(a.target, ctx, 0) + ' = ' + rhs + ';'];
};
CS.input = (dest, type) => [dest + ' = ' + ({ Integer:'int.Parse(Console.ReadLine())', Real:'double.Parse(Console.ReadLine())', Boolean:'bool.Parse(Console.ReadLine())', Character:'Console.ReadLine()[0]' }[type] || 'Console.ReadLine()') + ';'];
CS.output = (e, nl, ctx) => ['Console.Write' + (nl ? 'Line' : '') + '(' + CS.E(e, ctx, 0) + ');'];
CS.funcPrologue = C.funcPrologue;
CS.funcEpilogue = JAVA.funcEpilogue;
CS.bodyIndent = 2;
CS.wrap = (bodies, out) => {
  out.push('// Generato da FlowLab — C#');
  out.push('using System;', '');
  out.push('class Program');
  out.push('{');
  out.push('    static readonly Random Rnd = new Random();');
  bodies.forEach(b => {
    out.push('');
    if(b.isMain) out.push('    static void Main(string[] args)');
    else {
      const rt = b.f.returnType && b.f.returnType !== 'None' ? csType(b.f.returnType) : 'void';
      const ps = (b.f.params || []).map(p => csType(FL.canonType(p.type) || 'Integer') + (p.array ? '[]' : '') + ' ' + p.name).join(', ');
      out.push('    static ' + rt + ' ' + b.f.name + '(' + ps + ')');
    }
    out.push('    {');
    b.lines.forEach(l => out.push(l));
    out.push('    }');
  });
  out.push('}');
};

/* ---------- JavaScript ---------- */
const JS = cFamily({
  pi:'Math.PI',
  str:v => jsStr(v),
  pow:(a, b) => a + ' ** ' + b,
  ops:{ '==':'===', '!=':'!==' },
  concat:(parts, ctx, E) => { const s = parts.map(p => E(p, ctx, 5)); if(!isStr(typeOf(parts[0], ctx))) s[0] = 'String(' + s[0] + ')'; return s.join(' + '); },
  fn:{
    abs:'Math.abs', arccos:'Math.acos', arcsin:'Math.asin', arctan:'Math.atan', cos:'Math.cos', sin:'Math.sin', tan:'Math.tan',
    log:'Math.log', log10:'Math.log10', sqrt:'Math.sqrt', exp:'Math.exp', pow:'Math.pow', min:'Math.min', max:'Math.max',
    int:'Math.trunc', floor:'Math.floor', ceil:'Math.ceil', round:'Math.round', sgn:'Math.sign',
    len:a => a[0] + '.length', size:a => a[0] + '.length',
    random:a => a.length ? 'Math.floor(Math.random() * ' + a[0] + ')' : 'Math.random()',
    char:a => a[0] + '[' + a[1] + ']', mid:a => a[0] + '.substr(' + a[1] + ', ' + a[2] + ')',
    tochar:'String.fromCharCode', tocode:a => a[0] + '.charCodeAt(0)', tointeger:'parseInt', toreal:'parseFloat', tostring:'String',
    tofixed:a => a[0] + '.toFixed(' + a[1] + ')', toupper:a => a[0] + '.toUpperCase()', tolower:a => a[0] + '.toLowerCase()', trim:a => a[0] + '.trim()'
  }
});
JS.forOpen = (v, s, e, st, dec) => 'for (' + v + ' = ' + s + '; ' + v + (dec ? ' >= ' : ' <= ') + e + '; ' + v + (dec ? ' -= ' : ' += ') + st + ') {';
JS.declare = (type, ds) => ds.map(d => {
  const dv = { Integer:'0', Real:'0', String:'""', Boolean:'false', Character:'" "' }[type];
  return 'let ' + d.name + ' = ' + (d.size ? 'new Array(' + JS.E(d.size, stub, 0) + ').fill(' + dv + ')' : dv) + ';';
});
JS.assign = (a, ctx) => {
  const tt = typeOf(a.target, ctx), et = typeOf(a.expr, ctx);
  let rhs = JS.E(a.expr, ctx, 0);
  if(tt === 'Integer' && et === 'Real') rhs = 'Math.trunc(' + rhs + ')';
  return [JS.E(a.target, ctx, 0) + ' = ' + rhs + ';'];
};
JS.input = (dest, type) => [dest + ' = ' + ({ Integer:'parseInt(input())', Real:'parseFloat(input())', Boolean:'input().trim().toLowerCase() === "true"', Character:'input()[0]' }[type] || 'input()') + ';'];
JS.output = (e, nl, ctx) => [(nl ? 'console.log(' : 'process.stdout.write(String(') + JS.E(e, ctx, 0) + (nl ? ');' : '));')];
JS.funcPrologue = (f, ctx, lines, ind) => { Object.keys(ctx.vars).forEach(k => { if(ctx.vars[k].implicit) lines.push(I(ind, JS) + 'let ' + k + ';'); }); };
JS.funcEpilogue = (f, ctx, lines, ind) => { if(f.name.toLowerCase() !== 'main' && f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, JS) + 'return ' + f.returnVar + ';'); };
JS.wrap = (bodies, out) => {
  out.push('// Generato da FlowLab — JavaScript (Node.js)');
  out.push('const fs = require("fs");');
  out.push('const _lines = fs.readFileSync(0, "utf8").split(/\\r?\\n/);');
  out.push('let _li = 0;');
  out.push('function input() { return _lines[_li++] ?? ""; }');
  bodies.forEach(b => {
    out.push('');
    out.push('function ' + (b.isMain ? 'main' : b.f.name) + '(' + (b.f.params || []).map(p => p.name).join(', ') + ') {');
    b.lines.forEach(l => out.push(l));
    out.push('}');
  });
  out.push('', 'main();');
};

/* ============================================================
   PSEUDOCODICE (italiano)
   ============================================================ */
const PS = { tab:'    ', T:'vero', F:'falso', pi:'π', elseLine:'Altrimenti', breakStmt:'Esci dal ciclo', semi:'' };
PS.str = v => jsStr(v);
PS.not = s => 'NON ' + s;
PS.ops = { and:'E', or:'O', '==':'=', '!=':'≠', '<=':'≤', '>=':'≥', '%':'mod', '/':'/' };
PS.pow = (a, b) => a + '^' + b;
PS.concat = (parts, ctx, E) => parts.map(p => E(p, ctx, 5)).join(' & ');
PS.fn = {};
PS.E = makeEmitter(PS);
PS.comment = s => '// ' + s;
PS.ifOpen = c => 'Se ' + c + ' Allora';
PS.whileOpen = c => 'Mentre ' + c + ' Esegui';
PS.blockClose = t => ({ if:'FineSe', while:'FineMentre', for:'FinePer' }[t] || 'Fine');
PS.forOpen = (v, s, e, st, dec) => 'Per ' + v + ' Da ' + s + ' A ' + e + (dec ? ' Decrementando di ' + st : (String(st) === '1' ? '' : ' Passo ' + st)) + ' Esegui';
PS.doWhile = (it, cond, c, ctx, lines, ind, body) => { lines.push(I(ind, PS) + 'Esegui'); body(); lines.push(I(ind, PS) + 'Mentre ' + cond); };
PS.declare = (type, ds) => ['Dichiara ' + type + ' ' + ds.map(d => d.size ? d.name + '[' + FL.exprToSource(d.size) + ']' : d.name).join(', ')];
PS.assign = (a, ctx) => [PS.E(a.target, ctx, 0) + ' ← ' + PS.E(a.expr, ctx, 0)];
PS.input = dest => ['Leggi ' + dest];
PS.output = (e, nl, ctx) => ['Scrivi ' + PS.E(e, ctx, 0) + (nl ? '' : '  (senza a capo)')];
PS.funcEpilogue = (f, ctx, lines, ind) => { if(f.returnType && f.returnType !== 'None' && f.returnVar) lines.push(I(ind, PS) + 'Restituisci ' + f.returnVar); };
PS.wrap = (bodies, out) => {
  out.push('// Pseudocodice generato da FlowLab');
  bodies.forEach(b => {
    out.push('');
    const ps = (b.f.params || []).map(p => (FL.canonType(p.type) || 'Integer') + ' ' + p.name + (p.array ? '[]' : '')).join(', ');
    const rt = b.f.returnType && b.f.returnType !== 'None' ? ' : ' + b.f.returnType : '';
    out.push(b.isMain ? 'Inizio' : 'Funzione ' + b.f.name + '(' + ps + ')' + rt);
    b.lines.forEach(l => out.push(l));
    out.push(b.isMain ? 'Fine' : 'FineFunzione');
  });
};

const LANGS = {
  python:     { label:'Python',     ext:'py',   L:PY },
  c:          { label:'C',          ext:'c',    L:C },
  cpp:        { label:'C++',        ext:'cpp',  L:CPP },
  java:       { label:'Java',       ext:'java', L:JAVA },
  csharp:     { label:'C#',         ext:'cs',   L:CS },
  javascript: { label:'JavaScript', ext:'js',   L:JS },
  pseudo:     { label:'Pseudocodice', ext:'txt', L:PS },
};
function generate(project, lang){
  const d = LANGS[lang];
  if(!d) throw new Error('Linguaggio non supportato: ' + lang);
  return genProgram(project, d.L);
}

FL.codegen = { LANGS, generate, typeOf };
})();
