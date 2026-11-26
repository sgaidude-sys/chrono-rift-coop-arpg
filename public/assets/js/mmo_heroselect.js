/* =============================================================================
 * Chrono-Rift — hero select screen
 *
 *  Replaces the old boxed start modal with a full-screen character select that
 *  frames the live 3D hero in the middle of the screen:
 *    left    wordmark + roster of the four classes (line-art sigils, role line)
 *    right   class name, epithet, short fantasy, role / difficulty, stat bars and
 *            the four signature skills with their keys
 *    bottom  hero name, realm (collapsed; expands to code / public / private) and
 *            the Enter button
 *  Phones: roster becomes a top strip, details shrink to a bottom sheet.
 *  Keys while open: ← → / 1-4 switch class, Enter starts.
 *  Keeps every id and callback the game uses (#hero-name-input, #room-code-input,
 *  #modal-room-indicator, .class-card[data-class], selectClassCard, startOrResumeGame).
 * ============================================================================= */
(function () {
  'use strict';

  const SIGIL = {
    vanguard: '<svg viewBox="0 0 32 32"><path d="M16 3.5l10 3.6v7.6c0 6.6-4.3 11.2-10 13.8C10.3 25.9 6 21.3 6 14.7V7.1z"/><path d="M16 8.5v15M11 13.5h10"/></svg>',
    ranger: '<svg viewBox="0 0 32 32"><path d="M9 4c8.5 3.2 12.6 8 12.6 12S17.5 24.8 9 28"/><path d="M9 4v24"/><path d="M4.5 16H27M23 12.5l4 3.5-4 3.5"/></svg>',
    arcanist: '<svg viewBox="0 0 32 32"><path d="M9 28L22 6"/><path d="M22 6c-6.5-.6-12 2.6-14.5 8.2 4.3-2.6 9-3.2 13.2-1.6"/><circle cx="16" cy="16" r="12.5" stroke-dasharray="2 3.4"/></svg>',
    berserker: '<svg viewBox="0 0 32 32"><path d="M16 4v24"/><path d="M16 7c-5-.8-8.6 1.6-10 6 3-1.6 6.6-1.4 10 .6M16 7c5-.8 8.6 1.6 10 6-3-1.6-6.6-1.4-10 .6"/><path d="M12.5 28h7"/></svg>'
  };

  const CLASSES = [
    { id: 'vanguard', name: 'Vanguard', epithet: 'The Sunsteel Bulwark', role: 'Tank · Melee', diff: 1, accent: '#f3c86b',
      blurb: 'The shield of the party. Provokes enemies into attacking them, shrugs off damage, and plants a war banner that heals the whole party.',
      stats: { Health: 5, Power: 3, Range: 1, Mobility: 2 },
      skills: [['LMB', 'Sunsteel Combo', 'Every third strike sends out a golden shockwave.'], ['2', 'Seismic Slam', 'Stuns nearby foes and PROVOKES them to attack you.'],
        ['Shift', 'Aegis Rush', 'A shielded charge that slams foes in your path.'], ['4', 'Phalanx Banner', 'Party heals and +25% damage around the banner.']] },
    { id: 'ranger', name: 'Ranger', epithet: 'The Emerald Shadow', role: 'Damage · Ranged', diff: 2, accent: '#2ee68a',
      blurb: 'Fights from a distance with piercing volleys and thrown blades, vaults clear of danger and calls down a rain of starlit arrows.',
      stats: { Health: 2, Power: 4, Range: 5, Mobility: 5 },
      skills: [['LMB', 'Astral Volley', 'Piercing arrows; every third shot fans out.'], ['2', 'Fan of Blades', 'Seven daggers that mark targets for a crit.'],
        ['Shift', 'Shadow Vault', 'Leap away and leave an exploding decoy.'], ['4', 'Starfall Rain', 'Eighteen arrows rain down on a marked area.']] },
    { id: 'arcanist', name: 'Arcanist', epithet: 'The Reaper of Hours', role: 'Support · Caster', diff: 3, accent: '#b266ff',
      blurb: 'Bends time to keep the party alive: every strike mends the most wounded ally, and a chrono dome freezes foes while healing friends.',
      stats: { Health: 2, Power: 5, Range: 4, Mobility: 3 },
      skills: [['LMB', 'Reaper Sweep', 'Each sweep launches a homing crescent.'], ['2', 'Anima Vortex', 'A singularity pulls foes in, then implodes.'],
        ['Shift', 'Chrono Blink', 'Teleport, leaving a shattering time-mirror.'], ['4', 'Time Sanctuary', 'Freezes foes and heals allies inside for 30% HP.']] },
    { id: 'berserker', name: 'Berserker', epithet: 'The Crimson Warlord', role: 'Bruiser · Melee', diff: 2, accent: '#ff3b5c',
      blurb: 'Wades in with twin axes, spins into a blood-fire whirlwind and leaps into the thick of the fight, healing with every blow.',
      stats: { Health: 5, Power: 5, Range: 1, Mobility: 3 },
      skills: [['LMB', 'Twin-Axe Cleave', 'Crossing cleaves that scatter molten sparks.'], ['2', 'Blood Whirlwind', 'Spin inside a fire tornado for three hits.'],
        ['Shift', 'Crusher Leap', 'Leap and crater the ground, stunning foes.'], ['4', 'Warlord Frenzy', '+35% attack speed and lifesteal for eight seconds.']] }
  ];
  const BY_ID = {}; CLASSES.forEach(c => { BY_ID[c.id] = c; });

  const CSS = `
  #hero-modal.hs { display: none; padding: 0 !important; align-items: stretch !important; justify-content: stretch !important;
    background: linear-gradient(90deg, rgba(5,7,12,.9) 0%, rgba(5,7,12,.62) 22%, rgba(5,7,12,0) 38%, rgba(5,7,12,0) 56%, rgba(5,7,12,.78) 68%, rgba(5,7,12,.93) 100%),
                linear-gradient(0deg, rgba(5,7,12,.85) 0%, rgba(5,7,12,0) 26%) !important; }
  #hero-modal.hs.active { display: block; }
  #hero-modal .hs-root { position: absolute; inset: 0; color: #F5F2EB; font-family: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif; --acc: #f3c86b; }
  #hero-modal.cr-reveal .hs-root, #hero-modal.active .hs-root { animation: hsIn .6s cubic-bezier(.2,.7,.2,1); }
  @keyframes hsIn { from { opacity: 0; } to { opacity: 1; } }
  .hs-root button { font-family: inherit; }
  .hs-left { position: absolute; left: clamp(20px, 4.5vw, 72px); top: clamp(24px, 7vh, 72px); width: 290px; }
  .hs-brand { font: 900 22px 'Cinzel', serif; letter-spacing: .32em; color: #F5F2EB; }
  .hs-brand small { display: block; font: 600 10px 'Plus Jakarta Sans', sans-serif; letter-spacing: .42em; color: #D4AF37; margin-top: 6px; }
  .hs-kicker { margin: 7vh 0 14px; font: 700 10.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .38em; color: rgba(245,242,235,.55); }
  .hs-roster { display: flex; flex-direction: column; gap: 4px; }
  .hs-root .class-card { all: unset; box-sizing: border-box; display: grid; grid-template-columns: 46px 1fr; align-items: center; gap: 14px; cursor: pointer;
    padding: 10px 12px 10px 14px; position: relative; border-left: 1px solid rgba(245,242,235,.12); transition: background .25s, border-color .25s; }
  .hs-root .class-card .sg { width: 46px; height: 46px; display: grid; place-items: center; position: relative; }
  .hs-root .class-card .sg::before { content: ''; position: absolute; inset: 7px; transform: rotate(45deg); border: 1px solid rgba(245,242,235,.25); transition: border-color .25s, background .25s, box-shadow .25s; }
  .hs-root .class-card svg { width: 24px; height: 24px; fill: none; stroke: rgba(245,242,235,.6); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; position: relative; transition: stroke .25s; }
  .hs-root .class-card .nm { font: 700 17px 'Cinzel', serif; letter-spacing: .12em; color: rgba(245,242,235,.6); transition: color .25s; }
  .hs-root .class-card .rl { font-size: 11px; letter-spacing: .14em; color: rgba(245,242,235,.38); margin-top: 3px; text-transform: uppercase; }
  .hs-root .class-card:hover { background: linear-gradient(90deg, rgba(245,242,235,.05), transparent); }
  .hs-root .class-card:hover .nm { color: #F5F2EB; }
  .hs-root .class-card.selected { border-left-color: var(--c); background: linear-gradient(90deg, color-mix(in srgb, var(--c) 16%, transparent), transparent 85%); }
  .hs-root .class-card.selected .sg::before { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); }
  .hs-root .class-card.selected svg { stroke: #fff; }
  .hs-root .class-card.selected .nm { color: #fff; }
  .hs-root .class-card.selected .rl { color: var(--c); }
  .hs-right { position: absolute; right: clamp(20px, 4.5vw, 72px); top: clamp(22px, 6vh, 80px); width: min(380px, 32vw); text-align: left; }
  .hs-right > * { animation: hsSlide .5s cubic-bezier(.2,.7,.2,1) both; }
  .hs-right.swap > * { animation: none; }
  @keyframes hsSlide { from { opacity: 0; transform: translateX(14px); } }
  .hs-ep { font: 700 10.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .36em; color: var(--acc); text-transform: uppercase; }
  .hs-name { font: 900 clamp(40px, 4.6vw, 64px)/1 'Cinzel', serif; letter-spacing: .08em; margin: 10px 0 14px; text-shadow: 0 4px 30px rgba(0,0,0,.6); }
  .hs-blurb { font-size: 14px; line-height: 1.62; color: rgba(245,242,235,.8); }
  .hs-meta { display: flex; gap: 28px; margin: 18px 0 20px; padding: 12px 0; border-top: 1px solid rgba(212,175,55,.32); border-bottom: 1px solid rgba(212,175,55,.32); }
  .hs-meta div { font-size: 10px; letter-spacing: .26em; color: rgba(245,242,235,.45); text-transform: uppercase; }
  .hs-meta b { display: block; font: 600 13px 'Plus Jakarta Sans', sans-serif; letter-spacing: .04em; color: #F5F2EB; text-transform: none; margin-top: 5px; }
  .hs-dia { display: inline-flex; gap: 5px; margin-top: 7px; } .hs-dia i { width: 7px; height: 7px; transform: rotate(45deg); border: 1px solid rgba(245,242,235,.4); }
  .hs-dia i.on { background: var(--acc); border-color: var(--acc); }
  .hs-stats { display: grid; grid-template-columns: 74px 1fr; gap: 9px 12px; align-items: center; font-size: 11px; letter-spacing: .14em; color: rgba(245,242,235,.6); text-transform: uppercase; }
  .hs-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; } .hs-bar i { height: 4px; background: rgba(245,242,235,.16); transition: background .35s; }
  .hs-bar i.on { background: linear-gradient(90deg, var(--acc), #fff); }
  .hs-sk-h { margin: 24px 0 8px; font: 700 10px 'Plus Jakarta Sans', sans-serif; letter-spacing: .32em; color: rgba(245,242,235,.45); }
  .hs-sk { display: grid; grid-template-columns: 48px 1fr; gap: 2px 12px; padding: 7px 0; border-bottom: 1px solid rgba(245,242,235,.07); }
  .hs-sk kbd { grid-row: span 2; align-self: center; justify-self: start; font: 700 10px 'Plus Jakarta Sans', sans-serif; letter-spacing: .06em; color: #F5F2EB;
    padding: 4px 7px; border: 1px solid rgba(245,242,235,.35); border-radius: 4px; background: rgba(255,255,255,.04); }
  .hs-sk b { font: 700 13px 'Cinzel', serif; letter-spacing: .06em; }
  .hs-sk span { font-size: 12px; color: rgba(245,242,235,.6); line-height: 1.45; }
  .hs-bottom { position: absolute; right: clamp(20px, 4.5vw, 72px); bottom: clamp(20px, 5vh, 56px); width: min(380px, 32vw); display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px 22px; }
  .hs-bottom .hs-field { flex: 1; min-width: 0; }
  .hs-field label { display: block; font: 700 9.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .34em; color: rgba(245,242,235,.5); margin-bottom: 6px; }
  .hs-field input { all: unset; box-sizing: border-box; width: 100%; padding: 7px 0; font: 600 16px 'Plus Jakarta Sans', sans-serif; color: #F5F2EB; border-bottom: 1px solid rgba(212,175,55,.45); transition: border-color .2s; }
  .hs-field input:focus { border-bottom-color: #F5F2EB; }
  .hs-field input::placeholder { color: rgba(245,242,235,.35); }
  .hs-realm-btn { all: unset; box-sizing: border-box; cursor: pointer; display: block; width: 100%; padding: 8px 0 7px; font: 600 14px 'Plus Jakarta Sans', sans-serif; color: #F5F2EB; border-bottom: 1px solid rgba(212,175,55,.25); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hs-realm-btn em { font-style: normal; color: rgba(245,242,235,.45); font-size: 11px; margin-left: 8px; letter-spacing: .1em; }
  .hs-realm-pop { position: absolute; bottom: calc(100% + 14px); right: 0; width: 340px; padding: 16px; display: none;
    background: rgba(14,17,23,.86); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid rgba(212,175,55,.35); border-radius: 10px; }
  .hs-realm-pop.on { display: block; animation: hsIn .2s ease; }
  .hs-realm-pop input { width: 100% !important; font-family: 'JetBrains Mono', monospace !important; letter-spacing: .08em; margin-bottom: 12px; }
  .hs-realm-pop .row { display: flex; gap: 8px; } .hs-realm-pop .row button { flex: 1; }
  .hs-ghost { all: unset; cursor: pointer; text-align: center; padding: 8px 10px; font: 600 11.5px 'Plus Jakarta Sans', sans-serif; letter-spacing: .08em; color: #F5F2EB;
    border: 1px solid rgba(245,242,235,.25); border-radius: 6px; transition: border-color .2s, background .2s; }
  .hs-ghost:hover { border-color: #D4AF37; background: rgba(212,175,55,.1); }
  .hs-realm-pop p { margin: 10px 0 0; font-size: 11px; color: rgba(245,242,235,.5); line-height: 1.5; }
  .hs-go { all: unset; box-sizing: border-box; flex-basis: 100%; text-align: center; cursor: pointer; position: relative; padding: 17px 0; font: 900 15px 'Cinzel', serif; letter-spacing: .3em; color: #17120a;
    background: linear-gradient(180deg, #f6dc8c, #D4AF37 55%, #a8842a); clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%);
    transition: filter .2s, transform .2s; box-shadow: 0 0 30px rgba(212,175,55,.35); }
  .hs-go:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .hs-go:active { transform: translateY(1px); }
  .hs-hint { position: absolute; left: clamp(20px, 4.5vw, 72px); bottom: clamp(20px, 5vh, 56px); font-size: 11px; letter-spacing: .14em; color: rgba(245,242,235,.42); }
  .hs-hint kbd { font: 700 10px 'Plus Jakarta Sans', sans-serif; padding: 2px 5px; border: 1px solid rgba(245,242,235,.3); border-radius: 3px; margin: 0 2px; }
  /* ---------- portrait phones ---------- */
  @media (max-width: 900px) and (orientation: portrait) {
    #hero-modal.hs { background: linear-gradient(180deg, rgba(5,7,12,.82) 0%, rgba(5,7,12,0) 22%, rgba(5,7,12,0) 48%, rgba(5,7,12,.92) 72%) !important; }
    .hs-left { left: 0; right: 0; top: 12px; width: auto; text-align: center; }
    .hs-brand { font-size: 14px; } .hs-brand small, .hs-kicker, .hs-hint { display: none; }
    body.cr-lyra-call .hs-brand { display: none; }
    body.cr-lyra-call .hs-left { top: calc(74px + env(safe-area-inset-top)); }
    .hs-roster { flex-direction: row; justify-content: center; gap: 6px; margin-top: 10px; }
    .hs-root .class-card { grid-template-columns: 1fr; justify-items: center; gap: 4px; padding: 6px 8px; border-left: 0; border-bottom: 1px solid rgba(245,242,235,.12); }
    .hs-root .class-card.selected { border-bottom-color: var(--c); background: linear-gradient(0deg, color-mix(in srgb, var(--c) 18%, transparent), transparent); }
    .hs-root .class-card .sg { width: 36px; height: 36px; } .hs-root .class-card .nm { font-size: 11px; } .hs-root .class-card .rl { display: none; }
    .hs-right { left: 16px; right: 16px; top: auto; bottom: 144px; width: auto; }
    .hs-name { font-size: 28px; margin: 4px 0 6px; } .hs-blurb { font-size: 12px; line-height: 1.45; }
    .hs-meta { margin: 8px 0 0; padding: 6px 0; } .hs-stats, .hs-sk-h, .hs-sks { display: none; }
    .hs-bottom { left: 16px; right: 16px; bottom: calc(12px + env(safe-area-inset-bottom)); width: auto; gap: 10px 14px; }
    .hs-go { padding: 13px 0; font-size: 13.5px; }
    .hs-realm-btn em { display: none; } .hs-realm-btn::after { content: ' ›'; color: #D4AF37; }
    .hs-realm-pop { width: min(340px, calc(100vw - 32px)); }
  }
  /* ---------- landscape phones: crisp 2-column framing around centered 3D hero ---------- */
  @media (max-height: 520px) and (orientation: landscape), (pointer: coarse) and (max-height: 520px) and (min-width: 500px) {
    #hero-modal.hs { background: linear-gradient(90deg, rgba(5,7,12,.88) 0%, rgba(5,7,12,.45) 22%, rgba(5,7,12,0) 34%, rgba(5,7,12,0) 62%, rgba(5,7,12,.82) 74%, rgba(5,7,12,.94) 100%) !important; }
    .hs-brand, .hs-brand small, .hs-kicker, .hs-hint, .hs-stats, .hs-sk-h, .hs-sks, .hs-meta, .hs-realm-btn em { display: none; }
    .hs-left { left: 12px; right: auto; top: 10px; bottom: 10px; width: 148px; text-align: left; display: flex; flex-direction: column; justify-content: center; }
    .hs-roster { flex-direction: column; gap: 3px; margin-top: 0; }
    .hs-root .class-card { grid-template-columns: 30px 1fr; justify-items: start; gap: 8px; padding: 6px 8px; border-left: 1px solid rgba(245,242,235,.12); border-bottom: 0; }
    .hs-root .class-card.selected { border-left-color: var(--c); background: linear-gradient(90deg, color-mix(in srgb, var(--c) 18%, transparent), transparent 88%); }
    .hs-root .class-card .sg { width: 30px; height: 30px; } .hs-root .class-card .sg::before { inset: 4px; }
    .hs-root .class-card svg { width: 17px; height: 17px; }
    .hs-root .class-card .nm { font-size: 12px; letter-spacing: .08em; }
    .hs-root .class-card .rl { display: block; font-size: 9px; margin-top: 1px; letter-spacing: .08em; }
    .hs-right { left: auto; right: 12px; top: 10px; bottom: auto; width: min(214px, 31vw); }
    .hs-ep { font-size: 8.5px; letter-spacing: .24em; }
    .hs-name { font-size: 22px; margin: 3px 0 4px; }
    .hs-blurb { font-size: 10.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .hs-bottom { left: auto; right: 12px; bottom: 10px; width: min(214px, 31vw); gap: 8px 10px; }
    .hs-field label { font-size: 8px; margin-bottom: 2px; }
    .hs-field input { padding: 4px 0; font-size: 13px; }
    .hs-realm-btn { padding: 4px 0; font-size: 12px; }
    .hs-realm-btn::after { content: ' ›'; color: #D4AF37; }
    .hs-go { padding: 10px 0; font-size: 12px; letter-spacing: .18em; }
    .hs-realm-pop { width: min(300px, calc(100vw - 24px)); }
  }
  @media (max-height: 860px) and (min-width: 901px) { .hs-sk span { display: none; } .hs-sk kbd { grid-row: auto; } .hs-sk { padding: 6px 0; } .hs-sk-h { margin-top: 18px; } .hs-meta { margin: 14px 0 16px; } }
  @media (max-height: 640px) and (min-width: 901px) { .hs-sks, .hs-sk-h, .hs-blurb { display: none; } }
  body.hs-open #hud-top, body.hs-open #hud-bottom, body.hs-open #chat-panel, body.hs-open #minimap-wrap, body.hs-open #ui-quick, body.hs-open #ui-status, body.hs-open #ui-avatar,
  body.hs-open #touch-joystick, body.hs-open #ui-ident, body.hs-open #mmo-quick, body.hs-open #mmo-xpbar, body.hs-open #story-tracker, body.hs-open #coop-roster, body.hs-open #epic-combo,
  body.hs-open #interact-prompt, body.hs-open #center-banner, body.hs-open #loot-feed, body.hs-open #boss-hud,
  body.hs-open #cr-op-hints, body.hs-open #dir-moves, body.hs-open #cr-tal-nudge, body.hs-open #cr-obj-chip, body.hs-open #cr-equip-card { visibility: hidden !important; }
  body.hs-open canvas + div .npc-label, body.hs-open .nameplate-html { visibility: hidden !important; }
  `;

  function build() {
    const modal = document.getElementById('hero-modal');
    if (!modal || modal.classList.contains('hs')) return;
    const st = document.createElement('style'); st.id = 'heroselect-css'; st.textContent = CSS; document.head.appendChild(st);
    let savedName = '';
    try { savedName = localStorage.getItem('arpg_hero_name') || ''; } catch (e) { /* storage blocked */ }
    const oldName = document.getElementById('hero-name-input');
    const oldRoom = document.getElementById('room-code-input');
    const nameVal = (oldName && oldName.value) || savedName;
    const roomVal = (oldRoom && oldRoom.value) || 'ASHEN-1';
    modal.classList.add('hs');
    modal.innerHTML = `
      <div class="hs-root">
        <div class="hs-left">
          <div class="hs-brand">CHRONO-RIFT<small>CHRONICLES OF ASHENVALE</small></div>
          <div class="hs-kicker">CHOOSE YOUR HERO</div>
          <div class="hs-roster">${CLASSES.map((c, i) => `
            <button type="button" class="class-card${i === 0 ? ' selected' : ''}" data-class="${c.id}" style="--c:${c.accent}" aria-label="${c.name}">
              <span class="sg">${SIGIL[c.id]}</span><span><div class="nm">${c.name}</div><div class="rl">${c.role}</div></span>
            </button>`).join('')}
          </div>
        </div>
        <div class="hs-right" aria-live="polite"></div>
        <div class="hs-bottom">
          <div class="hs-field"><label for="hero-name-input">HERO NAME</label>
            <input id="hero-name-input" type="text" maxlength="22" placeholder="Name your hero" autocomplete="off" spellcheck="false" /></div>
          <div class="hs-field" style="position:relative"><label>REALM</label>
            <button type="button" class="hs-realm-btn"><span class="hs-realm-lbl"></span><em>CHANGE</em></button><span id="modal-room-indicator" hidden></span>
            <div class="hs-realm-pop">
              <label for="room-code-input">REALM CODE</label>
              <div class="hs-field"><input id="room-code-input" type="text" maxlength="18" autocomplete="off" spellcheck="false" /></div>
              <div class="row"><button type="button" class="hs-ghost" data-act="public">Public realm</button><button type="button" class="hs-ghost" data-act="private">New private realm</button></div>
              <p>Friends who enter the same code play in your world.</p>
            </div>
          </div>
          <button type="button" class="hs-go">ENTER ASHENVALE</button>
        </div>
        <div class="hs-hint"><kbd>←</kbd><kbd>→</kbd> switch hero &nbsp; <kbd>Enter</kbd> begin &nbsp; <kbd>F1</kbd> controls</div>
      </div>`;
    const nameIn = document.getElementById('hero-name-input');
    const roomIn = document.getElementById('room-code-input');
    nameIn.value = nameVal; roomIn.value = roomVal;
    const lbl = modal.querySelector('.hs-realm-lbl');
    const syncInd = () => { const v = (roomIn.value || 'ASHEN-1').trim().toUpperCase(); lbl.textContent = v === 'ASHEN-1' ? 'Ashen-1 · Public' : v; };
    syncInd();
    try { new MutationObserver(syncInd).observe(document.getElementById('modal-room-indicator'), { childList: true, characterData: true, subtree: true }); } catch (e) { /* no observer */ }
    const pop = modal.querySelector('.hs-realm-pop');
    const g = () => window.game;
    modal.querySelector('.hs-realm-btn').addEventListener('click', () => { pop.classList.toggle('on'); if (pop.classList.contains('on')) roomIn.focus(); });
    roomIn.addEventListener('input', () => { if (g()) g().onRoomInputChanged(roomIn.value); syncInd(); });
    roomIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); pop.classList.remove('on'); } });
    pop.addEventListener('click', (e) => {
      const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act || !g()) return;
      if (act === 'public') g().selectPublicRealm(); else g().generatePrivateRoomCode();
      syncInd();
    });
    modal.querySelectorAll('.class-card').forEach((el) => {
      el.addEventListener('click', () => { if (g()) g().selectClassCard(el.getAttribute('data-class')); });
      el.addEventListener('mouseenter', () => { const a = g() && g().audio; if (a && a.playSample) a.playSample('ui_hover', 1.0, 0.18); });
    });
    modal.querySelector('.hs-go').addEventListener('click', () => { pop.classList.remove('on'); if (g()) g().startOrResumeGame(); });
    // keyboard: arrows / 1-4 switch hero, Enter begins (ignored while typing in a field)
    window.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('active') || document.body.classList.contains('cr-title-on') || document.body.classList.contains('cr-acct-on')) return;
      const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
      const game = g(); if (!game) return;
      const cur = Math.max(0, CLASSES.findIndex(c => c.id === game.player.classId));
      let next = -1;
      if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) next = (cur + 1) % CLASSES.length;
      else if (!typing && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) next = (cur + CLASSES.length - 1) % CLASSES.length;
      else if (!typing && /^[1-4]$/.test(e.key)) next = +e.key - 1;
      else if (e.key === 'Enter' && (!typing || e.target === nameIn)) { e.preventDefault(); e.stopImmediatePropagation(); pop.classList.remove('on'); game.startOrResumeGame(); return; }
      if (next >= 0) { e.preventDefault(); e.stopImmediatePropagation(); game.selectClassCard(CLASSES[next].id); }
      else if (!typing && (/^Arrow/.test(e.key) || /^[wasdqezx ]$/i.test(e.key))) { e.preventDefault(); e.stopImmediatePropagation(); }   // the hero holds its pose
    }, true);
    renderDetails('vanguard', true);
  }

  function renderDetails(id, first) {
    const c = BY_ID[id] || CLASSES[0];
    const modal = document.getElementById('hero-modal');
    if (!modal) return;
    const root = modal.querySelector('.hs-root'); if (!root) return;
    root.style.setProperty('--acc', c.accent);
    const R = root.querySelector('.hs-right');
    if (!first && R.dataset.cls === id) return;
    R.dataset.cls = id;
    const bars = (n) => `<div class="hs-bar">${[0, 1, 2, 3, 4].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
    R.classList.add('swap'); void R.offsetWidth;
    R.innerHTML = `
      <div class="hs-ep">${c.epithet}</div>
      <div class="hs-name">${c.name}</div>
      <div class="hs-blurb">${c.blurb}</div>
      <div class="hs-meta"><div>Role<b>${c.role}</b></div><div>Difficulty<span class="hs-dia" style="display:flex">${[0, 1, 2].map(i => `<i class="${i < c.diff ? 'on' : ''}"></i>`).join('')}</span></div></div>
      <div class="hs-stats">${Object.keys(c.stats).map(k => `<span>${k}</span>${bars(c.stats[k])}`).join('')}</div>
      <div class="hs-sk-h">SIGNATURE SKILLS</div>
      <div class="hs-sks">${c.skills.map(s => `<div class="hs-sk"><kbd>${s[0]}</kbd><b>${s[1]}</b><span>${s[2]}</span></div>`).join('')}</div>`;
    R.classList.remove('swap');
  }

  // build as soon as this script runs (before the game constructor touches the inputs)
  if (document.getElementById('hero-modal')) build(); else document.addEventListener('DOMContentLoaded', build);

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { selectClassCard: GP.selectClassCard, openModal: GP.openModal, enterWorld: GP.enterWorld, renderFrame: GP.renderFrame };
  const _c = new THREE.Vector3(), _l = new THREE.Vector3();
  Object.assign(GP, {
    selectClassCard(classId, silent) {
      const r = orig.selectClassCard.apply(this, arguments);
      if (BY_ID[classId]) {
        renderDetails(classId);
        if (!silent && this.audio && this.audio.playSample) this.audio.playSample('ui_select', 1.0, 0.3);
      }
      return r;
    },
    openModal(id) {
      const r = orig.openModal.apply(this, arguments);
      if (id === 'hero-modal') this.syncHeroSelectLabel();
      return r;
    },
    enterWorld() {
      const r = orig.enterWorld ? orig.enterWorld.apply(this, arguments) : undefined;
      this.syncHeroSelectLabel();
      return r;
    },
    // Frame the hero full-body in the middle of the screen while the select is open
    renderFrame() {
      const hm = this.ui && this.ui.heroModal;
      const open = !!(hm && hm.classList.contains('active') && hm.classList.contains('hs'));
      if (open !== !!this._hsOpen) { this._hsOpen = open; document.body.classList.toggle('hs-open', open); this._hsCam = null; }
      if (open && !this.cutsceneActive && this.player && this.camera) {
        const p = this.player, cam = this.camera;
        const face = p.meshRoot ? p.meshRoot.rotation.y : (p.yaw || 0);
        const t = performance.now() / 1000;
        const isPortrait = window.innerWidth < 900 && window.innerHeight >= window.innerWidth;
        const isShortLand = window.innerHeight < 520;
        const a = face + Math.sin(t * 0.22) * 0.2 + (isPortrait ? 0 : -0.12);
        const dist = isPortrait ? 7.4 : (isShortLand ? 5.6 : 5.0);
        const base = (this.terrainVisualHeight ? this.terrainVisualHeight(p.pos.x, p.pos.z) : 0) + p.pos.y;
        _c.set(p.pos.x + Math.sin(a) * dist, base + (isPortrait ? 2.0 : 1.45), p.pos.z + Math.cos(a) * dist);
        if (!this._hsCam) this._hsCam = _c.clone(); else this._hsCam.lerp(_c, 0.08);
        cam.position.copy(this._hsCam);
        _l.set(p.pos.x, base + (isPortrait ? -0.35 : (isShortLand ? 0.95 : 1.0)), p.pos.z);
        cam.lookAt(_l);
        cam.updateMatrixWorld();
      }
      return orig.renderFrame.apply(this, arguments);
    },
    syncHeroSelectLabel() {
      const b = document.querySelector('#hero-modal .hs-go');
      if (b) b.textContent = this.isInWorld ? 'RETURN TO THE REALM' : 'ENTER ASHENVALE';
      if (this.player) renderDetails(this.player.classId || 'vanguard');
    }
  });

  window.CR_HEROSELECT = { CLASSES };
})();
