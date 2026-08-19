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
  const gearEl  = document.getElementById('drumGear');
  const langSw  = document.getElementById('langSwitch');
  const swapEl  = document.getElementById('swap');
  const swapTxt = document.getElementById('swapText');

  let lang = 'ru';
  let current = 0;
  let tabButtons = [];

  const L = (o) => (o && o[lang]) || '';
  const clamp = (n, m) => ((n % m) + m) % m;

  /* =========================================================
     3D-МОДЕЛЬ ШЕСТЕРНКИ (Three.js): короткий цилиндр, по кругу
     вырезаны трапециевидные впадины => зубья (плоская вершина,
     боковые грани почти вертикальные). Верх чистый. На боку —
     редкие короткие вертикальные полоски (до 3 рядом, без
     штриховки). Без холостого вращения; видна в рамке (обрезана).
     ========================================================= */
  let gearState = null;
  let gearAngle = 0, gearVel = 0;

  function makeVerticalStripesTex(THREE){
    const W=512, H=128;
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const x=c.getContext('2d');
    x.fillStyle='#dfd8c8'; x.fillRect(0,0,W,H);
    x.strokeStyle='#161413'; x.lineWidth=2;
    let rng=12345; const rnd=()=>{ rng=(rng*1103515245+12345)&0x7fffffff; return rng/0x7fffffff; };
    let px=12;
    while(px < W-4){
      const cluster=1+Math.floor(rnd()*3);          // 1..3 рядом, не более
      for(let k=0;k<cluster && px<W;k++){
        const h=12+rnd()*46;                         // короткие, разной длины
        const y=rnd()*(H-h);                          // на разной высоте
        x.beginPath(); x.moveTo(px,y); x.lineTo(px,y+h); x.stroke();
        px+=3;
      }
      px+=24+rnd()*64;                               // редко
    }
    const t=new THREE.CanvasTexture(c);
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,1);
    return t;
  }
  function gearShape(THREE, teeth, Rroot, Rtip){
    const s=new THREE.Shape();
    const step=Math.PI*2/teeth;
    const base=step*0.50, top=step*0.42, taper=(base-top)/2; // 0.04*step — почти прямоугольные
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
  function initGear(){
    const THREE = window.THREE;
    if (!THREE || !gearEl || gearState) return;
    const w = gearEl.clientWidth || 540, h = gearEl.clientHeight || 450;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, w/h, 0.1, 100);
    camera.position.set(0, 1.7, 3.35); camera.lookAt(0, 0, 0);   // крупнее => обрезается рамкой
    const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setSize(w, h); renderer.setClearColor(0x000000, 0);
    gearEl.appendChild(renderer.domElement);

    const teeth = 16, Rroot = 2.0, Rtip = 2.5, H = 0.8;
    const shape = gearShape(THREE, teeth, Rroot, Rtip);
    const geo = new THREE.ExtrudeGeometry(shape, { depth:H, bevelEnabled:false, steps:1, curveSegments:1 });
    geo.rotateX(-Math.PI/2); geo.center();
    const capsMat = new THREE.MeshBasicMaterial({ color: 0xf6f2e9 });             // верх чистый
    const sideMat = new THREE.MeshBasicMaterial({ map: makeVerticalStripesTex(THREE), color: 0xffffff });
    const mesh = new THREE.Mesh(geo, [capsMat, sideMat]);
    scene.add(mesh);
    const edges = new THREE.EdgesGeometry(geo, 1);
    const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x161413 }));
    scene.add(lines);

    gearState = { renderer, scene, camera, mesh, lines };
    requestAnimationFrame(gearLoop);
  }
  function gearLoop(){
    if (!gearState) return;
    gearAngle += gearVel;                // только от скролла, без холостого хода
    gearVel *= 0.92;
    gearState.mesh.rotation.y = gearAngle;
    gearState.lines.rotation.y = gearAngle;
    gearState.renderer.render(gearState.scene, gearState.camera);
    requestAnimationFrame(gearLoop);
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
      </div></div>`;
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function goTo(i){
    if (i === current) return;
    current = clamp(i, N);
    applyTabs(); renderContent();
    gearVel += 6;
  }
  const next = () => goTo((current+1)%N);
  const prev = () => goTo((current-1+N)%N);

  function applyLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true':'false'));
    tabButtons.forEach((b,i)=> b.innerHTML = tabHTML(L(ACTIVE[i].label)));
    applyTabs(); renderContent();
  }

  const SWAP_PHRASES = {
    ru: ['Тэкс, это сюда…','О, ещё же ЭТО!','Ага, нормас','Всё, погналиииии!'],
    en: ['Okay, this goes here…','Oh, and THIS too!','Yeah, all good','Alright, let’s goooo!'],
  };
  function setLang(l){
    playSwap(SWAP_PHRASES[l] || SWAP_PHRASES.en);
    // переводим контент в середине свапа, когда панель закрывает экран
    setTimeout(() => applyLang(l), 450);
  }

  /* переход-свап при смене языка: цикл фраз из оригинала whoisguilty */
  let swapIV = null;
  function playSwap(phrases){
    if (!swapEl || !swapTxt) return;
    let i = 0;
    swapTxt.textContent = phrases[0];
    swapEl.classList.remove('run');
    void swapEl.offsetWidth;
    swapEl.classList.add('run');
    if (swapIV) clearInterval(swapIV);
    swapIV = setInterval(() => {
      i++;
      if (i >= phrases.length){ clearInterval(swapIV); swapIV = null; return; }
      swapTxt.textContent = phrases[i];
    }, 175);
    setTimeout(() => { if (swapIV){ clearInterval(swapIV); swapIV = null; } swapEl.classList.remove('run'); }, 950);
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
    gearVel += (e.deltaY>0?1:-1) * Math.min(Math.abs(e.deltaY)/30, 6);
  }, { passive:true });

  window.addEventListener('keydown', (e) => {
    if (e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
    else if (e.key==='ArrowRight'){ e.preventDefault(); next(); }
  });
  arrowL.addEventListener('click', prev);
  arrowR.addEventListener('click', next);
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
      if (gearState && gearEl){
        const w = gearEl.clientWidth || 540, h = gearEl.clientHeight || 405;
        gearState.renderer.setSize(w, h);
        gearState.camera.aspect = w/h;
        gearState.camera.updateProjectionMatrix();
      }
    }, 150);
  });

  /* старт */
  buildTabs();
  applyLang('ru');
  requestAnimationFrame(() => initGear());

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
