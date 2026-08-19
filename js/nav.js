/* =========================================================
   Навигация по табам + i18n + ГЕРОЙ-БАРАБАН.
   Барабан = 3D-цилиндр в ракурсе 3/4: верхний овал (чистая
   плоскость) + боковая стенка вниз + вертикальные зубья-блоки
   с горизонтальной штриховкой (фактура металла).
   Вращение: слабый холостой ход + сильно при скролле.
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, BIO, UI, PH } = window.PORTFOLIO;
  const ACTIVE = TABS.filter(t => t.active);
  const N = ACTIVE.length;

  const tabsEl  = document.getElementById('tabs');
  const strip   = document.getElementById('tabStrip');
  const subEl   = document.getElementById('tabSub');
  const content = document.getElementById('content');
  const arrowL  = document.getElementById('arrowLeft');
  const arrowR  = document.getElementById('arrowRight');
  const heroEl   = document.getElementById('heroGear');
  const sideGearEl = document.getElementById('drumGear');
  const langSw  = document.getElementById('langSwitch');
  const swapEl  = document.getElementById('swap');
  const swapTxt = document.getElementById('swapText');

  let lang = 'ru';
  let current = 0;
  let tabButtons = [];

  const L = (o) => (o && o[lang]) || '';
  const clamp = (n, m) => ((n % m) + m) % m;

  /* =========================================================
     ГЕРОЙ-ШЕСТЕРНЯ (#heroGear, Three.js): короткий цилиндр с
     трапециевидными впадинами. Крутится ТОЛЬКО при смене вкладок
     (мягко влево/вправо). Верх чистый; на боку — редкие короткие
     вертикальные полоски (≤4 на грань, не от краёв).
     БОКОВОЙ drumGear (#drumGear): декоративная SVG-шестерёнка,
     слабый холостой ход + сильно при скролле.
     ========================================================= */
  let gearState = null;
  let heroAngle = 0, heroTarget = 0;     // hero: целевой угол (меняется при смене вкладок)
  let sideAngle = 0, sideVel = 0;        // боковая: холостой ход + скролл

  /* боковая декоративная шестерёнка */
  function buildSideCog(){
    if (!sideGearEl) return;
    const teeth=24, Rr=100, Rt=122, hub=24, tw=8;
    let s=[`<svg viewBox="-130 -130 260 260" preserveAspectRatio="xMidYMid meet">`];
    s.push(`<g fill="none" stroke="#161413" stroke-width="2.4" stroke-linejoin="round">`);
    for(let i=0;i<teeth;i++){ const a=i*(360/teeth); s.push(`<rect x="${Rr-1.5}" y="${-tw/2}" width="${Rt-Rr+3}" height="${tw}" transform="rotate(${a})" stroke-width="2.2"/>`); }
    s.push(`<circle cx="0" cy="0" r="${Rr}" stroke-width="2.4"/>`);
    s.push(`<circle cx="0" cy="0" r="${Rr-16}" stroke-width="1.4"/>`);
    for(let i=0;i<6;i++){ const a=i*60*Math.PI/180; const x1=(hub+2)*Math.cos(a),y1=(hub+2)*Math.sin(a),x2=(Rr-18)*Math.cos(a),y2=(Rr-18)*Math.sin(a); s.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="1.8"/>`); }
    s.push(`<circle cx="0" cy="0" r="${hub}" stroke-width="2.4"/>`);
    s.push(`<circle cx="0" cy="0" r="${hub-7}" stroke-width="1.2"/>`);
    s.push(`</g></svg>`);
    sideGearEl.innerHTML = s.join("");
  }

  function makeVerticalStripesTex(THREE){
    const W=256, H=128;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const x=c.getContext('2d');
    x.fillStyle='#dfd8c8'; x.fillRect(0,0,W,H);
    x.strokeStyle='#161413'; x.lineWidth=2;
    let rng=98765; const rnd=()=>{ rng=(rng*1103515245+12345)&0x7fffffff; return rng/0x7fffffff; };
    const top=16, bot=H-16;                 // не от краёв сверху/снизу
    const count=2+Math.floor(rnd()*3);      // 2..4 полосы (≤4 на грань)
    for(let k=0;k<count;k++){
      const px=14+rnd()*(W-28);
      const h=10+rnd()*30;                  // короткие, разной длины
      const y=top+rnd()*((bot-top)-h);      // на разной высоте
      x.beginPath(); x.moveTo(px,y); x.lineTo(px,y+h); x.stroke();
    }
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(16,1);   // одна плитка на грань зуба
    return t;
  }
  function gearShape(THREE, teeth, Rroot, Rtip){
    const s=new THREE.Shape();
    const step=Math.PI*2/teeth;
    const base=step*0.50, top=step*0.46, taper=(base-top)/2; // широкая плоская вершина, почти прямоугольные, явные трапеции
    const P=(r,ang)=>[r*Math.cos(ang), r*Math.sin(ang)];
    for(let i=0;i<teeth;i++){
      const a=i*step;
      if(i===0) s.moveTo(...P(Rroot, a));
      s.lineTo(...P(Rtip, a+taper));
      s.lineTo(...P(Rtip, a+taper+top));
      s.lineTo(...P(Rroot, a+base));
    }
    s.closePath();
    return s;
  }
  function makeLabelTex(THREE, text){
    const c=document.createElement('canvas'); c.width=512; c.height=160;
    const x=c.getContext('2d');
    x.clearRect(0,0,512,160);
    const rr=(X,Y,W,H,R)=>{ x.beginPath(); x.moveTo(X+R,Y); x.arcTo(X+W,Y,X+W,Y+H,R); x.arcTo(X+W,Y+H,X,Y+H,R); x.arcTo(X,Y+H,X,Y,R); x.arcTo(X,Y,X+W,Y,R); x.closePath(); };
    x.fillStyle='rgba(246,242,233,0.94)'; rr(10,10,492,140,22); x.fill();
    x.strokeStyle='#161413'; x.lineWidth=6; rr(10,10,492,140,22); x.stroke();
    x.fillStyle='#161413'; x.font='700 58px "Space Grotesk", sans-serif'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText(text, 256, 82);
    const t=new THREE.CanvasTexture(c); t.anisotropy=4; return t;
  }
  function buildLabels(THREE){
    if(!gearState || !window.THREE) return;
    const T=window.THREE;
    gearState.labelMeshes.forEach((m,i)=>{
      const tex=makeLabelTex(T, L(ACTIVE[i].label));
      if(m.material.map) m.material.map.dispose();
      m.material.map=tex; m.material.needsUpdate=true;
    });
  }
  function initGear(){
    const THREE=window.THREE;
    if(!THREE || !heroEl || gearState) return;
    const w=heroEl.clientWidth||620, h=heroEl.clientHeight||560;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(50, w/h, 0.1, 100);
    camera.position.set(0, 1.8, 5.3); camera.lookAt(0,0,0);
    const renderer=new THREE.WebGLRenderer({alpha:true, antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.setSize(w,h); renderer.setClearColor(0x000000,0);
    heroEl.appendChild(renderer.domElement);

    const paper=()=>new THREE.MeshBasicMaterial({color:0xf6f2e9});
    const inkMat=()=>new THREE.MeshBasicMaterial({color:0x161413});
    const mech=new THREE.Group(); scene.add(mech);       // весь механизм (масштабируем вместе)

    // главная шестерня + её рёбра + рамки-вкладки — в одной группе (вращаются вместе)
    const gearGroup=new THREE.Group(); mech.add(gearGroup);
    const teeth=16, Rroot=1.4, Rtip=1.65, H=0.55;
    const shape=gearShape(THREE, teeth, Rroot, Rtip);
    const geo=new THREE.ExtrudeGeometry(shape, {depth:H, bevelEnabled:false, steps:1, curveSegments:1});
    geo.rotateX(-Math.PI/2); geo.center();
    const sideMat=new THREE.MeshBasicMaterial({map:makeVerticalStripesTex(THREE), color:0xffffff});
    const mesh=new THREE.Mesh(geo, [paper(), sideMat]);
    gearGroup.add(mesh);
    const edges=new THREE.EdgesGeometry(geo, 1);
    const lines=new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color:0x161413}));
    gearGroup.add(lines);

    // 4 текстовые рамки-вкладки, прижаты к ободу (depthTest => задние скрыты за шестернёй, без X-ray)
    const rLabel=Rtip+0.03, slot=Math.PI/2;
    const labelMeshes=[];
    for(let i=0;i<ACTIVE.length;i++){
      const th=i*slot;
      const mat=new THREE.MeshBasicMaterial({transparent:true, side:THREE.DoubleSide, depthTest:true, depthWrite:false});
      const lab=new THREE.Mesh(new THREE.PlaneGeometry(1.35,0.45), mat);
      lab.position.set(rLabel*Math.sin(th), 0, rLabel*Math.cos(th));
      lab.rotation.y = th;
      lab.renderOrder = 3;
      gearGroup.add(lab);
      labelMeshes.push(lab);
    }

    // малая зацепленная шестерёнка (зуб в зазор, не в зуб): расстояние + фаза
    const sTeeth=12, sRroot=0.45, sRtip=0.6, sH=0.55;
    const D = Rtip + sRroot + 0.04;                       // зазор: вершина главной < корень малой
    const sShape=gearShape(THREE, sTeeth, sRroot, sRtip);
    const sGeo=new THREE.ExtrudeGeometry(sShape, {depth:sH, bevelEnabled:false, steps:1, curveSegments:1});
    sGeo.rotateX(-Math.PI/2); sGeo.center();
    const smallGroup=new THREE.Group(); smallGroup.position.set(D, 0, 0); mech.add(smallGroup);
    const smallGear=new THREE.Mesh(sGeo, [paper(), new THREE.MeshBasicMaterial({map:makeVerticalStripesTex(THREE), color:0xffffff})]);
    smallGroup.add(smallGear);
    const sEdges=new THREE.EdgesGeometry(sGeo,1);
    const sLines=new THREE.LineSegments(sEdges, new THREE.LineBasicMaterial({color:0x161413}));
    smallGroup.add(sLines);

    // маховик (гладкое spoked колесо слева)
    const flyGroup=new THREE.Group(); flyGroup.position.set(-(Rtip+0.72), 0, 0); mech.add(flyGroup);
    const fRim=new THREE.Mesh(new THREE.TorusGeometry(0.6,0.1,8,40), inkMat()); flyGroup.add(fRim);
    for(let s=0;s<6;s++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.07,0.07), inkMat()); sp.rotation.y=s*(Math.PI/3); flyGroup.add(sp); }
    const fHub=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.13,0.16,16), inkMat()); flyGroup.add(fHub);

    mech.scale.set(0.82,0.82,0.82);
    gearState={renderer,scene,camera,gearGroup,smallGroup,flyGroup,labelMeshes, sPhase:0.131};
    buildLabels(THREE);
  }
  function tick(now){
    heroAngle += (heroTarget - heroAngle)*0.10;
    if(gearState){
      gearState.gearGroup.rotation.y = heroAngle;
      // малая шестерёнка: обратное вращение с передаточным числом + фаза зацепления (зуб в зазор)
      gearState.smallGroup.rotation.y = -heroAngle * (16/12) + gearState.sPhase;
      // маховик (как бы на ремне) — крутится в ту же сторону быстрее
      gearState.flyGroup.rotation.y = heroAngle * 1.8;
      gearState.renderer.render(gearState.scene, gearState.camera);
    }
    sideAngle += 0.09 + sideVel;
    sideVel *= 0.9;
    if(sideGearEl) sideGearEl.style.transform = `rotate(${sideAngle.toFixed(2)}deg)`;
    requestAnimationFrame(tick);
  }

  /* =========================================================
     Табы (двойной span -> слайд-анимация как у кнопки «начать»)
     ========================================================= */
  function tabHTML(label){
    const t = esc(label);
    return `<span class="t">${t}</span><span class="t">${t}</span>`;
  }
  function buildTabs(){
    strip.innerHTML = "";
    tabButtons = [];
    ACTIVE.forEach((tab, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.dataset.index = i;
      b.innerHTML = tabHTML(L(tab.label));
      b.addEventListener('click', () => goTo(i));
      strip.appendChild(b);
      tabButtons.push(b);
    });
  }
  function applyTabs(){
    tabButtons.forEach((b, i) => b.classList.toggle('is-active', i === current));
    subEl.textContent = L(ACTIVE[current].subtitle);
  }

  function renderContent(){
    const tab = ACTIVE[current];
    if (tab.id === 'bio'){ renderBio(); return; }
    renderProjects(tab);
  }

  function mediaHTML(p){
    const tag = (p.type || 'placeholder').toLowerCase();
    if (p.src){
      if (tag === 'video') return `<video src="${p.src}" autoplay muted loop playsinline></video>`;
      return `<img src="${p.src}" alt="${esc(L(p.title))}"/>`;
    }
    const ph = PH[tag] || PH.photo;
    return `<div class="ph">${ph}<span class="ph-tag">${tag==='placeholder'?UI[lang].media:tag}</span></div>`;
  }
  function linkHTML(p){
    if (p.link) return `<a class="link live" href="${p.link}" target="_blank" rel="noopener">${UI[lang].openLabel}</a>`;
    return `<span class="link disabled">${UI[lang].linkUnavailable}</span>`;
  }
  function renderCard(p){
    const tag = (p.type || 'placeholder').toLowerCase();
    let media;
    if (p.gallery && p.gallery.length){
      const gal = p.gallery;
      media = `<div class="gallery" data-gal='${esc(JSON.stringify(gal))}' data-cur="0">
        <img class="gal-img" src="${esc(gal[0])}" alt="${esc(L(p.title))}"/>`
        + (gal.length > 1
          ? `<button class="gal-arrow gal-prev" data-dir="-1" aria-label="prev">‹</button>
             <button class="gal-arrow gal-next" data-dir="1" aria-label="next">›</button>
             <span class="gal-count">1/${gal.length}</span>` : '')
        + `</div>`;
    } else {
      media = mediaHTML(p);
    }
    return `<article class="card"><div class="media">${media}<span class="badge">${tag}</span></div>
      <div class="body"><h3 class="title">${esc(L(p.title))}</h3><p class="desc">${esc(L(p.desc))}</p>${linkHTML(p)}</div></article>`;
  }
  function renderProjects(tab){
    const items = PROJECTS[tab.id] || [];
    const head = `<div class="content-head"><h2>${esc(L(tab.label))}</h2><span class="count">${items.length} ${UI[lang].works}</span><span class="rule"></span></div>`;
    content.innerHTML = head + `<div class="grid">${items.map(renderCard).join('')}</div>`;
  }

  function renderBio(){
    const facts = BIO.facts.map(f => `<li>${esc(L(f))}</li>`).join('');
    const stacks = BIO.stacks.map(grp => `<div class="bio-stack"><h4>${esc(L(grp.cat))}</h4><div class="bio-chips">${grp.items.map(it=>{ const v = typeof it === 'string' ? it : L(it); return `<span class="bio-chip">${esc(v)}</span>`; }).join('')}</div></div>`).join('');
    const head = `<div class="content-head"><h2>${L({ru:'Биография',en:'About'})}</h2><span class="rule"></span></div>`;
    content.innerHTML = head + `<div class="bio">
      <figure class="bio-photo"><img src="${BIO.photo}" alt="${esc(L(BIO.name))}"/></figure>
      <div class="bio-info">
        <h3 class="bio-name">${esc(L(BIO.name))}</h3>
        <p class="bio-handle">${esc(BIO.handle)}</p>
        <ul class="bio-facts">${facts}</ul>
        <div class="bio-stacks">${stacks}</div>
      </div></div>
      <img class="bio-wig" src="assets/wig-dev.svg" alt="иллюстрация"/>`;
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function goTo(i){
    if (i === current) return;
    const diff = ((i - current) + N) % N;
    const steps = diff <= N/2 ? diff : diff - N;   // кратчайший путь в шагах
    current = clamp(i, N);
    applyTabs(); renderContent();
    heroTarget -= steps * (Math.PI/2);   // 4 вкладки -> π/2 на шаг; рамки вращаются с шестернёй
  }
  const next = () => goTo((current+1)%N);
  const prev = () => goTo((current-1+N)%N);

  function applyLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true':'false'));
    tabButtons.forEach((b,i)=> b.innerHTML = tabHTML(L(ACTIVE[i].label)));
    applyTabs(); renderContent();
    buildLabels();   // обновить текст на 3D-рамках-вкладках
  }

  const SWAP_TEXT = { ru:'Всё, погналиииии!', en:'Alright, let’s goooo!' };
  function setLang(l){
    playSwap(SWAP_TEXT[l] || SWAP_TEXT.en);
    // переводим контент в середине свапа, когда панель закрывает экран
    setTimeout(() => applyLang(l), 450);
  }

  /* переход-свап при смене языка: один стабильный текст */
  function playSwap(text){
    if (!swapEl || !swapTxt) return;
    swapTxt.textContent = text;
    swapEl.classList.remove('run');
    void swapEl.offsetWidth;   // reflow для перезапуска анимации
    swapEl.classList.add('run');
    setTimeout(() => swapEl.classList.remove('run'), 950);
  }

  /* ввод */
  let wheelLock = false;
  tabsEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 6) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    if (e.deltaY > 0) next(); else prev();
    setTimeout(()=> wheelLock=false, 320);
  }, { passive:false });

  window.addEventListener('wheel', (e) => {
    sideVel += (e.deltaY>0?1:-1) * Math.min(Math.abs(e.deltaY)/30, 6);
  }, { passive:true });

  window.addEventListener('keydown', (e) => {
    if (e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
    else if (e.key==='ArrowRight'){ e.preventDefault(); next(); }
  });
  arrowL.addEventListener('click', prev);
  arrowR.addEventListener('click', next);
  const gAL = document.getElementById('gearArrowL');
  const gAR = document.getElementById('gearArrowR');
  if(gAL) gAL.addEventListener('click', prev);
  if(gAR) gAR.addEventListener('click', next);
  langSw.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

  /* галерея: переключение стрелками */
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('.gal-arrow'); if (!btn) return;
    const gal = btn.closest('.gallery'); if (!gal) return;
    let imgs; try { imgs = JSON.parse(gal.dataset.gal || '[]'); } catch(_){ return; }
    if (!imgs.length) return;
    const dir = parseInt(btn.dataset.dir || '1', 10);
    let cur = parseInt(gal.dataset.cur || '0', 10);
    cur = (cur + dir + imgs.length) % imgs.length;
    const img = gal.querySelector('.gal-img'); if (img) img.src = imgs[cur];
    const cnt = gal.querySelector('.gal-count'); if (cnt) cnt.textContent = (cur+1) + '/' + imgs.length;
    gal.dataset.cur = String(cur);
  });

  /* ресайз: обновить рендерер шестерни */
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (gearState && heroEl){
        const w = heroEl.clientWidth || 600, h = heroEl.clientHeight || 500;
        gearState.renderer.setSize(w, h);
        gearState.camera.aspect = w/h;
        gearState.camera.updateProjectionMatrix();
      }
    }, 150);
  });

  /* старт */
  buildTabs();
  applyLang('ru');
  buildSideCog();
  requestAnimationFrame(initGear);
  requestAnimationFrame(tick);

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
