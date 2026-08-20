/* =========================================================
   Навигация по табам + i18n.
   3D-механизм (большая шестерня + деревянные стрелки) живёт
   в js/mechanism.js. Здесь — только связка: смена вкладки ->
   MECHANISM.step(±1) и обновление надписи на табличке.
   Старая версия шестерни сохранена в js/gear-legacy.js.
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, BIO, UI } = window.PORTFOLIO;
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
    syncMcStage(ACTIVE[current].id === 'mc');
  }

  /* Сцена Minecraft: показываем только на своей вкладке и только там
     крутим анимацию — в остальное время кадры не рисуются.
     display переключаем сразу, прозрачность — следующим кадром,
     иначе перехода не будет (элемент только что был display:none). */
  function syncMcStage(on){
    const st = document.getElementById('mcStage');
    if (!st) return;
    if (on){
      st.classList.add('is-on');
      requestAnimationFrame(() => st.classList.add('is-lit'));
      if (window.MC_SCENE) MC_SCENE.show(true);
    } else {
      st.classList.remove('is-lit');
      if (window.MC_SCENE) MC_SCENE.show(false);
      setTimeout(() => { if (!st.classList.contains('is-lit')) st.classList.remove('is-on'); }, 520);
    }
  }

  function renderContent(){
    const tab = ACTIVE[current];
    if (tab.id === 'bio'){ renderBio(); return; }
    renderProjects(tab);
  }

  /* =========================================================
     Медиа карточек. Один проект = один «набор кадров»:
       gallery -> все кадры, photo/gif/video -> один, none -> пусто.
     Наборы лежат в mediaSets, карточка ссылается на свой индексом
     (data-mid) — и точки под галереей, и полноэкранный просмотр
     читают один и тот же массив, поэтому не могут разойтись.
     ========================================================= */
  let mediaSets = [];

  function mediaItems(p){
    if (p.gallery && p.gallery.length)
      return p.gallery.map(src => ({ src, kind: kindOf(p.type, src) }));
    if (p.src) return [{ src:p.src, kind:kindOf(p.type, p.src) }];
    return [];
  }
  /* тип кадра решает расширение файла: 'gallery' у проекта ничего
     не говорит о том, картинка внутри или видео */
  function kindOf(type, src){
    if (/\.(mp4|webm|mov)$/i.test(src)) return 'video';
    if ((type||'').toLowerCase() === 'video') return 'video';
    return 'image';
  }
  const frameHTML = (it, alt, cls) => it.kind === 'video'
    ? `<video class="${cls}" src="${esc(it.src)}" autoplay muted loop playsinline></video>`
    : `<img class="${cls}" src="${esc(it.src)}" alt="${esc(alt)}"/>`;

  /* точки-виджеты под галереей: по одной на кадр, активная — шире
     и залита. Номер кадра читается позицией, без «2/4». */
  function dotsHTML(n, cur, cls){
    let s = `<div class="${cls}" role="tablist" aria-label="${esc(UI[lang].shot)}">`;
    for (let i=0;i<n;i++){
      s += `<button class="gal-dot${i===cur?' is-on':''}" type="button" role="tab"
              data-go="${i}" aria-selected="${i===cur?'true':'false'}"
              aria-label="${esc(UI[lang].shot)} ${i+1}"><span></span></button>`;
    }
    return s + `</div>`;
  }
  function linkHTML(p){
    /* ссылки нет — плашки нет вообще: «недоступно» ничего не даёт */
    if (!p.link) return '';
    return `<a class="link live" href="${esc(p.link)}" target="_blank" rel="noopener">${UI[lang].openLabel}</a>`;
  }
  function renderCard(p, idx){
    const items = mediaItems(p);
    mediaSets[idx] = { items, cur:0, title:L(p.title) };
    const body = `<div class="body"><h3 class="title">${esc(L(p.title))}</h3>
      <p class="desc">${esc(L(p.desc))}</p>${linkHTML(p)}</div>`;
    if (!items.length)
      return `<article class="card card--nomedia">${body}</article>`;

    const multi = items.length > 1;
    let media = frameHTML(items[0], L(p.title), 'gal-img');
    if (multi){
      media += `<button class="gal-arrow gal-prev" type="button" data-dir="-1"
                  aria-label="${esc(UI[lang].prev)}">‹</button>
                <button class="gal-arrow gal-next" type="button" data-dir="1"
                  aria-label="${esc(UI[lang].next)}">›</button>`
             + dotsHTML(items.length, 0, 'gal-dots');
    }
    media += `<span class="media-zoom" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"/></svg></span>`;
    return `<article class="card"><div class="media" data-mid="${idx}"
      role="button" tabindex="0" aria-label="${esc(UI[lang].zoom)}">${media}</div>${body}</article>`;
  }
  function renderProjects(tab){
    const items = PROJECTS[tab.id] || [];
    mediaSets = [];
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
    if (boxOpen()) return;               // просмотр открыт — механизм не листаем
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

  langSw.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));

  /* =========================================================
     Галерея в карточке: стрелки и точки листают кадр на месте.
     ========================================================= */
  function setFrame(mediaEl, set, i){
    const items = set.items;
    set.cur = (i + items.length) % items.length;
    const it = items[set.cur];
    const old = mediaEl.querySelector('.gal-img');
    const fresh = document.createElement('div');
    fresh.innerHTML = frameHTML(it, set.title, 'gal-img');
    const node = fresh.firstElementChild;
    if (old) mediaEl.replaceChild(node, old);
    else mediaEl.insertBefore(node, mediaEl.firstChild);
    mediaEl.querySelectorAll('.gal-dots .gal-dot').forEach((d, k) => {
      const on = k === set.cur;
      d.classList.toggle('is-on', on);
      d.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  content.addEventListener('click', (e) => {
    const mediaEl = e.target.closest('.media');
    if (!mediaEl) return;
    const set = mediaSets[parseInt(mediaEl.dataset.mid, 10)];
    if (!set || !set.items.length) return;

    const arrow = e.target.closest('.gal-arrow');
    if (arrow){
      setFrame(mediaEl, set, set.cur + parseInt(arrow.dataset.dir || '1', 10));
      return;
    }
    const dot = e.target.closest('.gal-dot');
    if (dot){ setFrame(mediaEl, set, parseInt(dot.dataset.go, 10)); return; }

    openBox(set, set.cur, mediaEl);      // клик по самому кадру — во весь экран
  });
  /* клавиатура: карточка-медиа — обычная кнопка */
  content.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const mediaEl = e.target.closest('.media');
    if (!mediaEl || e.target.closest('.gal-arrow') || e.target.closest('.gal-dot')) return;
    const set = mediaSets[parseInt(mediaEl.dataset.mid, 10)];
    if (!set || !set.items.length) return;
    e.preventDefault();
    openBox(set, set.cur, mediaEl);
  });

  /* =========================================================
     Полноэкранный просмотр: кадр целиком, по бокам стрелки
     (если кадров несколько), крестик и ESC — закрыть.
     ========================================================= */
  const box     = document.getElementById('lightbox');
  const boxWrap = box && box.querySelector('.lb-frame');
  const boxDots = box && box.querySelector('.lb-dots');
  const boxPrev = box && box.querySelector('.lb-prev');
  const boxNext = box && box.querySelector('.lb-next');
  const boxClose= box && box.querySelector('.lb-close');
  let boxSet = null, boxI = 0, boxFrom = null;

  const boxOpen = () => !!(box && box.classList.contains('is-on'));

  function paintBox(){
    if (!boxSet) return;
    const items = boxSet.items;
    boxI = (boxI + items.length) % items.length;
    boxWrap.innerHTML = frameHTML(items[boxI], boxSet.title, 'lb-media');
    const multi = items.length > 1;
    boxPrev.hidden = boxNext.hidden = !multi;
    boxDots.innerHTML = multi ? dotsHTML(items.length, boxI, 'lb-dots-row') : '';
    box.setAttribute('aria-label', boxSet.title || '');
  }
  function openBox(set, i, from){
    if (!box) return;
    boxSet = set; boxI = i || 0; boxFrom = from || null;
    paintBox();
    box.classList.add('is-on');
    box.removeAttribute('aria-hidden');
    document.body.classList.add('lb-lock');
    if (boxClose) boxClose.focus();
  }
  function closeBox(){
    if (!box || !boxOpen()) return;
    box.classList.remove('is-on');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lb-lock');
    boxWrap.innerHTML = '';           // остановить видео
    boxSet = null;
    if (boxFrom && boxFrom.focus) boxFrom.focus();
    boxFrom = null;
  }
  const boxStep = (d) => { if (boxSet){ boxI += d; paintBox(); } };

  if (box){
    box.addEventListener('click', (e) => {
      if (e.target.closest('.lb-close')){ closeBox(); return; }
      const a = e.target.closest('.lb-arrow');
      if (a){ boxStep(parseInt(a.dataset.dir || '1', 10)); return; }
      const d = e.target.closest('.gal-dot');
      if (d){ boxI = parseInt(d.dataset.go, 10); paintBox(); return; }
      /* клик по фону (не по кадру и не по кнопкам) — закрыть */
      if (!e.target.closest('.lb-frame')) closeBox();
    });
  }

  /* стрелки: пока открыт просмотр — листают кадры, иначе вкладки */
  window.addEventListener('keydown', (e) => {
    if (boxOpen()){
      if (e.key === 'Escape'){ e.preventDefault(); closeBox(); }
      else if (e.key === 'ArrowLeft'){ e.preventDefault(); boxStep(-1); }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); boxStep(1); }
      return;
    }
    if (e.key==='ArrowLeft'){ e.preventDefault(); prev(); }
    else if (e.key==='ArrowRight'){ e.preventDefault(); next(); }
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
  if (window.MC_SCENE) MC_SCENE.init({ el: document.getElementById('mcStage') });
  applyLang('ru');
  buildSideCog();
  requestAnimationFrame(initMech);
  requestAnimationFrame(tick);
  /* шрифт таблички может подгрузиться позже — перерисовать надпись */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncPlate);

  window.NAV = { next, prev, goTo, setLang, current:()=>current };
})();
