/* =========================================================
   Данные портфолио. Чтобы добавить реальные медиа/ссылки —
   отредактируйте поля: type, src, link.
     type:  'video' | 'photo' | 'gif'   (или 'placeholder' для заглушки)
     src:   путь к файлу в assets/...   (или null для заглушки)
     link:  URL проекта или null         (null => «Ссылка пока недоступна»)
   ========================================================= */

const ICONS = {
  web: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="20" width="72" height="56" rx="6"/>
    <path d="M14 34 H86"/>
    <circle cx="23" cy="27" r="2.4" fill="#161413" stroke="none"/>
    <circle cx="32" cy="27" r="2.4" fill="#161413" stroke="none"/>
    <path d="M30 50 H62 M30 60 H50"/>
    <path d="M70 70 l8 8 M78 70 l-8 8" stroke="#161413"/>
  </svg>`,
  mc: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linejoin="round">
    <path d="M50 16 L82 32 V68 L50 84 L18 68 V32 Z"/>
    <path d="M50 16 L50 50 M50 50 L18 32 M50 50 L82 32 M18 68 L50 50 M82 68 L50 50"/>
    <path d="M50 50 L50 84" opacity=".4" stroke-dasharray="3 4"/>
  </svg>`,
  game: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 36 H70 a16 16 0 0 1 16 16 v0 a18 18 0 0 1 -18 18 a14 14 0 0 1 -11 -6 H43 a14 14 0 0 1 -11 6 A18 18 0 0 1 14 52 a16 16 0 0 1 16 -16 Z"/>
    <path d="M30 52 H42 M36 46 V58"/>
    <circle cx="64" cy="48" r="3" fill="#161413" stroke="none"/>
    <circle cx="72" cy="56" r="3" fill="#161413" stroke="none"/>
  </svg>`,
  sys: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="30" y="30" width="40" height="40" rx="4"/>
    <path d="M30 42 H20 M30 58 H20 M70 42 H80 M70 58 H80 M42 30 V20 M58 30 V20 M42 70 V80 M58 70 V80"/>
    <path d="M44 50 H56 M50 44 V56"/>
  </svg>`,
};

/* Заглушки медиа (рисуются, пока нет реального файла) */
const PH = {
  video: `<svg class="ph" viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="26" width="72" height="48" rx="6"/>
    <path d="M44 40 V60 L62 50 Z" fill="#8c8780" stroke="none"/>
  </svg>`,
  photo: `<svg class="ph" viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="22" width="76" height="56" rx="6"/>
    <circle cx="40" cy="44" r="9"/>
    <path d="M22 78 L46 54 L60 70 L72 60 L80 72"/>
  </svg>`,
  gif: `<svg class="ph" viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="22" width="72" height="56" rx="6"/>
    <text x="50" y="58" font-family="Caveat, cursive" font-size="26" font-weight="700" text-anchor="middle" fill="#8c8780" stroke="none">GIF</text>
  </svg>`,
};

const TABS = [
  { id:'web',  label:'Web',       subtitle:'Full-Stack · веб-разработка', icon:ICONS.web,  active:true  },
  { id:'mc',   label:'Minecraft', subtitle:'Minecraft · плагины и сборки', icon:ICONS.mc,   active:true  },
  { id:'game', label:'Gamedev',   subtitle:'Game Development · движки и игрушки', icon:ICONS.game, active:true },
  { id:'sys',  label:'Systems',  subtitle:'Системное программирование',   icon:ICONS.sys,  active:false }, // скрытая, неактивная
];

const PROJECTS = {
  web: [
    { title:'Сайт-портфолио',     type:'placeholder', src:null, link:null, desc:'Этот сайт — скетч-стиль, чёрно-белый, 3D-барабан навигации.' },
    { title:'Веб-приложение',     type:'placeholder', src:null, link:null, desc:'Полноценный full-stack сервис. Замените на своё видео/скрин.' },
    { title:'Лендинг',             type:'placeholder', src:null, link:null, desc:'Одностраничник с анимациями. Загрузите сюда гифку или фото.' },
    { title:'Дашборд',             type:'placeholder', src:null, link:null, desc:'Аналитическая панель. Место для скринкаста.' },
    { title:'API-сервис',          type:'placeholder', src:null, link:null, desc:'REST/GraphQL бэкенд. Фото архитектуры или гифка.' },
    { title:'Интерактив-демо',     type:'placeholder', src:null, link:null, desc:'Эксперимент с WebGL. Видо-заглушка до загрузки медиа.' },
  ],
  mc: [
    { title:'Сборка-сервер',      type:'placeholder', src:null, link:null, desc:'Кастомный сервер с плагинами. Добавьте видео-обход.' },
    { title:'Плагин «Экономика»',  type:'placeholder', src:null, link:null, desc:'Экономическая система. Гифка с геймплеем.' },
    { title:'Карта-приключение',  type:'placeholder', src:null, link:null, desc:'Адвенчура-карта. Фото скриншотов.' },
    { title:'Мод-пак',            type:'placeholder', src:null, link:null, desc:'Набор модов. Видео-превью.' },
    { title:'Спавн-строение',     type:'placeholder', src:null, link:null, desc:'Лор-спавн. Скриншот-тура.' },
    { title:'Мини-игра',          type:'placeholder', src:null, link:null, desc:'Мини-игра в сервере. Гифка процесса.' },
  ],
  game: [
    { title:'2D-платформер',      type:'placeholder', src:null, link:null, desc:'Сделан на своём движке. Геймплей-видео.' },
    { title:'3D-песочница',       type:'placeholder', src:null, link:null, desc:'Воксельный мир. Скринкаст.' },
    { title:'Рогалик',            type:'placeholder', src:null, link:null, desc:'Процедурный данжен. Гифка.' },
    { title:'Аркада',             type:'placeholder', src:null, link:null, desc:'Мини-игра на геймджем. Видео.' },
    { title:'Симулятор',          type:'placeholder', src:null, link:null, desc:'Физический симулятор. Фото.' },
    { title:'Шутер',            type:'placeholder', src:null, link:null, desc:'Прототип шутера. Гифка.' },
  ],
};

window.PORTFOLIO = { TABS, PROJECTS, PH };
