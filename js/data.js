/* =========================================================
   Данные портфолио с i18n (ru / en).
   В списках только реальные работы: карточек-заглушек нет.
     type:    'video' | 'photo' | 'gif' | 'gallery' | 'none'
     src:     путь к файлу в assets/...   (или null)
     gallery: массив путей — для type:'gallery'
     link:    URL проекта или null (null => плашки ссылки просто нет)
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
    { title:{ru:'Аудит безопасности', en:'Security Audit'},
      desc:{ru:'Макет сайта для аудита безопасности. Позже обговорили с клиентом и внесли правки — в галерее три экрана, листай стрелками.',
            en:'A website mockup for a security audit. Later reviewed with the client and revised — three screens in the gallery, use the arrows.'},
      type:'gallery',
      gallery:['assets/web/audit-1.webp','assets/web/audit-2.webp','assets/web/audit-3.webp'],
      src:null, link:null },
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
    { title:{ru:'DanganVerse — лаунчер', en:'DanganVerse — launcher'},
      desc:{ru:'Свой лаунчер для сборки DanganVerse: автообновление по дельте, админ-панель с загрузкой ZIP-сборок и папок, дерево файлов репозитория, свой модпак, настройки и вход в аккаунт.',
            en:'A custom launcher for the DanganVerse pack: delta auto-updates, an admin panel that uploads ZIP builds and folders, a repository file tree, custom modpacks, settings and account sign-in.'},
      type:'gallery',
      gallery:['assets/mc/danganverse-1.webp','assets/mc/danganverse-2.webp'],
      src:null, link:null },
    { title:{ru:'Прокачка на 50 уровней', en:'50-level progression'},
      desc:{ru:'Клиент выдал текстуры — я собрал комплексный мод, а затем перенёс его в плагин. 50 уровней прокачки, пассивные баффы и дебаффы, легендарные оружия. На старте выбор из 5 рас, у каждой свои крафты брони, оружия и талисманов. Интеграция с IronSpells.',
            en:'The client supplied the textures — I built a complex mod, then ported it to a plugin. 50 levels of progression, passive buffs and debuffs, legendary weapons. Five races to pick from at the start, each with its own armour, weapon and talisman crafts. Integrates IronSpells.'},
      type:'gallery',
      gallery:['assets/mc/levels-1.webp','assets/mc/levels-2.webp'],
      src:null, link:null },
    { title:{ru:'Сообщения в чате', en:'Chat messages'},
      desc:{ru:'Мод на оформление сообщений в чате — как у Лололошки. Красивые анимации появления и ухода реплик.',
            en:'A chat message mod in the style of Lololoshka. Neat animations as lines appear and leave.'},
      type:'gallery',
      gallery:['assets/mc/chatmsg-1.webp','assets/mc/chatmsg-2.webp'],
      src:null, link:null },
    { title:{ru:'Маяки островов', en:'Island beacons'},
      desc:{ru:'Плагин в духе Rust: игрок приватит остров маяком и строит дом. Базы можно гриферить — спец. динамитом пробить стену, отмычкой взломать двери.',
            en:'A Rust-flavoured plugin: the player claims an island with a beacon and builds a house. Bases can be raided — special dynamite blows walls open, a lockpick opens doors.'},
      type:'photo', src:'assets/mc/islands-1.webp', link:null },
    { title:{ru:'Мод из ресурспака', en:'Mod out of a resource pack'},
      desc:{ru:'Перенёс модельки предметов из ресурспака в мод и добавил функционал. Плюс пак ModelEngine + MythicMobs: ловушки тоже переехали в мод. Всё функционирует.',
            en:'Ported item models out of a resource pack into a mod and gave them behaviour. Plus a ModelEngine + MythicMobs pack: the traps moved into the mod too. All of it works.'},
      type:'gallery',
      gallery:['assets/mc/frompack-1.webp','assets/mc/frompack-2.webp','assets/mc/frompack-3.webp',
               'assets/mc/frompack-4.webp','assets/mc/frompack-5.webp','assets/mc/frompack-6.webp',
               'assets/mc/frompack-7.webp'],
      src:null, link:null },
  ],
  game: [
    { title:{ru:'RPWorld', en:'RPWorld'},
      desc:{ru:'Игра на C++ (Vulkan) с собственным движком. Подробнее — на отдельной странице.', en:'A C++ (Vulkan) game with a custom engine. See the dedicated page.'},
      type:'none', src:null, link:'https://sadoul.github.io/rpworld' },
  ],
};

const BIO = {
  name: { ru:'Sadoul', en:'Sadoul' },
  handle: '@Nichtojestv0',
  photo: 'assets/web/me.webp',
  facts: [
    { ru:'20 лет', en:'20 years old' },
    { ru:'Принимается криптовалюта', en:'Cryptocurrency accepted' },
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
  ru: { works:'работ', openLabel:'открыть ↗',
        zoom:'открыть во весь экран', close:'закрыть', prev:'предыдущее', next:'следующее',
        shot:'кадр' },
  en: { works:'works', openLabel:'open ↗',
        zoom:'open fullscreen', close:'close', prev:'previous', next:'next',
        shot:'shot' },
};

window.PORTFOLIO = { ICONS, TABS, PROJECTS, BIO, UI, LANGS:['ru','en'] };
