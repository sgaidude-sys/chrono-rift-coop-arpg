/* =============================================================================
 * Chrono-Rift — AAA HUD design system (loaded last)
 *
 *  Tokens:  ivory #F5F2EB text · champagne gold #D4AF37 / rgba(212,175,55,.35) hairlines
 *           and diamond accents · obsidian glass rgba(14,17,23,.72) + blur(12px) ONLY
 *           for modal windows. Type: Cinzel (titles) + Plus Jakarta Sans (numbers/UI).
 *  HUD:     no boxes over the viewport — white glyphs and numbers float with soft
 *           text-shadows. Desktop layout (body:not(.touch-ui)):
 *             top-left     circular minimap with gold compass ticks + avatar/level badge
 *             top-right    icon-only quick menu (Talents, Inventory, Map, Audio, Settings)
 *             top-center   zone label; boss bar (serif title, thin HP + posture) fades in
 *             bottom-center slim segmented HP (damage catch-up trail) + MP/synergy lines,
 *                          flanked by circular skills with SVG cooldown sweeps + keycaps
 *           Phones keep the touch layout from mmo_mobile.js, restyled with the tokens.
 *  Polish:  180 ms scale/fade modal open + close, backdrop-click & Escape close,
 *           hover glows, pointer-events:none on every empty wrapper.
 *  The original HUD elements stay in the DOM (game code writes into them); they are
 *  restyled or re-homed, never replaced.
 * ============================================================================= */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Icons (1.6px line glyphs, ivory)
  // ---------------------------------------------------------------------------
  const ICON = {
    talents: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.2 6.6 6.8.1-5.5 4.1 2 6.6L12 15.9l-5.5 4 2-6.6L3 9.2l6.8-.1z"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    audio: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="wave" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/></svg>'
  };
  const skSvg = (d) => '<svg class="ui-sk-svg" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const SKILL_SVG = {
    vanguard: [
      '<path d="M5 19L19 5M14.5 5H19v4.5"/><path d="M7 13l4 4M5 9.5a8.5 8.5 0 0 1 9.5-4.5"/>',
      '<path d="M12 3l6.5 2.5v4.8c0 4.2-2.8 7-6.5 8.7-3.7-1.7-6.5-4.5-6.5-8.7V5.5z"/><path d="M4 21h16M8.5 18.5L6.5 21M15.5 18.5l2 2.5"/>',
      '<path d="M11.5 5l6.5 2.5v4.5c0 4-2.5 6.5-6.5 8v-15z"/><path d="M3 9h5M2 12.5h6M4 16h4M18 12h4"/>',
      '<path d="M6.5 3.5v17.5M6.5 5h11.5l-2.5 4 2.5 4H6.5"/><path d="M11 7.5v3M9.5 9h3"/>'
    ],
    ranger: [
      '<path d="M7 4c6 2.5 8.5 5.5 8.5 8S13 17.5 7 20V4z"/><path d="M4 12h16.5M17 9l3.5 3-3.5 3"/>',
      '<path d="M12 19V4M12 4l-1.5 3.5h3z"/><path d="M12 19L5.5 7.5M5.5 7.5l.5 3.5 2.5-1.5z"/><path d="M12 19l6.5-11.5M18.5 7.5l-.5 3.5-2.5-1.5z"/>',
      '<path d="M4 17c2.5-7 8-9.5 14.5-7"/><path d="M15 7.5l3.5 2.5-2.5 3.5"/><polygon points="7,17 9.5,20 7,23 4.5,20"/>',
      '<path d="M12 3l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z"/><path d="M6.5 11v9M12 13v8M17.5 11v9M4.5 18l2 2 2-2M10 19l2 2 2-2M15.5 18l2 2 2-2"/>'
    ],
    arcanist: [
      '<path d="M7.5 20.5L17 4.5"/><path d="M17 4.5C11.5 4 7.5 6.8 5.5 11.5c3.5-2 7.2-2.2 10.5-.8"/>',
      '<circle cx="12" cy="12" r="2.2"/><path d="M12 4.5a7.5 7.5 0 0 1 7.2 5.4M19.5 12a7.5 7.5 0 0 1-5.4 7.2M12 19.5a7.5 7.5 0 0 1-7.2-5.4M4.5 12A7.5 7.5 0 0 1 9.9 4.8"/>',
      '<polygon points="12,3.5 19,12 12,20.5 5,12" stroke-dasharray="2.2 2.2"/><path d="M13 7l-3.5 5h4L11 17"/>',
      '<circle cx="12" cy="12" r="9.5" stroke-dasharray="2 2.5"/><path d="M8.5 7h7M8.5 17h7M9.5 7c0 3 2.5 3.8 2.5 5s-2.5 2-2.5 5M14.5 7c0 3-2.5 3.8-2.5 5s2.5 2 2.5 5"/>'
    ],
    berserker: [
      '<path d="M6 19L17.5 5.5M18 19L6.5 5.5"/><path d="M13.5 5.5c3-.8 5.2 1 5.5 4M10.5 5.5c-3-.8-5.2 1-5.5 4"/>',
      '<path d="M5 7h14M6.5 11h11M8.5 15h7M10.5 19h3"/><path d="M4.5 10c-.5-2 1.5-3.5 3.5-3.5M19.5 12.5c.5 2-1.5 3.5-3.5 3.5"/>',
      '<path d="M4 15C7 6.5 14 5 18 12"/><path d="M14.5 12l3.5.5.5-3.5"/><path d="M7 20.5h14M10.5 18.5l2-3 2 3 2-2.5 2 2.5"/>',
      '<path d="M12 3.5c2 3 5.5 5.5 5.5 10a5.5 5.5 0 0 1-11 0c0-2.5 1.3-4.6 2.5-6-.2 2 .8 3.2 2 3.5-.3-2.8 0-5.2 1-7.5z"/>'
    ],
    jump: '<path d="M4 9h10a2.5 2.5 0 1 0-2.5-2.5M3 13.5h14.5M6 18h8"/><path d="M15.5 10.5l3 3-3 3"/>',
    parry: '<path d="M12 3.5l7 2.6v5.2c0 4.5-3 7.8-7 9.7-4-1.9-7-5.2-7-9.7V6.1z"/><path d="M9.5 11.5l2 2 3.5-3.5"/>',
    potion: '<path d="M9.5 4h5M10.5 4v4l-4.5 7.5A3 3 0 0 0 8.5 20h7a3 3 0 0 0 2.5-4.5L13.5 8V4"/><path d="M8.5 15h7"/>',
    ult: '<circle cx="12" cy="12" r="9" stroke-dasharray="2.2 2.6"/><path d="M12 4.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/>'
  };

  const CSS = `
  :root {
    --ui-ivory: #F5F2EB; --ui-ivory-dim: rgba(245, 242, 235, 0.62); --ui-gold: #D4AF37; --ui-hair: rgba(212, 175, 55, 0.35);
    --ui-obsidian: rgba(14, 17, 23, 0.72); --ui-ease: cubic-bezier(.2, .7, .2, 1);
    --ui-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.55);
    --ui-num: 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif;
  }
  body { font-family: var(--ui-num); }

  /* ---------- modals: the ONLY place for obsidian glass ---------- */
  .modal-backdrop { background: radial-gradient(ellipse at 50% 40%, rgba(8, 10, 16, 0.38), rgba(4, 5, 9, 0.66)) !important; }
  .modal-backdrop.active { animation: uiFade .18s ease-out; }
  .modal-backdrop.active > .modal-box { animation: uiPop .18s var(--ui-ease); }
  .modal-backdrop.ui-closing { animation: uiFadeOut .17s ease-in forwards; pointer-events: none; }
  .modal-backdrop.ui-closing > .modal-box, .modal-backdrop.ui-closing > .tal-wrap { animation: uiPopOut .17s ease-in forwards; }
  @keyframes uiFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes uiFadeOut { to { opacity: 0; } }
  @keyframes uiPop { from { opacity: 0; transform: scale(.965) translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes uiPopOut { to { opacity: 0; transform: scale(.975); } }
  .modal-box {
    background: var(--ui-obsidian) !important; -webkit-backdrop-filter: blur(12px) saturate(1.1); backdrop-filter: blur(12px) saturate(1.1);
    border: 1px solid var(--ui-hair) !important; border-radius: 14px !important;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05) !important; color: var(--ui-ivory);
  }
  .modal-box::-webkit-scrollbar { width: 6px; } .modal-box::-webkit-scrollbar-thumb { background: var(--ui-hair); border-radius: 3px; }
  .modal-title, .modal-box h2, .modal-box h3 { font-family: 'Cinzel', serif; color: var(--ui-ivory); letter-spacing: 1.5px; }
  .modal-hero-banner { background: linear-gradient(180deg, rgba(212,175,55,.08), transparent) !important; border: 0 !important; border-bottom: 1px solid var(--ui-hair) !important; border-radius: 0 !important; box-shadow: none !important; }
  .mini-btn { font-family: var(--ui-num) !important; transition: transform .18s var(--ui-ease), background-color .18s, border-color .18s, box-shadow .18s !important; }
  .mini-btn:hover { box-shadow: 0 0 14px rgba(212, 175, 55, 0.25) !important; }
  .key-cap, .ui-kc { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 4px !important;
    font: 700 10.5px var(--ui-num) !important; color: var(--ui-ivory) !important; letter-spacing: .4px;
    background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05)) !important; border: 1px solid rgba(245,242,235,.45) !important;
    box-shadow: 0 2px 0 rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.25); text-shadow: none; }

  /* ---------- shared HUD text treatment ---------- */
  #story-tracker, #coop-roster, #chat-panel, #interact-prompt, #center-banner, #minimap-wrap, #boss-hud {
    background: none !important; border: 0 !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  #story-tracker, #coop-roster { color: var(--ui-ivory); text-shadow: var(--ui-shadow); }
  #story-tracker .story-tracker-title { font-family: 'Cinzel', serif !important; color: var(--ui-ivory) !important; font-size: 12px !important; letter-spacing: 2px; }
  #story-tracker .mmo-trk { padding-left: 10px; border-left: 1px solid var(--ui-hair); }
  #story-tracker .mmo-trk-t { color: var(--ui-ivory) !important; font-family: var(--ui-num); font-weight: 700; }
  #story-tracker .mmo-trk-p { color: var(--ui-ivory-dim) !important; }
  #story-tracker .story-chapter-pill { background: none !important; border: 0 !important; color: var(--ui-gold) !important; padding: 0 !important; letter-spacing: 2px; font-size: 10px !important; }
  #story-tracker .story-obj-line { color: var(--ui-ivory-dim) !important; }
  #story-tracker .mini-btn { background: transparent !important; border-color: transparent !important; padding: 0 4px !important; background-image: none !important; color: var(--ui-ivory-dim) !important; }
  #chat-log .chat-msg { text-shadow: var(--ui-shadow); font-family: var(--ui-num); }
  #chat-input { background: rgba(14,17,23,.35) !important; border: 0 !important; border-bottom: 1px solid var(--ui-hair) !important; border-radius: 0 !important; font-family: var(--ui-num); }
  #chat-input:focus { background: rgba(14,17,23,.55) !important; border-bottom-color: var(--ui-gold) !important; }
  #interact-prompt { font-family: var(--ui-num) !important; font-weight: 600 !important; color: var(--ui-ivory) !important; text-shadow: var(--ui-shadow); letter-spacing: .3px; }
  #interact-prompt::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--ui-gold), transparent); }
  #skill-tooltip { background: var(--ui-obsidian) !important; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid var(--ui-hair) !important; border-radius: 10px !important; box-shadow: 0 14px 34px rgba(0,0,0,.4) !important; }
  #skill-tooltip .tip-title { font-family: 'Cinzel', serif; color: var(--ui-ivory); }
  #skill-tooltip .tip-meta { font-family: var(--ui-num); color: var(--ui-gold); }
  #skill-tooltip .tip-desc { color: var(--ui-ivory-dim); font-family: var(--ui-num); }
  #skill-tooltip .room-badge { background: none; border: 1px solid rgba(245,242,235,.45); color: var(--ui-ivory); font-family: var(--ui-num); }
  #mmo-xpbar { height: 2px !important; bottom: 0 !important; width: 100vw !important; border: 0 !important; border-radius: 0 !important; background: rgba(255,255,255,.08) !important; }
  #mmo-xp-fill { background: linear-gradient(90deg, rgba(212,175,55,.5), var(--ui-gold)) !important; box-shadow: 0 0 8px rgba(212,175,55,.6) !important; }
  #mmo-xp-text { display: none !important; }
  .loot-toast { background: var(--ui-obsidian) !important; border-color: var(--ui-hair) !important; font-family: var(--ui-num); }
  #region-banner .rb-title { font-family: 'Cinzel', serif; color: var(--ui-ivory) !important; }
  #region-banner .rb-gem { border-color: var(--ui-gold) !important; box-shadow: 0 0 10px rgba(212,175,55,.8) !important; }
  #region-banner .rb-rule { background: linear-gradient(90deg, transparent, var(--ui-gold)) !important; }
  #region-banner .rb-rule.r { background: linear-gradient(270deg, transparent, var(--ui-gold)) !important; }

  /* ---------- boss bar: wide, thin, centred, fades ---------- */
  #boss-hud { display: flex !important; opacity: 0; visibility: hidden; transform: translateY(-6px); pointer-events: none !important;
    transition: opacity .35s ease, transform .35s var(--ui-ease), visibility 0s linear .35s; gap: 5px !important; padding: 0 !important; }
  #boss-hud.visible { opacity: 1; visibility: visible; transform: none; transition: opacity .35s ease, transform .35s var(--ui-ease), visibility 0s; }
  #boss-hud .boss-name-row { justify-content: center !important; position: relative; color: var(--ui-ivory) !important; text-shadow: var(--ui-shadow), 0 0 18px rgba(212,175,55,.35); }
  #boss-name-label { font-family: 'Cinzel', serif !important; font-weight: 700 !important; font-size: 17px !important; letter-spacing: 4px !important; text-transform: uppercase; }
  #boss-hp-label { position: absolute; right: 0; bottom: 1px; font: 600 11px var(--ui-num) !important; color: var(--ui-ivory-dim); letter-spacing: .5px; }
  #boss-hud .boss-hp-track { height: 6px !important; border-radius: 0 !important; background: rgba(0,0,0,.45) !important; border: 0 !important; box-shadow: 0 0 0 1px var(--ui-hair) !important; }
  #boss-hp-fill { background: linear-gradient(90deg, #8e1d2c, #d8344a 60%, #ff7a6a) !important; box-shadow: 0 0 10px rgba(216, 52, 74, .55); transition: width .25s ease-out !important; }
  #boss-hud .boss-posture-track { height: 3px !important; margin-top: 2px !important; border: 0 !important; border-radius: 0 !important; background: rgba(0,0,0,.4) !important; width: 62%; align-self: center; }
  #boss-posture-fill { background: linear-gradient(90deg, rgba(212,175,55,.6), #F3D98A) !important; box-shadow: 0 0 6px rgba(212,175,55,.8) !important; }
  #boss-hud::before { content: ''; height: 1px; background: linear-gradient(90deg, transparent, var(--ui-hair), transparent); order: 99; margin-top: 4px; }

  /* =====================================================================
     DESKTOP LAYOUT
     ===================================================================== */
  body:not(.touch-ui) #hud-top { top: 18px !important; left: 18px !important; right: 18px !important; }
  body:not(.touch-ui) #party-panel { display: none !important; }
  body:not(.touch-ui) #hud-top > #network-panel { display: none !important; }
  body:not(.touch-ui) #hud-left-col { padding-top: 182px; width: 280px; pointer-events: none !important; gap: 10px; }
  body:not(.touch-ui) #hud-left-col > * { pointer-events: auto; }
  body:not(.touch-ui) #story-tracker { width: 280px !important; padding: 2px 0 !important; }

  /* top-left: circular minimap + avatar */
  body:not(.touch-ui) #minimap-wrap { top: 18px !important; left: 18px !important; right: auto !important; bottom: auto !important; padding: 0 !important; width: 150px; height: 150px; gap: 0 !important; pointer-events: none; }
  body:not(.touch-ui) #minimap-canvas { width: 150px !important; height: 150px !important; border: 0 !important;
    background: radial-gradient(circle, rgba(18, 24, 36, .55) 0%, rgba(8, 10, 16, .78) 100%) !important;
    box-shadow: 0 0 0 1px var(--ui-hair), 0 6px 24px rgba(0,0,0,.35) !important; }
  body:not(.touch-ui) .minimap-caption { position: absolute; top: 160px; left: 0; width: 108px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font: 600 10px var(--ui-num) !important; color: var(--ui-ivory-dim) !important; text-shadow: var(--ui-shadow); letter-spacing: .6px; }
  #ui-compass { position: absolute; inset: -7px; width: calc(100% + 14px); height: calc(100% + 14px); pointer-events: none; overflow: visible; }
  #ui-compass line { stroke: var(--ui-gold); stroke-width: 1; opacity: .55; }
  #ui-compass line.maj { opacity: .95; stroke-width: 1.4; }
  #ui-compass text { fill: var(--ui-ivory); font: 700 9px 'Cinzel', serif; text-anchor: middle; dominant-baseline: middle; paint-order: stroke; stroke: rgba(0,0,0,.7); stroke-width: 2px; }
  #ui-compass .n { fill: var(--ui-gold); }
  #ui-avatar { position: fixed; left: 128px; top: 112px; z-index: 11; width: 58px; height: 58px; pointer-events: none; }
  #ui-avatar .ring { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 50% 35%, rgba(60, 64, 78, .95), rgba(14, 17, 23, .95));
    box-shadow: 0 0 0 1px var(--ui-gold), 0 0 0 4px rgba(14,17,23,.55), 0 0 0 5px var(--ui-hair), 0 6px 18px rgba(0,0,0,.45);
    display: grid; place-items: center; font: 700 24px 'Cinzel', serif; color: var(--ui-ivory); text-shadow: 0 0 12px rgba(212,175,55,.5); }
  #ui-avatar .hpring { position: absolute; inset: -3px; width: 64px; height: 64px; transform: rotate(-90deg); }
  #ui-avatar .hpring circle { fill: none; stroke-width: 2; }
  #ui-avatar .hpring .bg { stroke: rgba(255,255,255,.08); }
  #ui-avatar .hpring .fg { stroke: #e8475c; stroke-linecap: round; transition: stroke-dashoffset .3s ease; }
  #ui-avatar .lvl { position: absolute; left: 50%; bottom: -10px; transform: translateX(-50%); min-width: 26px; height: 18px; padding: 0 6px; display: grid; place-items: center;
    font: 800 10.5px var(--ui-num); color: #14110a; background: linear-gradient(180deg, #F3D98A, var(--ui-gold)); border-radius: 3px; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
  #ui-ident { position: fixed; left: 182px; top: 24px; z-index: 11; pointer-events: none; color: var(--ui-ivory); text-shadow: var(--ui-shadow); }
  #ui-ident .nm { font: 700 15px 'Cinzel', serif; letter-spacing: 1.5px; }
  #ui-ident .sub { font: 600 11px var(--ui-num); color: var(--ui-ivory-dim); margin-top: 2px; letter-spacing: .4px; }
  #ui-ident .cur { display: flex; gap: 12px; margin-top: 6px; font: 700 12px var(--ui-num); }
  #ui-ident .cur i { font-style: normal; display: inline-block; width: 7px; height: 7px; transform: rotate(45deg); margin-right: 6px; vertical-align: 1px; }
  #ui-ident .cur .g i { background: var(--ui-gold); box-shadow: 0 0 6px rgba(212,175,55,.8); }
  #ui-ident .cur .s i { background: #7fd8ff; box-shadow: 0 0 6px rgba(127,216,255,.8); }
  #ui-ident .hair { width: 120px; height: 1px; margin-top: 7px; background: linear-gradient(90deg, var(--ui-hair), transparent); }

  /* top-right: icon-only quick menu + status */
  #ui-quick { position: fixed; top: 18px; right: 18px; z-index: 12; display: flex; gap: 6px; pointer-events: none; }
  #ui-quick button { pointer-events: auto; position: relative; width: 38px; height: 38px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background: transparent;
    display: grid; place-items: center; transition: transform .18s var(--ui-ease), background-color .18s, box-shadow .18s; }
  #ui-quick button svg { width: 21px; height: 21px; fill: none; stroke: var(--ui-ivory); stroke-width: 1.6; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); }
  #ui-quick button:hover { transform: scale(1.1); background: rgba(245, 242, 235, 0.08); box-shadow: 0 0 0 1px var(--ui-hair), 0 0 16px rgba(212,175,55,.25); }
  #ui-quick button:active { transform: scale(.94); }
  #ui-quick button .badge { position: absolute; top: 3px; right: 3px; width: 7px; height: 7px; transform: rotate(45deg); background: var(--ui-gold); box-shadow: 0 0 8px var(--ui-gold); display: none; }
  #ui-quick button.has .badge { display: block; }
  #ui-quick button::after { content: attr(data-tip); position: absolute; top: 44px; left: 50%; transform: translateX(-50%) translateY(-3px); white-space: nowrap; opacity: 0; pointer-events: none;
    font: 600 10.5px var(--ui-num); color: var(--ui-ivory); text-shadow: var(--ui-shadow); letter-spacing: .5px; transition: opacity .18s, transform .18s; }
  #ui-quick button:hover::after { opacity: 1; transform: translateX(-50%); }
  #ui-quick .sep { width: 1px; margin: 9px 4px; background: var(--ui-hair); }
  #ui-status { position: fixed; top: 62px; right: 22px; z-index: 12; pointer-events: none; font: 600 10.5px var(--ui-num); color: var(--ui-ivory-dim); text-shadow: var(--ui-shadow); letter-spacing: .6px; }
  #ui-status b { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: #5be39b; box-shadow: 0 0 6px #5be39b; }
  #ui-status b.off { background: #e8b04a; box-shadow: 0 0 6px #e8b04a; }
  body.touch-ui #ui-quick, body.touch-ui #ui-status, body.touch-ui #ui-ident, body.touch-ui #ui-avatar, body.touch-ui #ui-vitals { display: none !important; }

  /* top-centre: zone label + boss bar */
  body:not(.touch-ui) #center-banner { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); width: min(720px, 52vw) !important; max-width: none !important; pointer-events: none !important; gap: 10px !important; }
  body:not(.touch-ui) #center-banner > * { pointer-events: none !important; }
  body:not(.touch-ui) .zone-pill { background: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; gap: 10px !important;
    font: 700 12px 'Cinzel', serif !important; letter-spacing: 3px !important; color: var(--ui-ivory) !important; text-shadow: var(--ui-shadow); }
  body:not(.touch-ui) .zone-pill::before, body:not(.touch-ui) .zone-pill::after { content: ''; width: 46px; height: 1px; background: linear-gradient(90deg, transparent, var(--ui-hair)); }
  body:not(.touch-ui) .zone-pill::after { background: linear-gradient(270deg, transparent, var(--ui-hair)); }
  body:not(.touch-ui) .zone-warp-btns { display: none !important; }
  body:not(.touch-ui) #hud-zone-level { font: 600 10.5px var(--ui-num) !important; letter-spacing: 1px; color: var(--ui-ivory-dim) !important; background: none !important; border: 0 !important; text-transform: none; }

  /* bottom-centre: vitals flanked by circular skills */
  body:not(.touch-ui) #hud-bottom { bottom: 22px !important; pointer-events: none; }
  body:not(.touch-ui) #hud-bottom > * { pointer-events: auto; }
  body:not(.touch-ui) #skill-bar { background: none !important; border: 0 !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
    padding: 0 !important; gap: 12px !important; align-items: center !important; pointer-events: none; }
  body:not(.touch-ui) #skill-bar .skill-slot { pointer-events: auto; width: 54px !important; height: 54px !important; padding: 0 !important; border-radius: 50% !important; overflow: visible !important;
    justify-content: center !important; border: 0 !important; background: radial-gradient(circle at 50% 38%, rgba(40, 44, 56, .62), rgba(10, 12, 18, .72)) !important;
    -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); box-shadow: 0 0 0 1px rgba(245,242,235,.22), 0 6px 18px rgba(0,0,0,.35) !important; transition: transform .18s var(--ui-ease), box-shadow .18s !important; }
  body:not(.touch-ui) #skill-bar .skill-slot:hover { transform: translateY(-3px) scale(1.05) !important; box-shadow: 0 0 0 1px var(--ui-gold), 0 0 18px rgba(212,175,55,.35), 0 8px 20px rgba(0,0,0,.35) !important; }
  body:not(.touch-ui) #skill-bar .skill-slot.triggered { transform: scale(.9) !important; box-shadow: 0 0 0 1.5px var(--ui-ivory), 0 0 22px rgba(245,242,235,.45) !important; }
  body:not(.touch-ui) #skill-bar .skill-icon { font-size: 22px !important; margin: 0 !important; filter: grayscale(1) brightness(1.75) contrast(1.15) drop-shadow(0 1px 2px rgba(0,0,0,.85)); }
  #skill-bar .skill-icon.has-svg { filter: none !important; display: grid; place-items: center; line-height: 0; }
  #skill-bar .skill-icon .ui-sk-svg { width: 24px; height: 24px; fill: none; stroke: var(--ui-ivory); stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,.9)); }
  body:not(.touch-ui) #slot-5 .skill-icon .ui-sk-svg { width: 28px; height: 28px; stroke: #dff6ff; }
  body:not(.touch-ui) #slot-potion .skill-icon .ui-sk-svg { width: 20px; height: 20px; }
  body.touch-ui #slot-1 .skill-icon .ui-sk-svg { width: 34px; height: 34px; }
  body:not(.touch-ui) #skill-bar .skill-name { display: none !important; }
  body:not(.touch-ui) #skill-bar .skill-key { top: auto !important; left: 50% !important; bottom: -9px; transform: translateX(-50%); z-index: 3; padding: 0 5px !important; min-width: 17px; height: 15px; line-height: 13px !important; text-align: center;
    font: 800 9px var(--ui-num) !important; color: var(--ui-ivory) !important; letter-spacing: .4px; border-radius: 3px !important;
    background: rgba(14,17,23,.86) !important; border: 1px solid rgba(245,242,235,.5) !important; box-shadow: 0 2px 4px rgba(0,0,0,.5); white-space: nowrap; }
  body:not(.touch-ui) #skill-bar .skill-cd-overlay { inset: 0 !important; height: auto !important; border-radius: 50%; background: none !important; z-index: 2;
    font: 700 15px var(--ui-num) !important; color: var(--ui-ivory) !important; text-shadow: 0 1px 3px #000; }
  .ui-sweep { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; z-index: 1;
    background: conic-gradient(rgba(6, 8, 12, .7) calc(var(--cd, 0) * 360deg), transparent 0); }
  .ui-ring { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); transform: rotate(-90deg); pointer-events: none; z-index: 2; overflow: visible; }
  .ui-ring circle { fill: none; stroke-width: 1.6; }
  .ui-ring .bg { stroke: transparent; }
  .ui-ring .fg { stroke: var(--ui-gold); stroke-linecap: round; filter: drop-shadow(0 0 3px rgba(212,175,55,.7)); }
  .skill-slot.ui-ready-flash::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; border: 1.5px solid var(--ui-ivory); animation: uiReady .45s ease-out forwards; pointer-events: none; }
  @keyframes uiReady { from { transform: scale(.85); opacity: 1; } to { transform: scale(1.35); opacity: 0; } }
  body:not(.touch-ui) #skill-bar #slot-1 { order: 1; } body:not(.touch-ui) #skill-bar #slot-2 { order: 2; }
  body:not(.touch-ui) #skill-bar #slot-3 { order: 3; } body:not(.touch-ui) #skill-bar #slot-4 { order: 4; }
  body:not(.touch-ui) #skill-bar #ui-vitals { order: 5; }
  body:not(.touch-ui) #skill-bar #slot-5 { order: 6; width: 62px !important; height: 62px !important; }
  body:not(.touch-ui) #skill-bar #slot-jump { order: 7; } body:not(.touch-ui) #skill-bar #slot-parry { order: 8; }
  body:not(.touch-ui) #skill-bar #slot-potion { order: 9; width: 44px !important; height: 44px !important; }
  body:not(.touch-ui) #skill-bar #slot-potion .skill-icon { font-size: 18px !important; }
  body:not(.touch-ui) #skill-bar #slot-5.ult-ready { box-shadow: 0 0 0 1.5px #bdf3ff, 0 0 24px rgba(127, 216, 255, .55) !important; animation: none !important; }
  body:not(.touch-ui) #skill-bar #slot-5 .ui-ring .fg { stroke: #9fe6ff; filter: drop-shadow(0 0 3px rgba(127,216,255,.8)); }
  body:not(.touch-ui) #skill-bar #slot-parry.blocking { box-shadow: 0 0 0 1.5px var(--ui-gold), 0 0 18px rgba(212,175,55,.5) !important; }
  #ui-potion-n { position: absolute; right: -4px; top: -4px; z-index: 3; font: 800 10px var(--ui-num); color: var(--ui-ivory); text-shadow: var(--ui-shadow); }
  body.touch-ui #skill-bar .skill-slot { overflow: visible !important; }
  body.touch-ui #ui-potion-n { display: grid; place-items: center; right: -3px; top: -3px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px;
    background: rgba(12,16,28,.9); border: 1px solid rgba(212,175,55,.65); font-size: 10px; line-height: 1; }
  body.touch-ui .ui-ring { display: none; }

  #ui-vitals { width: 300px; margin: 0 14px; pointer-events: none; color: var(--ui-ivory); }
  #ui-vitals .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; text-shadow: var(--ui-shadow); }
  #ui-vitals .lv { font: 700 11px var(--ui-num); letter-spacing: 1px; color: var(--ui-ivory-dim); }
  #ui-vitals .lv b { color: var(--ui-gold); font-weight: 800; }
  #ui-vitals .hpn { font: 700 13px var(--ui-num); letter-spacing: .3px; font-variant-numeric: tabular-nums; }
  #ui-vitals .hpn small { color: var(--ui-ivory-dim); font-weight: 600; font-size: 11px; }
  .ui-bar { position: relative; height: 7px; background: rgba(0,0,0,.42); box-shadow: 0 0 0 1px rgba(245,242,235,.14); border-radius: 1px; overflow: hidden; }
  .ui-bar > i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; }
  .ui-bar .trail { background: linear-gradient(90deg, #f0d39a, #fff3d6); opacity: .85; }
  .ui-bar .fill { background: linear-gradient(180deg, rgba(255,255,255,.28), transparent 55%), linear-gradient(90deg, #a51e33, #e8475c 70%, #ff7d8a); box-shadow: 0 0 10px rgba(232,71,92,.45); }
  .ui-bar.low .fill { animation: uiLow .7s ease-in-out infinite alternate; }
  @keyframes uiLow { to { filter: brightness(1.45); } }
  .ui-bar .seg { inset: 0; width: auto; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), rgba(6, 8, 12, .75) calc(10% - 1px), rgba(6, 8, 12, .75) 10%); }
  .ui-thin { position: relative; height: 2px; margin-top: 4px; background: rgba(255,255,255,.1); overflow: hidden; }
  .ui-thin > i { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 50%; transition: transform .25s ease-out; }
  .ui-thin.mp > i { background: linear-gradient(90deg, #3b7fe0, #8fd0ff); box-shadow: 0 0 6px rgba(120, 190, 255, .7); }
  .ui-thin.syn > i { background: linear-gradient(90deg, #4fd6e8, #e8fbff); box-shadow: 0 0 6px rgba(120, 230, 255, .8); }
  .ui-thin.syn.full > i { animation: uiLow .6s ease-in-out infinite alternate; }
  #ui-vitals .lbl { display: flex; justify-content: space-between; margin-top: 3px; font: 600 9px var(--ui-num); color: var(--ui-ivory-dim); letter-spacing: 1.2px; text-shadow: var(--ui-shadow); }

  /* chat: floating text, no box */
  body:not(.touch-ui) #chat-panel { left: 18px !important; bottom: 104px !important; width: 330px !important; padding: 0 !important; pointer-events: none; }
  body:not(.touch-ui) #chat-panel .chat-input-row { opacity: 0; transition: opacity .18s; }
  body:not(.touch-ui) #chat-panel #chat-log { pointer-events: none; }
  body:not(.touch-ui) #chat-panel:focus-within #chat-log { pointer-events: auto; }
  body:not(.touch-ui) #chat-panel:focus-within .chat-input-row, body:not(.touch-ui) #chat-panel:hover .chat-input-row { opacity: 1; }
  body:not(.touch-ui) #chat-panel .chat-input-row .mini-btn { padding: 4px 10px !important; background-image: none !important; }
  body:not(.touch-ui) #chat-panel > * { pointer-events: auto; }
  body:not(.touch-ui) #chat-log { -webkit-mask-image: linear-gradient(180deg, transparent, #000 30%); mask-image: linear-gradient(180deg, transparent, #000 30%); }

  /* settings modal (hosts the network panel) */
  #settings-modal .modal-box { max-width: 560px; }
  #settings-modal .ui-set-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid var(--ui-hair); }
  #settings-modal .ui-set-head h2 { font: 700 18px 'Cinzel', serif; letter-spacing: 3px; }
  #settings-modal #network-panel { display: flex !important; position: static !important; width: auto !important; min-width: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; padding: 0 !important; gap: 12px !important; }
  #settings-modal .net-actions { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px !important; }
  #settings-modal .net-actions .mini-btn { padding: 10px 12px 10px 24px !important; font-size: 12px !important; text-align: left; border-color: var(--ui-hair) !important; background-color: rgba(255,255,255,.03) !important; background-position: 10px 50% !important; }
  #settings-modal .net-actions .mini-btn:hover { background-color: rgba(212,175,55,.1) !important; border-color: var(--ui-gold) !important; transform: none; }
  #settings-modal .net-status-row, #settings-modal #coop-diag-line { font-family: var(--ui-num) !important; }
  @media (max-width: 640px) { #settings-modal .net-actions { grid-template-columns: 1fr; } }

  /* phones: same tokens on the existing touch layout */
  body.touch-ui #skill-bar { background: none !important; border: 0 !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
  body.touch-ui #party-panel, body.touch-ui #story-tracker, body.touch-ui #minimap-wrap { background: rgba(14,17,23,.38) !important; border: 1px solid rgba(212,175,55,.22) !important; box-shadow: none !important; -webkit-backdrop-filter: blur(6px) !important; backdrop-filter: blur(6px) !important; }
  body.touch-ui #skill-bar .skill-slot { border-radius: 50% !important; background: radial-gradient(circle at 50% 38%, rgba(40, 44, 56, .62), rgba(10, 12, 18, .72)) !important; border: 1px solid rgba(245,242,235,.28) !important; box-shadow: 0 4px 14px rgba(0,0,0,.35) !important; }
  body.touch-ui #skill-bar .skill-icon { filter: grayscale(1) brightness(1.75) drop-shadow(0 1px 2px rgba(0,0,0,.85)); }
  body.touch-ui #mmo-quick button { background: rgba(14,17,23,.5) !important; border: 1px solid rgba(212,175,55,.35) !important; }
  `;

  // keycap labels on the skill circles
  const KEYS = { 'slot-1': '1', 'slot-2': '2', 'slot-3': '3', 'slot-4': '4', 'slot-5': 'R', 'slot-jump': 'SPACE', 'slot-parry': 'RMB', 'slot-potion': 'C' };
  const RING_R = 29, RING_C = 2 * Math.PI * RING_R;

  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { initMMOWorld: GP.initMMOWorld, updateMMOWorld: GP.updateMMOWorld, closeModals: GP.closeModals, toggleAudio: GP.toggleAudio, selectClassCard: GP.selectClassCard };

  Object.assign(GP, {
    initMMOWorld() {
      orig.initMMOWorld.call(this);
      try { this.initAAAUI(); } catch (e) { console.warn('[UI] init failed', e); }
    },

    initAAAUI() {
      if (this._aaa) return;
      const U = this._aaa = { cd: {}, cdMax: {}, hpShown: 1, trail: 1, trailHold: 0, t: 0, statusT: 0 };
      if (!document.getElementById('ui-font')) {
        const l = document.createElement('link');
        l.id = 'ui-font'; l.rel = 'stylesheet';
        l.href = window.CR_VENDOR_FONTS ? 'vendor/fonts-ui.css' : 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';   // offline edition bundles the font
        document.head.appendChild(l);
      }
      const st = document.createElement('style'); st.id = 'ui-aaa-css'; st.textContent = CSS; document.head.appendChild(st);

      // ---- top-left: compass ticks on the minimap, avatar, identity ----
      const mm = document.getElementById('minimap-wrap');
      if (mm && !document.getElementById('ui-compass')) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.id = 'ui-compass'; svg.setAttribute('viewBox', '0 0 164 164');
        let s = '';
        for (let i = 0; i < 48; i++) {
          const a = i / 48 * Math.PI * 2, maj = i % 12 === 0, mid = i % 4 === 0;
          const r0 = 82 - (maj ? 7 : (mid ? 4.5 : 2.5)), r1 = 82;
          s += `<line class="${maj ? 'maj' : ''}" x1="${82 + Math.sin(a) * r0}" y1="${82 - Math.cos(a) * r0}" x2="${82 + Math.sin(a) * r1}" y2="${82 - Math.cos(a) * r1}"/>`;
        }
        s += '<text class="n" x="82" y="2">N</text><text x="163" y="82">E</text><text x="82" y="163">S</text><text x="1" y="82">W</text>';
        svg.innerHTML = s;
        mm.appendChild(svg);
      }
      const av = document.createElement('div');
      av.id = 'ui-avatar';
      av.innerHTML = `<svg class="hpring" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="30"/><circle class="fg" cx="32" cy="32" r="30" stroke-dasharray="${2 * Math.PI * 30}" stroke-dashoffset="0"/></svg><div class="ring">V</div><div class="lvl">1</div>`;
      document.body.appendChild(av);
      const id = document.createElement('div');
      id.id = 'ui-ident';
      id.innerHTML = '<div class="nm"></div><div class="sub"></div><div class="hair"></div><div class="cur"><span class="g"><i></i><b>0</b></span><span class="s"><i></i><b>0</b></span></div>';
      document.body.appendChild(id);
      U.av = av; U.id = id;

      // ---- top-right: icon-only quick menu ----
      const q = document.createElement('div');
      q.id = 'ui-quick';
      q.innerHTML = `
        <button data-a="talents" data-tip="Talents [K]" aria-label="Talents">${ICON.talents}<span class="badge"></span></button>
        <button data-a="bag" data-tip="Inventory [I]" aria-label="Inventory">${ICON.bag}</button>
        <button data-a="map" data-tip="World Map [M]" aria-label="World map">${ICON.map}</button>
        <span class="sep"></span>
        <button data-a="audio" data-tip="Audio" aria-label="Audio">${ICON.audio}</button>
        <button data-a="gear" data-tip="Settings" aria-label="Settings">${ICON.gear}</button>`;
      document.body.appendChild(q);
      q.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (this.audio) this.audio.init();
        const a = b.dataset.a;
        if (a === 'talents' && this.toggleTalents) this.toggleTalents();
        else if (a === 'bag') this.toggleModal('inventory-modal');
        else if (a === 'map' && this.openWorldMap) this.openWorldMap(this.isAtWaypoint ? this.isAtWaypoint() : false);
        else if (a === 'audio') this.toggleAudio();
        else if (a === 'gear') this.openSettings();
      });
      U.quick = q;
      const status = document.createElement('div');
      status.id = 'ui-status';
      document.body.appendChild(status);
      U.status = status;

      // ---- settings modal hosts the original network panel while open ----
      if (!document.getElementById('settings-modal')) {
        const m = document.createElement('div');
        m.id = 'settings-modal'; m.className = 'modal-backdrop';
        m.innerHTML = `<div class="modal-box"><div class="ui-set-head"><h2>Settings</h2><button class="mini-btn" data-close>✕ Close [ESC]</button></div><div id="ui-settings-slot"></div></div>`;
        document.body.appendChild(m);
        m.querySelector('[data-close]').onclick = () => this.closeModals();
      }
      const acts = document.querySelector('#network-panel .net-actions:last-of-type') || document.querySelector('#network-panel .net-actions');
      if (acts && !document.getElementById('btn-controls')) {
        const c = document.createElement('button');
        c.id = 'btn-controls'; c.className = 'mini-btn'; c.textContent = '⌨️ Controls [F1 / H]';
        c.onclick = () => this.openControlsSheet && this.openControlsSheet();
        acts.appendChild(c);
        const r = document.createElement('button');
        r.id = 'btn-tutorial'; r.className = 'mini-btn'; r.textContent = '🎓 Replay Tutorial';
        r.onclick = () => { this.closeModals(); if (this.replayTutorial) this.replayTutorial(); };
        acts.appendChild(r);
      }

      // ---- bottom: vitals between the skill groups, sweeps + keycaps on slots ----
      const bar = document.getElementById('skill-bar');
      if (bar && !document.getElementById('ui-vitals')) {
        const v = document.createElement('div');
        v.id = 'ui-vitals';
        v.innerHTML = `<div class="row"><span class="lv">LV <b>1</b></span><span class="hpn">0 <small>/ 0</small></span></div>
          <div class="ui-bar"><i class="trail"></i><i class="fill"></i><i class="seg"></i></div>
          <div class="ui-thin mp"><i></i></div><div class="ui-thin syn"><i></i></div>
          <div class="lbl"><span>AETHER</span><span class="synl">SYNERGY 0%</span></div>`;
        bar.appendChild(v);
        U.v = {
          lv: v.querySelector('.lv b'), hpn: v.querySelector('.hpn'), bar: v.querySelector('.ui-bar'),
          fill: v.querySelector('.fill'), trail: v.querySelector('.trail'), mp: v.querySelector('.mp > i'),
          syn: v.querySelector('.syn > i'), synBar: v.querySelector('.syn'), synl: v.querySelector('.synl')
        };
      }
      U.slots = {};
      Object.keys(KEYS).forEach((sid) => {
        const el = document.getElementById(sid);
        if (!el) return;
        const k = el.querySelector('.skill-key');
        if (k) k.textContent = KEYS[sid];
        else { const s = document.createElement('span'); s.className = 'skill-key'; s.textContent = KEYS[sid]; el.appendChild(s); }
        const sw = document.createElement('div'); sw.className = 'ui-sweep'; el.appendChild(sw);
        const NS = 'http://www.w3.org/2000/svg';
        const ring = document.createElementNS(NS, 'svg');
        ring.setAttribute('class', 'ui-ring'); ring.setAttribute('viewBox', '0 0 62 62');
        ring.innerHTML = `<circle class="bg" cx="31" cy="31" r="${RING_R}"/><circle class="fg" cx="31" cy="31" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>`;
        el.appendChild(ring);
        U.slots[sid] = { el, sw, fg: ring.querySelector('.fg'), last: -1 };
      });
      const pot = document.getElementById('slot-potion');
      if (pot && !document.getElementById('ui-potion-n')) {
        const n = document.createElement('span'); n.id = 'ui-potion-n'; pot.appendChild(n); U.potN = n;
      }

      // ---- micro-interactions ----
      document.addEventListener('mousedown', (e) => {
        const bd = e.target;
        if (!bd.classList || !bd.classList.contains('modal-backdrop') || !bd.classList.contains('active')) return;
        if (bd.id === 'hero-modal' || !this.isInWorld) return;               // the start screen never closes by accident
        this.closeModals();
      });
      this.refreshAudioIcon();
      this.refreshSkillIcons(this.player && this.player.classId);
    },

    refreshSkillIcons(classId) {
      const cls = SKILL_SVG[classId] ? classId : 'vanguard';
      const setSvg = (el, d) => { if (!el) return; el.innerHTML = skSvg(d); el.classList.add('has-svg'); };
      SKILL_SVG[cls].forEach((d, idx) => setSvg(document.getElementById(`icon-${idx + 1}`), d));
      setSvg(document.querySelector('#slot-jump .skill-icon'), SKILL_SVG.jump);
      setSvg(document.querySelector('#slot-parry .skill-icon'), SKILL_SVG.parry);
      setSvg(document.querySelector('#slot-potion .skill-icon'), SKILL_SVG.potion);
      setSvg(document.querySelector('#slot-5 .skill-icon'), SKILL_SVG.ult);
    },

    selectClassCard(classId, silent) {
      const r = orig.selectClassCard ? orig.selectClassCard.apply(this, arguments) : undefined;
      if (this._aaa) this.refreshSkillIcons(this.player && this.player.classId);
      return r;
    },

    openSettings() {
      const panel = document.getElementById('network-panel');
      const slot = document.getElementById('ui-settings-slot');
      if (!panel || !slot) return;
      this.openModal('settings-modal');
      if (panel.parentNode !== slot) {
        this._aaa.panelHome = { parent: panel.parentNode, next: panel.nextSibling };
        slot.appendChild(panel);
      }
    },

    restoreNetworkPanel() {
      const U = this._aaa, panel = document.getElementById('network-panel');
      if (!U || !U.panelHome || !panel) return;
      const h = U.panelHome; U.panelHome = null;
      if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(panel, h.next); else h.parent.appendChild(panel);
    },

    // 170 ms fade/scale-out, then the real close (instant when another modal replaces it)
    closeModals(fromOpenModal) {
      if (fromOpenModal || !this._aaa) { this.restoreNetworkPanel(); return orig.closeModals.apply(this, arguments); }
      const open = Array.from(document.querySelectorAll('.modal-backdrop.active:not(.ui-closing)'));
      if (!open.length || open.some(m => m.id === 'hero-modal')) { this.restoreNetworkPanel(); return orig.closeModals.apply(this, arguments); }
      if (this._aaaClosing) return;
      this._aaaClosing = true;
      open.forEach(m => m.classList.add('ui-closing'));
      const args = arguments;
      setTimeout(() => {
        this._aaaClosing = false;
        document.querySelectorAll('.modal-backdrop.ui-closing').forEach(m => m.classList.remove('ui-closing'));
        this.restoreNetworkPanel();
        orig.closeModals.apply(this, args);
      }, 170);
    },

    toggleAudio() {
      const r = orig.toggleAudio.apply(this, arguments);
      this.refreshAudioIcon();
      return r;
    },

    refreshAudioIcon() {
      const b = this._aaa && this._aaa.quick && this._aaa.quick.querySelector('[data-a="audio"]');
      if (!b) return;
      const muted = this.audio && this.audio.muted;
      b.innerHTML = muted ? ICON.mute : ICON.audio;
      b.dataset.tip = muted ? 'Audio: off' : 'Audio: on';
    },

    // =========================================================================
    updateAAAUI(dt) {
      const U = this._aaa, p = this.player;
      if (!U || !p) return;
      U.t += dt;
      // vitals (every frame: the catch-up trail needs smooth motion)
      const hpF = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
      if (hpF < U.trail - 0.001) { if (U.trailHold <= 0 && U.trail - hpF > 0.002 && U.hpShown > hpF + 0.002) U.trailHold = 0.45; }
      else U.trail = hpF;
      U.hpShown = hpF;
      if (U.trailHold > 0) U.trailHold -= dt;
      else if (U.trail > hpF) U.trail = Math.max(hpF, U.trail - dt * 0.55);
      if (U.v) {
        U.v.fill.style.transform = `scaleX(${hpF.toFixed(4)})`;
        U.v.trail.style.transform = `scaleX(${U.trail.toFixed(4)})`;
      }
      U.slow = (U.slow || 0) + dt;
      if (U.slow < 0.1) return;
      U.slow = 0;
      const set = (el, key, val, prop) => { if (el && U[key] !== val) { U[key] = val; if (prop) el.style[prop] = val; else el.textContent = val; } };
      if (U.v) {
        set(U.v.lv, 'lvTxt', String(p.level));
        const hpTxt = `${Math.round(p.hp)} <small>/ ${p.maxHp}</small>`;
        if (U.hpTxt !== hpTxt) { U.hpTxt = hpTxt; U.v.hpn.innerHTML = hpTxt; }
        U.v.bar.classList.toggle('low', hpF < 0.3);
        set(U.v.mp, 'mpT', `scaleX(${(Math.max(0, p.mp) / Math.max(1, p.maxMp)).toFixed(3)})`, 'transform');
        const syn = Math.min(100, Math.floor(p.synergy || 0));
        set(U.v.syn, 'synT', `scaleX(${(syn / 100).toFixed(3)})`, 'transform');
        U.v.synBar.classList.toggle('full', syn >= 100);
        set(U.v.synl, 'synL', syn >= 100 ? 'CONVERGENCE READY · R' : `SYNERGY ${syn}%`);
      }
      // avatar + identity
      const HC = typeof HERO_CLASSES !== 'undefined' ? HERO_CLASSES[p.classId] : null;
      set(U.av.querySelector('.ring'), 'avB', HC ? (HC.badge || HC.title[0]) : (p.classId || 'V')[0].toUpperCase());
      set(U.av.querySelector('.lvl'), 'avL', String(p.level));
      U.av.querySelector('.fg').style.strokeDashoffset = String(2 * Math.PI * 30 * (1 - hpF));
      set(U.id.querySelector('.nm'), 'idN', p.name || 'Hero');
      set(U.id.querySelector('.sub'), 'idS', `${HC ? HC.title : p.classId} · Level ${p.level}`);
      set(U.id.querySelector('.g b'), 'idG', String(p.gold));
      set(U.id.querySelector('.s b'), 'idSh', String(p.shards));
      // cooldown sweeps (max learned from the moment a cooldown starts, so talents / haste are included)
      const cds = p.cooldowns || {};
      Object.entries(U.slots).forEach(([sid, s]) => {
        let frac = 0;
        if (sid === 'slot-5') {
          const syn = Math.min(100, p.synergy || 0);
          frac = 1 - syn / 100;
          s.fg.style.strokeDashoffset = String(RING_C * (1 - syn / 100));
        } else {
          const key = sid === 'slot-potion' ? 'potion' : sid.slice(5);
          const cd = cds[key] || 0;
          const prev = U.cd[key] || 0;
          if (cd > prev + 0.05) U.cdMax[key] = cd;
          if (prev > 0.05 && cd <= 0.05) { s.el.classList.remove('ui-ready-flash'); void s.el.offsetWidth; s.el.classList.add('ui-ready-flash'); setTimeout(() => s.el.classList.remove('ui-ready-flash'), 480); }
          U.cd[key] = cd;
          frac = cd > 0.05 ? Math.min(1, cd / (U.cdMax[key] || cd)) : 0;
          s.fg.style.strokeDashoffset = String(RING_C * (1 - frac));
        }
        const f = frac.toFixed(3);
        if (s.last !== f) { s.last = f; s.sw.style.setProperty('--cd', f); }
      });
      if (U.potN) set(U.potN, 'potNTxt', String(p.potions || 0));   // cache key must differ from the element's own key
      // quick-menu talent badge
      const tb = U.quick.querySelector('[data-a="talents"]');
      if (tb && this.talentPointsTotal) tb.classList.toggle('has', this.talentPointsTotal() > this.talentPointsSpent());
      // status line
      U.statusT -= 0.1;
      if (U.statusT <= 0) {
        U.statusT = 0.5;
        const room = (document.getElementById('hud-room-code') || {}).textContent || '';
        const fps = (document.getElementById('hud-fps') || {}).textContent || '';
        const peers = this.remotePeers ? this.remotePeers.size : 0;
        const online = !!this.channelSubscribed;
        const html = `<b class="${online ? '' : 'off'}"></b>${room}${peers ? ` · ${peers + 1} heroes` : ''} · ${fps}`;
        if (U.statusH !== html) { U.statusH = html; U.status.innerHTML = html; }
      }
      const slotP = document.getElementById('slot-parry');
      if (slotP) slotP.classList.toggle('blocking', !!this._blocking);
    },

    updateMMOWorld(dt) {
      orig.updateMMOWorld.call(this, dt);
      if (this._aaa) this.updateAAAUI(dt);
    }
  });
})();
