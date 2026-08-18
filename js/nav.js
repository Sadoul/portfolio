/* =========================================================
   Навигация по табам + i18n + ГЕРОЙ-БАРАБАН (прямозубая
   шестерня 3/4, штриховка зубьев). Вращение: слабый холостой
   ход + сильная прокрутка при скролле.
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
  const startBtn= document.getElementById('startBtn');

  let lang = 'ru';
  let current = 0;
  let tabButtons = [];

  const L = (o) => (o && o[lang]) || '';
  const clamp = (n, m) => ((n % m) + m) % m;

  /* =========================================================
     ПРЯМОЗУБАЯ ШЕСТЕРНЯ (thin disk 3/4, dense teeth, hatched)
     ========================================================= */
  const G = {
    VB:[0,0,360,240], cx:180, cy:120,
    RR:108, RT:128, tY:0.34,   // радиусы + вертикаль. сжатие (тонкий диск)
    teeth:42, hub:20,
  };
  function gearGeom(){ G.RRY = G.RR*G.tY; G.RTY = G.RT*G.tY; return G; }

  function renderGear(rotDeg){
    const g = gearGeom();
    const rot = rotDeg * Math.PI/180;
    const step = 2*Math.PI / g.teeth;
    const hw = step*0.33;
    const P = (ang,R,Ry) => [g.cx + R*Math.cos(ang), g.cy + Ry*Math.sin(ang)];

    let s = [];
    s.push(`<svg viewBox="${g.VB.join(' ')}">`);
    s.push(`<defs>
      <pattern id="gh" width="5" height="3" patternUnits="userSpaceOnUse">
        <rect width="5" height="3" fill="none"/>
        <line x1="0" y1="1.5" x2="5" y2="1.5" stroke="#161413" stroke-width="0.7"/>
      </pattern></defs>`);
    s.push(`<g fill="none" stroke="#161413" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">`);

    // верхняя плоскость (чистая): внешняя окружность по впадинам
    s.push(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.RR}" ry="${g.RRY}" stroke-width="2"/>`);
    s.push(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.RR-14}" ry="${(g.RR-14)*g.tY}" stroke-width="1.2"/>`);
    // осевые штрихпунктирные линии
    s.push(`<line x1="${g.cx-g.RR}" y1="${g.cy}" x2="${g.cx+g.RR}" y2="${g.cy}" stroke-width="1.2" stroke-dasharray="9 3 2 3"/>`);
    s.push(`<line x1="${g.cx}" y1="${g.cy-g.RRY}" x2="${g.cx}" y2="${g.cy+g.RRY}" stroke-width="1.2" stroke-dasharray="9 3 2 3"/>`);

    // зубья: только передняя половина (sin>0) — задние скрыты диском
    for (let i=0;i<g.teeth;i++){
      const phi = i*step + rot;
      if (Math.sin(phi) <= 0.06) continue;
      const [rlx,rly] = P(phi-hw, g.RR, g.RRY);
      const [rrx,rry] = P(phi+hw, g.RR, g.RRY);
      const [trx,trty]= P(phi+hw, g.RT, g.RTY);
      const [tlx,tly] = P(phi-hw, g.RT, g.RTY);
      s.push(`<polygon points="${rlx.toFixed(1)},${rly.toFixed(1)} ${rrx.toFixed(1)},${rry.toFixed(1)} ${trx.toFixed(1)},${trty.toFixed(1)} ${tlx.toFixed(1)},${tly.toFixed(1)}" fill="url(#gh)" stroke="#161413" stroke-width="1.6"/>`);
    }

    // ступица (на верхней плоскости)
    s.push(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.hub}" ry="${g.hub*g.tY}" stroke-width="2"/>`);
    s.push(`<circle cx="${g.cx}" cy="${g.cy}" r="4" fill="#161413" stroke="none"/>`);
    s.push(`</g></svg>`);
    gearEl.innerHTML = s.join("");
  }

  /* вращение: слабый холостой ход + сильная прокрутка при скролле */
  let gearAngle = 0, gearVel = 0;
  function gearTick(){
    gearAngle += 0.22 + gearVel;   // холостой ход + инерция от скролла
    gearVel *= 0.9;
    renderGear(gearAngle);
    requestAnimationFrame(gearTick);
  }

  /* =========================================================
     Табы (без иконок)
     ========================================================= */
  function buildTabs(){
    strip.innerHTML = "";
    tabButtons = [];
    ACTIVE.forEach((tab, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.dataset.index = i;
      b.textContent = L(tab.label);
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

  /* биография (без стикера «это я») */
  function renderBio(){
    const facts = BIO.facts.map(f => `<li>${esc(L(f))}</li>`).join('');
    const stacks = BIO.stacks.map(grp => `<div class="bio-stack"><h4>${esc(L(grp.cat))}</h4><div class="bio-chips">${grp.items.map(it=>`<span class="bio-chip">${esc(it)}</span>`).join('')}</div></div>`).join('');
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
    gearVel += current >= 0 ? 8 : -8;   // лёгкий импульс шестерне при смене
  }
  const next = () => goTo((current+1)%N);
  const prev = () => goTo((current-1+N)%N);

  function setLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true':'false'));
    tabButtons.forEach((b,i)=> b.textContent = L(ACTIVE[i].label));
    applyTabs(); renderContent();
  }

  /* ввод: колесо над табами => навигация; в любом месте => крутит барабан */
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
    gearVel += (e.deltaY>0?1:-1) * Math.min(Math.abs(e.deltaY)/30, 6); // сильно при скролле
  }, { passive:true });

  window.addEventListener('keydown', (e) => {
    if (e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
    else if (e.key==='ArrowRight'){ e.preventDefault(); next(); }
  });
  arrowL.addEventListener('click', prev);
  arrowR.addEventListener('click', next);
  langSw.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
  if (startBtn) startBtn.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));

  /* старт */
  gearGeom();
  buildTabs();
  setLang('ru');
  requestAnimationFrame(gearTick);

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
