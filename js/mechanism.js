/* =========================================================
   MECHANISM — настоящая 3D-сцена (Three.js) в стиле стимпанк,
   решённая в фирменном скетч-стиле сайта: бумага + чернильный
   контур, тонкие линии, простые формы. Не SVG, не CSS —
   реальная геометрия: зубья экструдированы из 2D-контура,
   спицы/ступица/болты/трубы — отдельные меши.

   Состав сцены:
     MainMechanism
       ├── MainGearGroup  (зубья, спицы, ступица, болты)
       │     ├── TopShaft    (вертикальный вал над диском + детали)
       │     └── PlateRing   (4 таблички вкладок на ободе, активная
       │                      залита чернилами; клик = переход)
       ├── SecondaryGears (под шестернёй и позади — не по бокам)
       ├── UnderPipes     (ржавые трубы под диском, фланцы, вентиль)
       ├── Pipes / Valves / Gauges  (задний план)
       └── LeftArrow / RightArrow   (деревянные, на ползунах,
                                     ходят по направляющим валам)

   Вращение: ТОЛЬКО при смене вкладок, шаг STEP_DEG влево/вправо
   с easeInOutCubic + лёгкой доводкой (инерция тяжёлого маховика).
   ========================================================= */
window.MECHANISM = (function(){
  "use strict";

  /* ---------- палитра (в тон CSS-переменным сайта) ---------- */
  const INK        = 0x161413;
  const PAPER      = 0xf6f2e9;
  const PAPER_SIDE = 0xe8e1d2;   // боковые грани — чуть темнее
  const PAPER_DEEP = 0xded6c4;   // задний план
  const WOOD       = 0xe4dccb;   // «дерево»: тот же скетч, но теплее
  /* под курсором стрелка ТЕМНЕЕТ и уходит в красный: на светлой
     бумаге затемнение читается лучше, чем засветка (та сливалась
     с фоном), а красноватый тон сразу говорит «кнопка нажимается». */
  const WOOD_HOT   = 0x9c5544;   // ≈47% яркости дерева, красный доминирует умеренно

  /* ---------- параметры механизма ---------- */
  const TEETH      = 24;
  const R_HOLE     = 1.18;   // внутреннее отверстие
  const R_ROOT     = 1.72;   // впадина между зубьями
  const R_TIP      = 2.00;   // вершина зуба
  const THICK      = 0.50;   // толщина диска (низкий, широкий)
  const SPOKES     = 6;
  /* Шаг = 90°: таблички стоят через 90°, поэтому активная всегда
     доезжает точно на зрителя. Меньший шаг оставлял бы подсвеченную
     табличку боком. */
  const STEP_DEG   = 90;
  const SPIN_MS    = 980;    // длительность одного шага (ход тяжелее)
  const RUST       = 0xcfc4ad;   // «ржавая» труба — чуть грязнее бумаги
  /* Шестерёнка на валу и шестерёнка за ступицей накладываются на
     экране почти целиком, а тон у обеих был один (PAPER_DEEP) — они
     сливались в одно пятно. Разводим по тону: передняя светлее и
     теплее, задняя темнее и холоднее. Оттенок слабый — насыщенность
     8% и 3% против 11% у деревянных стрелок, так что картинка
     остаётся почти чёрно-белой. */
  const GEAR_SHAFT = 0xe0d8cf;   // на валу: светлее, тёплый
  const GEAR_BACK  = 0xc7cbce;   // за ступицей: темнее, холодный

  /* ---------- состояние ---------- */
  let THREE = null;
  let host = null, renderer = null, scene = null, camera = null;
  let mech = null, mainGear = null;
  let plates = [];           // 4 таблички вкладок на ободе
  let labelText = '';
  let onPlateCb = null;      // клик по табличке -> перейти на вкладку
  let secondary = [];        // {group, ratio}
  let spinners = [];         // {obj, ratio, axis} — крутятся от главного диска
  let arrows = [];           // {group, hit, dir, mats, hover, press, homeX, homeScale, nx}
  let raf = 0, dirty = true, reduced = false;
  let angle = 0, target = 0, animFrom = 0, animTo = 0, animT = 1, animDur = SPIN_MS, lastT = 0;
  let mouseNX = 0, mouseNY = 0, camNX = 0, camNY = 0;
  let onStepCb = null;
  let probes = [];
  /* камера: вид сверху-спереди, но угол низкий (≈25°) — изометрия
     мягче, лучше читается толщина зубьев и вертикальный вал.
     Дистанция подбирается вписыванием. */
  const CAM_EL = 25 * Math.PI/180;
  const camDir = { x:0, y:Math.sin(CAM_EL), z:Math.cos(CAM_EL) };
  const camAt  = { x:0, y:0.04, z:0 };
  let camDist = 6.4;
  let camBase = { x:0, y:0, z:0 };
  function placeCamera(){
    camBase.x = camAt.x + camDir.x*camDist;
    camBase.y = camAt.y + camDir.y*camDist;
    camBase.z = camAt.z + camDir.z*camDist;
    camera.position.set(camBase.x, camBase.y, camBase.z);
    camera.lookAt(camAt.x, camAt.y, camAt.z);
    camera.updateMatrixWorld();
  }

  const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
  const lerp  = (a,b,t)=> a+(b-a)*t;
  const easeInOutCubic = (t)=> t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

  /* =========================================================
     LineBag — накопитель отрезков: все контурные линии сцены
     собираются в минимум draw-call'ов (LineSegments).
     ========================================================= */
  function LineBag(){ this.v = []; }
  LineBag.prototype.seg = function(x1,y1,z1, x2,y2,z2){
    this.v.push(x1,y1,z1, x2,y2,z2); return this;
  };
  /* замкнутый контур по массиву [x,y] на высоте y0 (z = -py) */
  LineBag.prototype.loop2D = function(pts, y0){
    for(let i=0;i<pts.length;i++){
      const a = pts[i], b = pts[(i+1)%pts.length];
      this.seg(a[0], y0, -a[1], b[0], y0, -b[1]);
    }
    return this;
  };
  /* окружность в плоскости XY (для вертикальных колёс/циферблатов) */
  LineBag.prototype.ringXY = function(r, z0, seg, cx, cy){
    seg = seg || 48; cx = cx||0; cy = cy||0;
    for(let i=0;i<seg;i++){
      const a = i/seg*Math.PI*2, b = (i+1)/seg*Math.PI*2;
      this.seg(cx+r*Math.cos(a), cy+r*Math.sin(a), z0,
               cx+r*Math.cos(b), cy+r*Math.sin(b), z0);
    }
    return this;
  };
  /* замкнутый контур по [x,y] в плоскости XY на глубине z0 */
  LineBag.prototype.loopXY = function(pts, z0){
    for(let i=0;i<pts.length;i++){
      const a = pts[i], b = pts[(i+1)%pts.length];
      this.seg(a[0], a[1], z0, b[0], b[1], z0);
    }
    return this;
  };
  /* окружность в плоскости XZ */
  LineBag.prototype.ring = function(r, y0, seg, cx, cz){
    seg = seg || 72; cx = cx||0; cz = cz||0;
    for(let i=0;i<seg;i++){
      const a = i/seg*Math.PI*2, b = (i+1)/seg*Math.PI*2;
      this.seg(cx+r*Math.cos(a), y0, cz+r*Math.sin(a),
               cx+r*Math.cos(b), y0, cz+r*Math.sin(b));
    }
    return this;
  };
  /* окружность в плоскости YZ (торцы труб, лежащих по оси X) */
  LineBag.prototype.ringYZ = function(r, x0, seg, cy, cz){
    seg = seg || 48; cy = cy||0; cz = cz||0;
    for(let i=0;i<seg;i++){
      const a = i/seg*Math.PI*2, b = (i+1)/seg*Math.PI*2;
      this.seg(x0, cy+r*Math.cos(a), cz+r*Math.sin(a),
               x0, cy+r*Math.cos(b), cz+r*Math.sin(b));
    }
    return this;
  };
  /* вертикальные «швы» цилиндра — несколько штук, для скетча */
  LineBag.prototype.seams = function(r, y1, y2, count, cx, cz, phase){
    count = count||4; cx = cx||0; cz = cz||0; phase = phase||0;
    for(let i=0;i<count;i++){
      const a = phase + i/count*Math.PI*2;
      const x = cx + r*Math.cos(a), z = cz + r*Math.sin(a);
      this.seg(x, y1, z, x, y2, z);
    }
    return this;
  };
  LineBag.prototype.build = function(width){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.v, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: INK, transparent:true, opacity:0.92, linewidth: width||1
    }));
  };

  /* =========================================================
     Текстуры-«штриховка» (тонкие линии, как от руки)
     ========================================================= */
  function rng(seed){ let s = seed>>>0; return ()=>{ s = (s*1664525+1013904223)>>>0; return s/4294967296; }; }

  /* ВЕРТИКАЛЬНЫЕ штрихи на зубьях: по 2–3 на грань, разной длины,
     высоты и толщины — как от руки.
     Штрихи привязаны к зубу: 1024 px = 4 зуба (24 зуба / 6 тайлов),
     внутри зуба они разложены по слотам, поэтому зазор между
     соседними ~85 px текстуры. Этого хватает, чтобы на экране они
     не сливались в одно серое пятно даже без retina.
     Жирные полосы, которые тут были раньше, брались не отсюда, а из
     UV: u считался по углу, и на почти радиальных боковинах зуба
     текстура растягивалась в несколько раз. Это исправлено в
     makeUV — там u идёт по длине контура. */
  function texToothStripes(){
    const W = 1024, H = 168;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0,0,W,H);
    x.lineCap = 'round';
    const rnd = rng(20260819);
    const top = 22, bot = H-22, span = bot-top;
    const BLOCKS = 4, bw = W/BLOCKS;
    for(let b=0;b<BLOCKS;b++){
      const n = rnd() < 0.5 ? 2 : 3;              // 2–3 штриха на грань
      for(let i=0;i<n;i++){
        const px = b*bw + bw*(i + 0.5)/n + (rnd()-0.5)*bw*0.20;
        const h  = span*(0.20 + rnd()*0.58);      // разной длины
        const y0 = top + rnd()*(span - h);        // на разной высоте
        x.lineWidth   = 2 + rnd()*1.2;            // и разной толщины
        x.strokeStyle = 'rgba(22,20,19,' + (0.56 + rnd()*0.24).toFixed(2) + ')';
        x.beginPath(); x.moveTo(px, y0); x.lineTo(px, y0 + h); x.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  /* короткие КРУГОВЫЕ полоски на верхней плоскости (не длинные) */
  function texTopArcs(){
    const S = 1024;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0,0,S,S);
    x.strokeStyle = 'rgba(22,20,19,0.78)'; x.lineCap = 'round'; x.lineWidth = 4;
    const rnd = rng(771337);
    const px = (u)=> u*S;                          // uv [0..1] -> пиксели
    const cx = px(0.5), cy = px(0.5), k = S/(2*R_TIP);   // мир -> пиксели
    const rIn = R_HOLE + 0.10, rOut = R_ROOT - 0.10;
    for(let i=0;i<11;i++){
      const r  = rIn + rnd()*(rOut-rIn);
      const a0 = rnd()*Math.PI*2;
      const len = (7 + rnd()*11) * Math.PI/180;    // 7..18° — короткие
      x.beginPath(); x.arc(cx, cy, r*k, a0, a0+len); x.stroke();
      if(rnd() < 0.34){                            // иногда — вторая рядом
        const r2 = r + (rnd()<0.5?-1:1)*(0.055+rnd()*0.05);
        if(r2>rIn && r2<rOut){
          x.beginPath(); x.arc(cx, cy, r2*k, a0+0.02, a0+len*0.82); x.stroke();
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  /* «дерево»: продольные волокна + пара царапин */
  function texWood(){
    const W = 512, H = 128;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0,0,W,H);
    const rnd = rng(4242);
    x.strokeStyle = 'rgba(22,20,19,0.30)'; x.lineWidth = 2; x.lineCap = 'round';
    for(let i=0;i<7;i++){
      const y = 14 + (i/6)*(H-28) + (rnd()-0.5)*7;
      const x0 = 12 + rnd()*70, x1 = W - 12 - rnd()*70;
      x.beginPath(); x.moveTo(x0, y);
      x.bezierCurveTo(W*0.34, y+(rnd()-0.5)*9, W*0.66, y+(rnd()-0.5)*9, x1, y);
      x.stroke();
    }
    x.strokeStyle = 'rgba(22,20,19,0.42)'; x.lineWidth = 2.4;
    for(let i=0;i<3;i++){
      const y = 20 + rnd()*(H-40), x0 = 40 + rnd()*(W-140);
      x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + 26 + rnd()*54, y + (rnd()-0.5)*5); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  /* «ржавчина и грязь» на трубах: пятна точками + потёки.
     Штриховки нет — только редкий стипплинг, как в скетче. */
  function texRust(){
    const W = 256, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0,0,W,H);
    const rnd = rng(9137);
    /* пятна: сгустки точек разного размера */
    for(let p=0;p<7;p++){
      const cx = rnd()*W, cy = rnd()*H, rad = 16 + rnd()*30;
      const dots = 26 + (rnd()*30|0);
      for(let i=0;i<dots;i++){
        const a = rnd()*Math.PI*2, r = Math.pow(rnd(), 0.7)*rad;
        const s = 0.7 + rnd()*1.5;
        x.fillStyle = 'rgba(22,20,19,' + (0.16 + rnd()*0.26).toFixed(2) + ')';
        x.beginPath(); x.arc(cx + r*Math.cos(a), cy + r*Math.sin(a), s, 0, Math.PI*2); x.fill();
      }
    }
    /* потёки: короткие вертикальные струйки от пятен вниз */
    x.strokeStyle = 'rgba(22,20,19,0.24)'; x.lineWidth = 1.6; x.lineCap = 'round';
    for(let i=0;i<9;i++){
      const sx = rnd()*W, sy = rnd()*H*0.7, len = 12 + rnd()*30;
      x.beginPath(); x.moveTo(sx, sy);
      x.quadraticCurveTo(sx + (rnd()-0.5)*5, sy+len*0.6, sx + (rnd()-0.5)*7, sy+len);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  /* клубы дыма: рисованные «облачка» контуром, как в скетче.
     Не мыльное пятно из блюра, а замкнутый неровный контур с
     редкой штриховкой внутри — чтобы дым читался тем же карандашом,
     что и весь механизм. Вариантов несколько, чтобы клубы не были
     копиями друг друга. */
  function texPuff(seed){
    const S = 128;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d');
    const rnd = rng(seed);
    /* контур: окружность, у которой радиус гуляет по углу */
    const lobes = 5 + (rnd()*3|0);
    const base  = S*0.30, jit = S*0.085;
    const rAt = (a)=>{
      let r = base;
      for(let k=1;k<=lobes;k++) r += jit*Math.sin(a*k + seed*0.7 + k)/k;
      return r;
    };
    x.beginPath();
    for(let i=0;i<=72;i++){
      const a = i/72*Math.PI*2, r = rAt(a);
      const px = S/2 + r*Math.cos(a), py = S/2 + r*Math.sin(a);
      i ? x.lineTo(px,py) : x.moveTo(px,py);
    }
    x.closePath();
    x.fillStyle = 'rgba(22,20,19,0.10)'; x.fill();
    x.strokeStyle = 'rgba(22,20,19,0.62)'; x.lineWidth = 2.6;
    x.lineJoin = 'round'; x.stroke();
    /* пара внутренних дуг — намёк на объём, без штриховки */
    x.strokeStyle = 'rgba(22,20,19,0.34)'; x.lineWidth = 2;
    for(let i=0;i<2;i++){
      const a0 = rnd()*Math.PI*2, r = base*(0.34 + rnd()*0.3);
      x.beginPath();
      x.arc(S/2 + (rnd()-0.5)*base*0.4, S/2 + (rnd()-0.5)*base*0.4,
            r, a0, a0 + 1.1 + rnd());
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 2;
    return t;
  }

  /* ---------- материалы (создаются один раз) ---------- */
  const MAT = {};
  function initMaterials(){
    MAT.woodTex  = texWood();
    MAT.cap      = new THREE.MeshLambertMaterial({ color:PAPER,      map:texTopArcs() });
    MAT.wall     = new THREE.MeshLambertMaterial({ color:PAPER_SIDE, map:texToothStripes() });
    MAT.hub      = new THREE.MeshLambertMaterial({ color:PAPER });
    MAT.bolt     = new THREE.MeshLambertMaterial({ color:PAPER_SIDE });
    MAT.spoke    = new THREE.MeshLambertMaterial({ color:PAPER_SIDE });
    MAT.deep     = new THREE.MeshLambertMaterial({ color:PAPER_DEEP });
    MAT.gearShaft= new THREE.MeshLambertMaterial({ color:GEAR_SHAFT });
    MAT.gearBack = new THREE.MeshLambertMaterial({ color:GEAR_BACK });
    MAT.rust     = new THREE.MeshLambertMaterial({ color:RUST, map:texRust() });
    MAT.line     = new THREE.LineBasicMaterial({ color:INK, transparent:true, opacity:0.92 });
    MAT.lineSoft = new THREE.LineBasicMaterial({ color:INK, transparent:true, opacity:0.5 });
    /* спрайты дыма: 4 рисунка клубов, материал у каждого клуба свой
       (нужна своя opacity), поэтому храним только текстуры */
    MAT.puffTex  = [texPuff(3), texPuff(17), texPuff(41), texPuff(88)];
  }
  /* =========================================================
     UV-генератор для ExtrudeGeometry:
       • крышки  — мир -> [0..1] по габариту (короткие круговые дуги);
       • стенки  — u = длина по окружности (тайлы), v = толщина.
     u стенок идёт по ДЛИНЕ контура, а не по углу. Угол на боковинах
     зуба растёт медленно (они почти радиальные), а на экране боковина
     занимает много места — при u=угол текстура растягивалась там в
     несколько раз, и тонкий штрих превращался в жирную чёрную полосу.
     По длине масштаб одинаков на впадине, боковине и площадке.
     Вся длина контура = ровно tiles тайлов (tiles целое), поэтому на
     стыке последнего и первого квада шва не видно.
     ========================================================= */
  function makeUV(rTip, tiles, pts){
    const K = 1/(2*rTip), C = 0.5;
    /* карта «точка контура -> пройденная длина» */
    const key = (px, py)=> Math.round(px*1e4) + '|' + Math.round(py*1e4);
    const arc = new Map();
    let total = 0;
    if(pts){
      for(let i=0;i<pts.length;i++){
        arc.set(key(pts[i][0], pts[i][1]), total);
        const n = pts[(i+1) % pts.length];
        total += Math.hypot(n[0]-pts[i][0], n[1]-pts[i][1]);
      }
    }
    return {
      generateTopUV: function(g, verts, a, b, c){
        return [
          new THREE.Vector2(verts[a*3]*K+C, verts[a*3+1]*K+C),
          new THREE.Vector2(verts[b*3]*K+C, verts[b*3+1]*K+C),
          new THREE.Vector2(verts[c*3]*K+C, verts[c*3+1]*K+C)
        ];
      },
      generateSideWallUV: function(g, verts, a, b, c, d){
        const at = (i)=> arc.get(key(verts[i*3], verts[i*3+1]));
        let ua, ub;
        const s0 = at(a), s1 = at(b);
        if(total > 0 && s0 !== undefined && s1 !== undefined){
          let e = s1;
          if(e - s0 >  total/2) e -= total;       // квад через стык
          if(e - s0 < -total/2) e += total;
          const f = tiles/total;
          ua = s0*f; ub = e*f;
        } else {
          /* контур отверстия: его точек в карте нет — считаем по углу */
          const ang = (i)=> Math.atan2(verts[i*3+1], verts[i*3]);
          let a0 = ang(a), a1 = ang(b);
          while(a1 - a0 >  Math.PI) a1 -= Math.PI*2;
          while(a1 - a0 < -Math.PI) a1 += Math.PI*2;
          const f = tiles/(Math.PI*2);
          ua = a0*f; ub = a1*f;
        }
        const za = verts[a*3+2], zb = verts[c*3+2];
        const v0 = za < zb ? 0 : 1, v1 = 1 - v0;
        return [
          new THREE.Vector2(ua, v0), new THREE.Vector2(ub, v0),
          new THREE.Vector2(ub, v1), new THREE.Vector2(ua, v1)
        ];
      }
    };
  }
  /* =========================================================
     Профиль зуба — трапеция: широкое основание, плоская вершина,
     наклонные боковины, чёткая впадина. Не треугольник.
        angle0 впадина → angle1 подъём → angle2..3 площадка → спуск

     asym: шестерня НЕ симметричная — зубья чуть разной высоты и
     ширины, боковины с разным наклоном (зуб «завален»), пара зубьев
     битая. Деталь кованая, а не выштампованная: у скетча так больше
     характера, и глазу есть за что зацепиться при вращении.
     Джиттер детерминированный (rng с фиксированным зерном) — форма
     одна и та же при каждой загрузке.
       • дно впадины одинаковое у всех зубьев: иначе на стыке зубьев
         радиус прыгает и в контуре видна ступенька;
       • сумма долей (площадка + 2 боковины + впадина) = 1, поэтому
         зуб всегда укладывается в свой шаг и профиль не самопересекается.
     ========================================================= */
  /* Профиль живёт в своей системе координат: зуб с индексом i стоит
     на угле i·(360/TEETH), а в «табличном» счёте (как у табличек и
     противовеса) это тот же угол + 90°. Скол ставим на 22-й зуб —
     в исходном повороте он выходит вперёд-направо и его видно;
     изношенный на 3-й — слева. */
  const ASYM_SEED  = 20259;
  const TOOTH_CHIP = 22;   // скол: вершина почти до впадины
  const TOOTH_WORN = 3;    // сильно изношенный зуб
  function gearProfile(teeth, rRoot, rTip, asym){
    const pts = [], corners = [];
    const step = Math.PI*2/teeth;
    const P = (r,a)=> pts.push([r*Math.cos(a), r*Math.sin(a)]);
    const rnd = asym ? rng(ASYM_SEED) : null;
    for(let i=0;i<teeth;i++){
      let fTip = 0.30, fA = 0.115, fB = 0.115, tipR = rTip;
      if(rnd){
        const j = ()=> rnd()*2 - 1;
        fTip += j()*0.040;
        fA   += j()*0.022;
        fB   += j()*0.022;          // fA ≠ fB — зуб наклонён в одну сторону
        /* ±0.035 — это ~13% высоты зуба (0.28): на экране 4–5 px,
           разнобой виден, но обод не выглядит поломанным */
        tipR += j()*0.035;
        if(i === TOOTH_CHIP){ tipR = rRoot + 0.085; fTip = 0.20; fA = 0.075; fB = 0.155; }
        if(i === TOOTH_WORN){ tipR = rTip - 0.075;  fTip = 0.36; fA = 0.150; fB = 0.085; }
      }
      const fVal = 1 - fTip - fA - fB;
      let a = i*step;
      P(rRoot, a);                                   // впадина
      P(rRoot, a + fVal*step*0.5);                   // (2 сегмента — круглый корень)
      a += fVal*step;   P(rRoot, a); corners.push([rRoot, a]);   // начало подъёма
      a += fA*step;     P(tipR,  a); corners.push([tipR,  a]);   // начало площадки
      a += fTip*step;   P(tipR,  a); corners.push([tipR,  a]);   // конец площадки
      a += fB*step;                  corners.push([rRoot, a]);   // конец спуска
    }
    return { pts, corners };
  }

  /* универсальная шестерня: createGear(teeth, radius, thickness…) */
  function createGear(o){
    const g = new THREE.Group();
    const prof = gearProfile(o.teeth, o.rRoot, o.rTip, o.asym);
    const shape = new THREE.Shape(prof.pts.map(p=> new THREE.Vector2(p[0],p[1])));
    if(o.hole){
      const h = new THREE.Path();
      h.absarc(0, 0, o.hole, 0, Math.PI*2, true);
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth:o.thick, bevelEnabled:false, steps:1, curveSegments:64,
      UVGenerator: makeUV(o.rTip, o.tiles||6, prof.pts)
    });
    geo.rotateX(-Math.PI/2);
    geo.translate(0, -o.thick/2, 0);
    /* soft — деталь заднего плана: одним тоном, без штриховки.
       o.tint задаёт свой тон вместо общего MAT.deep. */
    const flat = o.tint || MAT.deep;
    g.add(new THREE.Mesh(geo, o.soft ? [flat, flat] : [MAT.cap, MAT.wall]));

    const yT = o.thick/2, yB = -o.thick/2;
    const L = new LineBag();
    L.loop2D(prof.pts, yT);
    L.loop2D(prof.pts, yB);
    prof.corners.forEach(c=>{
      const x = c[0]*Math.cos(c[1]), z = -c[0]*Math.sin(c[1]);
      L.seg(x, yB, z, x, yT, z);
    });
    if(o.hole) L.ring(o.hole, yT, 72);        // нижнее кольцо не рисуем — лишний шум
    const ln = L.build(); if(o.soft) ln.material = MAT.lineSoft;
    g.add(ln);

    if(o.rings && o.rings.length){          // тонкие круги на верхней плоскости
      const S = new LineBag();
      o.rings.forEach(r=> S.ring(r, yT + 0.002, 96));
      g.add(new THREE.LineSegments(S.build().geometry, MAT.lineSoft));
    }
    g.userData.rTip = o.rTip;
    return g;
  }
  const createMainGear  = ()=> createGear({ teeth:TEETH, rRoot:R_ROOT, rTip:R_TIP,
                                            thick:THICK, hole:R_HOLE, tiles:6,
                                            rings:[R_ROOT], asym:true });
  const createSmallGear = (teeth, rTip, thick, soft, tint)=> createGear({
    teeth, rTip, rRoot:rTip-0.135*(rTip/0.7), thick, tiles:3, soft, tint
  });
  /* =========================================================
     Болты: одна геометрия + InstancedMesh на кольцо (дёшево),
     контур — общий LineSegments.
     ========================================================= */
  let BOLT_GEO = null;
  function createBolt(r, h){
    const g = new THREE.CylinderGeometry(r, r, h, 12);
    g.translate(0, h/2, 0);
    return g;
  }
  /* o.at — готовый список углов (рад). Если его нет, болты ставятся
     ровным кольцом по o.count. */
  function boltRing(parent, o){
    if(!BOLT_GEO) BOLT_GEO = createBolt(1, 1);
    const at = o.at || null;
    const n = at ? at.length : o.count;
    const im = new THREE.InstancedMesh(BOLT_GEO, MAT.bolt, n);
    const m = new THREE.Matrix4(), L = new LineBag();
    for(let i=0;i<n;i++){
      const a = at ? at[i] : (o.phase||0) + i/n*Math.PI*2;
      const x = o.radius*Math.cos(a), z = o.radius*Math.sin(a);
      m.makeScale(o.r, o.h, o.r); m.setPosition(x, o.y, z);
      im.setMatrixAt(i, m);
      L.ring(o.r*0.98, o.y + o.h, 12, x, z);
      L.ring(o.r*0.98, o.y + 0.004, 12, x, z);
    }
    im.instanceMatrix.needsUpdate = true;
    parent.add(im);
    parent.add(new THREE.LineSegments(L.build().geometry, MAT.line));
  }

  /* =========================================================
     Ступица: несколько концентрических цилиндров на одной оси
     + фланец с болтами + вал вниз.
     ========================================================= */
  function createHub(){
    const g = new THREE.Group();
    const yTop = THICK/2;
    /* минимализм: немного ярусов, «швы» только на крупных */
    const tiers = [
      { r:0.46, y0:-yTop,      y1:yTop,       seams:0 },  // бочка сквозь диск
      { r:0.72, y0:yTop,       y1:yTop+0.17,  seams:4 },  // фланец
      { r:0.44, y0:yTop+0.17,  y1:yTop+0.48,  seams:3 },
      { r:0.34, y0:yTop+0.48,  y1:yTop+0.56,  seams:0 },  // крышка
      { r:0.13, y0:-0.92,      y1:-yTop,      seams:0 }   // вал вниз
    ];
    const L = new LineBag();
    tiers.forEach(t=>{
      const h = t.y1 - t.y0;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, h, 28), MAT.hub);
      cyl.position.y = t.y0 + h/2;
      g.add(cyl);
      L.ring(t.r, t.y1, 48); L.ring(t.r, t.y0, 48);
      if(t.seams) L.seams(t.r, t.y0, t.y1, t.seams, 0, 0, 0.3);
    });
    g.add(L.build());
    boltRing(g, { count:6, radius:0.58, y:yTop+0.17, r:0.055, h:0.065, phase:0.39 });
    return g;
  }
  /* Спицы: толстые перемычки от ступицы к ободу, между ними — окна.
     Стоят НЕ ровно через 60°: углы разведены, ширина у каждой своя,
     одна (SPOKE_FAT) заметно толще — как поставленная взамен
     лопнувшей. Симметрии нет ни по углу, ни по толщине. */
  const SPOKE_OFF = [0, -0.075, 0.055, -0.02, 0.085, -0.05];  // рад, к i·60°
  const SPOKE_W   = [0.26, 0.225, 0.28, 0.24, 0.35, 0.255];   // высота бруса
  const SPOKE_FAT = 4;
  /* пять болтов на полотне, углы вразнобой (не кольцо) */
  const BOLT_AT = [0.20, 1.24, 2.55, 3.61, 5.02];
  function createSpokes(){
    const g = new THREE.Group();
    const r0 = 0.66, r1 = 1.23, len = r1 - r0;
    for(let i=0;i<SPOKES;i++){
      const a = i/SPOKES*Math.PI*2 + (SPOKE_OFF[i] || 0);
      const w = SPOKE_W[i] || 0.26;
      const geo = new THREE.BoxGeometry(len, w, 0.21);
      const s = new THREE.Group();
      s.position.set((r0+len/2)*Math.cos(a), 0, -(r0+len/2)*Math.sin(a));
      s.rotation.y = a;
      s.add(new THREE.Mesh(geo, MAT.spoke));
      s.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), MAT.line));
      /* у толстой спицы — накладка сверху с двумя заклёпками: видно,
         что это ремонт, а не штатная деталь (и видно из-под камеры) */
      if(i === SPOKE_FAT){
        const plGeo = new THREE.BoxGeometry(len*0.52, 0.05, 0.255);
        const pl = new THREE.Mesh(plGeo, MAT.bolt);
        pl.position.set(0.02, w/2 + 0.024, 0);
        s.add(pl);
        const ple = new THREE.LineSegments(new THREE.EdgesGeometry(plGeo), MAT.line);
        ple.position.copy(pl.position); s.add(ple);
        [-0.085, 0.085].forEach(dx=>{
          const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.024,0.024,0.045,8), MAT.hub);
          rv.position.set(0.02 + dx, w/2 + 0.06, 0);
          s.add(rv);
        });
      }
      g.add(s);
    }
    return g;
  }

  /* =========================================================
     Асимметричные детали на диске: одиночный противовес на ободе
     и клёпаная заплата на полотне. Оба стоят в промежутках между
     табличками (те через 90°, значит свободно 45°/135°/225°/315°),
     нигде не повторяются — диск перестаёт быть «ровным колесом»
     и при вращении сразу видно, где он сейчас.
     ========================================================= */
  const ASYM_CW    = 45  * Math.PI/180;   // противовес
  const ASYM_PATCH = 218 * Math.PI/180;   // заплата
  /* та же система координат, что у табличек: (R·sin a, y, R·cos a) */
  const atAngle = (R, a)=> [R*Math.sin(a), R*Math.cos(a)];

  function createCounterweight(){
    const g = new THREE.Group();
    const yTop = THICK/2;
    const [x, z] = atAngle(1.50, ASYM_CW);
    /* колодка вдоль хорды + два прижимных болта */
    const geo = new THREE.BoxGeometry(0.46, 0.17, 0.24);
    const m = new THREE.Mesh(geo, MAT.spoke);
    m.position.set(x, yTop + 0.085, z);
    m.rotation.y = ASYM_CW;
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), MAT.line);
    e.position.copy(m.position); e.rotation.y = ASYM_CW; g.add(e);
    /* скос-«ушко» наружу и болты */
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.13, 12), MAT.bolt);
    const [lx, lz] = atAngle(1.50, ASYM_CW + 0.135);
    lug.position.set(lx, yTop + 0.065, lz);
    g.add(lug);
    const L = new LineBag();
    L.ring(0.13, yTop, 14, lx, lz); L.ring(0.10, yTop + 0.13, 14, lx, lz);
    [-0.155, 0.155].forEach(d=>{
      const [bx, bz] = atAngle(1.50, ASYM_CW + d/1.50);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.032,0.032,0.06,8), MAT.hub);
      b.position.set(bx, yTop + 0.20, bz); g.add(b);
      L.ring(0.032, yTop + 0.23, 8, bx, bz);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));
    return g;
  }
  function createPatch(){
    const g = new THREE.Group();
    const yTop = THICK/2;
    const [x, z] = atAngle(1.44, ASYM_PATCH);
    const geo = new THREE.BoxGeometry(0.50, 0.035, 0.30);
    const m = new THREE.Mesh(geo, MAT.bolt);
    m.position.set(x, yTop + 0.017, z);
    m.rotation.y = ASYM_PATCH - 0.10;      // приклёпана чуть косо
    g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), MAT.line);
    e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e);
    const L = new LineBag();
    [[-0.17,-0.09],[0.17,-0.09],[0,0.10]].forEach(o=>{
      const c = Math.cos(ASYM_PATCH - 0.10), s = Math.sin(ASYM_PATCH - 0.10);
      const rx = x + o[0]*c + o[1]*s, rz = z - o[0]*s + o[1]*c;
      const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.045,8), MAT.hub);
      rv.position.set(rx, yTop + 0.045, rz); g.add(rv);
      L.ring(0.026, yTop + 0.067, 8, rx, rz);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    return g;
  }

  /* сборка большой шестерни: всё в одной группе — вращается вместе */
  function buildMainGear(){
    const G = new THREE.Group();
    G.add(createMainGear());
    G.add(createSpokes());
    G.add(createHub());
    /* Болты на верхней плоскости: было ровное кольцо из 12 —
       читалось как россыпь одинаковых цилиндриков и спорило с
       табличками. Оставляем пять, вразнобой по углу: деталь
       заметна там, где на неё смотрят, и не превращается в узор. */
    boltRing(G, { at:BOLT_AT, radius:1.63, y:THICK/2, r:0.052, h:0.060 });
    G.add(createCounterweight());
    G.add(createPatch());
    G.add(createTopShaft());
    buildPlateRing(G);
    return G;
  }

  /* =========================================================
     Трубы / клапаны / манометры — задний план, для глубины
     ========================================================= */
  function createPipe(x1,y1,z1, x2,y2,z2, r, rusty){
    const g = new THREE.Group();
    const a = new THREE.Vector3(x1,y1,z1), b = new THREE.Vector3(x2,y2,z2);
    const d = new THREE.Vector3().subVectors(b,a), len = d.length();
    const geo = new THREE.CylinderGeometry(r, r, len, 16, 1, true);
    const m = new THREE.Mesh(geo, rusty ? MAT.rust : MAT.deep);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), d.clone().normalize());
    g.add(m);
    const L = new LineBag();
    L.ring(r, -len/2, 20); L.ring(r, len/2, 20); L.seams(r, -len/2, len/2, 1, 0, 0, 1.2);
    const ln = new THREE.LineSegments(L.build().geometry, MAT.lineSoft);
    ln.position.copy(m.position); ln.quaternion.copy(m.quaternion);
    g.add(ln);
    return g;
  }
  function createElbow(x,y,z, r, rusty){
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r*1.28, 14, 10), rusty ? MAT.rust : MAT.deep));
    const L = new LineBag(); L.ring(r*1.28, 0, 22);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    g.position.set(x,y,z);
    return g;
  }
  /* фланец на трубе: два кольца-бортика, чтобы стык читался.
     axis — вдоль какой оси идёт труба ('x' | 'y' | 'z'): диск должен
     стоять ПЕРПЕНДИКУЛЯРНО трубе. Раньше он всегда был горизонтальным
     и на лежачей трубе читался плавником, а не стыком. */
  function createFlange(x,y,z, r, axis){
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r*1.5, r*1.5, 0.05, 16), MAT.deep);
    const L = new LineBag();
    if(axis === 'x'){
      m.rotation.z = Math.PI/2;
      L.ringYZ(r*1.5, -0.025, 22); L.ringYZ(r*1.5, 0.025, 22);
    } else if(axis === 'z'){
      m.rotation.x = Math.PI/2;
      L.ringXY(r*1.5, -0.025, 22); L.ringXY(r*1.5, 0.025, 22);
    } else {
      L.ring(r*1.5, 0.025, 22); L.ring(r*1.5, -0.025, 22);
    }
    g.add(m);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    g.position.set(x,y,z);
    return g;
  }
  /* =========================================================
     Вертикальный вал НАД шестерней: тонкий стержень + хомуты,
     коронная шестерёнка, шкив. Ребёнок MainGearGroup —
     вращается вместе с диском.

     Вал НЕ заканчивается в кадре: он уходит за верхний край экрана,
     как будто механизм продолжается выше страницы. Всё, что выше
     детальной зоны, помечено noFit — иначе вписывание считало бы
     вал габаритом и отодвигало камеру, мельча диск.
     ========================================================= */
  const SHAFT_TOP = 9.0;                 // заведомо выше верхней границы кадра
  function createTopShaft(){
    const g = new THREE.Group();
    const y0 = THICK/2 + 0.56;            // от крышки ступицы
    const y1 = y0 + 0.92;                 // конец детальной зоны
    const L = new LineBag();
    /* стержень детальной зоны */
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, y1-y0, 14), MAT.hub);
    rod.position.y = (y0+y1)/2; g.add(rod);
    L.ring(0.062, y0, 20);
    L.seams(0.062, y0, y1, 2, 0, 0, 0.5);
    /* хомуты */
    [y0+0.14, y1-0.30].forEach(y=>{
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 14), MAT.bolt);
      c.position.y = y; g.add(c);
      L.ring(0.105, y+0.035, 18); L.ring(0.105, y-0.035, 18);
    });
    /* коронная шестерёнка на валу */
    const crown = createSmallGear(12, 0.30, 0.10, true, MAT.gearShaft);
    crown.position.y = y0 + 0.40; g.add(crown);
    /* шкив: с него уходит привод куда-то выше кадра */
    const pul = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.032, 7, 20), MAT.deep);
    pul.rotation.x = Math.PI/2; pul.position.y = y1 - 0.14; g.add(pul);
    L.ring(0.167, y1-0.14, 24); L.ring(0.103, y1-0.14, 20);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    /* ---- продолжение вала за край кадра ---- */
    const up = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.062, SHAFT_TOP - y1, 14), MAT.hub);
    up.position.y = (y1 + SHAFT_TOP)/2;
    up.userData.noFit = true; g.add(up);
    const UL = new LineBag();
    UL.seams(0.062, y1, SHAFT_TOP, 2, 0, 0, 0.5);
    /* хомуты только на видимом участке: выше они всё равно за кадром */
    [y1+0.46, y1+1.28, y1+2.20].forEach(y=>{
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.062, 14), MAT.bolt);
      c.position.y = y; c.userData.noFit = true; g.add(c);
      UL.ring(0.098, y+0.031, 18); UL.ring(0.098, y-0.031, 18);
    });
    const uln = new THREE.LineSegments(UL.build().geometry, MAT.line);
    uln.userData.noFit = true; g.add(uln);

    g.userData.topY = y1;
    return g;
  }
  /* =========================================================
     Трубная развязка ПОД шестернёй, спереди-снизу — видна из-под
     обода: магистраль с фланцами, колена, стояки, вентиль, ржавчина.
     ========================================================= */
  /* Раньше это была одна прямая труба с одинаковыми коленами и
     стояками на обоих концах — читалась как ось симметрии и мешала
     асимметричному диску. Теперь трасса ломаная: слева толстая
     магистраль с вентилем, посередине переходная муфта со сменой
     диаметра и уступом по глубине, справа тонкая ветка, которая
     уходит назад и обрывается заглушкой. Концы разные:
     слева — открытый раструб с манжетой, справа — глухая заглушка. */
  function createUnderPipes(){
    const g = new THREE.Group();
    const y = -0.97, z = 1.16;
    const xL = -1.55, xM = 0.10, xR = 1.46;
    const rBig = 0.115, rSml = 0.082;
    const zR = z - 0.30;                       // уступ по глубине справа

    /* левая, толстая часть магистрали */
    g.add(createPipe(xL, y, z, xM, y, z, rBig, true));
    [-1.02, -0.46].forEach(fx=> g.add(createFlange(fx, y, z, rBig, 'x')));
    /* переходная муфта: конус с толстой на тонкую */
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(rSml, rBig, 0.20, 16, 1, true), MAT.rust);
    cone.rotation.z = -Math.PI/2; cone.position.set(xM + 0.10, y, z); g.add(cone);
    const CL = new LineBag();
    CL.ringYZ(rBig, xM,        20, y, z);
    CL.ringYZ(rSml, xM + 0.20, 20, y, z);
    g.add(new THREE.LineSegments(CL.build().geometry, MAT.lineSoft));
    /* правая, тонкая ветка: уступ назад, потом вдоль и заглушка */
    g.add(createPipe(xM + 0.20, y, z, 0.72, y, z, rSml, true));
    g.add(createElbow(0.72, y, z, rSml, true));
    g.add(createPipe(0.72, y, z, 0.72, y, zR, rSml, true));
    g.add(createElbow(0.72, y, zR, rSml, true));
    g.add(createPipe(0.72, y, zR, xR, y, zR, rSml, true));
    g.add(createFlange(1.14, y, zR, rSml, 'x'));
    /* глухая заглушка на правом конце: шайба + гайка по центру */
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rSml*1.34, rSml*1.34, 0.055, 16), MAT.deep);
    cap.rotation.z = Math.PI/2; cap.position.set(xR, y, zR); g.add(cap);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 6), MAT.bolt);
    nut.rotation.z = Math.PI/2; nut.position.set(xR + 0.05, y, zR); g.add(nut);
    const KL = new LineBag();
    KL.ringYZ(rSml*1.34, xR - 0.0275, 22, y, zR);
    KL.ringYZ(rSml*1.34, xR + 0.0275, 22, y, zR);
    g.add(new THREE.LineSegments(KL.build().geometry, MAT.lineSoft));

    /* левый конец: колено вниз + короткий патрубок с раструбом
       (открытый, в отличие от глухого правого) */
    g.add(createElbow(xL, y, z, rBig, true));
    g.add(createPipe(xL, y, z, xL, y - 0.26, z, 0.09, true));
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.09, 0.12, 16, 1, true), MAT.rust);
    bell.position.set(xL, y - 0.32, z); g.add(bell);
    const BL = new LineBag();
    BL.ring(0.145, y - 0.26, 22, xL, z); BL.ring(0.09, y - 0.38, 18, xL, z);
    g.add(new THREE.LineSegments(BL.build().geometry, MAT.lineSoft));

    /* один стояк вверх под диск — только слева, не парой */
    g.add(createPipe(-1.28, y, z, -1.28, y + 0.40, z, 0.075, true));
    g.add(createFlange(-1.28, y + 0.40, z, 0.075));
    /* тройник-сброс вниз на тонкой ветке (справа от муфты) */
    g.add(createPipe(0.36, y, z, 0.36, y - 0.22, z, 0.05, true));
    g.add(createFlange(0.36, y - 0.22, z, 0.05));
    /* вентиль на толстой магистрали, ближе к левому концу */
    const v = createValve(0.62);
    v.position.set(-0.78, y + 0.30, z);
    g.add(v);
    g.add(createPipe(-0.78, y, z, -0.78, y + 0.16, z, 0.05));
    return g;
  }
  /* маховичок-клапан: кольцо + спицы + ступица (вертикально) */
  function createValve(scale){
    const g = new THREE.Group();
    const R = 0.30, tube = 0.045;
    g.add(new THREE.Mesh(new THREE.TorusGeometry(R, tube, 8, 30), MAT.deep));
    const L = new LineBag();
    L.ringXY(R+tube, 0, 40); L.ringXY(R-tube, 0, 40);
    const sp = new THREE.BoxGeometry(R*1.94, 0.05, 0.05);
    for(let i=0;i<4;i++){
      const m = new THREE.Mesh(sp, MAT.deep); m.rotation.z = i*Math.PI/4; g.add(m);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.16,14), MAT.deep);
    hub.rotation.x = Math.PI/2; g.add(hub);
    L.ringXY(0.085, 0.08, 16); L.ringXY(0.085, -0.08, 16);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    if(scale) g.scale.setScalar(scale);
    return g;
  }

  /* =========================================================
     Выхлопная труба: стимпанковская дымовая труба на заднем плане.
     Ствол с уступом, клёпаные пояса, косой раструб сверху, копоть.
     Верх уходит за кадр (noFit) — как и вал, продолжает механизм
     за пределы страницы. Из неё идёт дым в «сломанном» режиме.
     ========================================================= */
  const STACK = { x:-2.28, z:-3.05, y0:-0.62, y1:2.05, top:7.4 };
  function createExhaust(){
    const g = new THREE.Group();
    const S = STACK, L = new LineBag();
    const rLo = 0.20, rHi = 0.152;
    /* нижняя, толстая секция + верхняя, тонкая: уступ по диаметру */
    const yStep = S.y0 + 1.16;
    const lo = new THREE.Mesh(
      new THREE.CylinderGeometry(rLo, rLo*1.06, yStep - S.y0, 18, 1, true), MAT.rust);
    lo.position.set(S.x, (S.y0 + yStep)/2, S.z); g.add(lo);
    const hi = new THREE.Mesh(
      new THREE.CylinderGeometry(rHi, rLo, S.y1 - yStep, 18, 1, true), MAT.rust);
    hi.position.set(S.x, (yStep + S.y1)/2, S.z); g.add(hi);
    L.ring(rLo*1.06, S.y0, 26, S.x, S.z);
    L.ring(rLo,      yStep, 26, S.x, S.z);
    L.seams(rLo, S.y0, yStep, 2, S.x, S.z, 0.7);
    L.seams(rHi, yStep, S.y1, 2, S.x, S.z, 0.7);
    /* клёпаные пояса: кольцо + точки-заклёпки по нему */
    [S.y0+0.30, yStep-0.12, yStep+0.42, S.y1-0.20].forEach((y, i)=>{
      const r = y < yStep ? rLo : rHi;
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(r*1.13, r*1.13, 0.075, 18), MAT.deep);
      band.position.set(S.x, y, S.z); g.add(band);
      L.ring(r*1.13, y+0.038, 24, S.x, S.z);
      L.ring(r*1.13, y-0.038, 24, S.x, S.z);
      for(let k=0;k<7;k++){
        const a = 0.4 + i*0.3 + k/7*Math.PI*2;
        L.ringYZ(0.016, S.x + r*1.14*Math.cos(a), 6, y, S.z + r*1.14*Math.sin(a));
      }
    });
    /* Косой раструб и продолжение за кадр — ОДНА наклонённая группа.
       Ось наклона стоит ровно на верхнем срезе ствола, поэтому раструб
       садится на трубу без ступеньки, а секция над ним — точно на
       раструб.
       Раньше раструб и верхняя секция поворачивались каждая вокруг
       своего центра: у секции высотой 5.05 низ уезжал в сторону на
       0.33 — больше её собственного радиуса 0.25, — и труба сверху
       выглядела разорванной. Пояса при этом сдвигались по линейной
       прикидке (y-S.y1)*0.13, а швы не сдвигались вовсе: три детали
       ехали по трём разным законам. */
    L.ring(rHi, S.y1, 22, S.x, S.z);           // стык ствола и раструба
    const lean = new THREE.Group();
    lean.position.set(S.x, S.y1, S.z);
    lean.rotation.z = 0.13;
    g.add(lean);
    const LL = new LineBag();                  // линии внутри наклона
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(rHi*1.62, rHi, 0.30, 18, 1, true), MAT.rust);
    bell.position.y = 0.15; lean.add(bell);
    LL.ring(rHi*1.62, 0.30, 22);               // срез раструба
    lean.add(new THREE.LineSegments(LL.build().geometry, MAT.lineSoft));
    /* фундамент: плита + два подкоса к земле */
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.40, 0.10, 20), MAT.deep);
    base.position.set(S.x, S.y0 - 0.05, S.z); g.add(base);
    L.ring(0.34, S.y0, 26, S.x, S.z); L.ring(0.40, S.y0 - 0.10, 26, S.x, S.z);
    [[0.46, 0.10], [-0.30, -0.42]].forEach(o=>{
      g.add(createPipe(S.x, S.y0 + 0.62, S.z, S.x + o[0], S.y0 - 0.04, S.z + o[1], 0.032));
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));

    /* продолжение за кадр — соосно раструбу, в той же группе наклона,
       поэтому координаты локальные: 0 = верхний срез ствола */
    const upH = S.top - S.y1 - 0.30;
    const up = new THREE.Mesh(
      new THREE.CylinderGeometry(rHi*1.62, rHi*1.62, upH, 18, 1, true), MAT.rust);
    up.position.y = 0.30 + upH/2;
    up.userData.noFit = true; lean.add(up);
    const UL = new LineBag();
    UL.seams(rHi*1.62, 0.30, S.top - S.y1, 2, 0, 0, 0.7);
    [0.78, 1.66].forEach(y=>{
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(rHi*1.78, rHi*1.78, 0.07, 18), MAT.deep);
      band.position.y = y;
      band.userData.noFit = true; lean.add(band);
      UL.ring(rHi*1.78, y+0.035, 22);
      UL.ring(rHi*1.78, y-0.035, 22);
    });
    const uln = new THREE.LineSegments(UL.build().geometry, MAT.lineSoft);
    uln.userData.noFit = true; lean.add(uln);
    return g;
  }

  /* манометр: круглый циферблат + риски + стрелка */
  function createGauge(){
    const g = new THREE.Group();
    const R = 0.26;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R*0.92, 0.10, 26), MAT.deep);
    body.rotation.x = Math.PI/2; g.add(body);
    const L = new LineBag();
    L.ringXY(R, -0.05, 40); L.ringXY(R*0.84, -0.052, 36);
    for(let i=0;i<9;i++){
      const a = Math.PI*1.28 - i*(Math.PI*1.56/8);
      L.seg(R*0.62*Math.cos(a), R*0.62*Math.sin(a), -0.055,
            R*0.78*Math.cos(a), R*0.78*Math.sin(a), -0.055);
    }
    const na = Math.PI*0.62;
    L.seg(0, 0, -0.056, R*0.66*Math.cos(na), R*0.66*Math.sin(na), -0.056);
    L.ringXY(0.03, -0.056, 12);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));
    return g;
  }
  /* =========================================================
     Деревянная стрелка: массивный корпус + стреловидный
     наконечник, реальная толщина, металлическая скоба, болты.
     Указывает наружу по локальной оси +X.
     ========================================================= */
  /* Контур центрирован по локальному нулю: стойка и вал приходят
     ровно под середину стрелки, а не сбоку от неё. */
  const AR_SH = 0.145, AR_HH = 0.345, AR_D = 0.18;
  const AR_TAIL = -0.56, AR_NECK = 0.14, AR_TIP = 0.56;
  /* насколько кронштейны вала разнесены от середины стрелки: по этой
     же точке висит полуотвалившаяся стрелка в пасхалке */
  const RAIL_HALF = 0.43;
  /* Две стрелки НЕ одинаковые: у каждой своё зерно текстуры дерева,
     свой набор гвоздей (число, положение, размер) и своя скоба.
     Габарит и силуэт общие — иначе кнопки перестали бы читаться
     как пара, — а вся мелочь на них разная. */
  const AR_VAR = [
    /* «правая»: две скобы, пять гвоздей парами, волокно крупное */
    { texOff:[0.13, 0.41], texRep:[0.62, 1.90], texRot:0,
      band:[-0.34,-0.20], blkW:0.30, blkX:0,
      nails:[[-0.25,0.064,0.032],[-0.25,-0.064,0.030],
             [-0.47,0.058,0.028],[-0.47,-0.070,0.034],
             [ 0.06,0.000,0.026]] },
    /* «левая»: одна скоба, четыре гвоздя вразнобой, волокно плотнее
       и косое, ползун шире и сдвинут, у гвоздя — трещина */
    { texOff:[0.57, 0.08], texRep:[0.74, 1.55], texRot:0.06,
      band:[-0.26], blkW:0.34, blkX:-0.03,
      nails:[[-0.34,0.070,0.034],[-0.34,-0.052,0.027],
             [-0.10,0.086,0.029],[-0.50,0.004,0.031]],
      crack:[-0.10, 0.086, 0.02, 0.128] }
  ];
  function createArrow(vi){
    const V = AR_VAR[vi % AR_VAR.length];
    const g = new THREE.Group();
    const sh = AR_SH, hh = AR_HH, d = AR_D;
    const xTail = AR_TAIL, xNeck = AR_NECK, xTip = AR_TIP;
    const pts = [
      [xTail,-sh], [xNeck,-sh], [xNeck,-hh], [xTip,0], [xNeck,hh], [xNeck,sh], [xTail,sh]
    ];
    const shape = new THREE.Shape(pts.map(p=> new THREE.Vector2(p[0],p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth:d, bevelEnabled:false, steps:1 });
    geo.translate(0, 0, -d/2);
    /* своя текстура: другой сдвиг/масштаб/поворот волокон — на одной
       стрелке волокно плотнее и идёт чуть косо */
    const tex = MAT.woodTex.clone(); tex.needsUpdate = true;
    tex.repeat.set(V.texRep[0], V.texRep[1]);
    tex.offset.set(V.texOff[0], V.texOff[1]);
    if(V.texRot){ tex.center.set(0.5, 0.5); tex.rotation = V.texRot; }
    const mat = new THREE.MeshLambertMaterial({ color:WOOD, map:tex });
    g.add(new THREE.Mesh(geo, mat));

    const L = new LineBag();
    L.loopXY(pts, d/2); L.loopXY(pts, -d/2);
    pts.forEach(p=> L.seg(p[0], p[1], -d/2, p[0], p[1], d/2));
    V.band.forEach(x=>{                              // металлическая скоба
      L.seg(x,-sh, d/2+0.001, x, sh, d/2+0.001);
      L.seg(x,-sh,-d/2-0.001, x, sh,-d/2-0.001);
      L.seg(x, sh, -d/2, x, sh, d/2); L.seg(x,-sh, -d/2, x,-sh, d/2);
    });
    V.nails.forEach(b=> L.ringXY(b[2], d/2+0.003, 10, b[0], b[1]));
    /* трещина от одного из гвоздей — только у второй стрелки */
    if(V.crack) L.seg(V.crack[0], V.crack[1], d/2+0.004,
                      V.crack[2], V.crack[3], d/2+0.004);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    /* ---- ползун: стрелка сидит на скользящем блоке, блок ходит
       по направляющему валу. Блок и вал двигаются вместе со
       стрелкой, вал остаётся в кронштейнах (см. buildScene). ---- */
    const blk = new THREE.Mesh(new THREE.BoxGeometry(V.blkW, 0.15, 0.26), MAT.spoke);
    blk.position.set(V.blkX, -sh - 0.075, 0);
    g.add(blk);
    const blkE = new THREE.LineSegments(new THREE.EdgesGeometry(blk.geometry), MAT.line);
    blkE.position.copy(blk.position); g.add(blkE);
    /* штифт, которым блок притянут к телу стрелки */
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.10, 8), MAT.bolt);
    pin.position.set(V.blkX, -sh - 0.01, 0); g.add(pin);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(xTip-xTail+0.18, hh*2+0.30, d+0.20),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false })
    );
    hit.position.set((xTail+xTip)/2, -0.06, 0);
    hit.userData.noFit = true;      // невидимая мишень райкаста: не кадрируем по ней
    g.add(hit);
    return { group:g, hit, mat };
  }
  /* =========================================================
     Таблички вкладок — ЧЕТЫРЕ, прямо на ободе шестерни.
     Стоят наклонно (как пюпитр), крутятся вместе с диском.
     Активная залита чернилами, остальные — светлые.
     Клик по табличке = переход на вкладку.
     ========================================================= */
  const PL_W = 0.92, PL_H = 0.30, PL_R = 0.07, PL_D = 0.055;
  const PLATE_R = 1.37;                    // радиус посадки на диске
  const PLATE_LEAN = 52 * Math.PI/180;     // наклон от вертикали
  function plateShape(){
    const w = PL_W/2, h = PL_H/2, r = PL_R;
    const s = new THREE.Shape();
    s.moveTo(-w+r, -h);
    s.lineTo(w-r, -h);  s.absarc(w-r, -h+r, r, -Math.PI/2, 0, false);
    s.lineTo(w, h-r);   s.absarc(w-r,  h-r, r, 0, Math.PI/2, false);
    s.lineTo(-w+r, h);  s.absarc(-w+r, h-r, r, Math.PI/2, Math.PI, false);
    s.lineTo(-w, -h+r); s.absarc(-w+r,-h+r, r, Math.PI, Math.PI*1.5, false);
    return s;
  }
  /* одна табличка: корпус + болты + холст под текст */
  function createGearPlate(){
    const g = new THREE.Group();
    const w = PL_W/2, h = PL_H/2, r = PL_R;
    const s = plateShape();
    const geo = new THREE.ExtrudeGeometry(s, { depth:PL_D, bevelEnabled:false, steps:1, curveSegments:8 });
    geo.translate(0, 0, -PL_D/2);
    g.add(new THREE.Mesh(geo, MAT.hub));

    const outline = s.getPoints(8).map(p=> [p.x, p.y]);
    const L = new LineBag();
    L.loopXY(outline, PL_D/2); L.loopXY(outline, -PL_D/2);
    const k = r*0.7071;
    [[w-r+k,h-r+k],[-(w-r)-k,h-r+k],[w-r+k,-(h-r)-k],[-(w-r)-k,-(h-r)-k]].forEach(c=>{
      L.seg(c[0], c[1], -PL_D/2, c[0], c[1], PL_D/2);
    });
    const bg = new THREE.CylinderGeometry(0.022, 0.022, 0.036, 8);
    [[w-0.075,h-0.075],[-(w-0.075),h-0.075],[w-0.075,-(h-0.075)],[-(w-0.075),-(h-0.075)]].forEach(b=>{
      const m = new THREE.Mesh(bg, MAT.bolt);
      m.rotation.x = Math.PI/2; m.position.set(b[0], b[1], PL_D/2+0.014);
      g.add(m);
      L.ringXY(0.022, PL_D/2+0.033, 8, b[0], b[1]);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    /* холст только под надпись: фон — бумага самого корпуса */
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 168;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(PL_W-0.09, PL_H-0.07),
      new THREE.MeshBasicMaterial({ map:tex, transparent:true, depthWrite:false })
    );
    face.position.z = PL_D/2 + 0.004; face.renderOrder = 2;
    g.add(face);

    /* кронштейн: две ножки от диска к нижней кромке таблички */
    const legGeo = new THREE.BoxGeometry(0.05, 0.20, 0.05);
    const legEdg = new THREE.EdgesGeometry(legGeo);
    [-w+0.14, w-0.14].forEach(x=>{
      const leg = new THREE.Mesh(legGeo, MAT.spoke);
      leg.position.set(x, -h-0.09, 0);
      g.add(leg);
      const e = new THREE.LineSegments(legEdg, MAT.line);
      e.position.copy(leg.position); g.add(e);
    });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(PL_W+0.10, PL_H+0.10, PL_D+0.16),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false })
    );
    hit.userData.noFit = true;
    g.add(hit);
    return { group:g, hit, cv, ctx, tex };
  }
  /* Лицо таблички: только надпись чернилами по бумаге корпуса —
     фон НЕ заливаем. Активная и так стоит лицом к зрителю, а
     чёрная плашка под текстом выглядела кляксой. Отличие активной —
     подчерк под надписью, того же цвета. */
  function drawPlateFace(p, text, active){
    const ctx = p.ctx, W = p.cv.width, H = p.cv.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#161413';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 96;
    const font = (n)=> '700 '+n+'px "Space Grotesk", system-ui, sans-serif';
    ctx.font = font(size);
    let wide = ctx.measureText(text).width;
    if(wide > W-52){ size = Math.floor(size*(W-52)/wide); ctx.font = font(size); wide = ctx.measureText(text).width; }
    const y = H/2 - (active ? 6 : 0);
    ctx.fillText(text, W/2, y + 3);
    if(active){
      const half = Math.min(wide, W-52)/2 + 6;
      ctx.fillRect(W/2 - half, y + size*0.46, half*2, 7);
    }
    p.tex.needsUpdate = true;
    dirty = true;
  }
  /* кольцо из 4 табличек на ободе — дети MainGearGroup */
  function buildPlateRing(parent){
    plates = [];
    for(let i=0;i<4;i++){
      const p = createGearPlate();
      /* Табличка i стоит на -i·90°: шаг вперёд крутит диск ВПРАВО
         (+90°), и как раз следующая табличка доезжает на фронт.
         При +i·90° вперёд выводило бы предыдущую. */
      const a = -i*Math.PI/2;             // 0° = фронт (к камере)
      /* внешняя группа разворачивает табличку по радиусу,
         внутренняя — наклоняет её назад, как пюпитр */
      const yaw = new THREE.Group();
      yaw.position.set(PLATE_R*Math.sin(a), THICK/2, PLATE_R*Math.cos(a));
      yaw.rotation.y = a;
      const lean = new THREE.Group();
      lean.rotation.x = -PLATE_LEAN;
      lean.position.y = 0.09 + (PL_H/2)*Math.cos(PLATE_LEAN);
      lean.add(p.group);
      yaw.add(lean);
      parent.add(yaw);
      plates.push({ index:i, group:p.group, hit:p.hit, ctx:p.ctx, cv:p.cv, tex:p.tex,
                    yaw, lean, text:'', active:false });
    }
  }
  /* API: подписать все таблички и отметить активную */
  function setLabels(list, activeIndex){
    if(!plates.length) return;
    for(let i=0;i<plates.length;i++){
      const p = plates[i];
      p.text = (list && list[i] != null) ? String(list[i]) : '';
      p.active = (i === activeIndex);
      drawPlateFace(p, p.text, p.active);
    }
    labelText = (list && list[activeIndex] != null) ? String(list[activeIndex]) : '';
  }
  /* совместимость: подписать только активную табличку */
  function setLabel(text){
    const i = plates.findIndex(p=> p.active);
    if(i < 0) return;
    plates[i].text = text; labelText = text;
    drawPlateFace(plates[i], text, true);
  }
  /* =========================================================
     Сборка сцены
     ========================================================= */
  function buildScene(){
    mech = new THREE.Group(); scene.add(mech);

    mainGear = buildMainGear();
    mainGear.name = 'MainGearGroup';
    mech.add(mainGear);

    /* вторичные шестерни: две под диском (видны через окна между
       спицами) + одна позади ступицы. Соседние крутятся встречно. */
    const under = [
      { t:11, r:0.60, x: 0.95, z: 0.36, k:-1 },
      { t:13, r:0.70, x:-0.88, z:-0.42, k: 1 }
    ];
    under.forEach(u=>{
      const gr = createSmallGear(u.t, u.r, 0.28, true);
      gr.position.set(u.x, -0.47, u.z);
      mech.add(gr);
      secondary.push({ group:gr, ratio:u.k*(TEETH/u.t), teeth:u.t });
      const ax = createPipe(u.x, -1.02, u.z, u.x, -0.47, u.z, 0.065);
      mech.add(ax);
    });

    const back = createSmallGear(14, 0.78, 0.28, true, MAT.gearBack);
    back.position.set(0, 0.30, -2.60);
    mech.add(back);
    secondary.push({ group:back, ratio:-(TEETH/14), teeth:14 });
    mech.add(createPipe(0, -0.42, -2.60, 0, 0.30, -2.60, 0.08));

    /* задний план: труба с коленами, маховичок слева, манометр справа.
       Держим низко — выглядывают из-за обода, не спорят с шестерней. */
    const zP = -2.42, yP = -0.06, xP = 1.58;
    mech.add(createPipe(-xP, yP, zP, xP, yP, zP, 0.105));
    [-xP, xP].forEach(x=>{
      mech.add(createElbow(x, yP, zP, 0.105));
      mech.add(createPipe(x, yP, zP, x, yP+0.30, zP, 0.09));
    });
    /* маховик слева: он приводится от главного диска, поэтому
       крутится вместе с ним при смене вкладки. Передача понижающая
       (ratio<1) и встречная — колесо идёт медленнее и в другую
       сторону, так видно, что это привод, а не копия шестерни. */
    const valve = createValve(0.78); valve.position.set(-xP, yP+0.53, zP); mech.add(valve);
    spinners.push({ obj:valve, ratio:-0.42, axis:'z' });
    const gauge = createGauge();     gauge.scale.setScalar(0.82);
    gauge.position.set(xP, yP+0.50, zP-0.02); mech.add(gauge);

    /* выхлопная труба — сзади слева, за маховиком */
    mech.add(createExhaust());

    /* трубы под диском (спереди-снизу, видны из-под обода) */
    mech.add(createUnderPipes());

    /* деревянные стрелки — передний план, слева и справа.
       Каждая сидит на ползуне и ходит по направляющему валу;
       вал держат два кронштейна на стойках. Это делает стрелку
       физически подключённой к механизму, а не висящей рядом. */
    const AX = 2.72, AY = 0.10, AZ = 0.34;
    const RAIL_Y = AY - AR_SH - 0.075;        // ось вала = центр ползуна
    [{ dir:-1, vi:1 }, { dir:1, vi:0 }].forEach(cfg=>{
      const s = cfg.dir;                       // +1 справа, -1 слева
      const a = createArrow(cfg.vi);           // у каждой стрелки свой вариант
      a.group.position.set(s*AX, AY, AZ);
      a.group.rotation.set(-0.06, 0, 0);
      const flip = s < 0;
      if(flip) a.group.scale.x = -1;           // стрелка смотрит наружу
      mech.add(a.group);

      /* направляющий вал с двумя кронштейнами. Кронштейны стоят
         СИММЕТРИЧНО относительно центра стрелки — иначе стрелка
         читается «съехавшей со своего столба». Свес наружу держим
         минимальным: он задаёт габарит кадра и мельчит диск. */
      const xOut = s*(AX + RAIL_HALF), xIn = s*(AX - RAIL_HALF);
      mech.add(createPipe(xOut, RAIL_Y, AZ, xIn, RAIL_Y, AZ, 0.036));

      /* два кронштейна-стойки: труба вниз + опорная пятка */
      [xOut, xIn].forEach((bx, i)=>{
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.30, 0.13), MAT.spoke);
        post.position.set(bx, RAIL_Y - 0.19, AZ);
        mech.add(post);
        const pe = new THREE.LineSegments(new THREE.EdgesGeometry(post.geometry), MAT.line);
        pe.position.copy(post.position); mech.add(pe);
        /* нога до пятки + пятка */
        mech.add(createPipe(bx, -0.66, AZ, bx, RAIL_Y - 0.32, AZ, 0.075));
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.085, 18), MAT.deep);
        pad.position.set(bx, -0.70, AZ); mech.add(pad);
        const PL = new LineBag();
        PL.ring(0.17, -0.658, 24, bx, AZ); PL.ring(0.21, -0.742, 24, bx, AZ);
        mech.add(new THREE.LineSegments(PL.build().geometry, MAT.lineSoft));
        /* хомут, которым вал прижат к стойке */
        const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 12), MAT.bolt);
        cl.rotation.z = Math.PI/2; cl.position.set(bx, RAIL_Y, AZ); mech.add(cl);
      });

      /* тяга от хвоста стрелки к ободу: короткий шток с фланцем —
         намёк, что стрелка толкает механизм. Хвост из-за flip всегда
         обращён к центру, поэтому в мире это AX - |AR_TAIL|. */
      const xTailW = s*(AX + AR_TAIL);
      mech.add(createPipe(xTailW, AY - 0.02, AZ, s*2.06, AY - 0.06, AZ*0.72, 0.032));
      mech.add(createFlange(s*2.06, AY - 0.06, AZ*0.72, 0.032));

      arrows.push({
        group:a.group, hit:a.hit, mat:a.mat, dir:s, flip,
        home:a.group.position.clone(),
        inward:new THREE.Vector3(-s, 0, 0),
        hover:false, press:false, tH:0, tP:0
      });
    });
  }

  function setupLighting(){
    scene.add(new THREE.AmbientLight(0xffffff, 0.74));
    const key = new THREE.DirectionalLight(0xffffff, 0.42);
    key.position.set(-3.4, 6.2, 4.0); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.14);
    fill.position.set(3.0, -1.4, -3.2); scene.add(fill);
  }

  function setupCamera(w, h){
    camera = new THREE.PerspectiveCamera(42, w/h, 0.1, 60);
    placeCamera();
  }
  /* =========================================================
     Вписывание в контейнер: проекцией контрольных точек в NDC.
     Модель не обрезается ни на десктопе, ни на телефоне.
     ========================================================= */
  /* Пробы строятся ИЗ САМОЙ ГЕОМЕТРИИ, а не списком вручную: любая
     новая деталь попадает во вписывание сама. Из всех вершин берём
     силуэт — по одной самой далёкой точке на угловой сектор в
     экранной плоскости, — так набор остаётся маленьким (≈сотни точек)
     и fit() гоняет его 12 раз за ресайз без затрат.
     Диск крутится, поэтому вершины главной шестерни считаем на всех
     четырёх положениях: габарит не должен «дышать» при переключении. */
  const PROBE_BINS = 240;
  function buildProbes(){
    scene.updateMatrixWorld(true);
    const dir = new THREE.Vector3(0, Math.sin(CAM_EL), Math.cos(CAM_EL)).normalize();
    const up  = new THREE.Vector3(0,1,0);
    const ex  = new THREE.Vector3().crossVectors(up, dir).normalize();   // экранный X
    const ey  = new THREE.Vector3().crossVectors(dir, ex).normalize();   // экранный Y
    const raw = [];
    const v = new THREE.Vector3();
    const collect = ()=>{
      mech.updateMatrixWorld(true);
      mech.traverse(o=>{
        if(o.userData.noFit || o.visible === false) return;
        /* мишени райкаста прозрачны и крупнее самой детали — кадрировать
           по ним нельзя, иначе камера отъезжает «в никуда». */
        const m = o.material;
        if(m && !Array.isArray(m) && m.transparent && m.opacity === 0) return;
        const g = o.geometry, pos = g && g.attributes && g.attributes.position;
        if(!pos || !(o.isMesh || o.isLineSegments || o.isLine)) return;
        if(o.isInstancedMesh) return;     // болты всегда внутри обода
        const step = Math.max(1, Math.floor(pos.count/600));
        for(let i=0;i<pos.count;i+=step){
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          raw.push(mech.worldToLocal(v.clone()));
        }
      });
    };
    const keep = mainGear.rotation.y;
    for(let q=0;q<4;q++){ mainGear.rotation.y = keep + q*Math.PI/2; collect(); }
    mainGear.rotation.y = keep; mech.updateMatrixWorld(true);

    /* силуэт: делим экранную плоскость на сектора и в каждом оставляем
       самую удалённую от центра точку — этого достаточно, чтобы
       ограничить проекцию с любой стороны. */
    const bins = new Array(PROBE_BINS).fill(null);
    let sx = 0, sy = 0;
    const px = [], py = [];
    for(let i=0;i<raw.length;i++){
      px.push(raw[i].dot(ex)); py.push(raw[i].dot(ey));
      sx += px[i]; sy += py[i];
    }
    sx /= raw.length || 1; sy /= raw.length || 1;
    for(let i=0;i<raw.length;i++){
      const dx = px[i]-sx, dy = py[i]-sy;
      const r2 = dx*dx + dy*dy;
      let b = Math.floor((Math.atan2(dy,dx)+Math.PI)/(2*Math.PI)*PROBE_BINS);
      if(b < 0) b = 0; if(b >= PROBE_BINS) b = PROBE_BINS-1;
      if(!bins[b] || r2 > bins[b].r2) bins[b] = { r2, p:raw[i] };
    }
    probes = bins.filter(Boolean).map(b=>b.p);
    /* Запас над раструбом выхлопа.
       Вписывание прижимает силуэт к кромке: самой верхней точкой был
       срез раструба, поэтому труба упиралась в край кадра и её не было
       видно целиком. Укорачивать ствол бессмысленно — силуэт
       становится ниже, камера подъезжает, и раструб снова у кромки.
       Поэтому добавляем невидимую точку ВЫШЕ раструба: габарит
       вырастает, камера отходит, и над трубой появляется поле. */
    probes.push(new THREE.Vector3(STACK.x, STACK.y1 + 0.30 + STACK_HEAD, STACK.z));
  }
  /* насколько поля просить над срезом раструба, в мировых единицах */
  const STACK_HEAD = 0.62;
  /* Вписывание = подбор ДИСТАНЦИИ камеры + вертикальное
     центрирование модели (а не масштаба модели): перспектива
     остаётся естественной на любом экране, кадр заполняется. */
  /* Кадрируем по габариту всего механизма (диск + стрелки). При этих
     значениях сам диск занимает ~68% ширины кадра — он остаётся героем
     композиции, но стрелки и декор не режутся по краям. */
  const FIT_X = 0.86, FIT_Y = 0.88;
  function fit(){
    if(!renderer || !host) return;
    const w = host.clientWidth || 620, h = host.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
    const v = new THREE.Vector3();
    const measure = ()=>{
      placeCamera(); mech.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for(let i=0;i<probes.length;i++){
        v.copy(probes[i]).add(mech.position).project(camera);
        if(v.x<x0) x0=v.x; if(v.x>x1) x1=v.x;
        if(v.y<y0) y0=v.y; if(v.y>y1) y1=v.y;
      }
      return { x0,x1,y0,y1 };
    };
    /* Чувствительность «сдвиг модели по миру Y → сдвиг картинки по Y»
       считаем численно: две проекции вместо тригонометрии, поэтому
       не зависит от угла камеры и параллакса и не может разойтись.
       (Раньше здесь делилось на camDir.y = sin(угла) вместо косинуса
       экранной вертикали — коэффициент выходил вдвое больше нужного и
       центрирование расходилось, уводя модель вниз.) */
    const dYdWorld = ()=>{
      const a = new THREE.Vector3(0, 0, 0).add(mech.position).project(camera).y;
      const b = new THREE.Vector3(0, 1, 0).add(mech.position).project(camera).y;
      return (b - a) || 1;
    };
    let m = measure();
    for(let it=0; it<24; it++){
      /* 1) центрируем по вертикали, сдвигая механизм */
      const cy = (m.y0+m.y1)/2;
      mech.position.y -= cy / dYdWorld();
      /* 2) подгоняем дистанцию под габарит */
      const k = Math.max((m.x1-m.x0)/2/FIT_X, (m.y1-m.y0)/2/FIT_Y);
      camDist = clamp(camDist*k, 3.8, 18);
      m = measure();
      if(Math.abs(k-1) < 0.002 && Math.abs(cy) < 0.003) break;
    }
    /* Страховка: центрирование задемпфировано (×0.85) и на последней
       итерации может не догнать габарит. Если что-то всё-таки вылезло
       за кадр — отодвигаем камеру ровно на столько, сколько нужно. */
    for(let it=0; it<8; it++){
      const over = Math.max(Math.abs(m.x0), Math.abs(m.x1))/FIT_X,
            ovy  = Math.max(Math.abs(m.y0), Math.abs(m.y1))/FIT_Y;
      const o = Math.max(over, ovy);
      if(o <= 1.0) break;
      camDist = clamp(camDist*o, 3.8, 18);
      m = measure();
    }
    placeCamera(); mech.updateMatrixWorld(true);
    camNX = camNY = 0;
    dirty = true;
  }

  /* =========================================================
     Анимация: тяжёлый маховик — разгон, проход, торможение
     ========================================================= */
  function easeHeavy(t){
    if(t <= 0) return 0;
    if(t >= 1) return 1;
    const e = easeInOutCubic(t);
    return reduced ? e : e + 0.018*Math.sin(Math.PI*t)*Math.cos(Math.PI*t*3);
  }
  let colWood = null, colHot = null;   // «дерево»: покой / под курсором (темнее, в красный)

  function tick(now){
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min((now - lastT)/1000, 0.05) : 0.016;
    lastT = now;
    let busy = false;

    if(animT < 1){
      animT = Math.min(1, animT + dt*1000/animDur);
      angle = animFrom + (animTo - animFrom)*easeHeavy(animT);
      mainGear.rotation.y = angle;
      for(let i=0;i<secondary.length;i++)
        secondary[i].group.rotation.y = angle*secondary[i].ratio;
      /* маховик и прочие ведомые детали: своя ось, своё передаточное */
      for(let i=0;i<spinners.length;i++){
        const s = spinners[i];
        s.obj.rotation[s.axis || 'z'] = angle*s.ratio;
      }
      busy = true;
    }

    const tx = reduced ? 0 : mouseNX, ty = reduced ? 0 : mouseNY;
    const dX = tx - camNX, dY = ty - camNY;
    if(Math.abs(dX) > 0.0015 || Math.abs(dY) > 0.0015){
      /* хвост экспоненты доводим до конца одним шагом: иначе после
         ухода курсора сцена ещё ~1.4 с рисует кадры на разнице,
         которой уже не видно, а в простое она должна стоять. */
      const near = Math.abs(dX) < 0.006 && Math.abs(dY) < 0.006;
      camNX = near ? tx : lerp(camNX, tx, 0.055);
      camNY = near ? ty : lerp(camNY, ty, 0.055);
      camera.position.set(camBase.x + camNX*0.50, camBase.y - camNY*0.26, camBase.z);
      camera.lookAt(camAt.x, camAt.y, camAt.z);
      busy = true;
    }

    /* пасхалка: падение стрелок + дым */
    if(broke || puffs.length || smokeT > 0){
      if(stepBreak(now, dt)) busy = true;
    }

    /* пока стрелки сломаны, hover/press к ним не применяем: они не кнопки */
    for(let i=0;i<arrows.length && !broke;i++){
      const a = arrows[i], hT = a.hover?1:0, pT = a.press?1:0;
      if(Math.abs(a.tH-hT) > 0.002 || Math.abs(a.tP-pT) > 0.002){
        a.tH = lerp(a.tH, hT, 0.16); a.tP = lerp(a.tP, pT, 0.28);
        const sc = 1 + a.tH*0.055;
        a.group.scale.set(a.flip ? -sc : sc, sc, sc);
        a.group.position.copy(a.home).addScaledVector(a.inward, a.tP*0.10 + a.tH*0.025);
        /* hover тянет цвет в тёмно-красный, нажатие добивает ещё темнее */
        a.mat.color.copy(colWood).lerp(colHot, clamp(a.tH,0,1))
                   .multiplyScalar(1 - 0.20*clamp(a.tP,0,1));
        busy = true;
      }
    }

    /* таблички: под курсором чуть приподнимаются вдоль своей нормали */
    for(let i=0;i<plates.length;i++){
      const p = plates[i], hT = p.hover?1:0;
      if(p.tH === undefined) p.tH = 0;
      if(Math.abs(p.tH-hT) > 0.002){
        p.tH = lerp(p.tH, hT, 0.18);
        p.group.position.z = p.tH*0.05;
        const sc = 1 + p.tH*0.05;
        p.group.scale.set(sc, sc, 1);
        busy = true;
      }
    }

    if(dirty || busy){ renderer.render(scene, camera); dirty = false; }
  }

  /* =========================================================
     ПАСХАЛКА: если долбить по стрелкам слишком часто, механизм не
     выдерживает. Та стрелка, по которой стучали последней, срывается
     с ползуна и падает на землю; вторая обрывается наполовину —
     висит на уцелевшем креплении и качается затухающим маятником.
     Из выхлопной трубы и патрубков идёт дым.

     Считаем именно НАЖАТИЯ (pointerdown по стрелке), не скролл и не
     клавиши: пасхалка — награда за долбёжку по кнопке, а прокрутка
     колесом к ней отношения не имеет.
     Через RECOVER_MS всё собирается обратно: иначе один раз найденная
     пасхалка навсегда убирала бы кнопки со страницы.
     ========================================================= */
  const RAGE_N = 7;            // столько нажатий
  const RAGE_MS = 2600;        // за столько миллисекунд
  const FALL_MS = 900;         // падение
  const WOBBLE_MS = 4200;      // качание полуупавшей
  const RECOVER_MS = 6400;     // когда собрать обратно
  const REASM_MS = 620;        // сборка
  const GROUND_Y = -0.78;      // уровень пятки стоек
  /* Провис полуотвалившейся: 0.78 рад ≈ 45°, нос опускается почти до
     земли. HALF_MAX — упор: глубже нос уходит под землю, поэтому
     качание к нему прижимается, а не пробивает грунт. */
  const HALF_TILT = 0.78, HALF_MAX = 0.86;
  let clicks = [];             // метки времени нажатий
  let broke = null;            // состояние пасхалки
  let puffs = [];              // активные клубы дыма
  let smokeT = 0;              // сколько ещё коптить, мс

  function noteClick(a){
    if(broke || reduced) return false;
    const now = performance.now();
    clicks.push({ t:now, a });
    while(clicks.length && now - clicks[0].t > RAGE_MS) clicks.shift();
    if(clicks.length < RAGE_N) return false;
    startBreak(a);
    clicks = [];
    return true;
  }

  /* Полуотвалившаяся стрелка висит на ВНУТРЕННЕМ кронштейне — том, что
     ближе к диску: наружный срыв, внутреннее крепление уцелело.
     Шарнир именно там, а НЕ в середине стрелки. Если вращать вокруг
     середины, хвост уходит вверх почти на столько же, на сколько нос
     вниз, и это читается как качели, а не как «сорвалась и повисла».
     Точка задана в локальных координатах группы; у левой стрелки
     scale.x = -1, поэтому в мире шарнир всегда у внутреннего
     кронштейна, без отдельного случая. */
  const HINGE_X = -RAIL_HALF, HINGE_Y = -AR_SH - 0.075;

  /* Держим шарнир на месте: сдвигаем группу так, чтобы точка шарнира
     после поворота осталась там, где была в покое. Матрица группы —
     T·R·S, S = diag(sx,1,1), поэтому для локальной точки p
       T = home + S·p − R·(S·p).
     Раскрытая покомпонентно, эта формула и стоит ниже. */
  function pivotAt(ar, rz){
    const s = Math.sin(rz), c = Math.cos(rz);
    const px = (ar.flip ? -1 : 1) * HINGE_X, py = HINGE_Y;
    ar.group.position.set(
      ar.home.x + px*(1 - c) + py*s,
      ar.home.y + py*(1 - c) - px*s,
      ar.home.z);
    ar.group.rotation.z = rz;
  }

  function startBreak(hitArrow){
    const full = hitArrow || arrows[0];
    const half = arrows[0] === full ? arrows[1] : arrows[0];
    broke = { t0:performance.now(), full, half, done:false, halfRz:0 };
    /* стрелки больше не кнопки: они лежат на земле */
    full.hover = full.press = false;
    half.hover = half.press = false;
    host.classList.remove('is-hot');
    smokeT = 2500;
    dirty = true;
  }

  /* один клуб: спрайт с рисованным контуром, всплывает и растворяется */
  function emit(x, y, z, up, spread){
    if(puffs.length > 46) return;
    const tex = MAT.puffTex[(Math.random()*MAT.puffTex.length)|0];
    const m = new THREE.SpriteMaterial({ map:tex, transparent:true,
                                         opacity:0, depthWrite:false });
    const sp = new THREE.Sprite(m);
    const s0 = 0.20 + Math.random()*0.16;
    sp.scale.set(s0, s0, 1);
    sp.position.set(x + (Math.random()-0.5)*spread, y, z + (Math.random()-0.5)*spread);
    sp.userData.noFit = true;
    mech.add(sp);
    puffs.push({ sp, mat:m, life:0,
                 ttl: 1500 + Math.random()*1300,
                 vy: up*(0.55 + Math.random()*0.5),
                 vx: (Math.random()-0.5)*0.30,
                 vz: (Math.random()-0.5)*0.16,
                 grow: 0.85 + Math.random()*0.85,
                 peak: 0.30 + Math.random()*0.22 });
  }

  /* точки, откуда идёт дым: верх выхлопной трубы и два патрубка */
  function smokeSources(){
    return [
      { x:STACK.x + 0.30, y:STACK.y1 + 0.30, z:STACK.z, up:1.0, spread:0.14 },
      { x:-1.55,          y:-1.32,           z:1.16,    up:0.5, spread:0.10 },
      { x: 0.36,          y:-1.22,           z:1.16,    up:0.4, spread:0.08 }
    ];
  }

  function stepBreak(now, dt){
    let busy = false;

    /* --- дым: пока коптит, подсыпаем новые клубы --- */
    if(smokeT > 0){
      smokeT -= dt*1000;
      const src = smokeSources();
      for(let i=0;i<src.length;i++){
        /* у трубы густо, у патрубков реже */
        const rate = i === 0 ? 26 : 9;
        if(Math.random() < rate*dt) emit(src[i].x, src[i].y, src[i].z, src[i].up, src[i].spread);
      }
      busy = true;
    }
    /* --- живущие клубы --- */
    for(let i=puffs.length-1;i>=0;i--){
      const p = puffs[i];
      p.life += dt*1000;
      const u = p.life/p.ttl;
      if(u >= 1){
        mech.remove(p.sp); p.mat.dispose(); puffs.splice(i,1);
        busy = true; continue;
      }
      p.sp.position.x += p.vx*dt;
      p.sp.position.y += p.vy*dt;
      p.sp.position.z += p.vz*dt;
      p.vy *= 0.995;                       // подъём затухает
      const sc = p.sp.scale.x + p.grow*dt;
      p.sp.scale.set(sc, sc, 1);
      /* быстро проявился, потом медленно растворился */
      p.mat.opacity = p.peak * (u < 0.18 ? u/0.18 : 1 - (u-0.18)/0.82);
      busy = true;
    }

    if(!broke) return busy;
    const el = now - broke.t0;

    /* --- сборка обратно --- */
    if(el > RECOVER_MS){
      const u = clamp((el - RECOVER_MS)/REASM_MS, 0, 1);
      const e = easeInOutCubic(u);
      const F = broke.full, H = broke.half;
      /* упавшая встаёт из положения «лежит» в исходное */
      F.group.position.lerpVectors(broke.restPos, F.home, e);
      F.group.rotation.x = lerp(broke.restRot.x, -0.06, e);
      F.group.rotation.y = lerp(broke.restRot.y, 0, e);
      F.group.rotation.z = lerp(broke.restRot.z, 0, e);
      pivotAt(H, lerp(broke.halfRz, 0, e));
      H.group.rotation.x = -0.06;
      if(u >= 1){
        F.group.position.copy(F.home);
        F.group.rotation.set(-0.06, 0, 0);
        H.group.position.copy(H.home);
        H.group.rotation.set(-0.06, 0, 0);
        broke = null;
      }
      return true;
    }

    /* --- падение целиком --- */
    const F = broke.full;
    if(el <= FALL_MS){
      const u = el/FALL_MS;
      /* по вертикали — свободное падение, по горизонтали снос наружу */
      const drop = (F.home.y - (GROUND_Y + AR_D/2)) * u*u;
      F.group.position.set(
        F.home.x + F.dir*0.34*u,
        F.home.y - drop,
        F.home.z + 0.30*u);
      /* валится на бок: разворот вокруг длинной оси + доворот по рысканью */
      F.group.rotation.x = -0.06 + (Math.PI/2 + 0.06) * easeInOutCubic(u);
      F.group.rotation.y = 0.30*u*u;
      F.group.rotation.z = F.dir*0.16*u;
      busy = true;
    } else if(!broke.landed){
      broke.landed = true;
      /* лёгкий подскок и успокоение — считаем один раз, дальше стоит */
      F.group.position.set(F.home.x + F.dir*0.36, GROUND_Y + AR_D/2, F.home.z + 0.32);
      F.group.rotation.set(Math.PI/2, 0.33, F.dir*0.17);
      broke.restPos = F.group.position.clone();
      broke.restRot = { x:F.group.rotation.x, y:F.group.rotation.y, z:F.group.rotation.z };
      /* удар о землю поднимает пыль */
      for(let i=0;i<5;i++)
        emit(F.group.position.x, GROUND_Y + 0.05, F.group.position.z, 0.30, 0.28);
      busy = true;
    }

    /* --- вторая: обрывается наполовину и качается --- */
    const H = broke.half;
    /* знак задаёт сторону: нос всегда идёт ВНИЗ, наружу от диска */
    const sgn = -H.dir;
    if(el <= FALL_MS*0.62){
      const u = el/(FALL_MS*0.62);
      pivotAt(H, sgn*HALF_TILT*easeInOutCubic(u));
      H.group.rotation.x = -0.06;
      broke.halfRz = sgn*HALF_TILT*easeInOutCubic(u);
      busy = true;
    } else if(el < WOBBLE_MS){
      /* затухающий маятник вокруг уцелевшего крепления */
      const u = (el - FALL_MS*0.62)/(WOBBLE_MS - FALL_MS*0.62);
      const amp = 0.13*Math.exp(-3.4*u);
      const ang = Math.min(HALF_MAX, HALF_TILT + amp*Math.sin(u*22));
      const rz = sgn*ang;
      pivotAt(H, rz);
      H.group.rotation.x = -0.06;
      broke.halfRz = rz;
      busy = true;
    } else if(broke.halfRz !== sgn*HALF_TILT){
      pivotAt(H, sgn*HALF_TILT);
      H.group.rotation.x = -0.06;
      broke.halfRz = sgn*HALF_TILT;
      busy = true;
    }
    return busy;
  }

  /* =========================================================
     Ввод: hover / press по деревянным стрелкам (raycast)
     ========================================================= */
  const ndc = { x:0, y:0 };
  let ray = null;
  function pick(e){
    const r = renderer.domElement.getBoundingClientRect();
    if(!r.width || !r.height) return null;
    ndc.x = ((e.clientX - r.left)/r.width)*2 - 1;
    ndc.y = -((e.clientY - r.top)/r.height)*2 + 1;
    mouseNX = clamp(ndc.x, -1, 1); mouseNY = clamp(ndc.y, -1, 1);
    ray.setFromCamera(ndc, camera);
    let hit = null;
    /* сломанные стрелки не кнопки: мишень не проверяем, пока не собрались */
    for(let i=0;i<arrows.length && !broke;i++){
      if(ray.intersectObject(arrows[i].hit, false).length){ hit = arrows[i]; break; }
    }
    for(let i=0;i<arrows.length;i++) arrows[i].hover = (arrows[i] === hit);
    /* таблички: берём ближайшую к камере, чтобы не ловить заднюю */
    let pHit = null, pDist = Infinity;
    if(!hit){
      for(let i=0;i<plates.length;i++){
        const r = ray.intersectObject(plates[i].hit, false);
        if(r.length && r[0].distance < pDist){ pDist = r[0].distance; pHit = plates[i]; }
      }
    }
    for(let i=0;i<plates.length;i++) plates[i].hover = (plates[i] === pHit);
    host.classList.toggle('is-hot', !!(hit || pHit));
    return hit || pHit || null;
  }
  function bindInput(){
    const el = renderer.domElement;
    ray = new THREE.Raycaster();
    el.addEventListener('pointermove', (e)=> pick(e));
    el.addEventListener('pointerdown', (e)=>{
      const a = pick(e);
      if(!a) return;
      if(a.dir){                                                    // стрелка
        /* нажатие считаем всегда, но если оно оказалось последней
           каплей — шаг уже не делаем: стрелка отвалилась */
        if(noteClick(a)) return;
        a.press = true; if(onStepCb) onStepCb(a.dir);
      }
      else if(onPlateCb) onPlateCb(a.index);                        // табличка
    });
    const release = ()=>{ for(let i=0;i<arrows.length;i++) arrows[i].press = false; };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', ()=>{
      release();
      for(let i=0;i<arrows.length;i++) arrows[i].hover = false;
      for(let i=0;i<plates.length;i++) plates[i].hover = false;
      host.classList.remove('is-hot');
      mouseNX = 0; mouseNY = 0;
    });
  }

  /* =========================================================
     Публичный API
     ========================================================= */
  function init(o){
    THREE = window.THREE;
    host = (o && o.el) || null;
    if(!THREE || !host || renderer) return false;
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    onStepCb  = (o && o.onStep)  || null;
    onPlateCb = (o && o.onPlate) || null;
    colWood = new THREE.Color(WOOD); colHot = new THREE.Color(WOOD_HOT);

    const w = host.clientWidth || 620, h = host.clientHeight || 400;
    scene = new THREE.Scene();
    setupCamera(w, h);
    renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    initMaterials();
    setupLighting();
    buildScene();
    buildProbes();
    fit();
    bindInput();
    if(o && o.labels) setLabels(o.labels, o.activeIndex || 0);
    else if(o && o.label) setLabels([o.label,'','',''], 0);
    raf = requestAnimationFrame(tick);
    return true;
  }

  /* шаг вращения: n>0 — вправо, n<0 — влево (накапливается) */
  function step(n){
    if(!mainGear || !n) return;
    target += n * STEP_DEG * Math.PI/180;
    animFrom = angle; animTo = target; animT = 0;
    animDur = reduced ? 140 : SPIN_MS;
    dirty = true;
  }

  /* хук для автотестов/отладки (в проде безвреден) */
  function debug(){
    return { THREE, scene, camera, renderer, mech, mainGear, arrows, secondary, spinners, plates,
             angle, target, stepDeg:STEP_DEG, teeth:TEETH, labelText,
             camEl:CAM_EL, plateR:PLATE_R, probes, fitX:FIT_X, fitY:FIT_Y,
             asym:{ seed:ASYM_SEED, chip:TOOTH_CHIP, worn:TOOTH_WORN,
                    spokeOff:SPOKE_OFF, spokeW:SPOKE_W },
             rage:{ n:RAGE_N, ms:RAGE_MS, broke:!!broke, puffs:puffs.length,
                    ground:GROUND_Y, recoverMs:RECOVER_MS,
                    tilt:HALF_TILT, tiltMax:HALF_MAX,
                    hinge:{ x:HINGE_X, y:HINGE_Y },
                    full: broke ? broke.full.dir : 0 },
             shaftTop:SHAFT_TOP, stack:STACK, startBreak, pivotAt };
  }

  return { init, step, setLabel, setLabels, resize: fit,
           ready: ()=> !!renderer, debug };
})();

