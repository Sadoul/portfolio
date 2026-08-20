/* =========================================================
   MC_SCENE — 3D-сцена для вкладки Minecraft: Стив ломает блок.
   Настоящая геометрия (Three.js), не спрайты: куб из шести
   текстурованных граней, Стив — классическая модель из семи
   боксов с UV из скина 64×64.

   Стиль: сайт чёрно-белый скетчевый, поэтому текстуры блоков и
   скина обесцвечены и лишь СЛЕГКА тонированы своим цветом
   (трава зеленит, земля коричневит, кожа телесная). Пиксели
   остаются пиксельными (NearestFilter), контуры обведены
   чернилами — как у механизма.

   Анимация: замах → удар → прогресс разрушения (трещины по
   стадиям) → блок рассыпается на осколки → пауза → блок
   возвращается. Цикл. Стив при этом дышит, приседает на ударе,
   голова следит за блоком, вторая рука и ноги отыгрывают отдачу.
   ========================================================= */
window.MC_SCENE = (function(){
  "use strict";

  const INK   = 0x161413;
  const PAPER = 0xf6f2e9;
  /* Сколько родного цвета оставляем от текстуры: 0 = серое,
     1 = как в игре. Было 0.26/0.20 — от текстур оставалась серая
     каша, трава не читалась как трава. Держим 0.62/0.55: текстуры
     узнаются, но остаются приглушёнными под скетч-стиль сайта. */
  const TINT_BLOCK = 0.62;
  const TINT_SKIN  = 0.55;

  const TEX = 'assets/mc/tex/';
  let THREE = null;
  let host = null, renderer = null, scene = null, camera = null;
  let root = null, steve = null, block = null, crackMesh = null;
  let shards = [], parts = {};
  let raf = 0, running = false, reduced = false, visible = false;
  let lastT = 0, phase = 'swing', phaseT = 0, hits = 0, dust = [];
  let loaded = 0, ready = false;

  const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
  const lerp  = (a,b,t)=> a+(b-a)*t;
  const ease  = (t)=> t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
  const easeOut = (t)=> 1-Math.pow(1-t,3);
  const easeIn  = (t)=> t*t*t;

  /* ---------------------------------------------------------
     Загрузка текстуры + обесцвечивание на canvas.
     Возвращаем CanvasTexture: так не нужны отдельные файлы под
     обесцвеченный вариант, и степень тонирования можно менять.
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
        /* яркость по восприятию, потом подмешиваем родной цвет */
        const l = 0.299*a[i] + 0.587*a[i+1] + 0.114*a[i+2];
        /* тянем к бумаге, но слабее, чем раньше (было 46 + l*0.80):
           сильный подъём чёрного съедал контраст пикселей */
        const b = 26 + l*0.90;
        a[i]   = clamp(b + (a[i]  -l)*tint, 0, 255)|0;
        a[i+1] = clamp(b + (a[i+1]-l)*tint, 0, 255)|0;
        a[i+2] = clamp(b + (a[i+2]-l)*tint, 0, 255)|0;
      }
      x.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;      // пиксели остаются пикселями
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      cb(t);
    };
    img.onerror = ()=> cb(null);
    img.src = TEX + file;
  }

  /* ---------------------------------------------------------
     UV для боксов Minecraft-модели.
     Скин 64×64: у каждой части свой прямоугольник развёртки —
     четыре боковые грани в ряд и две (верх/низ) над ними.
     Порядок групп у BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
     В скине +X — это ЛЕВАЯ для зрителя грань, поэтому право/лево
     в раскладке зеркальны относительно интуиции.
     --------------------------------------------------------- */
  function skinUV(geo, o){
    /* o: {x,y,w,h,d} — левый-верхний угол развёртки и размеры части
       в пикселях скина (как в вики: w=ширина, h=высота, d=глубина) */
    const S = 64;
    const uv = geo.attributes.uv;
    /* прямоугольники в пикселях: [x0,y0,w,h] для каждой группы */
    const R = {
      px: [o.x,               o.y + o.d, o.d, o.h],   // +X (для зрителя левая)
      nx: [o.x + o.d + o.w,   o.y + o.d, o.d, o.h],   // -X
      py: [o.x + o.d,         o.y,       o.w, o.d],   // верх
      ny: [o.x + o.d + o.w,   o.y,       o.w, o.d],   // низ
      pz: [o.x + o.d,         o.y + o.d, o.w, o.h],   // передняя
      nz: [o.x + o.d*2 + o.w, o.y + o.d, o.w, o.h]    // задняя
    };
    const order = ['px','nx','py','ny','pz','nz'];
    order.forEach((k, gi)=>{
      const r = R[k];
      const u0 = r[0]/S, u1 = (r[0]+r[2])/S;
      /* v считаем от низа: текстура читается сверху, UV — снизу */
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

  /* контур части: чернильные рёбра, как у механизма */
  function inked(mesh, soft){
    const e = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color:INK, transparent:true,
                                    opacity: soft ? 0.42 : 0.80 }));
    mesh.add(e);
    return mesh;
  }

  /* одна часть тела: бокс нужного размера с UV из скина.
     pivot — куда посадить точку вращения (плечо/бедро сверху). */
  function part(mat, size, uvBox, pivotTop){
    const U = 1/16;                            // 1 пиксель Minecraft = 1/16 юнита
    const g = new THREE.BoxGeometry(size[0]*U, size[1]*U, size[2]*U);
    skinUV(g, uvBox);
    const m = new THREE.Mesh(g, mat);
    inked(m);
    const pivot = new THREE.Group();
    /* сдвигаем меш так, чтобы вращение шло от верха части */
    if(pivotTop) m.position.y = -size[1]*U/2;
    pivot.add(m);
    return { pivot, mesh:m };
  }

  /* ---------------------------------------------------------
     Стив: голова 8×8×8, тело 8×12×4, руки и ноги 4×12×4.
     Развёртки — стандартные для скина 64×64 (только базовый слой,
     второго в этом скине нет).
     --------------------------------------------------------- */
  const U = 1/16;
  function buildSteve(skinTex){
    const mat = new THREE.MeshLambertMaterial({
      map:skinTex, transparent:true, alphaTest:0.5 });
    const g = new THREE.Group();

    const head  = part(mat, [8,8,8],  { x:0,  y:0,  w:8, h:8, d:8 }, false);
    const body  = part(mat, [8,12,4],  { x:16, y:16, w:8, h:12, d:4 }, false);
    const armR  = part(mat, [4,12,4],  { x:40, y:16, w:4, h:12, d:4 }, true);
    const armL  = part(mat, [4,12,4],  { x:32, y:48, w:4, h:12, d:4 }, true);
    const legR  = part(mat, [4,12,4],  { x:0,  y:16, w:4, h:12, d:4 }, true);
    const legL  = part(mat, [4,12,4],  { x:16, y:48, w:4, h:12, d:4 }, true);

    /* сборка по высотам: ноги 12px, тело 12px, голова 8px */
    legR.pivot.position.set(-2*U, 12*U, 0);
    legL.pivot.position.set( 2*U, 12*U, 0);
    body.pivot.position.set(0, 12*U + 6*U, 0);
    armR.pivot.position.set(-6*U, 12*U + 12*U, 0);
    armL.pivot.position.set( 6*U, 12*U + 12*U, 0);
    head.pivot.position.set(0, 12*U + 12*U + 4*U, 0);

    [legR, legL, body, armR, armL, head].forEach(p=> g.add(p.pivot));
    parts = { head, body, armR, armL, legR, legL };
    return g;
  }

  /* ---------------------------------------------------------
     Блок: куб 1×1×1 с шестью гранями. Трава — бок/верх/низ разные,
     камень и земля — одна текстура на все грани.
     --------------------------------------------------------- */
  function buildBlock(tex){
    /* порядок групп: +X, -X, +Y, -Y, +Z, -Z */
    const side = tex.side, top = tex.top, bot = tex.bottom;
    const mk = (t)=> new THREE.MeshLambertMaterial({ map:t });
    const mats = [mk(side), mk(side), mk(top), mk(bot), mk(side), mk(side)];
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Mesh(g, mats);
    inked(m);
    return m;
  }

  /* ---------------------------------------------------------
     Трещины: рисуем сами (в игре это destroy_stage_0..9).
     Ветвящиеся линии от центра, каждая стадия добавляет новые —
     поэтому рисунок «растёт», а не подменяется целиком.
     Накладываем чуть увеличенным кубом поверх блока.
     --------------------------------------------------------- */
  const CRACK_STAGES = 8;
  function texCracks(stage){
    const S = 128;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d');
    if(stage <= 0){
      return null;
    }
    /* детерминированно: одна и та же трещина на каждой стадии */
    let seed = 1337;
    const rnd = ()=>{ seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; };
    x.strokeStyle = 'rgba(22,20,19,0.86)';
    x.lineCap = 'round';
    const branches = 5;
    for(let b=0;b<branches;b++){
      const total = 3 + (b%3);                 // сегментов в ветке
      /* сколько сегментов этой ветки уже проявилось */
      const grown = clamp(Math.round(total*stage/CRACK_STAGES*1.6) - (b>2?1:0), 0, total);
      if(grown <= 0){ for(let k=0;k<total;k++){ rnd(); rnd(); } continue; }
      let px = S/2 + (rnd()-0.5)*10, py = S/2 + (rnd()-0.5)*10;
      let ang = b/branches*Math.PI*2 + rnd()*0.7;
      x.lineWidth = 3.0;
      for(let k=0;k<total;k++){
        const len = 12 + rnd()*16;
        const nx = px + Math.cos(ang)*len, ny = py + Math.sin(ang)*len;
        if(k < grown){
          x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
        }
        px = nx; py = ny;
        ang += (rnd()-0.5)*1.1;
        x.lineWidth = Math.max(1.4, x.lineWidth - 0.5);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }
  let crackTex = [];
  function buildCracks(){
    crackTex = [];
    for(let i=0;i<=CRACK_STAGES;i++) crackTex.push(texCracks(i));
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0,
                                    depthWrite:false }));
    return m;
  }
  function setCrack(stage){
    if(!crackMesh) return;
    const t = crackTex[clamp(stage, 0, CRACK_STAGES)];
    /* на нулевой стадии слой не нужен вообще — выключаем меш,
       а не оставляем прозрачный лишним вызовом отрисовки */
    crackMesh.visible = !!t;
    if(!t) return;
    crackMesh.material.map = t;
    crackMesh.material.opacity = 0.92;
    crackMesh.material.needsUpdate = true;
  }

  /* ---------------------------------------------------------
     Осколки: блок рассыпается на мелкие кубики с теми же
     текстурами. Разлетаются с гравитацией и растворяются.
     --------------------------------------------------------- */
  function spawnShards(){
    const mats = block.material;
    for(let i=0;i<14;i++){
      const s = 0.10 + Math.random()*0.13;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshLambertMaterial({ map: mats[(Math.random()*6)|0].map,
                                        transparent:true }));
      m.position.copy(block.position);
      m.position.x += (Math.random()-0.5)*0.8;
      m.position.y += (Math.random()-0.5)*0.8;
      m.position.z += (Math.random()-0.5)*0.8;
      m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
      root.add(m);
      shards.push({ m, life:0, ttl: 700 + Math.random()*500,
        vx:(Math.random()-0.5)*1.7, vy: 0.9 + Math.random()*1.5,
        vz:(Math.random()-0.5)*1.7,
        wx:(Math.random()-0.5)*9, wy:(Math.random()-0.5)*9 });
    }
  }
  function clearShards(){
    shards.forEach(s=>{ root.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); });
    shards = [];
  }

  /* ---------------------------------------------------------
     Анимация. Фазы:
       swing — замах и удар (по HITS_TO_BREAK раз), каждый удар
               добавляет стадию трещин;
       break — блок рассыпался, Стив отшатнулся;
       wait  — пауза;
       grow  — блок возвращается (масштаб от 0).
     --------------------------------------------------------- */
  /* Компоновка сцены. GROUND — верх плиты-земли, на нём и Стив, и блок.
     BLOCK_X подобран так, чтобы левая грань блока оказалась под кистью
     в момент ARM_HIT (проверено замером в браузере). */
  const GROUND  = -0.62;
  const STEVE_X = -0.34, STEVE_Z = -0.30;
  /* добываемый блок — верхний в столбе из двух: низ на GROUND+1,
     центр на GROUND+1.5, то есть на уровне плеча Стива */
  const BLOCK_X =  0.72, BLOCK_Z =  0.02;
  const BLOCK_Y =  GROUND + 1.5;

  const HITS_TO_BREAK = CRACK_STAGES;
  const SWING_MS = 460;         // один замах+удар
  const BREAK_MS = 620;
  const WAIT_MS  = 520;
  const GROW_MS  = 380;

  /* Ключевые углы правой руки. Плечо — точка вращения сверху, меш
     висит вниз, поэтому ОТРИЦАТЕЛЬНЫЙ rotation.x уводит кисть вперёд
     (к блоку), положительный — назад.
     Кисть в мире описывается (замерено в браузере, отсюда и числа):
       x(θ) = −0.472 − 0.714·sin θ,  y(θ) = 0.870 − 0.740·cos θ
     Максимум вылета по x — при θ ≈ −π/2, там же y ≈ 0.87. Поэтому
     добываемый блок поднят на высоту груди: удар приходит в середину
     грани, а не скользит по верхнему ребру.
       REST −0.30 → кисть у бедра
       UP   −2.95 → рука занесена над головой (кисть y≈1.60)
       HIT  −1.45 → кисть у грани, x 0.235 при грани 0.22
       DEEP −1.56 → перебег: кисть заходит в грань на 0.022 */
  const ARM_REST = -0.30, ARM_UP = -2.95, ARM_HIT = -1.45, ARM_DEEP = -1.56;

  /* поза Стива на фазе замаха: t = 0..1 внутри одного удара */
  function poseSwing(t){
    const P = parts;
    /* контакт в момент 0.58: до него — занос вверх-назад через голову,
       после — резкий мах вниз, перебег в грань и отдача */
    const strike = 0.58;
    let armX;
    if(t < strike){
      /* занос: рука идёт вверх, к концу притормаживает (антиципация) */
      const u = t/strike;
      armX = lerp(ARM_REST, ARM_UP, ease(u));
    } else {
      const u = (t - strike)/(1 - strike);
      if(u < 0.30){
        /* мах: почти линейно, с ускорением — самая быстрая часть */
        armX = lerp(ARM_UP, ARM_DEEP, easeIn(u/0.30));
      } else {
        /* отдача от блока обратно к бедру */
        armX = lerp(ARM_DEEP, ARM_REST, ease((u - 0.30)/0.70));
      }
    }
    P.armR.pivot.rotation.x = armX;
    /* плечо чуть разводит в сторону на замахе — мах не плоский */
    P.armR.pivot.rotation.z = -0.14 - 0.13*Math.sin(Math.min(t/strike,1)*Math.PI);

    /* импульс удара: узкий пик сразу после контакта */
    const k = (t - strike)/0.10;
    const impact = t < strike ? 0 : Math.exp(-(k*k));

    /* корпус: скрутка на замахе, раскрутка в удар, присед на контакте */
    const wind = t < strike ? ease(t/strike) : 1 - ease(Math.min((t-strike)/0.34, 1));
    P.body.pivot.rotation.y = -0.18 - wind*0.26;
    P.body.pivot.rotation.x = 0.05 + wind*0.06 + impact*0.16;
    P.body.pivot.rotation.z = wind*0.07;
    /* присед на контакте и короткий выпад к блоку — вес удара */
    root.position.y = -impact*0.06 - wind*0.02;
    root.position.x = impact*0.055;

    /* вторая рука — противофаза, отыгрывает баланс */
    P.armL.pivot.rotation.x = lerp(0.18, 0.62, wind) - impact*0.30;
    P.armL.pivot.rotation.z = 0.12 + wind*0.16;

    /* голова: следит за точкой удара, кивок от отдачи */
    P.head.pivot.rotation.x = 0.20 + wind*0.12 + impact*0.14;
    P.head.pivot.rotation.y = -0.14 + wind*0.10;

    /* ноги: упор, пружина на контакте */
    P.legR.pivot.rotation.x = -0.12 - wind*0.10 - impact*0.12;
    P.legL.pivot.rotation.x =  0.10 + wind*0.08 + impact*0.07;
  }

  /* отшатнулся после того, как блок рассыпался: короткий откид назад,
     руки вверх-вразлёт, голова поднялась — «сломал» */
  function poseBreak(t){
    const P = parts, e = easeOut(clamp(t*1.5, 0, 1));
    const back = Math.sin(t*Math.PI);
    P.armR.pivot.rotation.x = lerp(ARM_DEEP, ARM_REST, e) + back*0.36;
    P.armR.pivot.rotation.z = -0.14 - back*0.26;
    P.armL.pivot.rotation.x = lerp(0.62, 0.18, e) + back*0.30;
    P.armL.pivot.rotation.z = 0.12 + back*0.28;
    P.body.pivot.rotation.x = 0.05 - back*0.18;      // разогнулся
    P.body.pivot.rotation.y = -0.18 + back*0.12;
    P.body.pivot.rotation.z = 0;
    P.head.pivot.rotation.x = 0.20 - back*0.34;      // поднял голову
    P.head.pivot.rotation.y = -0.14 + back*0.14;
    P.legR.pivot.rotation.x = -0.12 + back*0.12;
    P.legL.pivot.rotation.x = 0.10 - back*0.12;
    root.position.y = back*0.02;
    root.position.x = lerp(0.055, 0, e);          // вернулся из выпада
  }

  /* дыхание в паузе */
  function poseIdle(now){
    const P = parts, b = Math.sin(now/720);
    P.armR.pivot.rotation.x = ARM_REST + b*0.05;
    P.armR.pivot.rotation.z = -0.14 - Math.abs(b)*0.03;
    P.armL.pivot.rotation.x = 0.18 - b*0.05;
    P.armL.pivot.rotation.z = 0.12 + Math.abs(b)*0.03;
    P.body.pivot.rotation.x = 0.05;
    P.body.pivot.rotation.y = -0.18;
    P.body.pivot.rotation.z = 0;
    P.head.pivot.rotation.x = 0.14 + b*0.04;
    P.head.pivot.rotation.y = -0.14 + b*0.06;
    P.legR.pivot.rotation.x = -0.10;
    P.legL.pivot.rotation.x = 0.08;
    root.position.y = b*0.008;
    root.position.x = 0;
  }

  /* пыль от удара — маленькие тёмные кубики у точки контакта: левая
     грань блока, верхняя её часть (куда приходит кисть) */
  function puff(){
    const n = 4 + ((Math.random()*3)|0);
    for(let i=0;i<n;i++){
      const s = 0.04 + Math.random()*0.055;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s),
        new THREE.MeshBasicMaterial({ color:INK, transparent:true, opacity:0.34 }));
      /* точка контакта: левая грань, чуть ниже середины по высоте,
         ближе к переднему краю — там и оказывается кисть */
      m.position.set(block.position.x - 0.5,
                     block.position.y - 0.06 + (Math.random()-0.5)*0.30,
                     block.position.z + 0.28 + (Math.random()-0.5)*0.38);
      root.add(m);
      dust.push({ m, life:0, ttl:340 + Math.random()*240,
        vx:-0.55 - Math.random()*0.7, vy:0.45 + Math.random()*0.8,
        vz:(Math.random()-0.5)*0.8 });
    }
  }

  function tick(now){
    if(!running){ raf = 0; return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min((now - lastT)/1000, 0.05) : 0.016;
    lastT = now;
    phaseT += dt*1000;

    if(phase === 'swing'){
      const t = phaseT/SWING_MS;
      if(t >= 1){
        phaseT = 0; hits++;
        setCrack(hits);
        puff();
        if(hits >= HITS_TO_BREAK){
          phase = 'break';
          setCrack(0);
          block.visible = false; crackMesh.visible = false;
          spawnShards();
        }
      } else poseSwing(t);
    } else if(phase === 'break'){
      poseBreak(clamp(phaseT/BREAK_MS, 0, 1));
      if(phaseT >= BREAK_MS){ phase = 'wait'; phaseT = 0; }
    } else if(phase === 'wait'){
      poseIdle(now);
      if(phaseT >= WAIT_MS){
        phase = 'grow'; phaseT = 0;
        clearShards();
        block.visible = true; crackMesh.visible = true;
        setCrack(0); hits = 0;
      }
    } else if(phase === 'grow'){
      const u = clamp(phaseT/GROW_MS, 0, 1);
      /* блок возвращается с перепрыгом — как в игре при установке */
      const s = easeOut(u)*1.06 - (u > 0.75 ? (u-0.75)*0.24 : 0);
      block.scale.setScalar(clamp(s, 0.001, 1.06));
      crackMesh.scale.copy(block.scale);
      poseIdle(now);
      if(u >= 1){
        block.scale.setScalar(1); crackMesh.scale.setScalar(1);
        phase = 'swing'; phaseT = 0;
      }
    }

    /* осколки */
    for(let i=shards.length-1;i>=0;i--){
      const s = shards[i];
      s.life += dt*1000;
      const u = s.life/s.ttl;
      if(u >= 1){
        root.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose();
        shards.splice(i,1); continue;
      }
      s.vy -= 5.2*dt;                                  // гравитация
      s.m.position.x += s.vx*dt;
      s.m.position.y += s.vy*dt;
      s.m.position.z += s.vz*dt;
      if(s.m.position.y < GROUND + 0.06){ s.m.position.y = GROUND + 0.06;
        s.vy *= -0.36; s.vx *= 0.7; s.vz *= 0.7; }
      s.m.rotation.x += s.wx*dt; s.m.rotation.y += s.wy*dt;
      s.m.material.opacity = u < 0.6 ? 1 : 1 - (u-0.6)/0.4;
    }
    /* пыль */
    for(let i=dust.length-1;i>=0;i--){
      const d = dust[i];
      d.life += dt*1000;
      const u = d.life/d.ttl;
      if(u >= 1){
        root.remove(d.m); d.m.geometry.dispose(); d.m.material.dispose();
        dust.splice(i,1); continue;
      }
      d.vy -= 2.4*dt;
      d.m.position.x += d.vx*dt;
      d.m.position.y += d.vy*dt;
      d.m.position.z += d.vz*dt;
      d.m.material.opacity = 0.34*(1-u);
    }

    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------
     Сборка и API
     --------------------------------------------------------- */
  function build(textures){
    scene = new THREE.Scene();
    root = new THREE.Group(); scene.add(root);

    /* Добываемый блок — верхний в столбе из двух. По X стоит так,
       чтобы левая грань попала точно под кисть в момент удара. */
    block = buildBlock(textures);
    block.position.set(BLOCK_X, BLOCK_Y, BLOCK_Z);
    root.add(block);
    crackMesh = buildCracks();
    crackMesh.position.copy(block.position);
    root.add(crackMesh);

    steve = buildSteve(textures.skin);
    /* Стив слева от блока, стоит на полу (ноги — низ фигуры).
       Рука вращается вокруг локальной оси X, кисть ходит по локальной
       плоскости YZ — поэтому «вперёд» у Стива смотрит НА блок:
       поворот 74° по Y. Не ровно 90°, чтобы остался трёхчетвертной
       вид (видно лицо и скрутку корпуса), но мах приходит в грань. */
    steve.position.set(STEVE_X, GROUND, STEVE_Z);
    steve.rotation.y = 74 * Math.PI/180;
    root.add(steve);

    /* Земля: не плита, а ряд настоящих блоков 1×1×1 — читается как
       кусок мира, а не подставка. Ряд заведомо шире кадра и помечен
       noFit, поэтому уходит за левый и правый край и не влияет на
       вписывание (иначе он бы отжимал камеру назад). */
    const lam = (t)=> new THREE.MeshLambertMaterial({ map:t });
    /* трава — бока/верх/низ разные, земля и камень цельные со всех сторон */
    const gm = [textures.side, textures.side, textures.top,
                textures.bottom, textures.side, textures.side].map(lam);
    const dirtM  = lam(textures.bottom);
    const stoneM = lam(textures.stone);
    for(let i=-5;i<=5;i++){
      const c = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), gm);
      c.position.set(0.15 + i*1.0, GROUND - 0.5, 0);
      inked(c, true);
      c.userData.noFit = true;
      root.add(c);
    }
    /* опора под добываемым блоком — он верхний в столбе. Земля, а не
       трава: сверху травяной блок, под ним земля — как в игре, и сразу
       видно, какой именно блок добывают. */
    const base = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), dirtM);
    base.position.set(BLOCK_X, GROUND + 0.5, BLOCK_Z);
    inked(base, true);
    base.userData.noFit = true;
    root.add(base);

    /* пара блоков по бокам на земле — сцена читается как кусок мира,
       а не как две фигуры в пустоте. Тоже noFit. */
    [[-1.85, stoneM], [2.72, gm]].forEach(([x, mat])=>{
      const c = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat);
      c.position.set(x, GROUND + 0.5, 0);
      inked(c, true);
      c.userData.noFit = true;
      root.add(c);
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.80));
    const key = new THREE.DirectionalLight(0xffffff, 0.40);
    key.position.set(-2.4, 4.0, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.12);
    fill.position.set(2.6, -0.8, -2.2); scene.add(fill);

    setCrack(0);
    poseIdle(0);
  }

  /* ---------------------------------------------------------
     Вписывание: как у механизма — подбираем дистанцию камеры по
     проекции габарита, а не подставляем числа руками. Тогда сцена
     заполняет кадр на любой пропорции контейнера и ничего не
     срезается. Габарит берём с запасом на замах руки: в позе покоя
     он меньше, чем в движении.
     --------------------------------------------------------- */
  const FIT_X = 0.92, FIT_Y = 0.88;
  /* доля высоты кадра, оставляемая над самой верхней точкой композиции */
  const TOP_PAD = 0.012;
  let fitPts = null;
  function buildFitPoints(){
    /* Габарит только по «главному»: Стив + блок. Ряд земли помечен
       noFit и в расчёт не идёт — он должен уходить за края кадра. */
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    bb.expandByObject(steve);
    bb.expandByObject(block);
    /* Замер в браузере: макушка 1.431, кисть в верхней точке замаха
       1.630 — рука выходит над головой на 0.199. Запас берём чуть
       меньше этого: на пике кисть подходит к самой кромке, но не
       срезается, а в покое над Стивом не остаётся лишней бумаги
       (со старым 0.24 в покое пустовало 28px из 258). */
    bb.max.y += 0.21;
    bb.min.y -= 0.14;                       // видно верх земли под ними
    bb.min.x -= 0.14; bb.max.x += 0.14;
    const p = [];
    for(let i=0;i<8;i++)
      p.push(new THREE.Vector3(
        i&1 ? bb.max.x : bb.min.x,
        i&2 ? bb.max.y : bb.min.y,
        i&4 ? bb.max.z : bb.min.z));
    /* центр по горизонтали и вертикали — куда смотреть */
    const c = bb.getCenter(new THREE.Vector3());
    return { pts:p, center:c };
  }
  function fit(){
    if(!renderer || !host) return;
    const w = host.clientWidth || 560, h = host.clientHeight || 200;
    if(!w || !h) return;                     // контейнер ещё скрыт
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    if(!ready) return;
    if(!fitPts) fitPts = buildFitPoints();
    const C = fitPts.center;
    /* камера чуть выше и левее, смотрит в центр композиции */
    const dir = new THREE.Vector3(-0.16, 0.34, 1).normalize();
    let dist = 3.2;
    const v = new THREE.Vector3();
    for(let it=0; it<20; it++){
      camera.position.copy(C).addScaledVector(dir, dist);
      camera.lookAt(C);
      camera.updateMatrixWorld();
      let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
      for(let i=0;i<fitPts.pts.length;i++){
        v.copy(fitPts.pts[i]).project(camera);
        if(v.x<x0)x0=v.x; if(v.x>x1)x1=v.x;
        if(v.y<y0)y0=v.y; if(v.y>y1)y1=v.y;
      }
      const k = Math.max((x1-x0)/2/FIT_X, (y1-y0)/2/FIT_Y);
      dist = clamp(dist*k, 1.6, 14);
      if(Math.abs(k-1) < 0.003) break;
    }
    /* Прижимаем композицию к верху кадра.
       Камера смотрит в центр габарита, значит центр всегда попадает в
       центр кадра, а весь незанятый запас делится пополам. Внизу его
       закрывает ряд земли (он noFit и уходит за кадр), а сверху
       оставалась полоса голой бумаги — из-за неё между сценой и
       карточками читался провал. Сдвигаем точку прицела вниз, пока
       верх габарита не встанет на TOP_PAD от кромки. */
    const aim = C.clone();
    const half = Math.tan(camera.fov*Math.PI/360);
    for(let it=0; it<8; it++){
      camera.position.copy(aim).addScaledVector(dir, dist);
      camera.lookAt(aim);
      camera.updateMatrixWorld();
      let top = -Infinity;
      for(let i=0;i<fitPts.pts.length;i++){
        v.copy(fitPts.pts[i]).project(camera);
        if(v.y>top) top = v.y;
      }
      const want = 1 - 2*TOP_PAD;             // NDC верхней кромки с полем
      const d = (want - top)/2 * (2*dist*half);
      if(Math.abs(d) < 0.004) break;
      aim.y -= d;                             // прицел ниже — картинка выше
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

    const w = host.clientWidth || 560, h = host.clientHeight || 200;
    camera = new THREE.PerspectiveCamera(38, w/h, 0.1, 40);
    renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    /* грузим пять текстур, собираем сцену когда все готовы */
    const T = {};
    const files = [
      ['side',   'grass_side.png', TINT_BLOCK],
      ['top',    'grass_top.png',  TINT_BLOCK],
      ['bottom', 'dirt.png',       TINT_BLOCK],
      ['stone',  'stone.png',      TINT_BLOCK],
      ['skin',   'steve.png',      TINT_SKIN]
    ];
    files.forEach(f=>{
      loadTex(f[1], f[2], (t)=>{
        T[f[0]] = t; loaded++;
        if(loaded < files.length) return;
        if(!T.side || !T.skin) return;          // без ключевых текстур не строим
        build(T);
        ready = true;
        fit();
        /* если вкладка уже открыта — сразу поехали */
        if(visible) start();
      });
    });

    window.addEventListener('resize', fit);
    /* вкладка браузера в фоне — не жжём кадры */
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden) stop();
      else if(visible) start();
    });
    return true;
  }

  /* вкладка Minecraft показана/скрыта */
  function show(on){
    visible = !!on;
    if(visible){
      if(ready) fit();
      start();
    } else stop();
  }

  function debug(){
    return { THREE, scene, camera, renderer, root, steve, block, crackMesh,
             parts, shards, dust, phase, hits, ready, running,
             stages:CRACK_STAGES, tint:{ block:TINT_BLOCK, skin:TINT_SKIN },
             pose:{ swing:poseSwing, brk:poseBreak, idle:poseIdle },
             arm:{ REST:ARM_REST, UP:ARM_UP, HIT:ARM_HIT, DEEP:ARM_DEEP },
             layout:{ GROUND, STEVE_X, STEVE_Z, BLOCK_X, BLOCK_Z },
             setCrack };
  }

  return { init, show, resize:fit, ready: ()=> ready, debug };
})();
