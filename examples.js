/* ============================================================
   FlowLab — Libreria di esempi
   ============================================================ */
'use strict';

(function(){
const FL = window.FL;

/* Mini-DSL per costruire i diagrammi */
const B = {
  decl:(type, text) => [{ type:'declare', declareType:type, text }],
  set:text => [{ type:'assign', text }],
  inp:text => [{ type:'input', text }],
  out:(text, newline) => [{ type:'output', text, newline:newline !== false }],
  call:text => [{ type:'call', text }],
  note:text => [{ type:'comment', text }],
  if:(cond, th, el) => [{ type:'if', text:cond }].concat(...(th || []), el && el.length ? [{ type:'else', text:'' }].concat(...el) : [], [{ type:'endif', text:'' }]),
  while:(cond, body) => [{ type:'while', text:cond }].concat(...body, [{ type:'endloop', text:'' }]),
  do:(cond, body) => [{ type:'dowhile', text:cond }].concat(...body, [{ type:'endloop', text:'' }]),
  for:(v, s, e, body, opt) => [{ type:'for', text:'', forData:Object.assign({ variable:v, start:s, end:e, direction:'inc', step:'1' }, opt || {}) }].concat(...body, [{ type:'endloop', text:'' }]),
};
function fn(name, body, o){
  o = o || {};
  return {
    name, params:o.params || [], returnType:o.returnType || 'None', returnVar:o.returnVar || '',
    nodes:[{ type:'start', text:'' }].concat(...body, [{ type:'end', text:'' }])
  };
}

const EXAMPLES = [
  {
    id:'ciao', title:'Ciao, mondo', level:'Base', tags:['Input', 'Output'],
    desc:'Chiede il nome all\'utente e lo saluta concatenando stringhe con &.',
    funcs:[fn('Main', [
      B.decl('String', 'nome'),
      B.out('"Come ti chiami?"'),
      B.inp('nome'),
      B.out('"Ciao, " & nome & "! Benvenuto in FlowLab."')
    ])]
  },
  {
    id:'parita', title:'Pari o dispari', level:'Base', tags:['If', 'mod'],
    desc:'Usa l\'operatore mod per stabilire se un numero è pari.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n'),
      B.out('"Inserisci un numero intero"'),
      B.inp('n'),
      B.if('n mod 2 = 0', [B.out('n & " è pari"')], [B.out('n & " è dispari"')])
    ])]
  },
  {
    id:'media', title:'Somma e media', level:'Base', tags:['For', 'Real'],
    desc:'Legge N voti e calcola somma e media con un ciclo For.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n, i'),
      B.decl('Real', 'voto, somma, media'),
      B.out('"Quanti voti vuoi inserire?"'),
      B.inp('n'),
      B.set('somma = 0'),
      B.for('i', '1', 'n', [
        B.out('"Voto " & i & ":"'),
        B.inp('voto'),
        B.set('somma = somma + voto')
      ]),
      B.if('n > 0', [B.set('media = somma / n'), B.out('"Media: " & ToFixed(media, 2)')], [B.out('"Nessun voto inserito"')])
    ])]
  },
  {
    id:'tabellina', title:'Tabellina', level:'Base', tags:['For', 'Output'],
    desc:'Stampa la tabellina di un numero da 1 a 10.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n, i'),
      B.out('"Tabellina del numero:"'),
      B.inp('n'),
      B.for('i', '1', '10', [B.out('n & " x " & i & " = " & n * i')])
    ])]
  },
  {
    id:'indovina', title:'Indovina il numero', level:'Intermedio', tags:['Do', 'Random'],
    desc:'Il computer pensa un numero da 1 a 100: indovinalo con i suggerimenti.',
    funcs:[fn('Main', [
      B.decl('Integer', 'segreto, tentativo, tentativi'),
      B.set('segreto = Random(100) + 1'),
      B.set('tentativi = 0'),
      B.out('"Ho pensato un numero da 1 a 100..."'),
      B.do('tentativo <> segreto', [
        B.out('"Il tuo tentativo:"'),
        B.inp('tentativo'),
        B.set('tentativi = tentativi + 1'),
        B.if('tentativo < segreto', [B.out('"Troppo basso!"')], [B.if('tentativo > segreto', [B.out('"Troppo alto!"')])])
      ]),
      B.out('"Indovinato in " & tentativi & " tentativi!"')
    ])]
  },
  {
    id:'fibonacci', title:'Successione di Fibonacci', level:'Intermedio', tags:['While', 'Grafici'],
    desc:'Calcola i primi N termini con un ciclo While. Apri la scheda Grafici per vederne la crescita.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n, a, b, temp, k'),
      B.out('"Quanti termini?"'),
      B.inp('n'),
      B.set('a = 0'), B.set('b = 1'), B.set('k = 0'),
      B.while('k < n', [
        B.out('a & " "', false),
        B.call('Plot(k, a)'),
        B.set('temp = a + b'),
        B.set('a = b'),
        B.set('b = temp'),
        B.set('k = k + 1')
      ]),
      B.out('""')
    ])]
  },
  {
    id:'primi', title:'Numeri primi', level:'Intermedio', tags:['Cicli annidati', 'Boolean'],
    desc:'Trova tutti i numeri primi fino a N con due cicli annidati.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n, i, d'),
      B.decl('Boolean', 'primo'),
      B.out('"Numeri primi fino a:"'),
      B.inp('n'),
      B.for('i', '2', 'n', [
        B.set('primo = true'),
        B.set('d = 2'),
        B.while('d * d <= i and primo', [
          B.if('i mod d = 0', [B.set('primo = false')]),
          B.set('d = d + 1')
        ]),
        B.if('primo', [B.out('i & " "', false)])
      ]),
      B.out('""')
    ])]
  },
  {
    id:'fattoriale', title:'Fattoriale ricorsivo', level:'Avanzato', tags:['Funzioni', 'Ricorsione'],
    desc:'Una funzione che richiama se stessa: osserva lo stack delle chiamate nel pannello Variabili.',
    funcs:[
      fn('Main', [
        B.decl('Integer', 'n'),
        B.out('"Calcolo del fattoriale di:"'),
        B.inp('n'),
        B.out('n & "! = " & Fattoriale(n)')
      ]),
      fn('Fattoriale', [
        B.decl('Integer', 'risultato'),
        B.if('n <= 1', [B.set('risultato = 1')], [B.set('risultato = n * Fattoriale(n - 1)')])
      ], { params:[{ name:'n', type:'Integer', array:false }], returnType:'Integer', returnVar:'risultato' })
    ]
  },
  {
    id:'mcd', title:'MCD di Euclide', level:'Intermedio', tags:['Funzioni', 'While'],
    desc:'Calcola il Massimo Comun Divisore e il minimo comune multiplo con una funzione.',
    funcs:[
      fn('Main', [
        B.decl('Integer', 'x, y, m'),
        B.out('"Primo numero:"'), B.inp('x'),
        B.out('"Secondo numero:"'), B.inp('y'),
        B.set('m = MCD(x, y)'),
        B.out('"MCD = " & m'),
        B.out('"mcm = " & x * y / m')
      ]),
      fn('MCD', [
        B.decl('Integer', 'r'),
        B.while('b <> 0', [B.set('r = a mod b'), B.set('a = b'), B.set('b = r')])
      ], { params:[{ name:'a', type:'Integer', array:false }, { name:'b', type:'Integer', array:false }], returnType:'Integer', returnVar:'a' })
    ]
  },
  {
    id:'bubble', title:'Bubble Sort animato', level:'Avanzato', tags:['Array', 'Funzioni', 'Grafici'],
    desc:'Ordina un array casuale. Apri la scheda Grafici: le barre si muovono ad ogni scambio!',
    funcs:[
      fn('Main', [
        B.decl('Integer', 'v[12]'),
        B.decl('Integer', 'i'),
        B.for('i', '0', 'Size(v) - 1', [B.set('v[i] = Random(90) + 10')]),
        B.call('Stampa(v)'),
        B.call('Ordina(v)'),
        B.call('Stampa(v)')
      ]),
      fn('Ordina', [
        B.decl('Integer', 'i, j, temp'),
        B.for('i', '0', 'Size(a) - 2', [
          B.for('j', '0', 'Size(a) - 2 - i', [
            B.if('a[j] > a[j + 1]', [B.set('temp = a[j]'), B.set('a[j] = a[j + 1]'), B.set('a[j + 1] = temp')])
          ])
        ])
      ], { params:[{ name:'a', type:'Integer', array:true }] }),
      fn('Stampa', [
        B.decl('Integer', 'k'),
        B.for('k', '0', 'Size(a) - 1', [B.out('a[k] & " "', false)]),
        B.out('""')
      ], { params:[{ name:'a', type:'Integer', array:true }] })
    ]
  },
  {
    id:'maxmin', title:'Massimo e minimo', level:'Intermedio', tags:['Array'],
    desc:'Riempie un array con numeri casuali e trova massimo, minimo e media.',
    funcs:[fn('Main', [
      B.decl('Integer', 'dati[10]'),
      B.decl('Integer', 'i, mx, mn, somma'),
      B.for('i', '0', '9', [B.set('dati[i] = Random(100)'), B.out('dati[i] & " "', false)]),
      B.out('""'),
      B.set('mx = dati[0]'), B.set('mn = dati[0]'), B.set('somma = 0'),
      B.for('i', '0', '9', [
        B.if('dati[i] > mx', [B.set('mx = dati[i]')]),
        B.if('dati[i] < mn', [B.set('mn = dati[i]')]),
        B.set('somma = somma + dati[i]')
      ]),
      B.out('"Massimo: " & mx'),
      B.out('"Minimo: " & mn'),
      B.out('"Media: " & somma / 10')
    ])]
  },
  {
    id:'palindromo', title:'Parola palindroma', level:'Intermedio', tags:['String', 'Len', 'Char'],
    desc:'Inverte una stringa carattere per carattere e verifica se è palindroma.',
    funcs:[fn('Main', [
      B.decl('String', 'parola, inversa'),
      B.decl('Integer', 'i'),
      B.out('"Scrivi una parola:"'),
      B.inp('parola'),
      B.set('inversa = ""'),
      B.for('i', 'Len(parola) - 1', '0', [B.set('inversa = inversa & Char(parola, i)')], { direction:'dec' }),
      B.out('"Al contrario: " & inversa'),
      B.if('ToLower(parola) = ToLower(inversa)', [B.out('"È palindroma!"')], [B.out('"Non è palindroma."')])
    ])]
  },
  {
    id:'binario', title:'Conversione in binario', level:'Intermedio', tags:['While', 'mod', 'String'],
    desc:'Converte un intero in base 2 con divisioni successive.',
    funcs:[fn('Main', [
      B.decl('Integer', 'n, x'),
      B.decl('String', 'bin'),
      B.out('"Numero decimale:"'),
      B.inp('n'),
      B.set('x = n'), B.set('bin = ""'),
      B.if('x = 0', [B.set('bin = "0"')]),
      B.while('x > 0', [B.set('bin = ToString(x mod 2) & bin'), B.set('x = Int(x / 2)')]),
      B.out('n & " in binario = " & bin')
    ])]
  },
  {
    id:'grafico', title:'Grafico di funzioni', level:'Grafica', tags:['Plot', 'Real'],
    desc:'Disegna sin(x) e una parabola nella scheda Grafici con Plot(x, y).',
    funcs:[fn('Main', [
      B.decl('Real', 'x'),
      B.note('Plot(x, y) aggiunge un punto al grafico'),
      B.call('ClearPlot()'),
      B.set('x = -6.3'),
      B.while('x <= 6.3', [B.call('Plot(x, Sin(x) * 3)'), B.set('x = x + 0.15')]),
      B.out('"Grafico completato: apri la scheda Grafici"')
    ])]
  },
  {
    id:'stella', title:'Disegno con la tartaruga', level:'Grafica', tags:['Disegno', 'Forward', 'Turn'],
    desc:'Grafica a tartaruga: disegna una rosa di poligoni colorati nella scheda Disegno.',
    funcs:[fn('Main', [
      B.decl('Integer', 'i, j'),
      B.decl('String', 'colori[6]'),
      B.set('colori[0] = "#e11d48"'), B.set('colori[1] = "#f59e0b"'), B.set('colori[2] = "#16a34a"'),
      B.set('colori[3] = "#0ea5e9"'), B.set('colori[4] = "#7c3aed"'), B.set('colori[5] = "#db2777"'),
      B.call('ClearCanvas()'),
      B.call('SetLineWidth(2)'),
      B.for('i', '0', '11', [
        B.call('SetColor(colori[i mod 6])'),
        B.for('j', '1', '6', [B.call('Forward(80)'), B.call('TurnRight(60)')]),
        B.call('TurnRight(30)')
      ])
    ])]
  },
  {
    id:'cerchi', title:'Forme e colori', level:'Grafica', tags:['Disegno', 'DrawCircle'],
    desc:'Disegna cerchi concentrici e rettangoli con coordinate (canvas 400×400).',
    funcs:[fn('Main', [
      B.decl('Integer', 'r, k'),
      B.call('ClearCanvas()'),
      B.for('k', '0', '9', [
        B.call('SetColor("hsl(" & k * 36 & ", 80%, 55%)")'),
        B.call('FillRect(k * 40, 360, 36, 36)')
      ]),
      B.call('SetLineWidth(3)'),
      B.for('r', '150', '10', [
        B.call('SetColor("hsl(" & r * 2 & ", 70%, 50%)")'),
        B.call('DrawCircle(200, 180, r)')
      ], { direction:'dec', step:'20' }),
      B.call('SetColor("#111827")'),
      B.call('DrawText(140, 20, "FlowLab Grafica")')
    ])]
  }
];

FL.examples = { list:EXAMPLES, B, fn };
})();
