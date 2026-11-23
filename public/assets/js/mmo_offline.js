/* =============================================================================
 * Chrono-Rift — offline edition switch
 *
 *  The standalone zip for game portals (CrazyGames, itch.io) sets
 *  window.CR_OFFLINE = true and does not load the Supabase library, so the game:
 *   • never contacts Supabase (no co-op rooms, accounts, cloud saves, world-state
 *     sync or leaderboard) — the game already skips all of that when the library
 *     is missing; this module just removes the waits and the online-only UI
 *   • starts straight in guest mode (no login screen); heroes save on the device
 *   • hides Rooms / Invite / room code / co-op status / Hall of Legends / chat
 *  In the normal (Vercel) build CR_OFFLINE is not set and this file does nothing.
 * ============================================================================= */
(function () {
  'use strict';
  if (!window.CR_OFFLINE) return;
  const GP = ChronoRiftCoOpGame.prototype;
  const orig = { acctClient: GP.acctClient, acctStart: GP.acctStart };

  document.documentElement.classList.add('cr-offline');
  const css = `
  .cr-offline #net-dot, .cr-offline #net-status-text, .cr-offline #hud-room-code, .cr-offline #coop-diag-line,
  .cr-offline [onclick*="lobby-modal"], .cr-offline [onclick*="copyInviteLink"], .cr-offline [onclick*="leaderboard-modal"],
  .cr-offline .hs-realm-btn, .cr-offline #coop-roster, .cr-offline #chat-panel, .cr-offline #lobby-modal, .cr-offline #leaderboard-modal,
  .cr-offline [data-acct="signin"], .cr-offline .acct-signin-link, .cr-offline #ui-status, .cr-offline #ui-quick [data-a="party"],
  .cr-offline .hs-field:has(.hs-realm-btn) { display: none !important; }`;
  const s = document.createElement('style'); s.id = 'cr-offline-css'; s.textContent = css;
  (document.head || document.documentElement).appendChild(s);

  Object.assign(GP, {
    // no backend: don't wait for a client that will never come
    async acctClient() { return null; },

    // straight to the guest heroes (create one on first launch)
    async acctStart() {
      if (!this._acct) return orig.acctStart.apply(this, arguments);
      this._acctStarted = true;
      document.body.classList.add('cr-acct-on', 'cr-booted');
      this._acct.mode = 'guest';
      try { sessionStorage.setItem('cr_mode', 'guest'); localStorage.setItem('cr_last_mode', 'guest'); } catch (e) { /* storage blocked */ }
      return this.acctShowChars();
    }
  });

  window.CR_OFFLINE_EDITION = true;
})();
