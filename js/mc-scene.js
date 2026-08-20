/* =========================================================
   MC_SCENE — 3D-сцена вкладки Minecraft.

   Что происходит: столб из двух блоков (сверху трава, под ней
   земля), на нём стоит Стив и рубит их под собой. Сломал траву —
   упал на землю. Сломал землю — упал вниз и больше не появился
   (до перезагрузки страницы или возврата на вкладку). По бокам
   в невесомости медленно крутятся блоки.

   Стиль: сайт чёрно-белый скетчевый, поэтому текстуры полностью
   обесцвечены (TINT = 0), но остаются текстурами — пиксель в
   пиксель, NearestFilter, с чернильным контуром по рёбрам.

   Трещины — настоящие destroy_stage из игры (assets/mc/tex/
   destroy_0..9.png), наложены прямо на грани блока.
   ========================================================= */
window.MC_SCENE = (function(){
  "use strict";

  const INK = 0x161413;
  /* Сколько родного цвета оставляем от текстуры: 0 = чистое
     чёрно-белое, 1 = как в игре. Держим 0 — сайт скетчевый, цвет
     в нём только у ржавых стрелок механизма. Текстура при этом
     никуда не девается: рисунок травы, земли и лица читается
     яркостью пикселей. */
  const TINT = 0;

  const TEX = 'assets/mc/tex/';
  const CRACK_N = 10;                    // destroy_0..destroy_9

  let THREE = null;
  let host = null, renderer = null, scene = null, camera = null;
  let root = null, steve = null, parts = {};
  let column = [], floaters = [], shards = [], dust = [];
  let crackMesh = null, crackTex = [];
  let raf = 0, running = false, reduced = false, visible = false;
  let lastT = 0, phase = 'mine', phaseT = 0, hits = 0;
  let target = 0;                        // 0 — трава, 1 — земля
  let fallFrom = 0, fallTo = 0, steveY = 0;
  let loaded = 0, need = 0, ready = false;

  const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
  const lerp  = (a,b,t)=> a+(b-a)*t;
  const ease  = (t)=> t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
  const easeOut = (t)=> 1-Math.pow(1-t,3);
  const easeIn  = (t)=> t*t*t;

  /* ---------------------------------------------------------
     Текстура: грузим файл и обесцвечиваем на canvas. Отдельные
     ч/б файлы не нужны, а степень обесцвечивания правится одной
     константой.
     --------------------------------------------------------- */
  function loadTex(file, tint, cb){
    const img = new Image();
    img.onload = ()=>{
      const W = img.width, H = img.height;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, W, H), a = d.data;
      for(let i=0;i<a.length;i+=4){
        if(a[i+3] === 0) continue;
        const l = 0.299*a[i] + 0.587*a[i+1] + 0.114*a[i+2];
        /* слегка поджимаем к бумаге, иначе тёмные пиксели травы
           сливаются в чёрное пятно и текстура пропадает */
        const b = 30 + l*0.86;
        a[i]   = clamp(b + (a[i]  -l)*tint, 0, 255)|0;
        a[i+1] = clamp(b + (a[i+1]-l)*tint, 0, 255)|0;
        a[i+2] = clamp(b + (a[i+2]-l)*tint, 0, 255)|0;
      }
      x.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      cb(t);
    };
    img.onerror = ()=> cb(null);
    img.src = TEX + file;
  }
  /* трещины грузим как есть: они уже чернильные и с альфой */
  function loadRaw(file, cb){
    const img = new Image();
    img.onload = ()=>{
      const t = new THREE.Texture(img);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      cb(t);
    };
    img.onerror = ()=> cb(null);
    img.src = TEX + file;
  }

  /* ---------------------------------------------------------
     UV частей тела по скину 64×64.
     Развёртка идёт лентой вокруг части: право, перед, лево, зад.
     Порядок групп у BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
     Модель смотрит в +Z, ось +Y вверх — значит ПРАВАЯ рука
     персонажа в мире это −X, а +X — его левый бок. Раньше здесь
     стояло наоборот, и боковые грани головы вставали задом
     наперёд: чубчик заворачивался не в ту сторону.
     --------------------------------------------------------- */
  function skinUV(geo, o){
    /* o: {x,y,w,h,d} — угол развёртки и размеры части в пикселях */
    const S = 64;
    const uv = geo.attributes.uv;
    const R = {
      px: [o.x + o.d + o.w, o.y + o.d, o.d, o.h],   // +X — левый бок
      nx: [o.x,             o.y + o.d, o.d, o.h],   // -X — правый бок
      py: [o.x + o.d,       o.y,       o.w, o.d],   // верх
      ny: [o.x + o.d + o.w, o.y,       o.w, o.d],   // низ
      pz: [o.x + o.d,       o.y + o.d, o.w, o.h],   // перед
      nz: [o.x + o.d*2+o.w, o.y + o.d, o.w, o.h]    // зад
    };
    ['px','nx','py','ny','pz','nz'].forEach((k, gi)=>{
      const r = R[k];
      const u0 = r[0]/S, u1 = (r[0]+r[2])/S;
      const v0 = 1 - (r[1]+r[3])/S, v1 = 1 - r[1]/S;
      const base = gi*4;
      /* порядок вершин грани у BoxGeometry: ЛВ, ПВ, ЛН, ПН */
      uv.setXY(base+0, u0, v1);
      uv.setXY(base+1, u1, v1);
      uv.setXY(base+2, u0, v0);
      uv.setXY(base+3, u1, v0);
    });
    uv.needsUpdate = true;
  }

  /* чернильный контур по рёбрам — как у механизма */
  function inked(mesh, soft){
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color:INK, transparent:true,
                                    opacity: soft ? 0.44 : 0.82 })));
    return mesh;
  }

  const U = 1/16;                        // 1 пиксель модели = 1/16 юнита

  /* Часть тела. pivotAt — где посадить точку вращения:
       'top'  — сверху (плечо, бедро),
       'neck' — снизу (голова крутится в шее, а не вокруг центра;
                иначе при повороте она съезжает с плеч и между
                головой и телом открывается щель).           */
  function part(mat, size, uvBox, pivotAt){
    const g = new THREE.BoxGeometry(size[0]*U, size[1]*U, size[2]*U);
    skinUV(g, uvBox);
    const m = new THREE.Mesh(g, mat);
    inked(m);
    if(pivotAt === 'top')  m.position.y = -size[1]*U/2;
    if(pivotAt === 'neck') m.position.y =  size[1]*U/2;
    const pivot = new THREE.Group();
    pivot.add(m);
    return { pivot, mesh:m };
  }
  /* ---------------------------------------------------------
     Стив: голова 8×8×8, тело 8×12×4, руки и ноги 4×12×4.
     Начало координат группы — под ногами, чтобы фигуру можно было
     ставить прямо на верхнюю грань блока.

     Оснастка: руки и голова висят НА ТЕЛЕ, а не на группе. Тогда
     наклон корпуса уводит вниз и плечи, и голову — без этого удар
     себе под ноги не собрать: плечо стояло бы на месте, и рука
     махала бы в воздух перед собой.
     --------------------------------------------------------- */
  function buildSteve(skin){
    const mat = new THREE.MeshLambertMaterial({
      map:skin, transparent:true, alphaTest:0.5 });
    const g = new THREE.Group();

    /* 'neck' и 'hip' — одно и то же: меш стоит ВЫШЕ точки вращения */
    const head = part(mat, [8,8,8],  { x:0,  y:0,  w:8, h:8,  d:8 }, 'neck');
    const body = part(mat, [8,12,4], { x:16, y:16, w:8, h:12, d:4 }, 'neck');
    const armR = part(mat, [4,12,4], { x:40, y:16, w:4, h:12, d:4 }, 'top');
    const armL = part(mat, [4,12,4], { x:32, y:48, w:4, h:12, d:4 }, 'top');
    const legR = part(mat, [4,12,4], { x:0,  y:16, w:4, h:12, d:4 }, 'top');
    const legL = part(mat, [4,12,4], { x:16, y:48, w:4, h:12, d:4 }, 'top');

    /* Высоты: ноги 0..12, тело 12..24, голова 24..32.
       Правая рука персонажа — со стороны −X (модель смотрит в +Z). */
    legR.pivot.position.set(-2*U, 12*U, 0);
    legL.pivot.position.set( 2*U, 12*U, 0);
    body.pivot.position.set(0, 12*U, 0);          // таз: корпус гнётся здесь
    /* плечи и шея — на 12 пикселей выше таза, уже внутри тела */
    armR.pivot.position.set(-6*U, 12*U, 0);
    armL.pivot.position.set( 6*U, 12*U, 0);
    head.pivot.position.set(0, 12*U, 0);
    [armR, armL, head].forEach(p=> body.pivot.add(p.pivot));

    g.add(legR.pivot); g.add(legL.pivot); g.add(body.pivot);
    parts = { head, body, armR, armL, legR, legL };
    return g;
  }

  /* ---------------------------------------------------------
     Блок 1×1×1. Трава — бока/верх/низ разные, земля и камень
     цельные со всех сторон.
     --------------------------------------------------------- */
  function blockMats(T, kind){
    const lam = (t)=> new THREE.MeshLambertMaterial({ map:t });
    if(kind === 'grass')
      return [T.side, T.side, T.top, T.dirt, T.side, T.side].map(lam);
    const t = kind === 'stone' ? T.stone : T.dirt;
    return lam(t);
  }
  function buildBlock(T, kind, soft){
    const m = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), blockMats(T, kind));
    inked(m, soft);
    return m;
  }

  /* ---------------------------------------------------------
     Трещины. Слой чуть больше блока, одна текстура на все грани —
     как в игре: разрушение видно с любой стороны.
     polygonOffset прижимает слой к грани, иначе он мерцает.
     --------------------------------------------------------- */
  function buildCrackLayer(){
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.002, 1.002, 1.002),
      new THREE.MeshBasicMaterial({
        transparent:true, depthWrite:false, opacity:1,
        polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 }));
    m.visible = false;
    m.renderOrder = 2;
    return m;
  }
  /* stage: -1 — снять слой, 0..9 — стадия из destroy_N.png */
  function setCrack(stage){
    if(!crackMesh) return;
    if(stage < 0 || !crackTex.length){ crackMesh.visible = false; return; }
    const t = crackTex[clamp(stage, 0, crackTex.length-1)];
    if(!t){ crackMesh.visible = false; return; }
    crackMesh.visible = true;
    crackMesh.material.map = t;
    crackMesh.material.needsUpdate = true;
  }
  /* ---------------------------------------------------------
     Компоновка. Столб из двух блоков в начале координат: трава по
     центру y=0 (верх на 0.5), под ней земля y=-1. Стив стоит на
     верхней грани чуть позади центра — так рука на махе уходит
     вниз мимо переднего ребра блока, а не в него.
     --------------------------------------------------------- */
  const GRASS_Y = 0, DIRT_Y = -1;
  const FEET = [GRASS_Y + 0.5, DIRT_Y + 0.5];    // куда встают ноги
  const FEET_GONE = -5.6;                        // ушёл за кадр
  const STEVE_X = -0.05, STEVE_Z = -0.14;
  const STEVE_RY = 0.55;                         // трёхчетвертной вид

  const MINE_MS  = 2300;    // сколько ломается один блок
  const SWING_MS = 400;     // один замах
  const LAND_MS  = 300;     // приземление
  const GRAV     = 11.0;

  /* Углы руки заданы ОТ МИРОВОЙ ВЕРТИКАЛИ: 0 — висит вниз, плюс —
     вперёд к камере, минус — назад за спину. Рука висит на теле,
     поэтому в локальный угол переводим вычитанием наклона
     корпуса: armX = total − lean.

     Кисть до верхней грани блока НЕ ДОХОДИТ, и это правильно.
     Плечо стоит на 2.0 (ноги 0.5 + 1.5), рука длиной 0.75, значит
     ниже 1.25 кисть не опускается — а грань, на которой Стив
     стоит, лежит на 0.5. Замер перебором: чтобы дотянуться, нужен
     наклон 1.2–1.35 рад, при котором макушка падает до 1.4 —
     фигура складывается лицом вниз. В самой игре то же самое: рубя
     блок под ногами, рука до него не достаёт, связь показывают
     трещины на грани и пыль из-под кисти. */
  const TOT_REST = 0.30, TOT_UP = -2.30, TOT_DEEP = 0.30;
  const LEAN_REST = 0.30, LEAN_UP = 0.18, LEAN_HIT = 0.74;
  const STRIKE = 0.55;      // доля замаха, на которой приходит удар

  const targetY = ()=> target === 0 ? GRASS_Y : DIRT_Y;

  /* поза добычи: t = 0..1 внутри одного замаха */
  function poseMine(t){
    const P = parts;
    let tot, lean;
    if(t < STRIKE){
      const u = ease(t/STRIKE);                  // занос вверх-назад
      tot  = lerp(TOT_REST, TOT_UP, u);
      lean = lerp(LEAN_REST, LEAN_UP, u);        // корпус выпрямляется
    } else {
      const u = (t - STRIKE)/(1 - STRIKE);
      if(u < 0.34){
        const k = easeIn(u/0.34);                // мах вниз, самая быстрая часть
        tot  = lerp(TOT_UP, TOT_DEEP, k);
        lean = lerp(LEAN_UP, LEAN_HIT, k);
      } else {
        tot  = TOT_DEEP;
        lean = lerp(LEAN_HIT, LEAN_REST, ease((u - 0.34)/0.66));
      }
    }
    const k = (t - STRIKE - 0.06)/0.09;
    const hit = t < STRIKE ? 0 : Math.exp(-(k*k));   // узкий пик удара
    P.body.pivot.rotation.x = lean + hit*0.06;
    P.body.pivot.rotation.y = -0.10 + (lean - LEAN_REST)*0.18;
    P.armR.pivot.rotation.x = tot - lean;
    P.armR.pivot.rotation.z = -0.10 - 0.10*Math.sin(Math.min(t/STRIKE,1)*Math.PI);
    P.armL.pivot.rotation.x = lerp(0.12, -0.26, clamp((lean-LEAN_UP)/0.56, 0, 1));
    P.armL.pivot.rotation.z = 0.12;
    P.head.pivot.rotation.x = 0.16 + hit*0.10;   // смотрит вниз на блок
    P.head.pivot.rotation.y = 0.06;
    P.legR.pivot.rotation.x = -0.10 - hit*0.10;
    P.legL.pivot.rotation.x =  0.12 + hit*0.06;
    steve.position.y = steveY - hit*0.05;
  }
  /* в полёте: руки вверх-вразлёт, ноги поджаты, корпус завалился */
  function poseFall(t, now){
    const P = parts, e = easeOut(clamp(t*2.2, 0, 1));
    const w = Math.sin(now/150)*0.10;                 // болтанка
    P.body.pivot.rotation.x = lerp(LEAN_REST, -0.16, e);
    P.body.pivot.rotation.y = -0.10 + w*0.5;
    P.armR.pivot.rotation.x = lerp(TOT_DEEP, -2.05, e) + w;
    P.armR.pivot.rotation.z = -0.10 - e*0.55;
    P.armL.pivot.rotation.x = lerp(0.12, -1.95, e) - w;
    P.armL.pivot.rotation.z = 0.12 + e*0.60;
    P.head.pivot.rotation.x = lerp(0.16, -0.22, e);   // задрал голову
    P.head.pivot.rotation.y = 0.06 - w*0.6;
    P.legR.pivot.rotation.x = lerp(-0.10, -0.62, e) + w*0.6;
    P.legL.pivot.rotation.x = lerp( 0.12,  0.34, e) - w*0.6;
    steve.position.y = steveY;
  }
  /* приземлился: присел и разогнулся */
  function poseLand(t){
    const P = parts, s = Math.sin(clamp(t,0,1)*Math.PI);
    P.body.pivot.rotation.x = LEAN_REST + s*0.20;
    P.body.pivot.rotation.y = -0.10;
    P.armR.pivot.rotation.x = TOT_DEEP - LEAN_REST - s*0.42;
    P.armR.pivot.rotation.z = -0.10 - s*0.18;
    P.armL.pivot.rotation.x = 0.12 - s*0.40;
    P.armL.pivot.rotation.z = 0.12 + s*0.18;
    P.head.pivot.rotation.x = 0.16 + s*0.16;
    P.head.pivot.rotation.y = 0.06;
    P.legR.pivot.rotation.x = -0.10 - s*0.30;
    P.legL.pivot.rotation.x =  0.12 + s*0.26;
    steve.position.y = steveY - s*0.10;               // присед
  }

  /* пыль из-под кисти: верхняя грань добываемого блока */
  function puff(){
    const y = targetY() + 0.52;
    const n = 4 + ((Math.random()*3)|0);
    for(let i=0;i<n;i++){
      const s = 0.035 + Math.random()*0.05;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s),
        new THREE.MeshBasicMaterial({ color:INK, transparent:true, opacity:0.32 }));
      m.position.set((Math.random()-0.5)*0.7, y, 0.10 + (Math.random()-0.5)*0.7);
      root.add(m);
      dust.push({ m, life:0, ttl:320 + Math.random()*240,
        vx:(Math.random()-0.5)*0.9, vy:0.5 + Math.random()*0.7,
        vz:0.25 + Math.random()*0.6 });
    }
  }

  /* блок рассыпался: осколки с его же текстурой */
  function spawnShards(mesh){
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for(let i=0;i<16;i++){
      const s = 0.09 + Math.random()*0.13;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s),
        new THREE.MeshLambertMaterial({
          map: mats[(Math.random()*mats.length)|0].map, transparent:true }));
      m.position.copy(mesh.position);
      m.position.x += (Math.random()-0.5)*0.85;
      m.position.y += (Math.random()-0.5)*0.85;
      m.position.z += (Math.random()-0.5)*0.85;
      m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      root.add(m);
      shards.push({ m, life:0, ttl:900 + Math.random()*600,
        vx:(Math.random()-0.5)*2.0, vy:0.7 + Math.random()*1.6,
        vz:(Math.random()-0.5)*2.0,
        wx:(Math.random()-0.5)*9, wy:(Math.random()-0.5)*9 });
    }
  }
  /* ---------------------------------------------------------
     Цикл. Фазы:
       mine — рубит блок под собой, трещины растут по времени
              (как в игре: держишь кнопку — рисунок доходит до
              destroy_9, потом блок ломается);
       fall — падает: с травы на землю, с земли за кадр;
       land — приземлился, присел;
       gone — упал совсем и больше не появится.
     --------------------------------------------------------- */
  let fallV = 0, lastSwing = -1;

  function startMine(){
    phase = 'mine'; phaseT = 0; lastSwing = -1;
    const m = column[target];
    if(m){ crackMesh.position.copy(m.position); setCrack(0); }
  }
  function breakTarget(){
    const m = column[target];
    if(m){ spawnShards(m); m.visible = false; }
    setCrack(-1);
    phase = 'fall'; phaseT = 0; fallV = 0;
    fallFrom = steveY;
    fallTo = target === 0 ? FEET[1] : FEET_GONE;
  }
  function reset(){
    target = 0; hits = 0; fallV = 0;
    steveY = FEET[0];
    column.forEach(m=>{ if(m){ m.visible = true; m.scale.setScalar(1); } });
    clearFx();
    if(steve){ steve.visible = true; steve.position.y = steveY; }
    startMine();
  }
  function clearFx(){
    shards.forEach(s=>{ root.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); });
    dust.forEach(d=>{ root.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose(); });
    shards = []; dust = [];
  }

  function tick(now){
    if(!running){ raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min((now - lastT)/1000, 0.05) : 0.016;
    lastT = now;
    phaseT += dt*1000;

    if(phase === 'mine'){
      const prog = phaseT/MINE_MS;
      setCrack(Math.min(CRACK_N-1, (prog*CRACK_N)|0));
      const sw = (phaseT/SWING_MS)|0;
      const t = (phaseT % SWING_MS)/SWING_MS;
      if(sw !== lastSwing && t >= STRIKE){ lastSwing = sw; puff(); }
      poseMine(t);
      if(prog >= 1) breakTarget();
    } else if(phase === 'fall'){
      fallV += GRAV*dt;
      steveY -= fallV*dt;
      if(steveY <= fallTo){
        steveY = fallTo;
        if(target === 0){
          target = 1;
          phase = 'land'; phaseT = 0;
          const m = column[1];
          if(m){ crackMesh.position.copy(m.position); }
        } else {
          phase = 'gone';
          steve.visible = false;
        }
      }
      if(phase === 'fall'){
        const span = Math.max(0.001, fallFrom - fallTo);
        poseFall(clamp((fallFrom - steveY)/span, 0, 1), now);
      } else if(phase === 'land'){
        steve.position.y = steveY;
      }
    } else if(phase === 'land'){
      poseLand(phaseT/LAND_MS);
      if(phaseT >= LAND_MS) startMine();
    }
    /* фаза gone: Стива нет, но блоки по бокам продолжают крутиться */

    /* блоки в невесомости */
    for(let i=0;i<floaters.length;i++){
      const f = floaters[i];
      f.m.rotation.x += f.wx*dt;
      f.m.rotation.y += f.wy*dt;
      f.m.rotation.z += f.wz*dt;
      f.t += dt;
      f.m.position.y = f.y0 + Math.sin(f.t*f.bs + f.ph)*f.amp;
    }
    stepFx(dt);
    renderer.render(scene, camera);
  }

  function stepFx(dt){
    for(let i=shards.length-1;i>=0;i--){
      const s = shards[i];
      s.life += dt*1000;
      const u = s.life/s.ttl;
      if(u >= 1){
        root.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose();
        shards.splice(i,1); continue;
      }
      s.vy -= 6.4*dt;
      s.m.position.x += s.vx*dt;
      s.m.position.y += s.vy*dt;
      s.m.position.z += s.vz*dt;
      s.m.rotation.x += s.wx*dt; s.m.rotation.y += s.wy*dt;
      s.m.material.opacity = u < 0.55 ? 1 : 1 - (u-0.55)/0.45;
    }
    for(let i=dust.length-1;i>=0;i--){
      const d = dust[i];
      d.life += dt*1000;
      const u = d.life/d.ttl;
      if(u >= 1){
        root.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose();
        dust.splice(i,1); continue;
      }
      d.vy -= 2.6*dt;
      d.m.position.x += d.vx*dt;
      d.m.position.y += d.vy*dt;
      d.m.position.z += d.vz*dt;
      d.m.material.opacity = 0.32*(1-u);
    }
  }
  /* ---------------------------------------------------------
     Блоки в невесомости по бокам. Список задан руками, а не
     случайно: композиция должна быть одна и та же при каждой
     загрузке. Случайны только скорости вращения — они и дают
     ощущение свободного парения.
       [x, y, z, размер, вид]
     --------------------------------------------------------- */
  const FLOAT = [
    [-4.66,  1.32, -0.55, 0.62, 'stone'],
    [-3.45, -0.58,  0.62, 0.78, 'dirt' ],
    [-2.58,  1.86,  0.30, 0.50, 'grass'],
    [ 2.71,  1.68, -0.35, 0.56, 'dirt' ],
    [ 3.65, -0.34,  0.48, 0.82, 'grass'],
    [ 4.73,  1.10, -0.70, 0.58, 'stone'],
  ];

  function build(T){
    scene = new THREE.Scene();
    root = new THREE.Group(); scene.add(root);

    /* столб: трава сверху, земля под ней */
    const grass = buildBlock(T, 'grass');
    grass.position.set(0, GRASS_Y, 0);
    const dirt = buildBlock(T, 'dirt');
    dirt.position.set(0, DIRT_Y, 0);
    root.add(grass); root.add(dirt);
    column = [grass, dirt];

    crackMesh = buildCrackLayer();
    root.add(crackMesh);

    steve = buildSteve(T.skin);
    steve.position.set(STEVE_X, FEET[0], STEVE_Z);
    steve.rotation.y = STEVE_RY;
    root.add(steve);
    steveY = FEET[0];

    /* парящие блоки: у каждого своя ось и скорость */
    let seed = 20260820;
    const rnd = ()=>{ seed = (seed*1664525 + 1013904223)>>>0; return seed/4294967296; };
    floaters = [];
    FLOAT.forEach(f=>{
      const m = buildBlock(T, f[4], true);
      m.scale.setScalar(f[3]);
      m.position.set(f[0], f[1], f[2]);
      m.rotation.set(rnd()*3, rnd()*3, rnd()*3);
      m.userData.noFit = true;              // габарит считаем по списку
      root.add(m);
      floaters.push({ m, y0:f[1], t:rnd()*6,
        wx:(rnd()-0.5)*0.55, wy:(rnd()-0.5)*0.55, wz:(rnd()-0.5)*0.40,
        bs:0.5 + rnd()*0.5, ph:rnd()*6, amp:0.05 + rnd()*0.07 });
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.82));
    const key = new THREE.DirectionalLight(0xffffff, 0.38);
    key.position.set(-2.4, 4.0, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.12);
    fill.position.set(2.6, -0.8, -2.2); scene.add(fill);

    startMine();
    poseMine(0);
  }

  /* ---------------------------------------------------------
     Вписывание.

     Пробники — не углы одного габарита, а список «точка + радиус».
     Так надо из-за парящих блоков: они крутятся, и осевой габарит
     дышал бы вместе с ними, а кадр «плавал» бы каждый кадр. Куб со
     стороной s при любом повороте лежит внутри шара радиусом
     s·√3/2, поэтому блок задаём центром и этим радиусом — габарит
     получается устойчивый.

     Раздувать габарит по Z нельзя: раздутие уводит углы к камере, а
     они в перспективе проецируются шире. Из-за этого прошлый вариант
     просил кадр на 20% больше нужного, и по краям оставалась пустая
     бумага. Здесь радиус переводится в экранный масштаб на СВОЕЙ
     глубине каждой точки — ровно столько места, сколько занимает.
     --------------------------------------------------------- */
  /* Запас почти нулевой сознательно: пробники — это ГАРАНТИРОВАННАЯ
     граница (шар вокруг каждого блока), поэтому при значении ≤1
     срезать нечего, а кадр садится вплотную. Оставляем 1.5% на
     толщину чернильного контура. */
  const FIT_X = 0.985, FIT_Y = 0.985;
  let probes = null;
  function buildProbes(){
    const P = [];
    const V = (x,y,z,r)=> P.push({ p:new THREE.Vector3(x,y,z), r:r||0 });
    /* парящие блоки: центр + полудиагональ, плюс размах покачивания */
    FLOAT.forEach(f=> V(f[0], f[1], f[2], f[3]*Math.sqrt(3)/2 + 0.13));
    /* столб: восемь углов двух блоков */
    for(let i=0;i<8;i++)
      V(i&1?0.5:-0.5, i&2?GRASS_Y+0.5:DIRT_Y-0.5, i&4?0.5:-0.5, 0);
    /* Стив: стоит на траве, макушка на 2.0 над ногами, на заносе
       кисть выходит выше примерно на 0.30 */
    for(let i=0;i<8;i++)
      V(STEVE_X + (i&1?0.42:-0.42), FEET[0] + (i&2?2.30:0),
        STEVE_Z + (i&4?0.42:-0.42), 0);
    return P;
  }
  /* экранный габарит набора пробников при текущей камере */
  function probeExtent(){
    const half = Math.tan(camera.fov*Math.PI/360);
    const v = new THREE.Vector3(), cp = new THREE.Vector3();
    camera.getWorldPosition(cp);
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
    for(let i=0;i<probes.length;i++){
      const pr = probes[i];
      v.copy(pr.p).project(camera);
      let rx = 0, ry = 0;
      if(pr.r){
        /* глубина точки по оси взгляда — на ней и считаем масштаб */
        const d = Math.max(0.05, v.set(0,0,0).copy(pr.p).sub(cp).dot(fwd));
        ry = pr.r/(d*half);
        rx = ry/camera.aspect;
        v.copy(pr.p).project(camera);
      }
      if(v.x-rx < x0) x0 = v.x-rx;
      if(v.x+rx > x1) x1 = v.x+rx;
      if(v.y-ry < y0) y0 = v.y-ry;
      if(v.y+ry > y1) y1 = v.y+ry;
    }
    return { x0, x1, y0, y1 };
  }
  function fit(){
    if(!renderer || !host) return;
    const w = host.clientWidth || 620, h = host.clientHeight || 260;
    if(!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    if(!ready) return;
    if(!probes) probes = buildProbes();

    const dir = new THREE.Vector3(-0.14, 0.26, 1).normalize();
    /* стартовый прицел — середина облака пробников */
    const aim = new THREE.Vector3();
    probes.forEach(pr=> aim.add(pr.p));
    aim.divideScalar(probes.length);

    let dist = 9.0;
    const half = Math.tan(camera.fov*Math.PI/360);
    const up = new THREE.Vector3(), right = new THREE.Vector3();
    for(let it=0; it<26; it++){
      camera.position.copy(aim).addScaledVector(dir, dist);
      camera.lookAt(aim);
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const e = probeExtent();
      /* масштаб: чей запас туже, тот и правит дистанцию */
      const k = Math.max((e.x1-e.x0)/2/FIT_X, (e.y1-e.y0)/2/FIT_Y);
      /* центровка: сдвигаем прицел так, чтобы рисунок встал ровно.
         Смещение в NDC переводим в мир через видимую высоту на
         дистанции камеры. */
      const cx = (e.x0+e.x1)/2, cy = (e.y0+e.y1)/2;
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      aim.addScaledVector(right, cx*dist*half*camera.aspect);
      aim.addScaledVector(up,    cy*dist*half);
      dist = clamp(dist*k, 2.0, 30);
      if(Math.abs(k-1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
    }
    camera.position.copy(aim).addScaledVector(dir, dist);
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function start(){
    if(!ready || running || reduced) return;
    running = true; lastT = 0;
    if(!raf) raf = requestAnimationFrame(tick);
  }
  function stop(){
    running = false;
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
  }

  function init(o){
    THREE = window.THREE;
    host = (o && o.el) || null;
    if(!THREE || !host || renderer) return false;
    reduced = !!(window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const w = host.clientWidth || 620, h = host.clientHeight || 260;
    camera = new THREE.PerspectiveCamera(34, w/h, 0.1, 60);
    renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const T = {};
    const files = [
      ['side',  'grass_side.png'],
      ['top',   'grass_top.png'],
      ['dirt',  'dirt.png'],
      ['stone', 'stone.png'],
      ['skin',  'steve.png'],
    ];
    need = files.length + CRACK_N;
    const done = ()=>{
      if(loaded < need) return;
      if(!T.side || !T.skin) return;        // без ключевых текстур не строим
      build(T);
      ready = true;
      fit();
      if(visible) start();
    };
    files.forEach(f=> loadTex(f[1], TINT, (t)=>{ T[f[0]] = t; loaded++; done(); }));
    crackTex = new Array(CRACK_N).fill(null);
    for(let i=0;i<CRACK_N;i++)
      (function(i){ loadRaw('destroy_'+i+'.png', (t)=>{ crackTex[i] = t; loaded++; done(); }); })(i);

    window.addEventListener('resize', fit);
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden) stop();
      else if(visible) start();
    });
    return true;
  }

  /* вкладка Minecraft показана/скрыта. Возврат на вкладку — как
     перезагрузка страницы: если Стив уже упал, ставим всё заново. */
  function show(on){
    visible = !!on;
    if(visible){
      if(ready){
        if(phase === 'gone') reset();
        fit();
      }
      start();
    } else stop();
  }

  function debug(){
    return { THREE, scene, camera, renderer, root, steve, parts,
             column, floaters, crackMesh, crackTex, shards, dust,
             phase, target, steveY, ready, running, tint:TINT,
             stages:CRACK_N, probes:()=>probes, probeExtent,
             layout:{ GRASS_Y, DIRT_Y, FEET, FEET_GONE, STEVE_X, STEVE_Z },
             pose:{ mine:poseMine, fall:poseFall, land:poseLand },
             setCrack, reset };
  }

  return { init, show, resize:fit, ready: ()=> ready, debug };
})();
