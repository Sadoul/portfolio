/* =========================================================
   MECHANISM — настоящая 3D-сцена (Three.js) в стиле стимпанк,
   решённая в фирменном скетч-стиле сайта: бумага + чернильный
   контур, тонкие линии, простые формы. Не SVG, не CSS —
   реальная геометрия: зубья экструдированы из 2D-контура,
   спицы/ступица/болты/трубы — отдельные меши.

   Состав сцены:
     MainMechanism
       ├── MainGearGroup  (корпус с зубьями, спицы, ступица, болты)
       ├── SecondaryGears (под шестернёй и позади — не по бокам)
       ├── Pipes / Valves / Gauges
       ├── LeftArrow / RightArrow  (деревянные, интерактивные)
       └── LabelPlate (табличка с активной вкладкой, не вращается)

   Вращение: ТОЛЬКО при смене вкладок, мягкий шаг STEP_DEG
   влево/вправо с easeInOutCubic + лёгкой доводкой (инерция).
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
  const STEP_DEG   = 30;     // один шаг вкладки = 30° (мягко)
  const SPIN_MS    = 820;    // длительность одного шага

  /* ---------- состояние ---------- */
  let THREE = null;
  let host = null, renderer = null, scene = null, camera = null;
  let mech = null, mainGear = null, plateTex = null, plateCtx = null, plateCanvas = null;
  let labelText = '';
  let secondary = [];        // {group, ratio}
  let arrows = [];           // {group, hit, dir, mats, hover, press, homeX, homeScale, nx}
  let raf = 0, dirty = true, reduced = false;
  let angle = 0, target = 0, animFrom = 0, animTo = 0, animT = 1, animDur = SPIN_MS, lastT = 0;
  let mouseNX = 0, mouseNY = 0, camNX = 0, camNY = 0;
  let onStepCb = null;
  let probes = [], plateRef = null;
  /* камера: лёгкий вид сверху-спереди (≈38°) — видно и верхнюю
     плоскость, и толщину зубьев. Дистанция подбирается вписыванием. */
  const CAM_EL = 38 * Math.PI/180;
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
    boltRing(G, { count:8, radius:1.45, y:THICK/2, r:0.062, h:0.072, phase:0.26 });
    return G;
  }

  /* =========================================================
     Трубы / клапаны / манометры — задний план, для глубины
     ========================================================= */
  function createPipe(x1,y1,z1, x2,y2,z2, r){
    const g = new THREE.Group();
    const a = new THREE.Vector3(x1,y1,z1), b = new THREE.Vector3(x2,y2,z2);
    const d = new THREE.Vector3().subVectors(b,a), len = d.length();
    const geo = new THREE.CylinderGeometry(r, r, len, 16, 1, true);
    const m = new THREE.Mesh(geo, MAT.deep);
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
  function createElbow(x,y,z, r){
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r*1.28, 14, 10), MAT.deep));
    const L = new LineBag(); L.ring(r*1.28, 0, 22);
    g.add(new THREE.LineSegments(L.build().geometry, MAT.lineSoft));
    g.position.set(x,y,z);
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
  function createArrow(){
    const g = new THREE.Group();
    const sh = 0.145, hh = 0.345, xTail = -0.68, xNeck = 0.02, xTip = 0.44, d = 0.18;
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
    [-0.44,-0.30].forEach(x=>{                       // металлическая скоба
      L.seg(x,-sh, d/2+0.001, x, sh, d/2+0.001);
      L.seg(x,-sh,-d/2-0.001, x, sh,-d/2-0.001);
      L.seg(x, sh, -d/2, x, sh, d/2); L.seg(x,-sh, -d/2, x,-sh, d/2);
    });
    [[-0.37,0.062],[-0.37,-0.062],[-0.60,0.062],[-0.60,-0.062]].forEach(b=>{
      L.ringXY(0.032, d/2+0.003, 10, b[0], b[1]);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(xTip-xTail+0.18, hh*2+0.14, d+0.20),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0, depthWrite:false })
    );
    hit.position.x = (xTail+xTip)/2;
    g.add(hit);
    return { group:g, hit, mat };
  }
  /* =========================================================
     Табличка с названием активной вкладки: прямоугольник с
     закруглёнными углами, 4 болта, текст на лицевой стороне.
     НЕ вращается — всегда обращена к пользователю.
     ========================================================= */
  /* Табличка держится скромной: она ближе всех к камере, и если
     сделать её крупной — вписывание отодвинет камеру и главная
     шестерня станет мелкой. */
  const PL_W = 1.08, PL_H = 0.36, PL_R = 0.09, PL_D = 0.08;
  function createPlate(){
    const g = new THREE.Group();
    const w = PL_W/2, h = PL_H/2, r = PL_R;
    const s = new THREE.Shape();
    s.moveTo(-w+r, -h);
    s.lineTo(w-r, -h);  s.absarc(w-r, -h+r, r, -Math.PI/2, 0, false);
    s.lineTo(w, h-r);   s.absarc(w-r,  h-r, r, 0, Math.PI/2, false);
    s.lineTo(-w+r, h);  s.absarc(-w+r, h-r, r, Math.PI/2, Math.PI, false);
    s.lineTo(-w, -h+r); s.absarc(-w+r,-h+r, r, Math.PI, Math.PI*1.5, false);
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
    const bg = new THREE.CylinderGeometry(0.028, 0.028, 0.045, 10);
    [[w-0.10,h-0.10],[-(w-0.10),h-0.10],[w-0.10,-(h-0.10)],[-(w-0.10),-(h-0.10)]].forEach(b=>{
      const m = new THREE.Mesh(bg, MAT.bolt);
      m.rotation.x = Math.PI/2; m.position.set(b[0], b[1], PL_D/2+0.018);
      g.add(m);
      L.ringXY(0.028, PL_D/2+0.041, 10, b[0], b[1]);
    });
    g.add(new THREE.LineSegments(L.build().geometry, MAT.line));

    plateCanvas = document.createElement('canvas');
    plateCanvas.width = 664; plateCanvas.height = 222;   // ≈ (PL_W-0.16):(PL_H-0.12)
    plateCtx = plateCanvas.getContext('2d');
    plateTex = new THREE.CanvasTexture(plateCanvas);
    plateTex.anisotropy = 4;
    const txt = new THREE.Mesh(
      new THREE.PlaneGeometry(PL_W-0.16, PL_H-0.12),
      new THREE.MeshBasicMaterial({ map:plateTex, transparent:true, depthWrite:false })
    );
    txt.position.z = PL_D/2 + 0.006; txt.renderOrder = 2;
    g.add(txt);
    return g;
  }
  function setLabel(text){
    if(!plateCtx) return;
    labelText = text;
    const W = plateCanvas.width, H = plateCanvas.height;
    plateCtx.clearRect(0,0,W,H);
    plateCtx.fillStyle = '#161413';
    plateCtx.textAlign = 'center'; plateCtx.textBaseline = 'middle';
    let size = 104;
    plateCtx.font = '700 '+size+'px "Space Grotesk", system-ui, sans-serif';
    const wide = plateCtx.measureText(text).width;
    if(wide > W-40){
      size = Math.floor(size*(W-40)/wide);
      plateCtx.font = '700 '+size+'px "Space Grotesk", system-ui, sans-serif';
    }
    plateCtx.fillText(text, W/2, H/2+4);
    plateTex.needsUpdate = true;
    dirty = true;
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

    /* деревянные стрелки — передний план, слева и справа.
       Хвост чуть не доходит до вершин зубьев, стрелка стоит на
       стойке — часть механизма, а не HTML-кнопка. */
    const AX = 2.78, AY = 0.08, AZ = 0.34;
    [{ dir:-1, rotY: 0.20 }, { dir:1, rotY:-0.20 }].forEach(cfg=>{
      const a = createArrow();
      a.group.position.set(cfg.dir*AX, AY, AZ);
      a.group.rotation.set(-0.08, cfg.rotY, 0);
      const flip = cfg.dir < 0;
      if(flip) a.group.scale.x = -1;
      mech.add(a.group);
      /* стойка-крепление: труба снизу + опорная площадка */
      mech.add(createPipe(cfg.dir*AX, -0.66, AZ, cfg.dir*AX, AY-0.18, AZ, 0.085));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.09, 18), MAT.deep);
      pad.position.set(cfg.dir*AX, -0.70, AZ); mech.add(pad);
      const PL = new LineBag();
      PL.ring(0.19, -0.655, 26, cfg.dir*AX, AZ); PL.ring(0.23, -0.745, 26, cfg.dir*AX, AZ);
      mech.add(new THREE.LineSegments(PL.build().geometry, MAT.lineSoft));

      arrows.push({
        group:a.group, hit:a.hit, mat:a.mat, dir:cfg.dir, flip,
        home:a.group.position.clone(),
        inward:new THREE.Vector3(-cfg.dir, 0, 0),
        hover:false, press:false, tH:0, tP:0
      });
    });

    /* табличка с активной вкладкой (не вращается) */
    plateRef = createPlate();
    plateRef.position.set(0, -0.46, 2.26);
    plateRef.rotation.x = -0.66;
    mech.add(plateRef);
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
  function buildProbes(){
    probes = [];
    scene.updateMatrixWorld(true);
    /* всё храним в ЛОКАЛЬНЫХ координатах механизма: fit() двигает
       mech.position.y, поэтому мир считается уже в fit(). */
    const addBox = (o)=>{
      const b = new THREE.Box3().setFromObject(o);
      for(let i=0;i<8;i++) probes.push(mech.worldToLocal(new THREE.Vector3(
        (i&1)?b.max.x:b.min.x, (i&2)?b.max.y:b.min.y, (i&4)?b.max.z:b.min.z)));
    };
    /* ВАЖНО: пробуем только реально видимые крайние точки. Валы и
       приливы под диском скрыты самим диском — если их учитывать,
       вписывание зря уменьшает главную шестерню. */
    arrows.forEach(a=> addBox(a.hit));
    if(plateRef) addBox(plateRef);
    for(let i=0;i<24;i++){
      const a = i/24*Math.PI*2, c = Math.cos(a), s = Math.sin(a);
      probes.push(new THREE.Vector3(R_TIP*c,  THICK/2, R_TIP*s));
      probes.push(new THREE.Vector3(R_TIP*c, -THICK/2, R_TIP*s));
    }
    probes.push(new THREE.Vector3(0, THICK/2 + 0.56, 0));          // верх ступицы
    probes.push(new THREE.Vector3(-1.58, 0.73, -2.42));            // маховичок
    probes.push(new THREE.Vector3( 1.58, 0.68, -2.42));            // манометр
    probes.push(new THREE.Vector3(-2.78, -0.75, 0.34));            // пятки стоек
    probes.push(new THREE.Vector3( 2.78, -0.75, 0.34));
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
    const tanY = Math.tan(camera.fov*Math.PI/360);
    for(let it=0; it<12; it++){
      placeCamera(); mech.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for(let i=0;i<probes.length;i++){
        v.copy(probes[i]).add(mech.position).project(camera);
        if(v.x<x0) x0=v.x; if(v.x>x1) x1=v.x;
        if(v.y<y0) y0=v.y; if(v.y>y1) y1=v.y;
      }
      /* 1) центрируем по вертикали, сдвигая механизм */
      const cy = (y0+y1)/2;
      mech.position.y -= cy * camDist * tanY / Math.max(camDir.y, 0.3) * 0.85;
      /* 2) подгоняем дистанцию под габарит */
      const k = Math.max((x1-x0)/2/FIT_X, (y1-y0)/2/FIT_Y);
      camDist = clamp(camDist*k, 3.8, 18);
      if(Math.abs(k-1) < 0.003 && Math.abs(cy) < 0.004) break;
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
    host.classList.toggle('is-hot', !!hit);
    return hit;
  }
  function bindInput(){
    const el = renderer.domElement;
    ray = new THREE.Raycaster();
    el.addEventListener('pointermove', (e)=> pick(e));
    el.addEventListener('pointerdown', (e)=>{
      const a = pick(e);
      if(!a) return;
      a.press = true;
      if(onStepCb) onStepCb(a.dir);
    });
    const release = ()=>{ for(let i=0;i<arrows.length;i++) arrows[i].press = false; };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', ()=>{
      release();
      for(let i=0;i<arrows.length;i++) arrows[i].hover = false;
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
    onStepCb = (o && o.onStep) || null;
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
    if(o && o.label) setLabel(o.label);
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
    return { scene, camera, renderer, mech, mainGear, arrows, secondary,
             angle, target, stepDeg:STEP_DEG, teeth:TEETH, labelText };
  }

  return { init, step, setLabel, resize: fit, ready: ()=> !!renderer, debug };
})();

