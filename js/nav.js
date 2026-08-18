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

  let lang = 'ru';
  let current = 0;
  let tabButtons = [];

  const L = (o) => (o && o[lang]) || '';
  const clamp = (n, m) => ((n % m) + m) % m;

  /* =========================================================
     3D-ЦИЛИНДР-ШЕСТЕРНЯ
     ========================================================= */
  const G = { VB:[0,0,360,270], cx:180, cyTop:118, R:112, tilt:0.30, H:30, teeth:44, hub:20 };
  const ry = () => G.R * G.tilt;

  // точки на верхнем/нижнем эллипсе под углом th (th=0 => фронт, низ эллипса)
  const Ptop = (th) => [G.cx + G.R*Math.sin(th), G.cyTop + ry()*Math.cos(th)];
  const Pbot = (th) => [G.cx + G.R*Math.sin(th), G.cyTop + G.H + ry()*Math.cos(th)];

  function arcPath(Rr, cy, from, to, steps){
    let d = "";
    for (let k=0; k<=steps; k++){
      const th = from + (to-from)*k/steps;
      d += (k===0?"M":" L") + (G.cx + Rr*Math.sin(th)).toFixed(1) + " " + (cy + ry()*Math.cos(th)).toFixed(1);
    }
    return d;
  }

  function renderGear(rotDeg){
    const rot = rotDeg * Math.PI/180;
    const step = 2*Math.PI / G.teeth;
    const hw = step * 0.33;
    const cyBot = G.cyTop + G.H;
    let s = [];

    s.push(`<svg viewBox="${G.VB.join(' ')}">`);
    s.push(`<defs>
      <pattern id="gh" width="5" height="3" patternUnits="userSpaceOnUse">
        <rect width="5" height="3" fill="none"/>
        <line x1="0" y1="1.5" x2="5" y2="1.5" stroke="#161413" stroke-width="0.7"/>
      </pattern></defs>`);
    s.push(`<g fill="none" stroke="#161413" stroke-linejoin="round" stroke-linecap="round">`);

    // 1) боковая стенка цилиндра (передняя половина): фронт-дуга верхняя -> вниз -> фронт-дуга нижняя
    let band = arcPath(G.R, G.cyTop, -Math.PI/2, Math.PI/2, 30);          // верхняя фронт-дуга
    band += " L" + Pbot(Math.PI/2).map(v=>v.toFixed(1)).join(" ");         // вниз справа
    band += arcPath(G.R, cyBot, Math.PI/2, -Math.PI/2, 30).replace("M"," L"); // нижняя фронт-дуга назад
    band += " Z";
    s.push(`<path d="${band}" fill="#efe9db" stroke="#161413" stroke-width="2"/>`);

    // 2) зубья-блоки на боковой стенке (только передняя половина cos(th)>0)
    for (let i=0;i<G.teeth;i++){
      const th = i*step + rot;
      if (Math.cos(th) <= 0.10) continue;           // боковые/задние скрыты
      const [tlx,tly] = Ptop(th-hw);
      const [trx,trty]= Ptop(th+hw);
      const [brx,bry] = Pbot(th+hw);
      const [blx,bly] = Pbot(th-hw);
      s.push(`<polygon points="${tlx.toFixed(1)},${tly.toFixed(1)} ${trx.toFixed(1)},${trty.toFixed(1)} ${brx.toFixed(1)},${bry.toFixed(1)} ${blx.toFixed(1)},${bly.toFixed(1)}" fill="url(#gh)" stroke="#161413" stroke-width="1.5"/>`);
    }

    // 3) верхняя плоскость (чистая): внешний овал, внутреннее кольцо, осевые линии, ступица
    s.push(`<ellipse cx="${G.cx}" cy="${G.cyTop}" rx="${G.R}" ry="${ry()}" fill="#f6f2e9" stroke="#161413" stroke-width="2"/>`);
    s.push(`<ellipse cx="${G.cx}" cy="${G.cyTop}" rx="${G.R-15}" ry="${(G.R-15)*G.tilt}" stroke-width="1.2"/>`);
    s.push(`<line x1="${G.cx-G.R}" y1="${G.cyTop}" x2="${G.cx+G.R}" y2="${G.cyTop}" stroke-width="1.2" stroke-dasharray="9 3 2 3"/>`);
    s.push(`<line x1="${G.cx}" y1="${G.cyTop-ry()}" x2="${G.cx}" y2="${G.cyTop+ry()}" stroke-width="1.2" stroke-dasharray="9 3 2 3"/>`);
    s.push(`<ellipse cx="${G.cx}" cy="${G.cyTop}" rx="${G.hub}" ry="${G.hub*G.tilt}" fill="#f6f2e9" stroke="#161413" stroke-width="2"/>`);
    s.push(`<circle cx="${G.cx}" cy="${G.cyTop}" r="4" fill="#161413" stroke="none"/>`);
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
