/* ============================================================
   FlowLab — Grafici e disegno
   - Andamento delle variabili numeriche nel tempo
   - Visualizzazione a barre degli array (live)
   - Plot(x, y) / PlotBar(etichetta, valore) dell'utente
   - Canvas di disegno con coordinate e grafica a tartaruga
   ============================================================ */
'use strict';

(function(){
const FL = window.FL;
const PALETTE = ['#2563eb', '#e11d48', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];
const MAX_POINTS = 4000;

function css(name, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function fitCanvas(cv){
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
  if(cv.width !== w * dpr || cv.height !== h * dpr){ cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function niceStep(range, target){
  if(range <= 0 || !isFinite(range)) return 1;
  const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function fmtTick(v){
  if(Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(1);
  return String(parseFloat(v.toPrecision(6)));
}

/* ---------- Grafico a linee generico ---------- */
function drawLines(cv, series, o){
  o = o || {};
  const { ctx, w, h } = fitCanvas(cv);
  const fg = css('--text', '#1f2937'), dim = css('--text-faint', '#94a3b8'), grid = css('--grid', '#e5e7eb');
  ctx.clearRect(0, 0, w, h);
  const vis = series.filter(s => s.pts.length && !s.hidden);
  if(!vis.length){
    ctx.fillStyle = dim; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(o.empty || 'Nessun dato', w / 2, h / 2);
    return;
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  vis.forEach(s => s.pts.forEach(p => { if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0]; if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1]; }));
  if(x0 === x1){ x0 -= 1; x1 += 1; }
  if(y0 === y1){ y0 -= 1; y1 += 1; }
  const padY = (y1 - y0) * 0.08; y0 -= padY; y1 += padY;
  const L = 46, R = 12, T = 10, Bm = 24;
  const pw = w - L - R, ph = h - T - Bm;
  const X = v => L + (v - x0) / (x1 - x0) * pw;
  const Y = v => T + ph - (v - y0) / (y1 - y0) * ph;
  ctx.font = '10px ui-monospace, monospace'; ctx.lineWidth = 1;
  const ys = niceStep(y1 - y0, Math.max(2, ph / 36));
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for(let v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys){
    const y = Y(v);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
    ctx.fillStyle = dim; ctx.fillText(fmtTick(v), L - 5, y);
  }
  const xs = niceStep(x1 - x0, Math.max(2, pw / 70));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for(let v = Math.ceil(x0 / xs) * xs; v <= x1; v += xs){
    const x = X(v);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
    ctx.fillStyle = dim; ctx.fillText(fmtTick(v), x, T + ph + 5);
  }
  if(y0 < 0 && y1 > 0){ ctx.strokeStyle = dim; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + pw, Y(0)); ctx.stroke(); }
  if(o.xLabel){ ctx.fillStyle = dim; ctx.textAlign = 'right'; ctx.fillText(o.xLabel, L + pw, T + ph + 5 + 0); }
  vis.forEach(s => {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    s.pts.forEach((p, i) => {
      const x = X(p[0]), y = Y(p[1]);
      if(i === 0) ctx.moveTo(x, y);
      else if(o.stepped){ ctx.lineTo(x, Y(s.pts[i - 1][1])); ctx.lineTo(x, y); }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if(s.pts.length <= 60) s.pts.forEach(p => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 2.6, 0, Math.PI * 2); ctx.fill(); });
    const last = s.pts[s.pts.length - 1];
    ctx.beginPath(); ctx.arc(X(last[0]), Y(last[1]), 3.5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = fg;
}

/* ---------- Barre ---------- */
function drawBars(cv, values, o){
  o = o || {};
  const { ctx, w, h } = fitCanvas(cv);
  const dim = css('--text-faint', '#94a3b8'), grid = css('--grid', '#e5e7eb'), fg = css('--text', '#1f2937');
  ctx.clearRect(0, 0, w, h);
  const n = values.length;
  if(!n){ ctx.fillStyle = dim; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(o.empty || 'Nessun dato', w / 2, h / 2); return; }
  const nums = values.map(v => typeof v.value === 'number' ? v.value : 0);
  let mn = Math.min(0, ...nums), mx = Math.max(0, ...nums);
  if(mn === mx) mx = mn + 1;
  const L = 8, R = 8, T = 14, Bm = o.labels ? 30 : 16;
  const pw = w - L - R, ph = h - T - Bm;
  const Y = v => T + ph - (v - mn) / (mx - mn) * ph;
  const bw = pw / n, gap = Math.min(4, bw * 0.18);
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + pw, Y(0)); ctx.stroke();
  ctx.font = (bw < 16 ? 8 : 10) + 'px ui-monospace, monospace'; ctx.textAlign = 'center';
  values.forEach((v, i) => {
    const x = L + i * bw + gap / 2, ww = Math.max(1, bw - gap);
    const val = nums[i];
    const y = Y(Math.max(0, val)), yb = Y(Math.min(0, val));
    const col = v.unset ? grid : (v.hot ? '#f59e0b' : (v.color || PALETTE[0]));
    ctx.fillStyle = col;
    ctx.fillRect(x, y, ww, Math.max(1, yb - y));
    if(bw >= 14 && !v.unset){
      ctx.fillStyle = fg; ctx.textBaseline = 'bottom';
      ctx.fillText(FL.formatValue(val), x + ww / 2, y - 1);
    }
    ctx.fillStyle = dim; ctx.textBaseline = 'top';
    if(o.labels) ctx.fillText(String(v.label).slice(0, Math.max(2, Math.floor(bw / 6))), x + ww / 2, T + ph + 4);
    else if(bw >= 12 || i % Math.ceil(12 / bw) === 0) ctx.fillText(String(i), x + ww / 2, T + ph + 3);
  });
}

/* ---------- Stato grafici ---------- */
const S = {
  els:null, series:new Map(), arrays:[], hot:{}, plotPts:[], plotBars:[], dirty:false, raf:0, visible:false,
  hidden:new Set(),
};

function init(els){
  S.els = els;
  initCanvas();
  window.addEventListener('resize', () => { scheduleRedraw(); redrawCanvasScale(); });
}
function reset(){
  S.series.clear(); S.arrays = []; S.hot = {}; S.plotPts = []; S.plotBars = [];
  scheduleRedraw();
}
function trackAssign(frameName, depth, name, value, idx, step){
  if(idx !== null && idx !== undefined){ S.hot[frameName + '|' + name] = idx; scheduleRedraw(); return; }
  if(typeof value !== 'number' || !isFinite(value)) return;
  const key = (depth > 0 ? frameName + '.' : '') + name;
  let s = S.series.get(key);
  if(!s){
    if(S.series.size >= 10) return;
    s = { name:key, color:PALETTE[S.series.size % PALETTE.length], pts:[] };
    S.series.set(key, s);
  }
  s.pts.push([step, value]);
  if(s.pts.length > MAX_POINTS) s.pts.splice(0, s.pts.length - MAX_POINTS);
  scheduleRedraw();
}
function setFrame(frame){
  S.arrays = [];
  if(!frame) return scheduleRedraw();
  for(const k in frame.vars){
    const v = frame.vars[k];
    if(v.arr && (v.type === 'Integer' || v.type === 'Real')) S.arrays.push({ name:k, frame:frame.name, v });
  }
  scheduleRedraw();
}
function plot(x, y){
  if(typeof x !== 'number' || typeof y !== 'number') throw new FL.FLError('Plot(x, y) richiede due numeri');
  S.plotPts.push([x, y]);
  if(S.plotPts.length > 20000) S.plotPts.shift();
  scheduleRedraw();
}
function plotBar(label, v){
  if(typeof v !== 'number') throw new FL.FLError('PlotBar(etichetta, valore) richiede un valore numerico');
  const l = FL.formatValue(label);
  const ex = S.plotBars.find(b => b.label === l);
  if(ex) ex.value = v; else S.plotBars.push({ label:l, value:v });
  scheduleRedraw();
}
function clearPlot(){ S.plotPts = []; S.plotBars = []; scheduleRedraw(); }

function scheduleRedraw(){
  if(S.raf) return;
  S.raf = requestAnimationFrame(() => { S.raf = 0; redraw(); });
}
function redraw(){
  if(!S.els || !S.visible) return;
  const E = S.els;
  /* variabili */
  const series = Array.from(S.series.values()).map(s => Object.assign({}, s, { hidden:S.hidden.has(s.name) }));
  E.varCard.hidden = false;
  drawLines(E.varCanvas, series, { empty:'Esegui un programma: qui vedrai l\'andamento delle variabili numeriche', stepped:true });
  E.varLegend.innerHTML = series.map(s => '<button class="lg-item' + (s.hidden ? ' off' : '') + '" data-k="' + escapeHtml(s.name) + '"><i style="background:' + s.color + '"></i>' + escapeHtml(s.name) + '</button>').join('');
  /* array */
  if(S.arrays.length){
    E.arrCard.hidden = false;
    let html = '';
    S.arrays.forEach((a, i) => { html += '<div class="arr-block"><div class="arr-title">' + escapeHtml(a.name) + ' <span>[' + a.v.value.length + ']</span></div><canvas class="chart-canvas arr-canvas" data-i="' + i + '"></canvas></div>'; });
    if(E.arrWrap.dataset.sig !== S.arrays.map(a => a.name + a.v.value.length).join(',')){
      E.arrWrap.innerHTML = html;
      E.arrWrap.dataset.sig = S.arrays.map(a => a.name + a.v.value.length).join(',');
    }
    E.arrWrap.querySelectorAll('canvas').forEach(cv => {
      const a = S.arrays[+cv.dataset.i]; if(!a) return;
      const hot = S.hot[a.frame + '|' + a.name];
      drawBars(cv, a.v.value.map((x, k) => ({ value:x, unset:x === undefined, hot:k === hot, color:PALETTE[0] })));
    });
  } else { E.arrCard.hidden = true; E.arrWrap.dataset.sig = ''; }
  /* plot */
  if(S.plotPts.length || S.plotBars.length){
    E.plotCard.hidden = false;
    if(S.plotBars.length && !S.plotPts.length){
      drawBars(E.plotCanvas, S.plotBars.map((b, i) => ({ value:b.value, label:b.label, color:PALETTE[i % PALETTE.length] })), { labels:true });
    } else {
      drawLines(E.plotCanvas, [{ name:'Plot', color:PALETTE[1], pts:S.plotPts }], {});
    }
  } else E.plotCard.hidden = true;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function toggleSeries(k){ if(S.hidden.has(k)) S.hidden.delete(k); else S.hidden.add(k); scheduleRedraw(); }
function setVisible(v){ S.visible = v; if(v) scheduleRedraw(); }

/* ---------- Disegno (canvas 400×400 + tartaruga) ---------- */
const G = { size:400, color:'#111827', fill:'#111827', lw:2, tx:200, ty:200, th:-90, pen:true, cmds:0, ctx:null, cv:null, tcv:null };
function initCanvas(){
  G.cv = S.els.gfxCanvas; G.tcv = S.els.gfxTurtle;
  redrawCanvasScale();
  gfxReset();
}
function redrawCanvasScale(){
  if(!G.cv) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const px = G.size * dpr;
  if(G.cv.width !== px){
    const old = G.cv.width ? (() => { const c = document.createElement('canvas'); c.width = G.cv.width; c.height = G.cv.height; c.getContext('2d').drawImage(G.cv, 0, 0); return c; })() : null;
    G.cv.width = G.cv.height = px; G.tcv.width = G.tcv.height = px;
    G.ctx = G.cv.getContext('2d');
    G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if(old){ G.ctx.save(); G.ctx.setTransform(1, 0, 0, 1, 0, 0); G.ctx.drawImage(old, 0, 0, px, px); G.ctx.restore(); }
    else clearBg();
  }
  G.ctx = G.cv.getContext('2d'); G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  G.tctx = G.tcv.getContext('2d'); G.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTurtle();
}
function clearBg(){ G.ctx.save(); G.ctx.fillStyle = '#ffffff'; G.ctx.fillRect(0, 0, G.size, G.size); G.ctx.restore(); }
function gfxReset(){
  G.color = '#111827'; G.fill = '#111827'; G.lw = 2; G.tx = 200; G.ty = 200; G.th = -90; G.pen = true; G.cmds = 0;
  if(G.ctx) clearBg();
  drawTurtle();
}
function drawTurtle(){
  if(!G.tctx) return;
  const c = G.tctx; c.clearRect(0, 0, G.size, G.size);
  if(!G.cmds || !G.turtleUsed) return;
  c.save(); c.translate(G.tx, G.ty); c.rotate(G.th * Math.PI / 180);
  c.fillStyle = 'rgba(22,163,74,.85)'; c.strokeStyle = '#065f46'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(10, 0); c.lineTo(-7, 6); c.lineTo(-4, 0); c.lineTo(-7, -6); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
function num(v, name){ if(typeof v !== 'number') throw new FL.FLError(name + ': gli argomenti devono essere numeri'); return v; }
function gfx(name, a){
  const c = G.ctx; if(!c) return;
  G.cmds++;
  c.lineWidth = G.lw; c.strokeStyle = G.color; c.fillStyle = G.fill; c.lineCap = 'round'; c.lineJoin = 'round';
  switch(name){
    case 'clearcanvas': clearBg(); G.tx = 200; G.ty = 200; G.th = -90; G.turtleUsed = false; if(a.length && typeof a[0] === 'string'){ c.fillStyle = a[0]; c.fillRect(0, 0, G.size, G.size); } break;
    case 'setcolor': G.color = String(a[0]); G.fill = String(a[0]); break;
    case 'setfill': G.fill = String(a[0]); break;
    case 'setlinewidth': G.lw = Math.max(0.5, num(a[0], 'SetLineWidth')); break;
    case 'drawline': c.beginPath(); c.moveTo(num(a[0], 'DrawLine'), a[1]); c.lineTo(a[2], a[3]); c.stroke(); break;
    case 'drawrect': c.strokeRect(num(a[0], 'DrawRect'), a[1], a[2], a[3]); break;
    case 'fillrect': c.fillRect(num(a[0], 'FillRect'), a[1], a[2], a[3]); break;
    case 'drawcircle': c.beginPath(); c.arc(num(a[0], 'DrawCircle'), a[1], Math.abs(a[2]), 0, Math.PI * 2); c.stroke(); break;
    case 'fillcircle': c.beginPath(); c.arc(num(a[0], 'FillCircle'), a[1], Math.abs(a[2]), 0, Math.PI * 2); c.fill(); break;
    case 'drawtext': c.font = '600 14px system-ui, sans-serif'; c.textBaseline = 'top'; c.fillText(FL.formatValue(a[2]), num(a[0], 'DrawText'), a[1]); break;
    case 'drawpoint': c.fillRect(num(a[0], 'DrawPoint') - G.lw / 2, a[1] - G.lw / 2, G.lw, G.lw); break;
    case 'forward': case 'back': {
      const d = num(a[0], 'Forward') * (name === 'back' ? -1 : 1);
      const nx = G.tx + Math.cos(G.th * Math.PI / 180) * d, ny = G.ty + Math.sin(G.th * Math.PI / 180) * d;
      if(G.pen){ c.beginPath(); c.moveTo(G.tx, G.ty); c.lineTo(nx, ny); c.stroke(); }
      G.tx = nx; G.ty = ny; G.turtleUsed = true; break;
    }
    case 'turnright': case 'turn': G.th += num(a[0], 'Turn'); G.turtleUsed = true; break;
    case 'turnleft': G.th -= num(a[0], 'TurnLeft'); G.turtleUsed = true; break;
    case 'penup': G.pen = false; break;
    case 'pendown': G.pen = true; break;
    case 'home': G.tx = 200; G.ty = 200; G.th = -90; G.turtleUsed = true; break;
    case 'setposition': G.tx = num(a[0], 'SetPosition'); G.ty = num(a[1], 'SetPosition'); G.turtleUsed = true; break;
    case 'setheading': G.th = num(a[0], 'SetHeading') - 90; G.turtleUsed = true; break;
    case 'plot': case 'plotpoint': plot(a[0], a[1]); G.cmds--; return 'plot';
    case 'plotbar': plotBar(a[0], a[1]); G.cmds--; return 'plot';
    case 'clearplot': clearPlot(); G.cmds--; return 'plot';
  }
  drawTurtle();
  return 'draw';
}
function gfxPNG(){ return G.cv.toDataURL('image/png'); }

FL.Charts = { init, reset, trackAssign, setFrame, plot, plotBar, clearPlot, redraw, scheduleRedraw, toggleSeries, setVisible, gfx, gfxReset, gfxPNG };
})();
