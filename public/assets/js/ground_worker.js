/* Chrono-Rift — bakes a band of the world ground off the main thread (ChronoWorld.bakeGround).
 * The page <head> starts one worker per CPU core (up to 4), each with a row range, while the
 * rest of the game downloads; bands come back as transferred arrays and are merged. */
self.window = self;                 // mmo_data.js / world_core.js attach to window
importScripts('mmo_data.js?v=16', 'world_core.js?v=22');
self.onmessage = function (e) {
  try {
    const b = self.ChronoWorld.bakeGround(new self.ChronoWorld.WorldGen(), e.data.j0, e.data.j1);
    self.postMessage(b, [b.ctrlA.buffer, b.ctrlB.buffer, b.map.buffer, b.heights.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err && err.message || err) });
  }
};
