/* =========================================================
   Навигация по табам + i18n (RU/EN) + боковая шестерёнка.
   Управление: клик по табу / стрелки / ← → / колесо над табами.
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, BIO, UI, PH } = window.PORTFOLIO;
  const ACTIVE = TABS.filter(t => t.active);   // web, mc, game, bio
  const N = ACTIVE.length;

  const tabsEl  = document.getElementById('tabs');
  const strip   = document.getElementById('tabStrip');
  const subEl   = document.getElementById('tabSub');
  const content = document.getElementById('content');
  const arrowL  = document.getElementById('arrowLeft');
  const arrowR  = document.getElementById('arrowRight');
  const gearEl  = document.getElementById('drumGear');
  const langSw  = document.getElementById('langSwitch');

  let lang = 'ru';
  let current = 0;          // индекс активного таба в ACTIVE
  let tabButtons = [];

  const L = (o) => (o && o[lang]) || '';
  const clamp = (n, m) => ((n % m) + m) % m;

  /* ---------- боковая шестерёнка ---------- */
  function buildGear(){
    const teeth = 24;
    const Rr = 100, Rt = 122, hub = 24, tw = 8;
    let s = [`<svg viewBox="-130 -130 260 260" preserveAspectRatio="xMidYMid meet">`];
    s.push(`<g fill="none" stroke="#161413" stroke-width="2.4" stroke-linejoin="round">`);
    for (let i=0;i<teeth;i++){
      const a = i*(360/teeth);
      s.push(`<rect x="${Rr-1.5}" y="${-tw/2}" width="${Rt-Rr+3}" height="${tw}" transform="rotate(${a})" stroke-width="2.2"/>`);
    }
    s.push(`<circle cx="0" cy="0" r="${Rr}" stroke-width="2.4"/>`);
    s.push(`<circle cx="0" cy="0" r="${Rr-16}" stroke-width="1.4"/>`);
    for (let i=0;i<6;i++){
      const a = i*60*Math.PI/180;
      const x1=(hub+2)*Math.cos(a), y1=(hub+2)*Math.sin(a);
      const x2=(Rr-18)*Math.cos(a), y2=(Rr-18)*Math.sin(a);
      s.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="1.8"/>`);
    }
    s.push(`<circle cx="0" cy="0" r="${hub}" stroke-width="2.4"/>`);
    s.push(`<circle cx="0" cy="0" r="${hub-7}" stroke-width="1.2"/>`);
    s.push(`<line x1="-9" y1="0" x2="9" y2="0" stroke-width="1.6"/>`);
    s.push(`<line x1="0" y1="-9" x2="0" y2="9" stroke-width="1.6"/>`);
    s.push(`</g></svg>`);
    gearEl.innerHTML = s.join("");
  }

  /* бесконечный ход: медленный холостой + импульсы от навигации */
  let gearSpin = 0;
  let gearVel = 0;
  function gearTick(){
    gearSpin += 0.18 + gearVel;
    gearVel *= 0.9;
    gearEl.style.transform = `translateY(-50%) rotate(${gearSpin.toFixed(2)}deg)`;
    requestAnimationFrame(gearTick);
  }
  const kickGear = (v=24) => { gearVel += v; };

  /* ---------- табы ---------- */
  function buildTabs(){
    strip.innerHTML = "";
    tabButtons = [];
    ACTIVE.forEach((tab, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.dataset.index = i;
      b.innerHTML = `<span class="ico">${tab.icon}</span><span class="lbl">${L(tab.label)}</span>`;
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

  /* ---------- проекты ---------- */
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
    return `
      <article class="card">
        <div class="media">${mediaHTML(p)}<span class="badge">${tag}</span></div>
        <div class="body">
          <h3 class="title">${esc(L(p.title))}</h3>
          <p class="desc">${esc(L(p.desc))}</p>
          ${linkHTML(p)}
        </div>
      </article>`;
  }
  function renderProjects(tab){
    const items = PROJECTS[tab.id] || [];
    const head = `
      <div class="content-head">
        <h2>${esc(L(tab.label))}</h2>
        <span class="count">${items.length} ${UI[lang].works}</span>
        <span class="rule"></span>
      </div>`;
    content.innerHTML = head + `<div class="grid">${items.map(renderCard).join('')}</div>`;
  }

  /* ---------- биография ---------- */
  function renderBio(){
    const facts = BIO.facts.map(f => `<li>${esc(L(f))}</li>`).join('');
    const stacks = BIO.stacks.map(grp => `
      <div class="bio-stack">
        <h4>${esc(L(grp.cat))}</h4>
        <div class="bio-chips">${grp.items.map(it => `<span class="bio-chip">${esc(it)}</span>`).join('')}</div>
      </div>`).join('');
    const head = `
      <div class="content-head">
        <h2>${L({ru:'Биография',en:'About'})}</h2>
        <span class="rule"></span>
      </div>`;
    content.innerHTML = head + `
      <div class="bio">
        <figure class="bio-photo">
          <img src="${BIO.photo}" alt="${esc(L(BIO.name))}"/>
          <span class="tag">${L({ru:'это я',en:'that\'s me'})}</span>
        </figure>
        <div class="bio-info">
          <h3 class="bio-name">${esc(L(BIO.name))}</h3>
          <p class="bio-handle">${esc(BIO.handle)}</p>
          <ul class="bio-facts">${facts}</ul>
          <div class="bio-stacks">${stacks}</div>
        </div>
      </div>`;
  }

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- навигация ---------- */
  function goTo(i){
    if (i === current) return;
    const prev = current;
    current = clamp(i, N);
    applyTabs();
    renderContent();
    kickGear(current >= prev ? 26 : -26);
  }
  function next(){ goTo((current + 1) % N); kickGear(26); }
  function prev(){ goTo((current - 1 + N) % N); kickGear(-26); }

  /* ---------- i18n ---------- */
  function setLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true' : 'false');
    });
    // обновить подписи табов
    tabButtons.forEach((b, i) => {
      const lbl = b.querySelector('.lbl');
      if (lbl) lbl.textContent = L(ACTIVE[i].label);
    });
    applyTabs();
    renderContent();
  }

  /* ---------- ввод ---------- */
  // колесо над табами
  let wheelLock = false;
  tabsEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 6) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    if (e.deltaY > 0) next(); else prev();
    setTimeout(() => wheelLock = false, 320);
  }, { passive:false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')      { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); next(); }
  });

  arrowL.addEventListener('click', prev);
  arrowR.addEventListener('click', next);

  langSw.querySelectorAll('.lang-btn').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  /* ---------- старт ---------- */
  buildGear();
  buildTabs();
  setLang('ru');
  requestAnimationFrame(gearTick);

  window.NAV = { next, prev, goTo, setLang, current: () => current };
})();
