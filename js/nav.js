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
     3D-ЦИЛИНДР-ШЕСТЕРНЯ: монолитный барабан (сплошная боковая
     стенка + нижнее основание, без пустоты) + выступающие
     штрихованные зубья-блоки. Впадины показывают сплошной ствол.
     ========================================================= */
  const G = { VB:[0,0,360,300], cx:180, cyTop:120, Rtip:120, Rroot:102, tilt:0.30, T:32, teeth:36, half:0.28 };
  const ryT = () => G.Rtip  * G.tilt;
  const ryR = () => G.Rroot * G.tilt;
  const cyBot = () => G.cyTop + G.T;
  const Ptop = (R,ry,th) => [G.cx + R*Math.sin(th), G.cyTop + ry*Math.cos(th)];
  const Pbot = (R,ry,th) => [G.cx + R*Math.sin(th), cyBot() + ry*Math.cos(th)];
  const arcPath = (R,ry,cy,from,to,steps) => {
    let d = "";
    for (let k=0; k<=steps; k++){
      const th = from + (to-from)*k/steps;
      d += (k?" L":"M") + (G.cx + R*Math.sin(th)).toFixed(1) + " " + (cy + ry*Math.cos(th)).toFixed(1);
    }
    return d;
  };

  function renderGear(rotDeg){
    const PI = Math.PI;
    const rot = rotDeg * PI/180;
    const step = 2*PI / G.teeth;
    const hw = step * G.half;
    let s = [`<svg viewBox="${G.VB.join(' ')}">`];
    s.push(`<defs><pattern id="gh" width="5" height="3" patternUnits="userSpaceOnUse">
      <rect width="5" height="3" fill="none"/>
      <line x1="0" y1="1.5" x2="5" y2="1.5" stroke="#161413" stroke-width="0.7"/></pattern></defs>`);
    s.push(`<g fill="none" stroke="#161413" stroke-linejoin="round" stroke-linecap="round">`);

    // 1) нижнее основание (Rtip) — сплошное (нет пустоты под впадинами)
    s.push(`<ellipse cx="${G.cx}" cy="${cyBot()}" rx="${G.Rtip}" ry="${ryT()}" fill="#efe9db" stroke="#161413" stroke-width="1.6"/>`);

    // 2) ствол барабана (Rroot, передняя половина) — сплошной металл
    let core = arcPath(G.Rroot, ryR(), G.cyTop, -PI/2, PI/2, 30);
    core += " L" + Pbot(G.Rroot, ryR(), PI/2).map(v=>v.toFixed(1)).join(" ");
    core += arcPath(G.Rroot, ryR(), cyBot(), PI/2, -PI/2, 30).replace("M"," L") + " Z";
    s.push(`<path d="${core}" fill="#efe9db" stroke="#161413" stroke-width="1.6"/>`);

    // 3) выступающие зубья-блоки (Rtip, передняя половина) — штриховка металла
    for (let i=0;i<G.teeth;i++){
      const th = i*step + rot;
      if (Math.cos(th) <= 0.12) continue;            // боковые/задние скрыты
      const [tlx,tly] = Ptop(G.Rtip, ryT(), th-hw);
      const [trx,trty]= Ptop(G.Rtip, ryT(), th+hw);
      const [brx,bry] = Pbot(G.Rtip, ryT(), th+hw);
      const [blx,bly] = Pbot(G.Rtip, ryT(), th-hw);
      s.push(`<polygon points="${tlx.toFixed(1)},${tly.toFixed(1)} ${trx.toFixed(1)},${trty.toFixed(1)} ${brx.toFixed(1)},${bry.toFixed(1)} ${blx.toFixed(1)},${bly.toFixed(1)}" fill="url(#gh)" stroke="#161413" stroke-width="1.5"/>`);
    }

    // 4) верхняя плоскость (Rtip) — чистая + один тонкий внутренний контур
    s.push(`<ellipse cx="${G.cx}" cy="${G.cyTop}" rx="${G.Rtip}" ry="${ryT()}" fill="#f6f2e9" stroke="#161413" stroke-width="2"/>`);
    s.push(`<ellipse cx="${G.cx}" cy="${G.cyTop}" rx="${G.Rtip-12}" ry="${(G.Rtip-12)*G.tilt}" stroke="#161413" stroke-width="1.2"/>`);

    s.push(`</g></svg>`);
    gearEl.innerHTML = s.join("");
  }

  let gearAngle = 0, gearVel = 0;
  function gearTick(){
    gearAngle += 0.20 + gearVel;   // слабый холостой ход + инерция от скролла
    gearVel *= 0.9;
    renderGear(gearAngle);
    requestAnimationFrame(gearTick);
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
    return `<article class="card"><div class="media">${mediaHTML(p)}<span class="badge">${tag}</span></div>
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

  function setLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true':'false'));
    tabButtons.forEach((b,i)=> b.innerHTML = tabHTML(L(ACTIVE[i].label)));
    applyTabs(); renderContent();
    playSwap(l === 'ru' ? 'Всё, погналиииии!' : 'Alright, let’s goooo!');
  }

  /* переход-свап при смене языка */
  function playSwap(text){
    if (!swapEl || !swapTxt) return;
    swapTxt.textContent = text;
    swapEl.classList.remove('run');
    void swapEl.offsetWidth;   // принудительный reflow для перезапуска анимации
    swapEl.classList.add('run');
    setTimeout(() => swapEl.classList.remove('run'), 820);
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

  /* старт */
  buildTabs();
  setLang('ru');
  requestAnimationFrame(gearTick);

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
