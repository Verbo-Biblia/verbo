/* Piper TTS worker — inference and model loading stay off the UI thread. */
"use strict";

importScripts(
  "./vendor/ort.min.js",
  "./vendor/piper_phonemize.js"
);

var ROOT = new URL("./", self.location.href);
var VOICES = {
  es: {
    model: new URL("models/es_MX-claude-high.onnx", ROOT).href,
    config: new URL("models/es_MX-claude-high.onnx.json", ROOT).href
  },
  en: {
    model: new URL("models/en_US-amy-medium.onnx", ROOT).href,
    config: new URL("models/en_US-amy-medium.onnx.json", ROOT).href
  }
};

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("vendor/", ROOT).href;

var activeLanguage = null;
var activeConfig = null;
var activeSession = null;
var phonemizerPromise = null;
var phonemeResolve = null;
var phonemeReject = null;

function detectLanguage(text) {
  var sample = (" " + text.toLowerCase() + " ").slice(0, 2400);
  var spanish = (sample.match(/[áéíóúñü¿¡]/g) || []).length * 3;
  var english = 0;
  [" el ", " la ", " de ", " que ", " y ", " en ", " los ", " para ", " por ", " con ", " dios ", " cristo "]
    .forEach(function (word) { spanish += (sample.split(word).length - 1); });
  [" the ", " of ", " and ", " to ", " in ", " that ", " is ", " for ", " with ", " god ", " christ "]
    .forEach(function (word) { english += (sample.split(word).length - 1); });
  return spanish >= english ? "es" : "en";
}

async function fetchWithProgress(url, language) {
  var response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo descargar el modelo (" + response.status + ")");
  var total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !response.body.getReader) return response.arrayBuffer();

  var reader = response.body.getReader();
  var chunks = [];
  var loaded = 0;
  while (true) {
    var part = await reader.read();
    if (part.done) break;
    chunks.push(part.value);
    loaded += part.value.byteLength;
    self.postMessage({ type: "progress", language: language, loaded: loaded, total: total });
  }
  var output = new Uint8Array(loaded);
  var offset = 0;
  chunks.forEach(function (chunk) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output.buffer;
}

async function loadVoice(language) {
  if (activeLanguage === language && activeSession) return;
  if (activeSession && activeSession.release) await activeSession.release();
  activeSession = null;
  activeLanguage = null;

  self.postMessage({ type: "status", status: "loading-model", language: language });
  var configResponse = await fetch(VOICES[language].config);
  if (!configResponse.ok) throw new Error("No se pudo cargar la configuración de voz");
  activeConfig = await configResponse.json();
  var model = await fetchWithProgress(VOICES[language].model, language);
  activeSession = await ort.InferenceSession.create(model, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all"
  });
  activeLanguage = language;
  self.postMessage({ type: "status", status: "model-ready", language: language });
}

async function getPhonemizer() {
  if (!phonemizerPromise) {
    phonemizerPromise = createPiperPhonemize({
      print: function (data) {
        if (!phonemeResolve) return;
        try {
          phonemeResolve(JSON.parse(data).phoneme_ids);
        } catch (error) {
          phonemeReject(error);
        }
      },
      printErr: function (message) {
        if (phonemeReject) phonemeReject(new Error(message));
      },
      locateFile: function (filename) {
        return new URL("vendor/" + filename, ROOT).href;
      }
    });
  }
  return phonemizerPromise;
}

async function phonemize(text, voice) {
  var module = await getPhonemizer();
  return new Promise(function (resolve, reject) {
    phonemeResolve = resolve;
    phonemeReject = reject;
    try {
      module.callMain([
        "-l", voice,
        "--input", JSON.stringify([{ text: text.trim() }]),
        "--espeak_data", "/espeak-ng-data"
      ]);
    } catch (error) {
      reject(error);
    }
  }).finally(function () {
    phonemeResolve = null;
    phonemeReject = null;
  });
}

function pcmToWav(pcm, sampleRate) {
  var buffer = new ArrayBuffer(44 + pcm.length * 2);
  var view = new DataView(buffer);
  function text(offset, value) {
    for (var i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  }
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  for (var i = 0; i < pcm.length; i++) {
    var sample = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}

self.addEventListener("message", async function (event) {
  var message = event.data || {};
  if (message.type !== "synthesize") return;
  try {
    var language = detectLanguage(message.text);
    await loadVoice(language);
    self.postMessage({ type: "status", status: "synthesizing", language: language });
    var ids = await phonemize(message.text, activeConfig.espeak.voice);
    var feeds = {
      input: new ort.Tensor("int64", ids, [1, ids.length]),
      input_lengths: new ort.Tensor("int64", [ids.length]),
      scales: new ort.Tensor("float32", [
        activeConfig.inference.noise_scale,
        activeConfig.inference.length_scale,
        activeConfig.inference.noise_w
      ])
    };
    if (Object.keys(activeConfig.speaker_id_map || {}).length) {
      feeds.sid = new ort.Tensor("int64", [0]);
    }
    var result = await activeSession.run(feeds);
    var wav = pcmToWav(result.output.data, activeConfig.audio.sample_rate);
    self.postMessage({
      type: "audio",
      id: message.id,
      language: language,
      buffer: wav
    }, [wav]);
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      message: error && error.message ? error.message : String(error)
    });
  }
});
