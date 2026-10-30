/* Veyra — настройки. Локальные файлы (assets/) имеют приоритет, иначе грузится CDN. */
(function () {
  'use strict';
  const VERSION = '0.10.14'; // версия @mediapipe/tasks-vision
  window.Veyra = Object.assign(window.Veyra || {}, {
    config: {
      name: 'Veyra',
      maxFileMB: 15,
      maxSidePx: 1280,          // большие фото уменьшаются перед анализом
      historyLimit: 30,
      storageKey: 'veyra.history.v1',
      local: {
        bundle: 'vendor/vision_bundle.mjs',
        wasm: 'vendor/wasm',
        model: 'models/face_landmarker.task'
      },
      cdn: {
        bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION + '/vision_bundle.mjs',
        wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VERSION + '/wasm',
        model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
      }
    }
  });
})();
