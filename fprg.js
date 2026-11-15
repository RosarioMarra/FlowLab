/* ============================================================
   FlowLab — Import/Export formato Flowgorithm (.fprg)
   ============================================================ */
'use strict';

(function(){
const FL = window.FL;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function xmlEsc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
function fgType(t){ const c = FL.canonType(t) || 'Integer'; return c === 'Character' ? 'String' : c; }
function stamp(d){
  const p = n => String(n).padStart(2, '0');
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(h) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' ' + ap;
}

/* ---------- Export ---------- */
function exportFprg(project){
  const out = [];
  const now = stamp(new Date());
  out.push('<?xml version="1.0"?>');
  out.push('<flowgorithm fileversion="4.2">');
  out.push('    <attributes>');
  out.push('        <attribute name="name" value="' + xmlEsc(project.name || 'FlowLab') + '"/>');
  out.push('        <attribute name="authors" value=""/>');
  out.push('        <attribute name="about" value="Esportato da FlowLab"/>');
  out.push('        <attribute name="saved" value="' + now + '"/>');
  out.push('        <attribute name="created" value="' + now + '"/>');
  out.push('        <attribute name="edited" value="' + now + '"/>');
  out.push('    </attributes>');
  project.funcs.forEach(f => {
    const rt = f.returnType && f.returnType !== 'None' ? fgType(f.returnType) : 'None';
    out.push('    <function name="' + xmlEsc(f.name) + '" type="' + rt + '" variable="' + xmlEsc(rt === 'None' ? '' : f.returnVar || '') + '">');
    if((f.params || []).length){
      out.push('        <parameters>');
      f.params.forEach(p => out.push('            <parameter name="' + xmlEsc(p.name) + '" type="' + fgType(p.type) + '" array="' + (p.array ? 'True' : 'False') + '"/>'));
      out.push('        </parameters>');
    } else out.push('        <parameters/>');
    out.push('        <body>');
    emitItems(FL.parseBlock(f.nodes), out, 3);
    out.push('        </body>');
    out.push('    </function>');
  });
  out.push('</flowgorithm>');
  return out.join('\n');
}
function ind(n){ return '    '.repeat(n); }
function emitItems(items, out, d){
  items.forEach(it => {
    const n = it.node, t = String(n.text || '').trim();
    if(it.kind === 'if'){
      out.push(ind(d) + '<if expression="' + xmlEsc(t) + '">');
      out.push(ind(d + 1) + '<then>'); emitItems(it.trueBranch, out, d + 2); out.push(ind(d + 1) + '</then>');
      out.push(ind(d + 1) + '<else>'); emitItems(it.falseBranch, out, d + 2); out.push(ind(d + 1) + '</else>');
      out.push(ind(d) + '</if>');
      return;
    }
    if(it.kind === 'loop'){
      if(n.type === 'while'){ out.push(ind(d) + '<while expression="' + xmlEsc(t) + '">'); emitItems(it.body, out, d + 1); out.push(ind(d) + '</while>'); }
      else if(n.type === 'dowhile'){ out.push(ind(d) + '<do expression="' + xmlEsc(t) + '">'); emitItems(it.body, out, d + 1); out.push(ind(d) + '</do>'); }
      else {
        const fd = n.forData && n.forData.variable ? n.forData : (FL.parseForText(n.text) || { variable:'i', start:'0', end:'0', step:'1', direction:'inc' });
        out.push(ind(d) + '<for variable="' + xmlEsc(fd.variable) + '" start="' + xmlEsc(fd.start) + '" end="' + xmlEsc(fd.end) + '" direction="' + (fd.direction === 'dec' ? 'dec' : 'inc') + '" step="' + xmlEsc(fd.step || '1') + '">');
        emitItems(it.body, out, d + 1);
        out.push(ind(d) + '</for>');
      }
      return;
    }
    switch(n.type){
      case 'declare': {
        const ds = FL.declaredNames(t);
        const type = fgType(n.declareType);
        const scal = ds.filter(x => !x.size).map(x => x.name);
        if(scal.length) out.push(ind(d) + '<declare name="' + xmlEsc(scal.join(', ')) + '" type="' + type + '" array="False" size=""/>');
        ds.filter(x => x.size).forEach(x => out.push(ind(d) + '<declare name="' + xmlEsc(x.name) + '" type="' + type + '" array="True" size="' + xmlEsc(x.sizeText) + '"/>'));
        break;
      }
      case 'assign': {
        let a = null; try{ a = FL.parseAssign(t); }catch(e){}
        if(a) out.push(ind(d) + '<assign variable="' + xmlEsc(FL.exprToSource(a.target)) + '" expression="' + xmlEsc(FL.exprToSource(a.expr)) + '"/>');
        else out.push(ind(d) + '<comment text="' + xmlEsc('Assign: ' + t) + '"/>');
        break;
      }
      case 'input': out.push(ind(d) + '<input variable="' + xmlEsc(t) + '"/>'); break;
      case 'output': out.push(ind(d) + '<output expression="' + xmlEsc(t) + '" newline="' + (n.newline === false ? 'False' : 'True') + '"/>'); break;
      case 'call': out.push(ind(d) + '<call expression="' + xmlEsc(t) + '"/>'); break;
      case 'comment': out.push(ind(d) + '<comment text="' + xmlEsc(t) + '"/>'); break;
      case 'break': out.push(ind(d) + '<comment text="Break (non supportato da Flowgorithm)"/>'); break;
    }
  });
}

/* ---------- Import ---------- */
function importFprg(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.querySelector('parsererror')) throw new Error('File .fprg non valido (XML malformato)');
  const root = doc.documentElement;
  if(!root || root.nodeName.toLowerCase() !== 'flowgorithm') throw new Error('Non è un file Flowgorithm');
  let name = 'Programma';
  root.querySelectorAll('attributes > attribute').forEach(a => { if(a.getAttribute('name') === 'name' && a.getAttribute('value')) name = a.getAttribute('value'); });
  const funcs = [];
  Array.from(root.children).filter(e => e.nodeName === 'function').forEach(fe => {
    const rt = fe.getAttribute('type') || 'None';
    const f = {
      name:fe.getAttribute('name') || 'Main',
      returnType:rt === 'None' ? 'None' : (FL.canonType(rt) || 'Integer'),
      returnVar:fe.getAttribute('variable') || '',
      params:[],
      nodes:[]
    };
    const pe = Array.from(fe.children).find(e => e.nodeName === 'parameters');
    if(pe) Array.from(pe.children).forEach(p => f.params.push({ name:p.getAttribute('name'), type:FL.canonType(p.getAttribute('type')) || 'Integer', array:/true/i.test(p.getAttribute('array') || '') }));
    const body = Array.from(fe.children).find(e => e.nodeName === 'body');
    f.nodes.push({ id:uid(), type:'start', text:'' });
    if(body) readBody(body, f.nodes);
    f.nodes.push({ id:uid(), type:'end', text:'' });
    funcs.push(f);
  });
  if(!funcs.length) throw new Error('Il file non contiene funzioni');
  return { name, funcs };
}
function readBody(el, nodes){
  Array.from(el.children).forEach(c => {
    const A = k => c.getAttribute(k) || '';
    switch(c.nodeName){
      case 'declare': {
        const type = FL.canonType(A('type')) || 'Integer';
        const isArr = /true/i.test(A('array'));
        const names = A('name').split(',').map(s => s.trim()).filter(Boolean);
        const text = isArr ? names.map(n => n + '[' + (A('size') || '1') + ']').join(', ') : names.join(', ');
        nodes.push({ id:uid(), type:'declare', declareType:type, text });
        break;
      }
      case 'assign': nodes.push({ id:uid(), type:'assign', text:A('variable') + ' = ' + A('expression') }); break;
      case 'input': nodes.push({ id:uid(), type:'input', text:A('variable') }); break;
      case 'output': nodes.push({ id:uid(), type:'output', text:A('expression'), newline:!/false/i.test(A('newline')) }); break;
      case 'call': nodes.push({ id:uid(), type:'call', text:A('expression') }); break;
      case 'comment': nodes.push({ id:uid(), type:'comment', text:A('text') }); break;
      case 'breakpoint': break;
      case 'if': {
        nodes.push({ id:uid(), type:'if', text:A('expression') });
        const th = Array.from(c.children).find(e => e.nodeName === 'then');
        const el2 = Array.from(c.children).find(e => e.nodeName === 'else');
        if(th) readBody(th, nodes);
        if(el2 && el2.children.length){ nodes.push({ id:uid(), type:'else', text:'' }); readBody(el2, nodes); }
        nodes.push({ id:uid(), type:'endif', text:'' });
        break;
      }
      case 'while': nodes.push({ id:uid(), type:'while', text:A('expression') }); readBody(c, nodes); nodes.push({ id:uid(), type:'endloop', text:'' }); break;
      case 'do': nodes.push({ id:uid(), type:'dowhile', text:A('expression') }); readBody(c, nodes); nodes.push({ id:uid(), type:'endloop', text:'' }); break;
      case 'for':
        nodes.push({ id:uid(), type:'for', text:'', forData:{ variable:A('variable'), start:A('start') || '0', end:A('end') || '0', direction:/dec/i.test(A('direction')) ? 'dec' : 'inc', step:A('step') || '1' } });
        readBody(c, nodes);
        nodes.push({ id:uid(), type:'endloop', text:'' });
        break;
    }
  });
}

FL.fprg = { exportFprg, importFprg };
})();
