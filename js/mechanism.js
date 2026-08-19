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
       ├── UnderPipes     (ржавые трубы под диском, фланцы, капли)
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
  const WOOD_HOVER = 0xfffdf6;

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

  /* ---------- состояние ---------- */
  let THREE = null;
  let host = null, renderer = null, scene = null, camera = null;
  let mech = null, mainGear = null;
  let plates = [];           // 4 таблички вкладок на ободе
  let labelText = '';
  let onPlateCb = null;      // клик по табличке -> перейти на вкладку
  let secondary = [];        // {group, ratio}
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

  /* редкие короткие ВЕРТИКАЛЬНЫЕ полоски на зубьях:
     на одной вертикальной оси — одна линия, без штриховки;
     разной длины, на разной высоте; иногда 2–3 рядом. */
  function texToothStripes(){
    const W = 1024, H = 168;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0,0,W,H);
    x.strokeStyle = 'rgba(22,20,19,0.86)'; x.lineCap = 'round'; x.lineWidth = 4;
    const rnd = rng(20260819);
    const top = 24, bot = H-24, span = bot-top;
    let px = 40 + rnd()*90;
    while(px < W-40){
      const group = 1 + Math.floor(rnd()*3);      // 1..3 линии рядом, не более
      for(let k=0;k<group && px<W-30;k++){
        const h  = span*(0.22 + rnd()*0.48);      // короткие, разной длины
        const y0 = top + rnd()*(span-h);          // на разной высоте
        x.beginPath(); x.moveTo(px, y0); x.lineTo(px, y0+h); x.stroke();
        px += 15 + rnd()*12;                      // соседние — вплотную
      }
      px += 120 + rnd()*230;                      // затем большой пропуск
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
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
    MAT.rust     = new THREE.MeshLambertMaterial({ color:RUST, map:texRust() });
    MAT.line     = new THREE.LineBasicMaterial({ color:INK, transparent:true, opacity:0.92 });
    MAT.lineSoft = new THREE.LineBasicMaterial({ color:INK, transparent:true, opacity:0.5 });
  }
  /* =========================================================
     UV-генератор для ExtrudeGeometry:
       • крышки  — мир -> [0..1] по габариту (короткие круговые дуги);
       • стенки  — u = длина по окружности (тайлы), v = толщина.
     Так вертикальные полоски идут ровно по зубьям и не рвутся
     на стыках четырёхугольников.
     ========================================================= */
  function makeUV(rTip, tiles){
    const K = 1/(2*rTip), C = 0.5;
    return {
      generateTopUV: function(g, verts, a, b, c){
        return [
          new THREE.Vector2(verts[a*3]*K+C, verts[a*3+1]*K+C),
          new THREE.Vector2(verts[b*3]*K+C, verts[b*3+1]*K+C),
          new THREE.Vector2(verts[c*3]*K+C, verts[c*3+1]*K+C)
        ];
      },
      generateSideWallUV: function(g, verts, a, b, c, d){
        const ang = (i)=> Math.atan2(verts[i*3+1], verts[i*3]);
        let a0 = ang(a), a1 = ang(b);
        while(a1 - a0 >  Math.PI) a1 -= Math.PI*2;
        while(a1 - a0 < -Math.PI) a1 += Math.PI*2;
        const f = tiles/(Math.PI*2);
        const ua = a0*f, ub = a1*f;
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
     ========================================================= */
  function gearProfile(teeth, rRoot, rTip){
    const pts = [], corners = [];
    const step = Math.PI*2/teeth;
    const fTip = 0.30, fFlank = 0.115, fVal = 1 - fTip - 2*fFlank;
    const P = (r,a)=> pts.push([r*Math.cos(a), r*Math.sin(a)]);
    for(let i=0;i<teeth;i++){
      let a = i*step;
      P(rRoot, a);                                   // впадина
      P(rRoot, a + fVal*step*0.5);                   // (2 сегмента — круглый корень)
      a += fVal*step;      P(rRoot, a); corners.push([rRoot,a]);   // начало подъёма
      a += fFlank*step;    P(rTip,  a); corners.push([rTip, a]);   // начало площадки
      a += fTip*step;      P(rTip,  a); corners.push([rTip, a]);   // конец площадки
      a += fFlank*step;                 corners.push([rRoot,a]);   // конец спуска
    }
    return { pts, corners };
  }

  /* универсальная шестерня: createGear(teeth, radius, thickness…) */
  function createGear(o){
    const g = new THREE.Group();
    const prof = gearProfile(o.teeth, o.rRoot, o.rTip);
    const shape = new THREE.Shape(prof.pts.map(p=> new THREE.Vector2(p[0],p[1])));
    if(o.hole){
      const h = new THREE.Path();
      h.absarc(0, 0, o.hole, 0, Math.PI*2, true);
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth:o.thick, bevelEnabled:false, steps:1, curveSegments:64,
      UVGenerator: makeUV(o.rTip, o.tiles||6)
    });
    geo.rotateX(-Math.PI/2);
    geo.translate(0, -o.thick/2, 0);
    g.add(new THREE.Mesh(geo, o.soft ? [MAT.deep, MAT.deep] : [MAT.cap, MAT.wall]));

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
                                            rings:[R_ROOT] });
  const createSmallGear = (teeth, rTip, thick, soft)=> createGear({
    teeth, rTip, rRoot:rTip-0.135*(rTip/0.7), thick, tiles:3, soft
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
  function boltRing(parent, o){
    if(!BOLT_GEO) BOLT_GEO = createBolt(1, 1);
    const im = new THREE.InstancedMesh(BOLT_GEO, MAT.bolt, o.count);
    const m = new THREE.Matrix4(), L = new LineBag();
    for(let i=0;i<o.count;i++){
      const a = (o.phase||0) + i/o.count*Math.PI*2;
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
  /* спицы: толстые перемычки от ступицы к ободу, между ними — окна */
  function createSpokes(){
    const g = new THREE.Group();
    const r0 = 0.66, r1 = 1.23, len = r1 - r0;
    const geo = new THREE.BoxGeometry(len, 0.26, 0.21);
    const edg = new THREE.EdgesGeometry(geo);
    for(let i=0;i<SPOKES;i++){
      const a = i/SPOKES*Math.PI*2;
      const s = new THREE.Group();
      s.position.set((r0+len/2)*Math.cos(a), 0, -(r0+len/2)*Math.sin(a));
      s.rotation.y = a;
      s.add(new THREE.Mesh(geo, MAT.spoke));
      s.add(new THREE.LineSegments(edg, MAT.line));
      g.add(s);
    }
    return g;
  }

  /* сборка большой шестерни: всё в одной группе — вращается вместе */
  function buildMainGear(){
    const G = new THREE.Group();
    G.add(createMainGear());
    G.add(createSpokes());
    G.add(createHub());
    /* болты вынесены на 1.63, чтобы не спорить с табличками (1.37) */
    boltRing(G, { count:12, radius:1.63, y:THICK/2, r:0.052, h:0.060, phase:0.13 });
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
  /* фланец на трубе: два кольца-бортика, чтобы стык читался */
  function createFlange(x,y,z, r){
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r*1.5, r*1.5, 0.05, 16), MAT.deep);
    g.add(m);
    const L = new LineBag();
    L.ring(r*1.5, 0.025, 22); L.ring(r*1.5, -0.025, 22);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    g.position.set(x,y,z);
    return g;
  }
  /* висящая капля на трубе: капелька + пара сорвавшихся ниже */
  function createDrip(x,y,z){
    const g = new THREE.Group();
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), MAT.deep);
    bead.scale.y = 1.5; g.add(bead);
    const L = new LineBag();
    L.ringXY(0.032, 0.001, 12, 0, 0);
    [[0.004,-0.17,0.020],[-0.006,-0.31,0.014]].forEach(d=>{
      const b = new THREE.Mesh(new THREE.SphereGeometry(d[2], 8, 6), MAT.deep);
      b.position.set(d[0], d[1], 0); b.scale.y = 1.6; g.add(b);
      L.ringXY(d[2], 0.001, 10, d[0], d[1]);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    g.position.set(x,y,z);
    return g;
  }
  /* =========================================================
     Вертикальный вал НАД шестерней: тонкий стержень + хомуты,
     коронная шестерёнка, шкив, крышка. Ребёнок MainGearGroup —
     вращается вместе с диском.
     ========================================================= */
  function createTopShaft(){
    const g = new THREE.Group();
    const y0 = THICK/2 + 0.56;            // от крышки ступицы
    const y1 = y0 + 0.92;
    const L = new LineBag();
    /* стержень */
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, y1-y0, 14), MAT.hub);
    rod.position.y = (y0+y1)/2; g.add(rod);
    L.ring(0.062, y0, 20); L.ring(0.062, y1, 20);
    L.seams(0.062, y0, y1, 2, 0, 0, 0.5);
    /* хомуты */
    [y0+0.14, y1-0.30].forEach(y=>{
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.07, 14), MAT.bolt);
      c.position.y = y; g.add(c);
      L.ring(0.105, y+0.035, 18); L.ring(0.105, y-0.035, 18);
    });
    /* коронная шестерёнка на валу */
    const crown = createSmallGear(12, 0.30, 0.10, true);
    crown.position.y = y0 + 0.40; g.add(crown);
    /* шкив под крышкой */
    const pul = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.032, 7, 20), MAT.deep);
    pul.rotation.x = Math.PI/2; pul.position.y = y1 - 0.14; g.add(pul);
    L.ring(0.167, y1-0.14, 24); L.ring(0.103, y1-0.14, 20);
    /* крышка-конус */
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.092, 0.10, 14), MAT.hub);
    cap.position.y = y1 + 0.05; g.add(cap);
    L.ring(0.092, y1, 18); L.ring(0.045, y1+0.10, 14);
    /* поперечный штифт у крышки — деталь, за которую цепляется глаз */
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 8), MAT.bolt);
    pin.rotation.z = Math.PI/2; pin.position.y = y1 - 0.02; g.add(pin);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));
    g.userData.topY = y1 + 0.10;
    return g;
  }
  /* =========================================================
     Трубная развязка ПОД шестернёй, спереди-снизу — видна из-под
     обода: магистраль с фланцами, колена, стояки, вентиль,
     ржавчина и капли.
     ========================================================= */
  function createUnderPipes(){
    const g = new THREE.Group();
    const y = -0.97, z = 1.16, x = 1.52;
    /* магистраль */
    g.add(createPipe(-x, y, z, x, y, z, 0.11, true));
    [-0.72, 0.0, 0.72].forEach(fx=> g.add(createFlange(fx, y, z, 0.11)));
    /* колена по краям + короткие стояки вверх, под диск */
    [-x, x].forEach(ex=>{
      g.add(createElbow(ex, y, z, 0.11, true));
      g.add(createPipe(ex, y, z, ex, y+0.34, z, 0.085, true));
      g.add(createFlange(ex, y+0.34, z, 0.085));
    });
    /* отвод назад по центру — уходит под диск, добавляет глубину */
    g.add(createPipe(0, y, z, 0, y, z-0.62, 0.075, true));
    g.add(createElbow(0, y, z-0.62, 0.075, true));
    /* вентиль на магистрали */
    const v = createValve(0.62);
    v.position.set(-0.36, y+0.30, z);
    g.add(v);
    g.add(createPipe(-0.36, y, z, -0.36, y+0.16, z, 0.05));
    /* капли с магистрали */
    [[-1.02,-0.06],[0.34,0.04],[1.06,-0.02]].forEach(d=>
      g.add(createDrip(d[0], y-0.12, z+d[1])));
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
  function createArrow(){
    const g = new THREE.Group();
    const sh = AR_SH, hh = AR_HH, d = AR_D;
    const xTail = AR_TAIL, xNeck = AR_NECK, xTip = AR_TIP;
    const pts = [
      [xTail,-sh], [xNeck,-sh], [xNeck,-hh], [xTip,0], [xNeck,hh], [xNeck,sh], [xTail,sh]
    ];
    const shape = new THREE.Shape(pts.map(p=> new THREE.Vector2(p[0],p[1])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth:d, bevelEnabled:false, steps:1 });
    geo.translate(0, 0, -d/2);
    const tex = MAT.woodTex.clone(); tex.needsUpdate = true; tex.repeat.set(0.62, 1.9);
    const mat = new THREE.MeshLambertMaterial({ color:WOOD, map:tex });
    g.add(new THREE.Mesh(geo, mat));

    const L = new LineBag();
    L.loopXY(pts, d/2); L.loopXY(pts, -d/2);
    pts.forEach(p=> L.seg(p[0], p[1], -d/2, p[0], p[1], d/2));
    [-0.32,-0.18].forEach(x=>{                       // металлическая скоба
      L.seg(x,-sh, d/2+0.001, x, sh, d/2+0.001);
      L.seg(x,-sh,-d/2-0.001, x, sh,-d/2-0.001);
      L.seg(x, sh, -d/2, x, sh, d/2); L.seg(x,-sh, -d/2, x,-sh, d/2);
    });
    [[-0.25,0.062],[-0.25,-0.062],[-0.48,0.062],[-0.48,-0.062]].forEach(b=>{
      L.ringXY(0.032, d/2+0.003, 10, b[0], b[1]);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    /* ---- ползун: стрелка сидит на скользящем блоке, блок ходит
       по направляющему валу. Блок и вал двигаются вместе со
       стрелкой, вал остаётся в кронштейнах (см. buildScene). ---- */
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.15, 0.26), MAT.spoke);
    blk.position.y = -sh - 0.075;
    g.add(blk);
    const blkE = new THREE.LineSegments(new THREE.EdgesGeometry(blk.geometry), MAT.line);
    blkE.position.copy(blk.position); g.add(blkE);
    /* штифт, которым блок притянут к телу стрелки */
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.10, 8), MAT.bolt);
    pin.position.y = -sh - 0.01; g.add(pin);

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

    /* холст: и фон, и текст — так активную заливаем чернилами */
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
  /* перерисовать лицо таблички: активная — чернила, прочие — бумага */
  function drawPlateFace(p, text, active){
    const ctx = p.ctx, W = p.cv.width, H = p.cv.height;
    ctx.clearRect(0,0,W,H);
    const R = 26;
    ctx.beginPath();
    ctx.moveTo(R,0); ctx.lineTo(W-R,0); ctx.quadraticCurveTo(W,0,W,R);
    ctx.lineTo(W,H-R); ctx.quadraticCurveTo(W,H,W-R,H);
    ctx.lineTo(R,H);   ctx.quadraticCurveTo(0,H,0,H-R);
    ctx.lineTo(0,R);   ctx.quadraticCurveTo(0,0,R,0);
    ctx.closePath();
    if(active){ ctx.fillStyle = '#161413'; ctx.fill(); }
    ctx.fillStyle = active ? '#f6f2e9' : '#161413';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = 96;
    const font = (n)=> '700 '+n+'px "Space Grotesk", system-ui, sans-serif';
    ctx.font = font(size);
    const wide = ctx.measureText(text).width;
    if(wide > W-52){ size = Math.floor(size*(W-52)/wide); ctx.font = font(size); }
    ctx.fillText(text, W/2, H/2 + 3);
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

    const back = createSmallGear(14, 0.78, 0.28, true);
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
    const valve = createValve(0.78); valve.position.set(-xP, yP+0.53, zP); mech.add(valve);
    const gauge = createGauge();     gauge.scale.setScalar(0.82);
    gauge.position.set(xP, yP+0.50, zP-0.02); mech.add(gauge);

    /* трубы под диском (спереди-снизу, видны из-под обода) */
    mech.add(createUnderPipes());

    /* деревянные стрелки — передний план, слева и справа.
       Каждая сидит на ползуне и ходит по направляющему валу;
       вал держат два кронштейна на стойках. Это делает стрелку
       физически подключённой к механизму, а не висящей рядом. */
    const AX = 2.72, AY = 0.10, AZ = 0.34;
    const RAIL_Y = AY - AR_SH - 0.075;        // ось вала = центр ползуна
    [{ dir:-1 }, { dir:1 }].forEach(cfg=>{
      const s = cfg.dir;                       // +1 справа, -1 слева
      const a = createArrow();
      a.group.position.set(s*AX, AY, AZ);
      a.group.rotation.set(-0.06, 0, 0);
      const flip = s < 0;
      if(flip) a.group.scale.x = -1;           // стрелка смотрит наружу
      mech.add(a.group);

      /* направляющий вал с двумя кронштейнами. Кронштейны стоят
         СИММЕТРИЧНО относительно центра стрелки — иначе стрелка
         читается «съехавшей со своего столба». Свес наружу держим
         минимальным: он задаёт габарит кадра и мельчит диск. */
      const xOut = s*(AX + 0.43), xIn = s*(AX - 0.43);
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
  }
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
  let colWood = null, colHot = null;   // цвета «дерева»: покой / hover

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
      busy = true;
    }

    const tx = reduced ? 0 : mouseNX, ty = reduced ? 0 : mouseNY;
    if(Math.abs(tx-camNX) > 0.0008 || Math.abs(ty-camNY) > 0.0008){
      camNX = lerp(camNX, tx, 0.055); camNY = lerp(camNY, ty, 0.055);
      camera.position.set(camBase.x + camNX*0.50, camBase.y - camNY*0.26, camBase.z);
      camera.lookAt(camAt.x, camAt.y, camAt.z);
      busy = true;
    }

    for(let i=0;i<arrows.length;i++){
      const a = arrows[i], hT = a.hover?1:0, pT = a.press?1:0;
      if(Math.abs(a.tH-hT) > 0.002 || Math.abs(a.tP-pT) > 0.002){
        a.tH = lerp(a.tH, hT, 0.16); a.tP = lerp(a.tP, pT, 0.28);
        const sc = 1 + a.tH*0.055;
        a.group.scale.set(a.flip ? -sc : sc, sc, sc);
        a.group.position.copy(a.home).addScaledVector(a.inward, a.tP*0.10 + a.tH*0.025);
        a.mat.color.copy(colWood).lerp(colHot, clamp(a.tH,0,1));
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
    for(let i=0;i<arrows.length;i++){
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
      if(a.dir){ a.press = true; if(onStepCb) onStepCb(a.dir); }   // стрелка
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
    colWood = new THREE.Color(WOOD); colHot = new THREE.Color(WOOD_HOVER);

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
    return { scene, camera, renderer, mech, mainGear, arrows, secondary, plates,
             angle, target, stepDeg:STEP_DEG, teeth:TEETH, labelText,
             camEl:CAM_EL, plateR:PLATE_R, probes, fitX:FIT_X, fitY:FIT_Y };
  }

  return { init, step, setLabel, setLabels, resize: fit,
           ready: ()=> !!renderer, debug };
})();

