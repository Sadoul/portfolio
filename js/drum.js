/* =========================================================
   3D-ЦИЛИНДР (барабан) — циклическая навигация по вкладкам
   Грани смотрят наружу (настоящая поверхность цилиндра).
   Видны: текущая грань по центру + две соседние слева/справа.
   Цикличный. Управление: скролл / клик / стрелки / ← →
                / свайп / перетаскивание мышью.
   Уголковая шестерёнка крутится при скролле (+ медленный холостой ход).
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, PH } = window.PORTFOLIO;

  // только активные вкладки (4-я "Systems" скрыта => неактивна)
  const ACTIVE = TABS.filter(t => t.active);
  const N = ACTIVE.length;                 // 3
  const COPIES = 2;                        // дублируем вкладки => 6 граней
  const FACETS = N * COPIES;               // 6
  const FSTEP = 360 / FACETS;              // 60°

  const drum   = document.getElementById('drum');
  const scene  = document.getElementById('drumScene');
  const sub    = document.getElementById('drumSub');
  const content= document.getElementById('content');
  const arrowL = document.getElementById('arrowLeft');
  const arrowR = document.getElementById('arrowRight');
  const gearEl = document.getElementById('drumGear');

  let current = 0;        // индекс центральной (текущей) грани (0..FACETS-1)
  let displayAngle = 0;   // текущий отрис. угол цилиндра (deg)
  let targetAngle = 0;   // целевой угол
  let tween = null;
  let facets = [];

  const DURATION = 720;  // длительность прокрутки (ms)

  const radius = () =>
    parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--drum-radius')) || 260;
  const clamp = (n, m) => ((n % m) + m) % m;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const tabOf = (f) => ACTIVE[f % N];

  /* ---------- уголковая шестерёнка ---------- */
  function buildGear(){
    const teeth = 18;
    const Rr  = 100, Rt = 120, hub = 24, tw = 9;
    let s = [];
    s.push(`<svg viewBox="-130 -130 260 260" preserveAspectRatio="xMidYMid meet">`);
    s.push(`<g fill="none" stroke="#161413" stroke-width="2.2" stroke-linejoin="round">`);
    for (let i=0;i<teeth;i++){
      const a = i*(360/teeth);
      s.push(`<rect x="${Rr-1.5}" y="${-tw/2}" width="${Rt-Rr+3}" height="${tw}" transform="rotate(${a})" stroke-width="2"/>`);
    }
    s.push(`<circle cx="0" cy="0" r="${Rr}" stroke-width="2.2"/>`);
    s.push(`<circle cx="0" cy="0" r="${Rr-16}" stroke-width="1.4"/>`);
    // спицы
    for (let i=0;i<6;i++){
      const a = i*60*Math.PI/180;
      const x1=(hub+2)*Math.cos(a), y1=(hub+2)*Math.sin(a);
      const x2=(Rr-18)*Math.cos(a), y2=(Rr-18)*Math.sin(a);
      s.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="1.8"/>`);
    }
    s.push(`<circle cx="0" cy="0" r="${hub}" stroke-width="2.2"/>`);
    s.push(`<circle cx="0" cy="0" r="${hub-7}" stroke-width="1.2"/>`);
    s.push(`<line x1="-8" y1="0" x2="8" y2="0" stroke-width="1.6"/>`);
    s.push(`<line x1="0" y1="-8" x2="0" y2="8" stroke-width="1.6"/>`);
    s.push(`</g></svg>`);
    gearEl.innerHTML = s.join("");
  }

  /* бесконечный ход шестерёнки: холостой + вклад от скролла барабана */
  let cogAngle = 0;
  function cogTick(){
    cogAngle += 0.12;
    const scrollPart = displayAngle * 1.4;
    if (gearEl) gearEl.style.transform = `rotate(${(cogAngle + scrollPart).toFixed(2)}deg)`;
    requestAnimationFrame(cogTick);
  }

  /* ---------- построение граней цилиндра ---------- */
  function build(){
    buildGear();
    drum.innerHTML = "";
    facets = [];
    for (let i = 0; i < FACETS; i++){
      const tab = tabOf(i);
      const facet = document.createElement('div');
      facet.className = 'drum-card';
      facet.dataset.index = i;
      facet.innerHTML = `
        <div class="face">
          <div class="ico">${tab.icon}</div>
          <div class="label">${tab.label}</div>
          <div class="num">0${(i % N)+1} / 0${N}</div>
        </div>`;
      const idx = i;
      facet.addEventListener('click', () => {
        if (idx === current){
          content.scrollIntoView({ behavior:'smooth', block:'start' });
          return;
        }
        goTo(idx);
      });
      drum.appendChild(facet);
      facets.push(facet);
    }
    layoutFacets();
  }

  /* расстановка граней по окружности (статично) */
  function layoutFacets(){
    const r = radius();
    facets.forEach((c, i) => {
      c.style.transform = `rotateY(${i * FSTEP}deg) translateZ(${r}px)`;
    });
    renderAngle(displayAngle);
  }

  /* ---------- отрисовка угла ---------- */
  function renderAngle(ang){
    drum.style.transform = `rotateX(-6deg) rotateY(${ang}deg)`;
    for (let i = 0; i < facets.length; i++){
      facets[i].classList.toggle('is-center', i === current);
    }
  }

  /* ---------- tween ---------- */
  function startTween(from, to, dur){
    tween = { from, to, start: performance.now(), dur: dur||DURATION };
    requestAnimationFrame(tick);
  }
  function tick(now){
    if (!tween) return;
    const t = Math.min(1, (now - tween.start) / tween.dur);
    const e = easeOutCubic(t);
    displayAngle = tween.from + (tween.to - tween.from) * e;
    renderAngle(displayAngle);
    if (t < 1) requestAnimationFrame(tick);
    else { displayAngle = tween.to; renderAngle(displayAngle); tween = null; }
  }

  /* ---------- навигация ---------- */
  function nav(dir){
    current = clamp(current + dir, FACETS);
    targetAngle = displayAngle - dir * FSTEP;
    const tab = tabOf(current);
    sub.textContent = tab.subtitle;
    renderContent(tab);
    startTween(displayAngle, targetAngle, DURATION);
  }
  function goTo(target){
    if (target === current) return;
    const diff = ((target - current) + FACETS) % FACETS;
    const dir = (diff <= FACETS / 2) ? diff : (diff - FACETS);
    if (dir === 0) return;
    nav(dir);
  }
  const next = () => nav(+1);
  const prev = () => nav(-1);

  /* ---------- рендер контента ---------- */
  function mediaHTML(p){
    const tag = (p.type || 'placeholder').toLowerCase();
    if (p.src){
      if (tag === 'video')
        return `<video src="${p.src}" autoplay muted loop playsinline></video>`;
      return `<img src="${p.src}" alt="${escapeHTML(p.title)}"/>`;
    }
    const ph = PH[tag] || PH.photo;
    return `<div class="ph">${ph}<span class="ph-tag">${tag==='placeholder'?'медиа':tag}</span></div>`;
  }
  function linkHTML(p){
    if (p.link)
      return `<a class="link live" href="${p.link}" target="_blank" rel="noopener">открыть ↗</a>`;
    return `<span class="link disabled">ссылка пока недоступна</span>`;
  }
  function renderCard(p){
    const tag = (p.type || 'placeholder').toLowerCase();
    return `
      <article class="card">
        <div class="media">
          ${mediaHTML(p)}
          <span class="badge">${tag}</span>
        </div>
        <div class="body">
          <h3 class="title">${escapeHTML(p.title)}</h3>
          <p class="desc">${escapeHTML(p.desc)}</p>
          ${linkHTML(p)}
        </div>
      </article>`;
  }
  function renderContent(tab){
    const items = PROJECTS[tab.id] || [];
    const head = `
      <div class="content-head">
        <h2>${escapeHTML(tab.label)}</h2>
        <span class="count">${items.length} работ</span>
        <span class="rule"></span>
      </div>`;
    content.innerHTML = head + `<div class="grid">${items.map(renderCard).join('')}</div>`;
  }
  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------- ввод: колесо ---------- */
  let wheelLock = false;
  scene.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 6) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    if (e.deltaY > 0) next(); else prev();
    setTimeout(() => wheelLock = false, 380);
  }, { passive:false });

  /* ---------- ввод: клавиатура ---------- */
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')      { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); next(); }
  });

  /* ---------- ввод: стрелки-кнопки ---------- */
  arrowL.addEventListener('click', prev);
  arrowR.addEventListener('click', next);

  /* ---------- ввод: тач-свайп ---------- */
  let touchX = null, touchY = null;
  scene.addEventListener('touchstart', (e) => {
    touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
  }, { passive:true });
  scene.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)){
      if (dx > 0) prev(); else next();
    }
    touchX = touchY = null;
  }, { passive:true });

  /* ---------- ввод: drag мышью ---------- */
  let dragX = null, dragged = false;
  scene.addEventListener('mousedown', (e) => { dragX = e.clientX; dragged = false; });
  window.addEventListener('mousemove', (e) => {
    if (dragX == null) return;
    const dx = e.clientX - dragX;
    if (!dragged && Math.abs(dx) > 60){
      dragged = true;
      if (dx > 0) prev(); else next();
      dragX = null;
    }
  });
  window.addEventListener('mouseup', () => { dragX = null; });

  /* ---------- ресайз ---------- */
  let rT;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => { layoutFacets(); }, 150);
  });

  /* ---------- старт ---------- */
  build();
  sub.textContent = tabOf(current).subtitle;
  renderContent(tabOf(current));
  renderAngle(0);
  requestAnimationFrame(cogTick);

  window.DRUM = { next, prev, goTo, current: () => current };
})();
