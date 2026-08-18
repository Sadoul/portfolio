/* =========================================================
   Данные портфолио с i18n (ru / en).
   Чтобы добавить реальные медиа/ссылки — отредактируйте поля
   type, src, link у нужного проекта.
     type:  'video' | 'photo' | 'gif' | 'placeholder'
     src:   путь к файлу в assets/...   (или null)
     link:  URL проекта или null         (null => «ссылка недоступна»)
   Тексты — объекты { ru, en }.
   ========================================================= */

const ICONS = {
  web: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="20" width="72" height="56" rx="6"/>
    <path d="M14 34 H86"/>
    <circle cx="23" cy="27" r="2.4" fill="#161413" stroke="none"/>
    <circle cx="32" cy="27" r="2.4" fill="#161413" stroke="none"/>
    <path d="M30 50 H62 M30 60 H50"/>
    <path d="M70 70 l8 8 M78 70 l-8 8"/>
  </svg>`,
  mc: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linejoin="round">
    <path d="M50 16 L82 32 V68 L50 84 L18 68 V32 Z"/>
    <path d="M50 16 L50 50 M50 50 L18 32 M50 50 L82 32 M18 68 L50 50 M82 68 L50 50"/>
  </svg>`,
  game: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 36 H70 a16 16 0 0 1 16 16 v0 a18 18 0 0 1 -18 18 a14 14 0 0 1 -11 -6 H43 a14 14 0 0 1 -11 6 A18 18 0 0 1 14 52 a16 16 0 0 1 16 -16 Z"/>
    <path d="M30 52 H42 M36 46 V58"/>
    <circle cx="64" cy="48" r="3" fill="#161413" stroke="none"/>
    <circle cx="72" cy="56" r="3" fill="#161413" stroke="none"/>
  </svg>`,
  bio: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="50" cy="36" r="16"/>
    <path d="M20 84 a30 30 0 0 1 60 0"/>
    <path d="M50 60 V70" opacity=".5"/>
  </svg>`,
  sys: `<svg viewBox="0 0 100 100" fill="none" stroke="#161413" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <rect x="30" y="30" width="40" height="40" rx="4"/>
    <path d="M30 42 H20 M30 58 H20 M70 42 H80 M70 58 H80 M42 30 V20 M58 30 V20 M42 70 V80 M58 70 V80"/>
    <path d="M44 50 H56 M50 44 V56"/>
  </svg>`,
};

/* Заглушки медиа (рисуются, пока нет реального файла) */
const PH = {
  video: `<svg viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="26" width="72" height="48" rx="6"/>
    <path d="M44 40 V60 L62 50 Z" fill="#8c8780" stroke="none"/>
  </svg>`,
  photo: `<svg viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="12" y="22" width="76" height="56" rx="6"/>
    <circle cx="40" cy="44" r="9"/>
    <path d="M22 78 L46 54 L60 70 L72 60 L80 72"/>
  </svg>`,
  gif: `<svg viewBox="0 0 100 100" fill="none" stroke="#8c8780" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="14" y="22" width="72" height="56" rx="6"/>
    <text x="50" y="58" font-family="Caveat, cursive" font-size="26" font-weight="700" text-anchor="middle" fill="#8c8780" stroke="none">GIF</text>
  </svg>`,
};

const TABS = [
  { id:'web',  icon:ICONS.web,  active:true,
    label:{ru:'Web',       en:'Web'},
    subtitle:{ru:'Full-Stack · веб-разработка', en:'Full-Stack · web development'} },
  { id:'mc',   icon:ICONS.mc,   active:true,
    label:{ru:'Minecraft', en:'Minecraft'},
    subtitle:{ru:'Minecraft · плагины и сборки', en:'Minecraft · plugins & packs'} },
  { id:'game', icon:ICONS.game, active:true,
    label:{ru:'Game Dev', en:'Game Dev'},
    subtitle:{ru:'Game Development · движки и игры', en:'Game Development · engines & games'} },
  { id:'bio',  icon:ICONS.bio,  active:true,
    label:{ru:'Биография', en:'About'},
    subtitle:{ru:'Обо мне', en:'About me'} },
  { id:'sys',  icon:ICONS.sys,  active:false,
    label:{ru:'Systems', en:'Systems'},
    subtitle:{ru:'Системное программирование', en:'Systems programming'} },
];

const PROJECTS = {
  web: [
    { title:{ru:'Сайт', en:'Website'},
      desc:{ru:'Дизайн и вёрстка. Скриншот живой страницы.', en:'Design and build. Live page screenshot.'},
      type:'photo', src:'assets/web/site1.webp', link:null },
    { title:{ru:'RPWorld — веб', en:'RPWorld — web'},
      desc:{ru:'Веб-проект RPWorld. Два экрана — листай стрелками.', en:'RPWorld web project. Two screens — use the arrows.'},
      type:'gallery', gallery:['assets/web/rpw_web.webp','assets/web/rpw_web2.webp'], src:null, link:'https://sadoul.github.io/rpworld' },
    { title:{ru:'Веб-приложение', en:'Web app'},
      desc:{ru:'Полноценный full-stack сервис.', en:'Full-stack service.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Лендинг', en:'Landing page'},
      desc:{ru:'Одностраничник с анимациями.', en:'One-pager with animations.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Дашборд', en:'Dashboard'},
      desc:{ru:'Аналитическая панель.', en:'Analytics dashboard.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'API-сервис', en:'API service'},
      desc:{ru:'REST/GraphQL бэкенд.', en:'REST/GraphQL backend.'}, type:'placeholder', src:null, link:null },
  ],
  mc: [
    { title:{ru:'Расы (Skyrim-стиль)', en:'Races (Skyrim-style)'},
      desc:{ru:'Мод на 1.20.1, сделан за неделю. При входе игрок выбирает расу — как в Skyrim. У разных рас свои характеристики. Интеграция с FemaleGenderMod и Pehkui: «гномы» или великаны ростом.',
            en:'A 1.20.1 mod built in a week. On join the player picks a race — Skyrim-style. Each race has its own stats. Integrates FemaleGenderMod + Pehkui: «dwarves» or giants by scale.'},
      type:'photo', src:'assets/mc/gui.webp', link:null },
    { title:{ru:'Headpats', en:'Headpats'},
      desc:{ru:'С нуля воссоздал плагин headpats на 1.21.10. Клиентский мод + серверный плагин позволяют гладить игроков и животных.',
            en:'Recreated the headpats plugin from scratch on 1.21.10. A client mod + server plugin let you pet players and animals.'},
      type:'gif', src:'assets/mc/headpats.gif', link:null },
    { title:{ru:'Карта-приключение', en:'Adventure map'},
      desc:{ru:'Адвенчура-карта.', en:'Adventure map.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Мод-пак', en:'Mod pack'},
      desc:{ru:'Набор модов.', en:'Collection of mods.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Спавн-строение', en:'Spawn build'},
      desc:{ru:'Лор-спавн.', en:'Lore spawn.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Мини-игра', en:'Minigame'},
      desc:{ru:'Мини-игра в сервере.', en:'Server minigame.'}, type:'placeholder', src:null, link:null },
  ],
  game: [
    { title:{ru:'RPWorld', en:'RPWorld'},
      desc:{ru:'Игра на C++ (Vulkan) с собственным движком. Подробнее — на отдельной странице.', en:'A C++ (Vulkan) game with a custom engine. See the dedicated page.'},
      type:'placeholder', src:null, link:'https://sadoul.github.io/rpworld' },
    { title:{ru:'2D-платформер', en:'2D platformer'},
      desc:{ru:'Свой движок.', en:'Custom engine.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'3D-песочница', en:'3D sandbox'},
      desc:{ru:'Воксельный мир.', en:'Voxel world.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Рогалик', en:'Roguelike'},
      desc:{ru:'Процедурный данжен.', en:'Procedural dungeon.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Аркада', en:'Arcade'},
      desc:{ru:'Мини-игра с геймджема.', en:'Game jam entry.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Симулятор', en:'Simulator'},
      desc:{ru:'Физический симулятор.', en:'Physics simulator.'}, type:'placeholder', src:null, link:null },
    { title:{ru:'Шутер', en:'Shooter'},
      desc:{ru:'Прототип шутера.', en:'Shooter prototype.'}, type:'placeholder', src:null, link:null },
  ],
};

const BIO = {
  name: { ru:'Sadoul', en:'Sadoul' },
  handle: '@Nichtojestv0',
  photo: 'assets/web/me.webp',
  facts: [
    { ru:'18 лет', en:'18 years old' },
    { ru:'Живу в Днепре', en:'Based in Dnipro' },
    { ru:'Принимаю к оплате: рубли, евро, криптовалюту', en:'Accept payment: rubles, euros, crypto' },
    { ru:'Делаю Minecraft-моды и плагины с 12 лет', en:'Building Minecraft mods & plugins since age 12' },
    { ru:'50 Minecraft-проектов', en:'50 Minecraft projects shipped' },
    { ru:'Более 10 веб-сайтов', en:'10+ websites built' },
    { ru:'Бэкенд: архитектура и серверная логика', en:'Backend: architecture & server-side logic' },
    { ru:'Пишу игру на C++ (Vulkan) — собственный движок с нуля', en:'Writing a game in C++ (Vulkan) — custom engine from scratch' },
    { ru:'Иду в системное программирование: изучаю Rust, Zig, Odin', en:'Heading into systems programming: studying Rust, Zig, Odin' },
  ],
  stacks: [
    { cat:{ru:'Языки',en:'Languages'}, items:['Java','Kotlin','C++','C#','Rust','Zig','Odin'] },
    { cat:{ru:'Бэкенд и данные',en:'Backend & data'}, items:['MariaDB','Tarantool','ClickHouse','NATS','ZeroMQ','gRPC'] },
    { cat:{ru:'Minecraft',en:'Minecraft'}, items:[{ru:'ресурспаки',en:'resource packs'},{ru:'моды',en:'mods'},{ru:'лаунчеры',en:'launchers'},{ru:'плагины',en:'plugins'},'Spigot / Paper','Forge / Fabric'] },
    { cat:{ru:'Game Dev',en:'Game Dev'}, items:['C++','Vulkan','CMake',{ru:'собственный движок',en:'custom engine'}] },
    { cat:{ru:'Системы / low-level',en:'Systems / low-level'}, items:['Rust','Zig','Odin','C','Linux','POSIX'] },
  ],
};

const UI = {
  ru: { works:'работ', openLabel:'открыть ↗', linkUnavailable:'ссылка пока недоступна', media:'медиа' },
  en: { works:'works', openLabel:'open ↗', linkUnavailable:'link unavailable', media:'media' },
};

window.PORTFOLIO = { ICONS, PH, TABS, PROJECTS, BIO, UI, LANGS:['ru','en'] };
