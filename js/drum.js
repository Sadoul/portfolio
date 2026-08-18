/* =========================================================
   3D-барабан (циклический, билборд-карусель)
   Карточки всегда лицом к камере => соседние читаемы.
   Управление: скролл / клик по соседней / стрелки / ← →
                / свайп / перетаскивание мышью
   Анимация: requestAnimationFrame (плавный tween, ease-out-cubic).
   ========================================================= */
(function(){
  "use strict";

  const { TABS, PROJECTS, PH } = window.PORTFOLIO;

  // только активные вкладки (4-я "Systems" скрыта => неактивна)
  const ACTIVE = TABS.filter(t => t.active);
  const N = ACTIVE.length;                 // 3
  const STEP = 360 / N;                    // 120°

  const drum   = document.getElementById('drum');
  const scene  = document.getElementById('drumScene');
  const sub    = document.getElementById('drumSub');
  const content= document.getElementById('content');
  const arrowL = document.getElementById('arrowLeft');
  const arrowR = document.getElementById('arrowRight');

  let current = 0;        // индекс центральной (текущей) вкладки
  let displayAngle = 0;   // текущий отрис. угол барабана (deg)
  let targetAngle = 0;    // целевой угол
  let tween = null;       // активная анимация {from,to,start,dur,onDone}
  let cards = [];

  const DURATION = 720;   // длительность прокрутки (ms)

  /* ---------- утилиты ---------- */
  const radius = () =>
    parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--drum-radius')) || 200;
  const clamp = (n, m) => ((n % m) + m) % m;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  /* ---------- построение карточек ---------- */
  function build(){
    drum.innerHTML = "";
    cards = [];
    ACTIVE.forEach((tab, i) => {
      const a = i * STEP;
      const card = document.createElement('div');
      card.className = 'drum-card';
      card.dataset.index = i;
      card.innerHTML = `
        <div class="face">
          <div class="ico">${tab.icon}</div>
          <div class="label">${tab.label}</div>
          <div class="num">0${i+1} / 0${N}</div>
        </div>`;
      card.addEventListener('click', () => {
        if (i === current){
          content.scrollIntoView({ behavior:'smooth', block:'start' });
          return;
        }
        goTo(i);
      });
      drum.appendChild(card);
      cards.push(card);
    });
    layoutCards();
  }

  /* позиция карточек на окружности (статично; меняется только при ресайзе) */
  function layoutCards(){
    const r = radius();
    cards.forEach((c, i) => {
      const a = i * STEP;
      c.style.transform = `rotateY(${a}deg) translateZ(${r}px)`;
    });
    renderAngle(displayAngle);
  }

  /* ---------- отрисовка угла (билборд: лицо всегда к камере) ---------- */
  function renderAngle(ang){
    drum.style.transform = `rotateX(-6deg) rotateY(${ang}deg)`;
    for (let i = 0; i < cards.length; i++){
      const a = i * STEP;
      const face = cards[i].querySelector('.face');
      // компенсируем и поворот карточки, и поворот барабана
      face.style.transform = `rotateY(${-(ang + a)}deg)`;
      cards[i].classList.toggle('is-center', i === current);
    }
  }

  /* ---------- tween ---------- */
  function startTween(from, to, dur, onDone){
    tween = { from, to, start: performance.now(), dur: dur||DURATION, onDone };
    requestAnimationFrame(tick);
  }
  function tick(now){
    if (!tween) return;
    const t = Math.min(1, (now - tween.start) / tween.dur);
    const e = easeOutCubic(t);
    displayAngle = tween.from + (tween.to - tween.from) * e;
    renderAngle(displayAngle);
    if (t < 1){
      requestAnimationFrame(tick);
    } else {
      const cb = tween.onDone;
      displayAngle = tween.to;
      renderAngle(displayAngle);
      tween = null;
      if (cb) cb();
    }
  }

  /* ---------- навигация ---------- */
  function nav(dir){
    current = clamp(current + dir, N);
    targetAngle = displayAngle - dir * STEP;   // dir=+1 => барабан крутится вправо
    sub.textContent = ACTIVE[current].subtitle;
    renderContent(ACTIVE[current]);
    startTween(displayAngle, targetAngle, DURATION, null);
  }

  // переход к конкретной вкладке кратчайшим путём
  function goTo(target){
    if (target === current) return;
    const diff = ((target - current) + N) % N;
    const dir = (diff <= N / 2) ? diff : (diff - N);
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
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
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
    rT = setTimeout(() => { layoutCards(); }, 150);
  });

  /* ---------- футер: год ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- старт ---------- */
  build();
  sub.textContent = ACTIVE[current].subtitle;
  renderContent(ACTIVE[current]);
  renderAngle(0);

  window.DRUM = { next, prev, goTo, current: () => current };
})();
