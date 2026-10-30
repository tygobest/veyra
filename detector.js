/* Veyra — загрузка MediaPipe Face Landmarker и поиск ориентиров лица. */
(function () {
  'use strict';
  const C = window.Veyra.config;
  let lib = null, landmarker = null, loading = null;

  async function exists(url) {
    try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch (e) { return false; }
  }

  async function loadLib() {
    if (lib) return lib;
    try { lib = { mod: await import(C.local.bundle), wasm: C.local.wasm, src: 'local' }; }
    catch (e) { lib = { mod: await import(C.cdn.bundle), wasm: C.cdn.wasm, src: 'cdn' }; }
    return lib;
  }

  async function init(onStatus) {
    if (landmarker) return landmarker;
    if (loading) return loading;
    loading = (async () => {
      onStatus && onStatus('Загружаю модуль распознавания…');
      const { mod, wasm } = await loadLib();
      const fileset = await mod.FilesetResolver.forVisionTasks(wasm);
      const model = (await exists(C.local.model)) ? C.local.model : C.cdn.model;
      onStatus && onStatus('Загружаю модель лица (~4 МБ, один раз)…');
      const make = delegate => mod.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: 'IMAGE', numFaces: 2,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
      });
      try { landmarker = await make('GPU'); } catch (e) { landmarker = await make('CPU'); }
      window.Veyra.connections = {
        oval: mod.FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        eyes: [].concat(mod.FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, mod.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
        brows: [].concat(mod.FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, mod.FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
        lips: mod.FaceLandmarker.FACE_LANDMARKS_LIPS
      };
      return landmarker;
    })();
    try { return await loading; } finally { loading = null; }
  }

  /** Возвращает { faces, width, height }; изображение предварительно уменьшается. */
  async function detect(img, onStatus) {
    const lm = await init(onStatus);
    onStatus && onStatus('Ищу лицо…');
    const k = Math.min(1, C.maxSidePx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    const res = lm.detect(cv);
    return { faces: res.faceLandmarks || [], width: w, height: h };
  }

  window.Veyra.detector = { init, detect };
})();
