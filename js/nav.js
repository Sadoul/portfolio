/* =========================================================
   Навигация по табам + i18n.
   3D-механизм (большая шестерня + деревянные стрелки) живёт
   в js/mechanism.js. Здесь — только связка: смена вкладки ->
   MECHANISM.step(±1) и обновление надписи на табличке.
   Старая версия шестерни сохранена в js/gear-legacy.js.
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, BIO, UI, PH } = window.PORTFOLIO;
  const ACTIVE = TABS.filter(t => t.active);
  const N = ACTIVE.length;

  const subEl   = document.getElementById('tabSub');
  const content = document.getElementById('content');
  const heroEl  = document.getElementById('heroMech');
  const a11yEl  = document.getElementById('mechA11y');
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
     3D-механизм (#heroMech) — см. js/mechanism.js. Крутится
     ТОЛЬКО при смене вкладок: один шаг = 30° влево/вправо.
     БОКОВАЯ drumGear (#drumGear): декоративная SVG-шестерёнка
     в углу страницы, слабый холостой ход + сильно при скролле.
     ========================================================= */
  let sideAngle = 0, sideVel = 0;

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

  /* 4 таблички на ободе шестерни = 4 вкладки, активная подсвечена */
  const plateLabels = () => ACTIVE.map(t => L(t.label));
  function syncPlate(){
    if (window.MECHANISM && MECHANISM.ready())
      MECHANISM.setLabels(plateLabels(), current);
  }
  function initMech(){
    if (!window.MECHANISM || !heroEl) return;
    MECHANISM.init({
      el: heroEl,
      labels: plateLabels(),
      activeIndex: current,
      onStep:  (dir) => { if (dir > 0) next(); else prev(); },  // деревянная стрелка
      onPlate: (i)   => goTo(i)                                 // табличка на ободе
    });
  }
  /* холостой ход декоративной шестерёнки в углу страницы */
  function tick(){
    sideAngle += 0.09 + sideVel;
    sideVel *= 0.9;
    if(sideGearEl) sideGearEl.style.transform = `rotate(${sideAngle.toFixed(2)}deg)`;
    requestAnimationFrame(tick);
  }

  /* =========================================================
     Вкладки живут на шестерне (3D). Здесь — только невидимый
     слой настоящих кнопок: он даёт клавиатуру и скринридер,
     потому что кликабельная геометрия внутри canvas для них
     недоступна. Визуально слоя нет (.mech-a11y в CSS).
     ========================================================= */
  function buildTabs(){
    if (!a11yEl) return;
    a11yEl.innerHTML = "";
    tabButtons = [];
    ACTIVE.forEach((tab, i) => {
      const b = document.createElement('button');
      b.className = 'mech-tab';
      b.type = 'button';
      b.dataset.index = i;
      b.setAttribute('role', 'tab');
      b.textContent = L(tab.label);
      b.addEventListener('click', () => goTo(i));
      a11yEl.appendChild(b);
      tabButtons.push(b);
    });
  }
  function applyTabs(){
    tabButtons.forEach((b, i) => {
      const on = i === current;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    subEl.textContent = L(ACTIVE[current].subtitle);
    if (window.TAB_DECOR) TAB_DECOR.show(ACTIVE[current].id);
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
    applyTabs(); renderContent(); syncPlate();
    /* вперёд -> шестерня вправо, назад -> влево (по 30° за шаг) */
    if (window.MECHANISM && MECHANISM.ready()) MECHANISM.step(steps);
  }
  const next = () => goTo((current+1)%N);
  const prev = () => goTo((current-1+N)%N);

  function applyLang(l){
    lang = l;
    document.documentElement.lang = l;
    langSw.querySelectorAll('.lang-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true':'false'));
    tabButtons.forEach((b,i)=> b.textContent = L(ACTIVE[i].label));
    applyTabs(); renderContent();
    syncPlate();   // переписать все 4 таблички на шестерне
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
  /* колесо над механизмом листает вкладки; страница при этом
     не скроллится только если курсор реально над сценой */
  let wheelLock = false;
  if (heroEl) heroEl.addEventListener('wheel', (e) => {
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

  /* ресайз: пересобрать вписывание механизма (мобильные/повороты) */
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (window.MECHANISM && MECHANISM.ready()) MECHANISM.resize();
    }, 150);
  });

  /* старт */
  buildTabs();
  if (window.TAB_DECOR) TAB_DECOR.init(ACTIVE.map(t=>t.id));
  applyLang('ru');
  buildSideCog();
  requestAnimationFrame(initMech);
  requestAnimationFrame(tick);
  /* шрифт таблички может подгрузиться позже — перерисовать надпись */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncPlate);

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
