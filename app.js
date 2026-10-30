/* Veyra — интерфейс: загрузка фото, анализ, отрисовка, разделы, история. */
(function () {
  'use strict';
  const V = window.Veyra, C = V.config, A = V.analysis;
  const $ = id => document.getElementById(id);
  const el = {
    input: $('photoInput'), photo: $('photo'), empty: $('empty'), clear: $('clearBtn'), analyze: $('analyzeBtn'),
    guideBtn: $('guideBtn'), ptsBtn: $('ptsBtn'), stage: $('stage'), canvas: $('guides'), info: $('fileInfo'),
    badge: $('badge'), drop: $('dropzone'), status: $('status'), note: $('note'), resStep: $('resStep')
  };
  const ctx = el.canvas.getContext('2d');
  const state = { url: null, file: null, faces: null, size: null, result: null, showPts: true, showLines: true, busy: false };

  /* ---------- вспомогательное ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function setStatus(msg, kind) {
    el.status.className = 'status' + (kind ? ' ' + kind : '');
    el.status.innerHTML = (kind ? '' : msg ? '<span class="spin"></span>' : '') + (msg ? '<span>' + esc(msg) + '</span>' : '');
  }
  const scoreClass = n => n >= 85 ? 'ok' : n >= 65 ? '' : 'warn';

  /* ---------- разделы ---------- */
  function show(name) {
    document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
    if (name === 'symmetry') renderSymmetry();
    if (name === 'proportions') renderProportions();
    if (name === 'history') renderHistory();
    if (name === 'scanner') requestAnimationFrame(draw);
  }
  document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => show(b.dataset.section)));

  /* ---------- фото ---------- */
  function reset() {
    if (state.url) URL.revokeObjectURL(state.url);
    Object.assign(state, { url: null, file: null, faces: null, size: null, result: null });
    el.input.value = ''; el.photo.hidden = true; el.photo.removeAttribute('src'); el.empty.hidden = false;
    el.canvas.hidden = true; el.badge.hidden = true; ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    el.info.textContent = 'Файл не выбран';
    [el.clear, el.analyze, el.guideBtn, el.ptsBtn].forEach(b => b.disabled = true);
    setStatus(''); renderResults();
  }

  function load(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Выбери файл изображения.');
    if (file.size > C.maxFileMB * 1024 * 1024) return toast('Файл больше ' + C.maxFileMB + ' МБ. Выбери поменьше.');
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = URL.createObjectURL(file); state.file = file; state.faces = null; state.result = null;
    el.photo.onload = () => {
      el.photo.hidden = false; el.empty.hidden = true; el.badge.hidden = false;
      el.info.textContent = file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB';
      [el.clear, el.analyze, el.guideBtn, el.ptsBtn].forEach(b => b.disabled = false);
      renderResults(); draw(); run();
    };
    el.photo.onerror = () => { reset(); toast('Не удалось открыть изображение.'); };
    el.photo.src = state.url;
  }

  /* ---------- анализ ---------- */
  async function run() {
    if (state.busy || !el.photo.naturalWidth) return;
    state.busy = true; el.analyze.disabled = true;
    try {
      const det = await V.detector.detect(el.photo, m => setStatus(m));
      if (!det.faces.length) {
        state.faces = null; state.result = null; draw(); renderResults();
        return setStatus('Лицо не найдено. Нужен чёткий снимок анфас с хорошим светом.', 'err');
      }
      state.faces = det.faces; state.size = { w: det.width, h: det.height };
      state.result = A.analyze(det.faces[0], det.width, det.height);
      if (det.faces.length > 1) state.result.warnings.unshift('На фото несколько лиц — анализирую первое найденное.');
      V.history.add({
        name: state.file.name, thumb: V.history.thumb(el.photo),
        sym: state.result.symmetry.score, pass: state.result.proportions.pass, total: state.result.proportions.total,
        data: slim(state.result)
      });
      setStatus('Готово: найдено ' + state.result.landmarkCount + ' ориентиров.', 'ok');
      draw(); renderResults();
    } catch (e) {
      console.error(e);
      setStatus('Не удалось запустить распознавание. Нужен интернет для первой загрузки модели (или положи файлы в assets/ — см. README). ' + (e && e.message ? '[' + e.message + ']' : ''), 'err');
    } finally { state.busy = false; el.analyze.disabled = !state.file; }
  }
  // в историю — только числа
  const slim = r => ({
    symmetry: { score: r.symmetry.score, pairs: r.symmetry.pairs.map(p => ({ name: p.name, d: p.d, score: p.score })), center: r.symmetry.center, rollDeg: r.symmetry.rollDeg },
    proportions: r.proportions, warnings: r.warnings, landmarkCount: r.landmarkCount, pose: r.pose
  });

  /* ---------- отрисовка поверх фото ---------- */
  function fit() {
    const r = el.stage.getBoundingClientRect(), ir = el.photo.naturalWidth / el.photo.naturalHeight, br = r.width / r.height;
    let w, h; if (ir > br) { w = r.width; h = w / ir; } else { h = r.height; w = h * ir; }
    return { r, x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
  }
  function draw() {
    if (el.photo.hidden || !el.photo.naturalWidth || !state.faces || (!state.showPts && !state.showLines)) { el.canvas.hidden = true; return; }
    const { r, x, y, w, h } = fit(), d = window.devicePixelRatio || 1;
    el.canvas.width = Math.round(r.width * d); el.canvas.height = Math.round(r.height * d);
    ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    const lm = state.faces[0], X = p => x + p.x * w, Y = p => y + p.y * h, conn = V.connections;
    if (state.showPts) {
      ctx.lineWidth = 1; ctx.strokeStyle = '#b39bffaa';
      if (conn) [[conn.oval, '#b39bffaa'], [conn.eyes, '#73ddffcc'], [conn.brows, '#73ddff99'], [conn.lips, '#69e5b1cc']].forEach(([list, col]) => {
        ctx.strokeStyle = col; ctx.beginPath();
        list.forEach(c => { ctx.moveTo(X(lm[c.start]), Y(lm[c.start])); ctx.lineTo(X(lm[c.end]), Y(lm[c.end])); }); ctx.stroke();
      });
      ctx.fillStyle = '#ffffffcc';
      for (let i = 0; i < lm.length; i += 3) { ctx.fillRect(X(lm[i]) - 0.6, Y(lm[i]) - 0.6, 1.4, 1.4); }
      ctx.fillStyle = '#ffd36b';
      A.PAIRS.forEach(([, i, j]) => [i, j].forEach(k => { ctx.beginPath(); ctx.arc(X(lm[k]), Y(lm[k]), 2.4, 0, 7); ctx.fill(); }));
    }
    if (state.showLines && state.result) {
      const s = state.size, ax = state.result.symmetry.axis, L = p => ({ x: x + p.x / s.w * w, y: y + p.y / s.h * h });
      const a = L(ax[0]), b = L(ax[1]);
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = '#b39bffe6';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#73ddffb3';
      const IX = A.IDX;
      [IX.glabella, IX.noseBase, IX.chin, IX.foreheadTop].forEach(k => { ctx.beginPath(); ctx.moveTo(x, Y(lm[k])); ctx.lineTo(x + w, Y(lm[k])); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    el.canvas.hidden = false;
  }

  /* ---------- результаты ---------- */
  function noteHtml(r) {
    const items = A.summarize(r), w = r.warnings;
    return '<div class="veyra-note"><div class="av">V</div><div><b>Veyra:</b> ' + esc(items[0]) +
      '<ul>' + items.slice(1).concat(w).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div></div>';
  }
  function renderResults() {
    const r = state.result, set = (id, t, na) => { const n = $(id); n.textContent = t; n.classList.toggle('na', !!na); };
    if (!r) {
      set('mLand', '—', 1); set('mSym', '—', 1); set('mProp', '—', 1); $('mLandS').textContent = 'Найду после анализа';
      el.note.innerHTML = ''; el.resStep.textContent = state.file ? 'АНАЛИЗ…' : 'ЖДУ ФОТО'; return;
    }
    set('mLand', String(r.landmarkCount)); $('mLandS').textContent = 'Точек MediaPipe Face Landmarker';
    set('mSym', r.symmetry.score + '/100'); set('mProp', r.proportions.pass + '/' + r.proportions.total);
    el.note.innerHTML = noteHtml(r); el.resStep.textContent = 'ГОТОВО';
  }
  const noData = '<div class="empty-view">Сначала загрузи фото в разделе «Сканер лица» — или открой запись из истории.</div>';

  function renderSymmetry() {
    const r = state.result, box = $('symBody');
    if (!r) { box.innerHTML = noData; return; }
    const s = r.symmetry;
    const row = (name, d, sc, sub) => '<div class="row"><div>' + esc(name) + '<small>' + esc(sub) + '</small></div><div class="bar"><i style="width:' + sc + '%"></i></div><div class="val ' + scoreClass(sc) + '">' + sc + '</div></div>';
    box.innerHTML = '<div class="big"><strong>' + s.score + '</strong><span>из 100 · общий балл симметрии</span></div>' +
      '<div class="rows">' + s.pairs.map(p => row(p.name, p.d, p.score, 'отклонение ' + (p.d * 100).toFixed(1) + '% ширины между глазами')).join('') +
      s.center.map(p => row(p.name, p.d, p.score, 'смещение от оси ' + (p.d * 100).toFixed(1) + '%')).join('') + '</div>' +
      '<div class="notice"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg><p>Ось симметрии подбирается по лицу; наклон головы (' + s.rollDeg.toFixed(1) + '°) компенсируется. Идеальной симметрии не бывает ни у кого — у большинства людей 75–92.</p></div>' +
      (r.warnings.length ? '<ul style="color:#ffc46b;font-size:11px;line-height:1.7">' + r.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '');
  }

  function renderProportions() {
    const r = state.result, box = $('propBody');
    if (!r) { box.innerHTML = noData; return; }
    const p = r.proportions;
    box.innerHTML = '<div class="big"><strong>' + p.pass + '/' + p.total + '</strong><span>измерений в ориентировочных диапазонах</span></div><div class="rows">' +
      p.items.map(it => {
        const lo = Math.min(it.min * 0.6, it.v), hi = Math.max(it.max * 1.4, it.v), f = v => ((v - lo) / (hi - lo) * 100);
        return '<div class="row"><div>' + esc(it.name) + '<small>' + esc(it.hint) + ' · ориентир ' + it.min + '–' + it.max + '</small></div>' +
          '<div class="bar range"><u style="left:' + f(it.min) + '%;width:' + (f(it.max) - f(it.min)) + '%"></u><i style="left:' + f(it.v) + '%"></i></div>' +
          '<div class="val ' + (it.ok ? 'ok' : 'warn') + '">' + it.v.toFixed(2) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="notice"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg><p>Диапазоны — это классические художественные каноны, а не медицинская норма. Выход за них ничего «плохого» не означает: лица разные.</p></div>';
  }

  function renderHistory() {
    const list = V.history.load(), box = $('histBody');
    $('histClear').disabled = !list.length;
    if (!list.length) { box.innerHTML = '<div class="empty-view">История пуста. Здесь появятся твои анализы — они хранятся только в этом браузере.</div>'; return; }
    box.innerHTML = '<div class="hist">' + list.map(h =>
      '<div class="hcard">' + (h.thumb ? '<img alt="" src="' + h.thumb + '">' : '') + '<div style="min-width:0"><div class="t">' + esc(h.name) + '</div><div class="d">' + new Date(h.ts).toLocaleString('ru-RU') +
      '</div><div class="s">Симметрия <b>' + h.sym + '</b> · Пропорции <b>' + h.pass + '/' + h.total + '</b></div><div class="a"><button class="btn btn-secondary" data-open="' + h.id + '">Открыть</button><button class="btn btn-secondary" data-del="' + h.id + '">Удалить</button></div></div></div>').join('') + '</div>';
  }
  $('histBody').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
    if (o) {
      const h = V.history.load().find(x => x.id === o.dataset.open);
      if (h) { state.result = Object.assign({ symmetry: {}, proportions: {} }, h.data); state.faces = null; renderResults(); show('symmetry'); }
    }
    if (d) { V.history.remove(d.dataset.del); renderHistory(); }
  });
  $('histClear').addEventListener('click', () => { if (confirm('Удалить всю историю?')) { V.history.clear(); renderHistory(); } });

  /* ---------- события ---------- */
  el.input.addEventListener('change', e => load(e.target.files[0]));
  el.clear.addEventListener('click', reset);
  el.analyze.addEventListener('click', run);
  el.guideBtn.addEventListener('click', () => { state.showLines = !state.showLines; el.guideBtn.style.opacity = state.showLines ? 1 : .5; draw(); });
  el.ptsBtn.addEventListener('click', () => { state.showPts = !state.showPts; el.ptsBtn.style.opacity = state.showPts ? 1 : .5; draw(); });
  ['dragenter', 'dragover'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.remove('drag'); }));
  el.drop.addEventListener('drop', e => load(e.dataTransfer.files[0]));
  window.addEventListener('resize', draw);

  V.app = { load, show, state }; // для отладки и тестов
})();
