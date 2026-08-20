/* =========================================================
   TAB_DECOR — декор вкладок: у каждого раздела свой набор
   деталей в полях страницы. Шестерёнки и вентили крутятся,
   трубы ржавые и грязные. Скетч-стиль: чернильный контур,
   тонкие линии, грязь — редким стипплингом.

   Слой ПРИКЛЕЕН К СТРАНИЦЕ (position:absolute, как .side-gear),
   поэтому при скролле детали уезжают вместе с контентом, а не
   висят перед камерой. Кластеры разбросаны по высоте: у каждой
   вкладки свои места. Смена вкладки — плавный fade in/out.

   pointer-events:none, вращение — CSS-анимации (GPU, главный
   поток свободен).
   ========================================================= */
window.TAB_DECOR = (function(){
  "use strict";

  const INK = '#161413';
  let root = null;
  let panes = {};        // id вкладки -> кластеры в полях (широкие экраны)
  let stripPanes = {};   // id вкладки -> полоса под механизмом (узкие)
  let built = false;

  /* детерминированный шум: одинаковая грязь при каждой загрузке */
  function rng(seed){
    let s = seed>>>0;
    return ()=>{ s = (s*1664525+1013904223)>>>0; return s/4294967296; };
  }

  /* ---------- ржавчина и грязь: редкие точки + короткие потёки ---------- */
  function grime(seed, x, y, w, h, density){
    const r = rng(seed);
    let s = '';
    const dots = density || 26;
    for(let i=0;i<dots;i++){
      const px = x + r()*w, py = y + r()*h;
      const rad = (0.5 + r()*1.7).toFixed(2);
      const op  = (0.18 + r()*0.34).toFixed(2);
      s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${rad}" fill="${INK}" opacity="${op}"/>`;
    }
    for(let i=0;i<Math.max(2, dots/8|0);i++){    // потёки вниз
      const px = x + r()*w, py = y + r()*h*0.6, len = 5 + r()*14;
      s += `<path d="M${px.toFixed(1)} ${py.toFixed(1)} q${(r()-0.5).toFixed(1)} ${(len*0.6).toFixed(1)} ${(r()-0.5).toFixed(1)} ${len.toFixed(1)}"
              fill="none" stroke="${INK}" stroke-width="1.1" opacity="0.26" stroke-linecap="round"/>`;
    }
    return s;
  }

  /* ---------- шестерёнка: трапециевидные зубья, как в механизме ---------- */
  function cog(o){
    const teeth = o.teeth || 12, Rr = o.r, Rt = Rr + (o.tooth || 9);
    const hub = o.hub || Math.max(5, Rr*0.26);
    const step = 360/teeth, half = step*0.5;
    let d = '';
    for(let i=0;i<teeth;i++){
      const a0 = i*step, a1 = a0 + half*0.34, a2 = a0 + half*0.66, a3 = a0 + half;
      const P = (r,a)=>{ const t=a*Math.PI/180; return [(r*Math.cos(t)).toFixed(2), (r*Math.sin(t)).toFixed(2)]; };
      const p0 = P(Rr,a0), p1 = P(Rt,a1), p2 = P(Rt,a2), p3 = P(Rr,a3);
      const p4 = P(Rr, a3 + half*0.5);
      d += (i===0 ? `M${p0[0]} ${p0[1]}` : `L${p0[0]} ${p0[1]}`);
      d += `L${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}L${p3[0]} ${p3[1]}L${p4[0]} ${p4[1]}`;
    }
    d += 'Z';
    let s = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${o.sw||2.2}" stroke-linejoin="round"/>`;
    s += `<circle cx="0" cy="0" r="${(Rr*0.82).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".7"/>`;
    s += `<circle cx="0" cy="0" r="${hub.toFixed(1)}" fill="none" stroke="${INK}" stroke-width="${o.sw||2.2}"/>`;
    const spokes = o.spokes || 5;
    for(let i=0;i<spokes;i++){
      const a = (i/spokes)*Math.PI*2, c = Math.cos(a), sn = Math.sin(a);
      s += `<line x1="${(hub*1.1*c).toFixed(1)}" y1="${(hub*1.1*sn).toFixed(1)}"
             x2="${(Rr*0.74*c).toFixed(1)}" y2="${(Rr*0.74*sn).toFixed(1)}"
             stroke="${INK}" stroke-width="1.6" opacity=".8"/>`;
    }
    if(o.grime) s += grime(o.seed||11, -Rr, -Rr, Rr*2, Rr*2, 14);
    const dur = (o.dur || 26) + 's';
    const dir = o.ccw ? 'reverse' : 'normal';
    return `<g transform="translate(${o.x},${o.y})">
      <g class="dc-spin" style="animation-duration:${dur};animation-direction:${dir}">${s}</g></g>`;
  }

  /* ---------- ржавая труба с фланцами ---------- */
  function pipe(o){
    const x = o.x, y = o.y, w = o.w, h = o.h || 22;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"
               fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    /* фланцы по концам и в середине */
    const fl = (fx)=> `<rect x="${fx-3}" y="${y-4}" width="6" height="${h+8}" rx="1.5"
                         fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    s += fl(x+5) + fl(x+w-5);
    if(w > 120) s += fl(x + w/2);
    /* продольный блик — одна тонкая линия, без штриховки */
    s += `<line x1="${x+10}" y1="${y+h*0.3}" x2="${x+w-10}" y2="${y+h*0.3}"
            stroke="${INK}" stroke-width="1" opacity=".38"/>`;
    s += grime(o.seed||23, x, y, w, h, o.dirt || 30);
    return s;
  }

  /* ---------- вентиль на трубе ---------- */
  function valve(o){
    const R = o.r || 15;
    let s = `<circle cx="0" cy="0" r="${R}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    s += `<circle cx="0" cy="0" r="${(R*0.3).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
    for(let i=0;i<4;i++){
      const a = i*Math.PI/4;
      s += `<line x1="${(-R*Math.cos(a)).toFixed(1)}" y1="${(-R*Math.sin(a)).toFixed(1)}"
             x2="${(R*Math.cos(a)).toFixed(1)}" y2="${(R*Math.sin(a)).toFixed(1)}"
             stroke="${INK}" stroke-width="1.7"/>`;
    }
    const dur = (o.dur || 14) + 's';
    return `<g transform="translate(${o.x},${o.y})">
      <g class="dc-spin" style="animation-duration:${dur};animation-direction:${o.ccw?'reverse':'normal'}">${s}</g>
      <line x1="0" y1="${R}" x2="0" y2="${R+9}" stroke="${INK}" stroke-width="2"/></g>`;
  }

  /* ---------- поршень: шток ходит в гильзе ---------- */
  function piston(o){
    const x = o.x, y = o.y;
    let s = `<rect x="${x}" y="${y}" width="34" height="46" rx="4"
               fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    s += grime(o.seed||71, x, y, 34, 46, 16);
    s += `<g class="dc-piston" style="animation-duration:${(o.dur||3.6)}s">
            <line x1="${x+17}" y1="${y+6}" x2="${x+17}" y2="${y-26}"
              stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
            <rect x="${x+8}" y="${y-34}" width="18" height="9" rx="2"
              fill="none" stroke="${INK}" stroke-width="2"/>
          </g>`;
    return s;
  }

  /* ---------- манометр со дрожащей стрелкой ---------- */
  function gauge(o){
    const R = o.r || 20;
    let s = `<circle cx="0" cy="0" r="${R}" fill="none" stroke="${INK}" stroke-width="2.2"/>`;
    s += `<circle cx="0" cy="0" r="${(R*0.8).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="1" opacity=".6"/>`;
    for(let i=0;i<9;i++){
      const a = Math.PI*1.25 - i*(Math.PI*1.5/8);
      s += `<line x1="${(R*0.62*Math.cos(a)).toFixed(1)}" y1="${(-R*0.62*Math.sin(a)).toFixed(1)}"
             x2="${(R*0.76*Math.cos(a)).toFixed(1)}" y2="${(-R*0.76*Math.sin(a)).toFixed(1)}"
             stroke="${INK}" stroke-width="1.3"/>`;
    }
    s += `<g class="dc-needle" style="animation-duration:${(o.dur||5.2)}s">
            <line x1="0" y1="0" x2="0" y2="${-(R*0.66).toFixed(1)}" stroke="${INK}" stroke-width="2"/>
          </g>`;
    s += `<circle cx="0" cy="0" r="2.4" fill="${INK}"/>`;
    return `<g transform="translate(${o.x},${o.y})">${s}</g>`;
  }

  /* ---------- изометрический блок на решётке ----------
     Блок задаётся не пикселями, а КЛЕТКОЙ (i,j,k): i,j — по полу,
     k — вверх. Экранные координаты считает iso(), поэтому соседние
     блоки стыкуются гранями точно, без зазоров и без наползания —
     раньше шаг стопки я брал на глаз, и блоки висели друг над другом
     с щелью.
     Форма: шестиугольник — ромб верха плюс две боковины. Внутри
     заливка гранями разной светлоты («свет сверху») и пиксельная
     крошка. kind: grass / dirt / stone / plank.
     Заливка непрозрачная (цвет бумаги), поэтому дальний блок не
     просвечивает через ближний — порядок рисования = порядок в
     списке, от дальнего к ближнему. ---------- */
  const PAPER = '#f6f2e9';
  /* Настоящая изометрия: смотрим вдоль (1,1,1). Ребро куба длиной a
     даёт полуширину ромба S = a/√2, полувысоту H = a/√6 и
     вертикальную стенку V = a·√(2/3). Отсюда
       H = S/√3 ≈ 0.5774·S,   V = 2S/√3 ≈ 1.1547·S.
     Раньше стояло H=0.5·S и V=0.82·S — стенка выходила на 29%
     короче нужной, и куб читался как приплюснутый параллелепипед.
     Полная высота силуэта = 2H + V = 4S/√3 ≈ 2.31·S при ширине 2S,
     то есть отношение высоты к ширине 1.155 — как у куба в изометрии. */
  const ISO_H = 1/Math.sqrt(3), ISO_V = 2/Math.sqrt(3);
  const ISO = (S)=> ({
    S, H: S*ISO_H, V: S*ISO_V,       // полуширина, полувысота ромба, стенка
    /* центр верхнего ромба клетки (i,j,k) */
    at(i, j, k){ return [ (i - j)*S, (i + j)*this.H - k*this.V ]; }
  });

  function mcBlock(o){
    const S = o.s || 30, k = o.kind || 'grass';
    const H = S*ISO_H, V = S*ISO_V;
    const r = rng(o.seed || 5);
    /* локальные вершины относительно центра верхнего ромба */
    const top   = `0,${-H} ${S},0 0,${H} ${-S},0`;
    const left  = `${-S},0 0,${H} 0,${H+V} ${-S},${V}`;
    const right = `${S},0 0,${H} 0,${H+V} ${S},${V}`;
    const hexa  = `${-S},0 0,${-H} ${S},0 ${S},${V} 0,${H+V} ${-S},${V}`;
    let s = '';
    s += `<polygon points="${hexa}" fill="${PAPER}"/>`;      /* перекрытие */
    s += `<polygon points="${top}"   fill="${INK}" opacity=".05"/>`;
    s += `<polygon points="${left}"  fill="${INK}" opacity=".13"/>`;
    s += `<polygon points="${right}" fill="${INK}" opacity=".08"/>`;
    /* крошка «пикселями» в координатах каждой грани */
    const pix = (n, fn, op)=>{
      let g = '';
      for(let i=0;i<n;i++){
        const [x,y] = fn(r(), r()), w = S*0.13;
        g += `<rect x="${(x-w/2).toFixed(1)}" y="${(y-w*0.31).toFixed(1)}"
               width="${w.toFixed(1)}" height="${(w*0.62).toFixed(1)}"
               fill="${INK}" opacity="${op}"/>`;
      }
      return g;
    };
    /* u,v в [0,1] по рёбрам грани -> точка внутри неё */
    const onTop   = (u,v)=> [ (u-v)*S*0.8, (u+v-1)*H*0.8 ];
    const onLeft  = (u,v)=> [ -S + u*S*0.88, u*H*0.88 + V*(0.12 + v*0.76) ];
    const onRight = (u,v)=> [  S - u*S*0.88, u*H*0.88 + V*(0.12 + v*0.76) ];
    if(k === 'grass'){
      s += pix(9, onTop, '.30');
      /* травинки свисают через оба верхних ребра на боковины */
      for(let i=0;i<8;i++){
        const t = (i%4 + 0.5)/4, sg = i < 4 ? -1 : 1;
        const x = sg*(1-t)*S, y = t*H;
        s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l0 ${(V*0.20 + r()*V*0.18).toFixed(1)}"
                stroke="${INK}" stroke-width="1.5" opacity=".44" stroke-linecap="round"/>`;
      }
      s += pix(5, onLeft, '.20') + pix(4, onRight, '.16');
    } else if(k === 'stone'){
      s += pix(6, onTop, '.18') + pix(7, onLeft, '.24') + pix(6, onRight, '.18');
      s += `<path d="M${(-S*0.55).toFixed(1)} ${(V*0.62).toFixed(1)} l${(S*0.3).toFixed(1)} ${(V*0.26).toFixed(1)}"
              stroke="${INK}" stroke-width="1.3" opacity=".34"/>`;
    } else if(k === 'plank'){
      for(let i=1;i<4;i++){                     // доски полосами по боковинам
        const y = V*i/4;
        s += `<path d="M${-S} ${y.toFixed(1)} L0 ${(H+y).toFixed(1)} L${S} ${y.toFixed(1)}"
                fill="none" stroke="${INK}" stroke-width="1.2" opacity=".34"/>`;
      }
      s += pix(4, onTop, '.16');
    } else {
      s += pix(8, onTop, '.24') + pix(7, onLeft, '.22') + pix(6, onRight, '.18');
    }
    /* контур: силуэт + три ребра, сходящиеся в переднем углу */
    s += `<polygon points="${hexa}" fill="none" stroke="${INK}"
            stroke-width="${o.sw||2.2}" stroke-linejoin="round"/>`;
    s += `<path d="M${-S} 0 L0 ${H} L${S} 0 M0 ${H} L0 ${(H+V).toFixed(1)}"
            fill="none" stroke="${INK}" stroke-width="${((o.sw||2.2)*0.8).toFixed(1)}"
            stroke-linejoin="round"/>`;
    const inner = o.bob
      ? `<g class="dc-bob" style="animation-duration:${o.dur||4.2}s">${s}</g>` : s;
    return `<g transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)})">${inner}</g>`;
  }

  /* ---------- Стив: та же семибоксовая фигура плоским контуром.
     Пропорции игровые, в единицах u = s/32 (полная высота 32u):
       голова 8×8 — y 0..8, тело 8×12 — y 8..20, руки и ноги 4×12.
     Голова стоит ВПЛОТНУЮ на теле: раньше она была на y −4..4, а
     тело начиналось с 8, и между ними висел зазор 4u.
     Рука качается (dc-swing), ось — в плече; в руке ничего нет. ---------- */
  function mcSteve(o){
    const u = (o.s || 42)/32;
    const B = (x,y,w,h,op)=>
      `<rect x="${(x*u).toFixed(1)}" y="${(y*u).toFixed(1)}"
             width="${(w*u).toFixed(1)}" height="${(h*u).toFixed(1)}"
             fill="${INK}" fill-opacity="${op||0.07}"
             stroke="${INK}" stroke-width="${(o.sw||2)}" stroke-linejoin="round"/>`;
    const px = (x,y,w,h,op)=>
      `<rect x="${(x*u).toFixed(1)}" y="${(y*u).toFixed(1)}"
             width="${(w*u).toFixed(1)}" height="${(h*u).toFixed(1)}"
             fill="${INK}" opacity="${op}"/>`;
    let s = '';
    s += B(-4, 20, 4, 12, .12);              // дальняя нога
    s += B( 0, 20, 4, 12, .07);              // ближняя нога
    s += B(-6,  8, 2.6, 11, .13);            // дальняя рука
    s += B(-4,  8, 8, 12, .09);              // тело
    s += B(-4,  0, 8, 8,  .05);              // голова: низ ровно на теле
    /* лицо пиксельными квадратиками */
    s += px(-2.6, 3.4, 1.5, 1.5, '.62') + px(1.1, 3.4, 1.5, 1.5, '.62');
    s += px(-1.4, 6.2, 2.8, 0.9, '.42');
    s += `<path d="M${(-4*u).toFixed(1)} ${(2.2*u).toFixed(1)} h${(8*u).toFixed(1)}"
            stroke="${INK}" stroke-width="1.3" opacity=".5"/>`;   // кромка волос
    /* ближняя рука: качается вокруг плеча, пустая */
    const arm = B(0, 0, 2.6, 11, .07);
    s += `<g transform="translate(${(3.4*u).toFixed(1)},${(8.6*u).toFixed(1)})">
            <g class="dc-swing" style="animation-duration:${(o.dur||2.4)}s">${arm}</g></g>`;
    return `<g transform="translate(${o.x.toFixed(1)},${o.y.toFixed(1)})">${s}</g>`;
  }

  /* =========================================================
     Кластеры. Каждый — маленькая SVG в поле страницы:
       side — у какого поля стоит (left / right),
       top  — где по высоте СТРАНИЦЫ (проценты: слой тянется
              на всю высоту body, поэтому детали разбросаны по
              всему документу, а не только на первом экране),
       w/h  — габарит, vb — своя система координат.
     У каждой вкладки места разные — набор не повторяется.
     ========================================================= */
  const C = (side, top, w, h, vb, inner) => ({ side, top, w, h, vb, inner });

  /* WEB: пара сцепленных шестерён, магистраль с вентилем, поршень */
  function setWeb(){
    return [
      C('left', '17%', 210, 190, '0 0 210 190',
        cog({ x:118, y:62, r:44, teeth:15, tooth:12, dur:30, seed:12, grime:true, spokes:6 }) +
        cog({ x:52, y:126, r:28, teeth:11, tooth:9, dur:19, ccw:true, seed:31, grime:true })),
      C('right', '39%', 200, 150, '0 0 200 150',
        pipe({ x:6, y:52, w:150, h:20, seed:101, dirt:34 }) +
        piston({ x:150, y:88, seed:71, dur:3.4 }) +
        valve({ x:44, y:104, r:16, dur:12 })),
      C('left', '63%', 165, 165, '0 0 165 165',
        cog({ x:96, y:74, r:34, teeth:12, tooth:10, dur:24, ccw:true, seed:52, grime:true }) +
        pipe({ x:10, y:126, w:120, h:18, seed:77, dirt:26 })),
    ];
  }

  /* MINECRAFT: в полях — блоки и Стив, а не стимпанк. 3D-сцена
     (Стив ломает блок) стоит по центру колонки отдельным хостом;
     эти кластеры её обрамляют, чтобы вкладка отличалась от
     остальных не только контентом.

     Блоки расставлены по изометрической решётке (клетки i,j,k), а
     не пикселями — так уступ и стопка стыкуются гранями. Порядок в
     строке = порядок рисования: сначала дальние клетки, потом
     ближние, иначе ближний блок окажется под дальним.
     Стив стоит на верхнем блоке: ступни ставим на центр его ромба.
     ========================================================= */
  /* сцена из блоков: cells = [[i,j,k,kind,seed], ...], ox/oy — где
     в системе координат SVG лежит клетка (0,0,0) */
  function mcScene(S, ox, oy, cells, extra){
    const G = ISO(S);
    let out = '';
    cells.forEach(c=>{
      const [x,y] = G.at(c[0], c[1], c[2]);
      out += mcBlock({ x:ox+x, y:oy+y, s:S, kind:c[3], seed:c[4],
                       bob:c[5], dur:c[6] });
    });
    if(extra) out += extra(G, ox, oy);
    return out;
  }

  /* Стив ростом ~2 блока, как в игре. Высота фигуры = s (32 единицы
     по s/32), стенка блока V = 1.1547*S, значит s ≈ 2*V ≈ 2.3*S.
     Ступни — на локальном y = s, ставим их в центр верхнего ромба. */
  const steveOn = (G, ox, oy, cell, s, dur)=>{
    const [sx, sy] = G.at(cell[0], cell[1], cell[2]);
    return mcSteve({ x:ox+sx, y:oy+sy-s, s, dur:dur||2.2 });
  };

  function setMinecraft(){
    return [
      /* уступ 2×1 с двухэтажной стопкой, на верхнем блоке — Стив */
      C('left', '16%', 130, 175, '0 0 130 175',
        mcScene(30, 50, 94, [
          [0,0,0,'stone', 5],
          [0,0,1,'grass', 2],
          [1,0,0,'grass', 9],
        ], (G, ox, oy)=> steveOn(G, ox, oy, [0,0,1], 48))),
      /* одиночный блок, слегка парит — «в руке у игрока» */
      C('right', '37%', 100, 110, '0 0 100 110',
        mcScene(34, 50, 36, [[0,0,0,'grass',14,true,4.6]])),
      /* разрез породы: камень, земля, трава — ровной стопкой */
      C('left', '61%', 100, 160, '0 0 100 160',
        mcScene(30, 50, 97, [
          [0,0,0,'stone',23],
          [0,0,1,'dirt', 31],
          [0,0,2,'grass',37],
        ])),
      /* доски + отколовшийся блок рядом */
      C('right', '79%', 135, 120, '0 0 135 120',
        mcScene(32, 44, 46, [[0,0,0,'plank',44]]) +
        mcScene(18, 104, 32, [[0,0,0,'dirt',51,true,3.8]])),
    ];
  }

  /* GAME DEV: три сцепленные шестерни, поршень, стояк */
  function setGameDev(){
    return [
      C('left', '15%', 210, 230, '0 0 210 230',
        cog({ x:132, y:56, r:32, teeth:12, tooth:10, dur:22, seed:23, grime:true }) +
        cog({ x:74, y:118, r:44, teeth:15, tooth:12, dur:31, ccw:true, seed:41, grime:true, spokes:6 }) +
        cog({ x:146, y:176, r:24, teeth:9, tooth:8, dur:16, seed:63, grime:true })),
      C('right', '36%', 190, 165, '0 0 190 165',
        piston({ x:96, y:52, seed:17, dur:2.9 }) +
        pipe({ x:10, y:110, w:150, h:20, seed:39, dirt:30 })),
      C('left', '57%', 175, 160, '0 0 175 160',
        pipe({ x:8, y:44, w:150, h:18, seed:91, dirt:28 }) +
        valve({ x:118, y:96, r:15, dur:13 })),
      C('right', '77%', 160, 150, '0 0 160 150',
        cog({ x:62, y:74, r:28, teeth:10, tooth:9, dur:18, ccw:true, seed:84, grime:true }) +
        gauge({ x:128, y:112, r:19, dur:5.8 })),
    ];
  }

  /* БИО: спокойнее — медленная шестерня, стояк с манометром, вентиль */
  function setBio(){
    return [
      C('left', '21%', 180, 175, '0 0 180 175',
        cog({ x:108, y:70, r:38, teeth:13, tooth:11, dur:40, seed:57, grime:true }) +
        pipe({ x:10, y:140, w:130, h:20, seed:29, dirt:24 })),
      C('right', '46%', 160, 210, '0 0 160 210',
        pipe({ x:56, y:26, w:20, h:110, seed:73, dirt:18 }) +
        gauge({ x:66, y:166, r:21, dur:6.4 })),
      C('left', '71%', 155, 140, '0 0 155 140',
        valve({ x:104, y:56, r:16, dur:18, ccw:true }) +
        pipe({ x:8, y:96, w:120, h:18, seed:36, dirt:22 })),
    ];
  }

  /* ключи = id вкладок из data.js */
  const SETS = { web:setWeb, mc:setMinecraft, game:setGameDev, bio:setBio };

  /* =========================================================
     Узкие экраны: поля страницы нет, кластеры пришлось бы либо
     загонять под текст, либо срезать почти целиком. Поэтому там
     одной ШИРОКОЙ ПОЛОСОЙ под механизмом — в потоке, где текста
     нет вообще. Рисунок виден целиком.
     ========================================================= */
  const SVG = (vb, inner, cls) =>
    `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;

  /* Поля сверху и снизу, чтобы зубья крупной шестерни и штоки
     поршней не срезались краем полосы. */
  const STRIP_W = 560, STRIP_H = 150, STRIP_PAD = 16;
  const STRIP_VB = `0 0 ${STRIP_W} ${STRIP_H + STRIP_PAD*2}`;
  const strip = (inner) =>
    SVG(STRIP_VB, `<g transform="translate(0,${STRIP_PAD})">${inner}</g>`, 'dc-s');

  function stripWeb(){
    return strip(
      pipe({ x:14, y:36, w:250, h:20, seed:101, dirt:34 }) +
      cog({ x:330, y:66, r:40, teeth:14, tooth:11, dur:30, seed:12, grime:true }) +
      cog({ x:406, y:102, r:26, teeth:10, tooth:8, dur:19, ccw:true, seed:31, grime:true }) +
      piston({ x:486, y:26, seed:71, dur:3.4 }) +
      valve({ x:266, y:96, r:16, dur:12 }));
  }
  /* Узкая полоса для Minecraft: 3D-сцена остаётся, но полоса ей не
     мешает — она стоит выше, между механизмом и сценой, и держит ту
     же тему: уступ блоков и Стив с киркой. */
  /* Все группы стоят на одной «земле»: низ силуэта ≈ y 139, поэтому
     oy у каждой свой (низ = oy + H + V). Раскиданы по всей ширине
     560, как в остальных полосах. */
  function stripMinecraft(){
    return strip(
      /* уступ со стопкой и Стивом */
      mcScene(22, 58, 74, [
        [0,1,0,'stone',5],  [1,1,0,'dirt', 9],
        [0,0,0,'dirt', 17],
        [0,0,1,'grass',2],  [1,0,0,'grass',23],
      ], (G, ox, oy)=> steveOn(G, ox, oy, [0,0,1], 36)) +
      /* доски и камень рядом */
      mcScene(24, 176, 82, [[0,0,0,'plank',44], [1,0,0,'stone',61]]) +
      /* парящий блок «в руке» */
      mcScene(17, 290, 56, [[0,0,0,'grass',14,true,4.6]]) +
      /* ступенька из трёх */
      mcScene(22, 400, 87, [
        [0,0,0,'dirt', 71], [1,0,0,'stone',77], [0,0,1,'grass',83],
      ]) +
      mcScene(20, 520, 103, [[0,0,0,'dirt',51]]));
  }
  function stripGameDev(){
    return strip(
      cog({ x:60, y:62, r:32, teeth:12, tooth:10, dur:22, seed:23, grime:true }) +
      cog({ x:132, y:92, r:44, teeth:15, tooth:12, dur:31, ccw:true, seed:41, grime:true, spokes:6 }) +
      cog({ x:206, y:52, r:24, teeth:9, tooth:8, dur:16, seed:63, grime:true }) +
      pipe({ x:252, y:48, w:220, h:20, seed:91, dirt:28 }) +
      piston({ x:492, y:24, seed:17, dur:2.9 }) +
      cog({ x:534, y:100, r:26, teeth:10, tooth:9, dur:18, ccw:true, seed:84, grime:true }));
  }
  function stripBio(){
    return strip(
      cog({ x:66, y:70, r:38, teeth:13, tooth:11, dur:40, seed:57, grime:true }) +
      pipe({ x:132, y:52, w:250, h:20, seed:29, dirt:24 }) +
      valve({ x:404, y:92, r:13, dur:18, ccw:true }) +
      gauge({ x:486, y:66, r:21, dur:6.4 }));
  }
  const STRIPS = { web:stripWeb, mc:stripMinecraft, game:stripGameDev, bio:stripBio };

  /* =========================================================
     Публичный API
     ========================================================= */
  /* один кластер -> позиционированный <div> с SVG внутри.
     Внутренний край упирается в край текстовой колонки (--gut),
     поэтому на текст кластер не наползает. Если поля меньше самого
     кластера, он не срезается краем экрана, а МАСШТАБИРУЕТСЯ в
     остаток поля (--cw), сохраняя пропорции: рисунок мельче, но
     виден целиком. */
  function clusterEl(c){
    const d = document.createElement('div');
    d.className = 'dc-c dc-c--' + c.side;
    d.style.top = c.top;
    d.style.setProperty('--cw', 'min(' + c.w + 'px, var(--gut))');
    d.style.width  = 'var(--cw)';
    d.style.height = 'calc(var(--cw) * ' + (c.h/c.w).toFixed(4) + ')';
    if(c.side === 'left') d.style.left = 'calc(var(--gut) - var(--cw))';
    else                  d.style.left = 'calc(100% - var(--gut))';
    d.innerHTML = SVG(c.vb, c.inner, 'dc-svg');
    return d;
  }
  function init(ids){
    root = document.getElementById('tabDecor');
    if(!root || built) return;
    const stripHost = document.getElementById('tabDecorStrip');
    panes = {}; stripPanes = {};
    (ids || Object.keys(SETS)).forEach(id=>{
      const make = SETS[id];
      if(!make) return;
      const pane = document.createElement('div');
      pane.className = 'dc-pane';
      pane.dataset.tab = id;
      make().forEach(c=> pane.appendChild(clusterEl(c)));
      root.appendChild(pane);
      panes[id] = pane;

      if(stripHost && STRIPS[id]){
        const sp = document.createElement('div');
        sp.className = 'dc-pane dc-pane--strip';
        sp.dataset.tab = id;
        sp.innerHTML = STRIPS[id]();
        stripHost.appendChild(sp);
        stripPanes[id] = sp;
      }
    });
    built = true;
  }
  /* показать набор активной вкладки, остальные спрятать
     (плавно: переход по opacity живёт в CSS, .dc-pane) */
  function show(id){
    if(!built) return;
    Object.keys(panes).forEach(k=>
      panes[k].classList.toggle('is-on', k === id));
    Object.keys(stripPanes).forEach(k=>
      stripPanes[k].classList.toggle('is-on', k === id));
  }

  return { init, show };
})();
