/* =========================================================
   TAB_DECOR — декор вкладок: у каждого раздела свой набор
   деталей по углам страницы. Шестерёнки крутятся, ржавые
   трубы капают. Всё в том же скетч-стиле: чернильный контур,
   тонкие линии, ржавчина и грязь — редким стипплингом.

   Не 3D и не мешает контенту: SVG в фиксированном слое,
   pointer-events:none, вращение и капли — CSS-анимации
   (композитятся на GPU, главный поток свободен).
   ========================================================= */
window.TAB_DECOR = (function(){
  "use strict";

  const INK = '#161413';
  let root = null;
  let panes = {};        // id вкладки -> боковые колонки (широкие экраны)
  let stripPanes = {};   // id вкладки -> полоса под контентом (узкие)
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

  /* ---------- капля: набухает у среза, срывается, падает ---------- */
  function drip(x, y, delay, fall){
    return `<g transform="translate(${x},${y})">
      <path d="M0 0 q-4 5 -4 8 a4 4 0 0 0 8 0 q0 -3 -4 -8Z"
        fill="none" stroke="${INK}" stroke-width="1.6"
        class="dc-drip" style="animation-delay:${delay}s;--dc-fall:${fall}px"/>
    </g>`;
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

  /* =========================================================
     Композиции: у каждой вкладки свой набор. Один кластер слева
     внизу, другой справа по центру — по краям, контенту не мешают.
     ========================================================= */
  const SVG = (vb, inner, cls) =>
    `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;

  /* Полоса под механизмом: одна система координат на все вкладки плюс
     поля сверху и снизу, чтобы зубья крупной шестерни и штоки поршней
     не срезались краем полосы, а капли успевали упасть. */
  const STRIP_W = 560, STRIP_H = 150, STRIP_PAD = 16;
  const STRIP_VB = `0 0 ${STRIP_W} ${STRIP_H + STRIP_PAD*2}`;
  const strip = (inner) =>
    SVG(STRIP_VB, `<g transform="translate(0,${STRIP_PAD})">${inner}</g>`, 'dc-s');

  /* WEB: связка из двух шестерён + поршень, труба сверху капает */
  function setWeb(){
    const left =
      pipe({ x:8, y:26, w:150, h:20, seed:101, dirt:34 }) +
      drip(52, 48, 0.2, 78) + drip(112, 48, 1.7, 66) +
      cog({ x:56, y:118, r:40, teeth:14, tooth:11, dur:30, seed:12, grime:true }) +
      cog({ x:132, y:154, r:26, teeth:10, tooth:8, dur:19, ccw:true, seed:31, grime:true }) +
      piston({ x:150, y:66, seed:71, dur:3.4 });
    const right =
      pipe({ x:34, y:150, w:120, h:18, seed:77, dirt:26 }) +
      drip(78, 170, 0.9, 60) +
      cog({ x:104, y:66, r:34, teeth:12, tooth:10, dur:24, ccw:true, seed:52, grime:true }) +
      valve({ x:40, y:74, r:16, dur:12 });
    return [SVG('0 0 210 210', left, 'dc-l'), SVG('0 0 190 200', right, 'dc-r')];
  }

  /* MINECRAFT: манометр + вертикальный стояк, крупная шестерня */
  function setMinecraft(){
    const left =
      cog({ x:64, y:96, r:48, teeth:16, tooth:12, dur:34, seed:19, grime:true, spokes:6 }) +
      pipe({ x:6, y:172, w:170, h:22, seed:88, dirt:38 }) +
      drip(44, 196, 0.5, 52) + drip(126, 196, 2.1, 44) +
      valve({ x:150, y:120, r:14, dur:10, ccw:true });
    const right =
      gauge({ x:64, y:56, r:24, dur:4.6 }) +
      pipe({ x:44, y:96, w:22, h:96, seed:44, dirt:20 }) +
      cog({ x:120, y:150, r:30, teeth:11, tooth:9, dur:21, seed:66, grime:true }) +
      drip(55, 196, 1.2, 50);
    return [SVG('0 0 200 250', left, 'dc-l'), SVG('0 0 180 250', right, 'dc-r')];
  }

  /* GAME DEV: три сцепленные шестерни разного размера + поршень */
  function setGameDev(){
    const left =
      cog({ x:52, y:74, r:32, teeth:12, tooth:10, dur:22, seed:23, grime:true }) +
      cog({ x:118, y:110, r:44, teeth:15, tooth:12, dur:31, ccw:true, seed:41, grime:true, spokes:6 }) +
      cog({ x:56, y:164, r:24, teeth:9, tooth:8, dur:16, seed:63, grime:true }) +
      pipe({ x:6, y:206, w:160, h:18, seed:91, dirt:28 }) +
      drip(70, 228, 0.7, 44);
    const right =
      piston({ x:70, y:58, seed:17, dur:2.9 }) +
      pipe({ x:20, y:112, w:130, h:20, seed:39, dirt:30 }) +
      drip(58, 134, 0.3, 66) + drip(120, 134, 1.9, 54) +
      cog({ x:106, y:184, r:28, teeth:10, tooth:9, dur:18, ccw:true, seed:84, grime:true });
    return [SVG('0 0 200 250', left, 'dc-l'), SVG('0 0 180 240', right, 'dc-r')];
  }

  /* БИО: спокойнее — одна шестерня, вентиль, труба с редкой каплей */
  function setBio(){
    const left =
      cog({ x:60, y:88, r:38, teeth:13, tooth:11, dur:40, seed:57, grime:true }) +
      pipe({ x:10, y:158, w:140, h:20, seed:29, dirt:24 }) +
      drip(64, 180, 1.4, 58) +
      valve({ x:132, y:110, r:13, dur:18, ccw:true });
    const right =
      pipe({ x:52, y:40, w:20, h:110, seed:73, dirt:18 }) +
      gauge({ x:62, y:172, r:21, dur:6.4 }) +
      drip(62, 152, 2.4, 40);
    return [SVG('0 0 180 220', left, 'dc-l'), SVG('0 0 150 220', right, 'dc-r')];
  }

  /* ключи = id вкладок из data.js */
  const SETS = { web:setWeb, mc:setMinecraft, game:setGameDev, bio:setBio };

  /* =========================================================
     Узкие экраны: поля страницы нет, боковые колонки пришлось бы
     либо загонять под текст, либо срезать почти целиком. Поэтому
     там же, но одной ШИРОКОЙ ПОЛОСОЙ под контентом — в потоке,
     где текста нет вообще. Рисунок виден целиком.
     ========================================================= */
  function stripWeb(){
    return strip(
      pipe({ x:14, y:30, w:250, h:20, seed:101, dirt:34 }) +
      drip(70, 52, 0.2, 62) + drip(158, 52, 1.7, 50) +
      cog({ x:330, y:66, r:40, teeth:14, tooth:11, dur:30, seed:12, grime:true }) +
      cog({ x:406, y:102, r:26, teeth:10, tooth:8, dur:19, ccw:true, seed:31, grime:true }) +
      piston({ x:486, y:26, seed:71, dur:3.4 }) +
      valve({ x:266, y:96, r:16, dur:12 }));
  }
  function stripMinecraft(){
    return strip(
      cog({ x:70, y:70, r:46, teeth:16, tooth:12, dur:34, seed:19, grime:true, spokes:6 }) +
      pipe({ x:140, y:38, w:230, h:22, seed:88, dirt:38 }) +
      drip(206, 62, 0.5, 58) + drip(320, 62, 2.1, 46) +
      valve({ x:398, y:88, r:14, dur:10, ccw:true }) +
      gauge({ x:472, y:60, r:24, dur:4.6 }) +
      cog({ x:534, y:104, r:24, teeth:9, tooth:8, dur:21, seed:66, grime:true }));
  }
  function stripGameDev(){
    return strip(
      cog({ x:60, y:62, r:32, teeth:12, tooth:10, dur:22, seed:23, grime:true }) +
      cog({ x:132, y:92, r:44, teeth:15, tooth:12, dur:31, ccw:true, seed:41, grime:true, spokes:6 }) +
      cog({ x:206, y:52, r:24, teeth:9, tooth:8, dur:16, seed:63, grime:true }) +
      pipe({ x:252, y:44, w:220, h:20, seed:91, dirt:28 }) +
      drip(316, 66, 0.7, 52) + drip(410, 66, 1.9, 40) +
      piston({ x:492, y:24, seed:17, dur:2.9 }) +
      cog({ x:534, y:100, r:26, teeth:10, tooth:9, dur:18, ccw:true, seed:84, grime:true }));
  }
  function stripBio(){
    return strip(
      cog({ x:66, y:70, r:38, teeth:13, tooth:11, dur:40, seed:57, grime:true }) +
      pipe({ x:132, y:44, w:250, h:20, seed:29, dirt:24 }) +
      drip(210, 66, 1.4, 54) +
      valve({ x:404, y:92, r:13, dur:18, ccw:true }) +
      gauge({ x:486, y:66, r:21, dur:6.4 }));
  }
  const STRIPS = { web:stripWeb, mc:stripMinecraft, game:stripGameDev, bio:stripBio };

  /* =========================================================
     Публичный API
     ========================================================= */
  function init(ids){
    root = document.getElementById('tabDecor');
    if(!root || built) return;
    const strip = document.getElementById('tabDecorStrip');
    panes = {}; stripPanes = {};
    (ids || Object.keys(SETS)).forEach(id=>{
      const make = SETS[id];
      if(!make) return;
      const pane = document.createElement('div');
      pane.className = 'dc-pane';
      pane.dataset.tab = id;
      pane.innerHTML = make().join('');
      root.appendChild(pane);
      panes[id] = pane;

      if(strip && STRIPS[id]){
        const sp = document.createElement('div');
        sp.className = 'dc-pane dc-pane--strip';
        sp.dataset.tab = id;
        sp.innerHTML = STRIPS[id]();
        strip.appendChild(sp);
        stripPanes[id] = sp;
      }
    });
    built = true;
  }
  /* показать набор активной вкладки, остальные спрятать */
  function show(id){
    if(!built) return;
    Object.keys(panes).forEach(k=>
      panes[k].classList.toggle('is-on', k === id));
    Object.keys(stripPanes).forEach(k=>
      stripPanes[k].classList.toggle('is-on', k === id));
  }

  return { init, show };
})();
