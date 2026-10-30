/* Veyra — локальная история анализов (localStorage, только в этом браузере). */
(function () {
  'use strict';
  const C = window.Veyra.config;

  function load() {
    try { return JSON.parse(localStorage.getItem(C.storageKey) || '[]'); } catch (e) { return []; }
  }
  function save(list) {
    // при нехватке места выбрасываем самые старые записи
    for (let n = list.length; n >= 0; n--) {
      try { localStorage.setItem(C.storageKey, JSON.stringify(list.slice(0, n))); return true; } catch (e) { /* retry */ }
    }
    return false;
  }
  function thumb(img) {
    try {
      const s = 96, k = Math.min(s / img.naturalWidth, s / img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.6);
    } catch (e) { return ''; }
  }
  function add(entry) {
    const list = load();
    list.unshift(Object.assign({ id: Date.now().toString(36), ts: Date.now() }, entry));
    save(list.slice(0, C.historyLimit));
  }
  function remove(id) { save(load().filter(x => x.id !== id)); }
  function clear() { try { localStorage.removeItem(C.storageKey); } catch (e) { /* ignore */ } }

  window.Veyra.history = { load, add, remove, clear, thumb };
})();
