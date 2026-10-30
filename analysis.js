/* Veyra — геометрический анализ по 478 ориентирам MediaPipe Face Landmarker.
   Чистые функции, без DOM: можно тестировать в Node (tests/analysis.test.js). */
(function (root) {
  'use strict';

  // Индексы ориентиров MediaPipe. "L" — левая сторона на изображении.
  const IDX = {
    eyeOutL: 33, eyeOutR: 263, eyeInL: 133, eyeInR: 362,
    browL: 70, browR: 300, browInL: 107, browInR: 336,
    noseWingL: 129, noseWingR: 358, noseTip: 1, noseBase: 2,
    mouthL: 61, mouthR: 291, lipUp: 13, lipLow: 14, upperLipTop: 0,
    cheekL: 234, cheekR: 454, jawL: 172, jawR: 397,
    foreheadTop: 10, glabella: 9, chin: 152, irisL: 468, irisR: 473
  };

  const PAIRS = [
    ['Внешние углы глаз', IDX.eyeOutL, IDX.eyeOutR],
    ['Внутренние углы глаз', IDX.eyeInL, IDX.eyeInR],
    ['Зрачки', IDX.irisL, IDX.irisR],
    ['Внешние края бровей', IDX.browL, IDX.browR],
    ['Внутренние края бровей', IDX.browInL, IDX.browInR],
    ['Крылья носа', IDX.noseWingL, IDX.noseWingR],
    ['Уголки рта', IDX.mouthL, IDX.mouthR],
    ['Скулы', IDX.cheekL, IDX.cheekR],
    ['Углы челюсти', IDX.jawL, IDX.jawR]
  ];
  const CENTER = [
    ['Кончик носа', IDX.noseTip], ['Верхняя губа', IDX.upperLipTop], ['Подбородок', IDX.chin]
  ];

  const K = 8; // крутизна перевода отклонения в баллы: score = 100*exp(-K*d)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const score = d => Math.round(100 * Math.exp(-K * d));

  function toPx(lm, w, h) { return lm.map(p => ({ x: p.x * w, y: p.y * h })); }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function symmetry(P) {
    const a = P[IDX.eyeOutL], b = P[IDX.eyeOutR];
    const s = dist(a, b);
    const o = mid(a, b);
    const u = { x: (b.x - a.x) / s, y: (b.y - a.y) / s };
    const v = { x: -u.y, y: u.x };
    const T = p => ({ x: ((p.x - o.x) * u.x + (p.y - o.y) * u.y) / s, y: ((p.x - o.x) * v.x + (p.y - o.y) * v.y) / s });

    const pairs = PAIRS.map(([name, i, j]) => ({ name, A: T(P[i]), B: T(P[j]) }));
    // Подгоняем вертикальную ось симметрии под лицо (среднее по парам + центральные точки)
    const xs = pairs.map(p => (p.A.x + p.B.x) / 2).concat(CENTER.map(([, i]) => T(P[i]).x));
    const x0 = xs.reduce((m, x) => m + x, 0) / xs.length;

    const rows = pairs.map(p => {
      const dx = (p.A.x + p.B.x - 2 * x0) / 2, dy = (p.A.y - p.B.y) / 2;
      const d = Math.hypot(dx, dy);
      return { name: p.name, d, dx, dy, score: score(d), vertical: dy };
    });
    const center = CENTER.map(([name, i]) => {
      const d = Math.abs(T(P[i]).x - x0);
      return { name, d, score: score(d) };
    });
    const all = rows.map(r => r.d).concat(center.map(c => c.d));
    const mean = all.reduce((m, x) => m + x, 0) / all.length;

    // Линия симметрии в пикселях изображения (для отрисовки)
    const top = { x: o.x + u.x * x0 * s - v.x * s * 1.1, y: o.y + u.y * x0 * s - v.y * s * 1.1 };
    const bot = { x: o.x + u.x * x0 * s + v.x * s * 1.9, y: o.y + u.y * x0 * s + v.y * s * 1.9 };
    return { score: score(mean), meanDev: mean, pairs: rows, center, axis: [top, bot], rollDeg: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  }

  function pose(P) {
    const n = P[IDX.noseTip], l = P[IDX.cheekL], r = P[IDX.cheekR];
    const a = Math.abs(n.x - l.x), b = Math.abs(r.x - n.x);
    const ratio = a / Math.max(b, 1e-6);
    return { yawRatio: ratio, turned: ratio < 0.8 || ratio > 1.25, faceWidthPx: dist(l, r) };
  }

  // Ориентировочные диапазоны — не «нормы», а общепринятые художественные каноны.
  function proportions(P) {
    const d = (i, j) => dist(P[i], P[j]);
    const stomion = mid(P[IDX.lipUp], P[IDX.lipLow]);
    const eyeW = (d(IDX.eyeOutL, IDX.eyeInL) + d(IDX.eyeOutR, IDX.eyeInR)) / 2;
    const defs = [
      { id: 'faceIndex', name: 'Индекс лица', hint: 'длина ÷ ширина', v: d(IDX.foreheadTop, IDX.chin) / d(IDX.cheekL, IDX.cheekR), min: 1.2, max: 1.5, ref: 1.35 },
      { id: 'fifths', name: 'Межглазное расстояние', hint: 'между внутренними углами ÷ ширина глаза', v: d(IDX.eyeInL, IDX.eyeInR) / eyeW, min: 0.9, max: 1.3, ref: 1 },
      { id: 'noseEye', name: 'Ширина носа', hint: 'крылья носа ÷ межглазное расстояние', v: d(IDX.noseWingL, IDX.noseWingR) / d(IDX.eyeInL, IDX.eyeInR), min: 0.85, max: 1.3, ref: 1 },
      { id: 'mouthNose', name: 'Ширина рта', hint: 'уголки рта ÷ ширина носа', v: d(IDX.mouthL, IDX.mouthR) / d(IDX.noseWingL, IDX.noseWingR), min: 1.25, max: 1.8, ref: 1.5 },
      { id: 'thirds', name: 'Средняя и нижняя трети', hint: 'межбровье→нос ÷ нос→подбородок', v: d(IDX.glabella, IDX.noseBase) / d(IDX.noseBase, IDX.chin), min: 0.75, max: 1.15, ref: 0.95 },
      { id: 'lowerFace', name: 'Верхняя губа и подбородок', hint: 'нос→рот ÷ рот→подбородок', v: dist(P[IDX.noseBase], stomion) / dist(stomion, P[IDX.chin]), min: 0.35, max: 0.65, ref: 0.5 }
    ];
    defs.forEach(x => { x.ok = x.v >= x.min && x.v <= x.max; });
    return { items: defs, pass: defs.filter(x => x.ok).length, total: defs.length };
  }

  function analyze(landmarks, w, h) {
    if (!landmarks || landmarks.length < 468) throw new Error('Недостаточно ориентиров');
    const P = toPx(landmarks, w, h);
    const sym = symmetry(P), pz = pose(P), prop = proportions(P);
    const warnings = [];
    if (pz.turned) warnings.push('Голова повёрнута в сторону — симметрия и пропорции будут искажены. Нужен фронтальный снимок.');
    if (Math.abs(sym.rollDeg) > 8) warnings.push('Голова наклонена на ' + Math.abs(sym.rollDeg).toFixed(0) + '° — расчёт учитывает наклон, но точнее при ровной голове.');
    if (pz.faceWidthPx < 120) warnings.push('Лицо на снимке маленькое (' + Math.round(pz.faceWidthPx) + ' px в ширину). Возьми фото покрупнее.');
    return { symmetry: sym, pose: pz, proportions: prop, warnings, landmarkCount: landmarks.length };
  }

  function summarize(r) {
    const s = r.symmetry, p = r.proportions, out = [];
    const worst = s.pairs.slice().sort((a, b) => a.d - b.d).pop();
    const best = s.pairs.slice().sort((a, b) => a.d - b.d)[0];
    const level = s.score >= 85 ? 'высокая' : s.score >= 70 ? 'умеренная' : 'заметная асимметрия';
    out.push('Симметрия: ' + s.score + '/100 (' + level + '). Лучше всего совпадают: ' + best.name.toLowerCase() + '; сильнее всего отличаются: ' + worst.name.toLowerCase() + '.');
    const bad = p.items.filter(x => !x.ok);
    out.push(bad.length ? 'Вне ориентировочного диапазона: ' + bad.map(x => x.name.toLowerCase()).join(', ') + '.' : 'Все ' + p.total + ' измерений в ориентировочных диапазонах.');
    out.push('Небольшие отклонения — норма для любого лица, а свет, поворот головы и мимика заметно влияют на цифры.');
    return out;
  }

  const api = { IDX, PAIRS, analyze, summarize, symmetry, proportions, pose };
  root.Veyra = Object.assign(root.Veyra || {}, { analysis: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
