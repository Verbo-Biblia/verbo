/* Traducción en vivo para contenido largo fuera del diccionario estático de
   interfaz (VerboI18n): ensayos de Misión/Fundador, catálogo de Librería y
   Recursos. Mismo mecanismo que ya usa /biblia/ para Comentario/Strong —
   API no oficial de Google Translate + caché en localStorage compartida
   (mismo prefijo 'verbo:t:') — pero reutilizable desde cualquier página del
   sitio. Marca cada bloque a traducir con data-i18n-live (opcionalmente
   data-i18n-live="id-estable" para una clave de caché legible). */
(function(){
  'use strict';
  const T_PREFIX = 'verbo:t:';
  function tcacheGet(key){ try{ return JSON.parse(localStorage.getItem(T_PREFIX+key)); }catch{ return null; } }
  function tcacheSet(key,val){ try{ localStorage.setItem(T_PREFIX+key, JSON.stringify(val)); }catch{} }

  function hashText(text){
    let hash=2166136261;
    const value=String(text||'');
    for(let i=0;i<value.length;i++){ hash^=value.charCodeAt(i); hash=Math.imul(hash,16777619); }
    return (hash>>>0).toString(16);
  }
  function cacheKey(id, text, targetLang){ return `v4:${targetLang}:${id}:${hashText(text)}`; }

  function splitTextIntoChunks(text, maxLen=4500){
    const chunks=[];
    while(text.length>maxLen){
      let idx=text.lastIndexOf('. ',maxLen);
      if(idx<maxLen/2) idx=text.lastIndexOf(' ',maxLen);
      if(idx<0) idx=maxLen;
      chunks.push(text.slice(0,idx+1).trim());
      text=text.slice(idx+1).trim();
    }
    if(text) chunks.push(text);
    return chunks;
  }

  async function googleTranslate(text, sourceLang, targetLang){
    async function fetchTranslate(chunk){
      try{
        const url=`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(chunk)}`;
        const resp=await fetch(url);
        if(!resp.ok) return null;
        const json=await resp.json();
        if(!Array.isArray(json?.[0])) return null;
        return json[0].map(p=>p?.[0]||'').join('');
      }catch{ return null; }
    }
    if(text.length<=4500) return fetchTranslate(text);
    const chunks=splitTextIntoChunks(text);
    const parts=[];
    for(const chunk of chunks){
      const r=await fetchTranslate(chunk);
      if(r===null) return null;
      parts.push(r);
    }
    return parts.join(' ');
  }

  async function translateElement(el, id, sourceLang, targetLang){
    if(el.dataset.origText == null) el.dataset.origText = el.textContent;
    const original = el.dataset.origText;
    if(!original || !original.trim()) return;
    const key = cacheKey(id, original, targetLang);
    let translated = tcacheGet(key);
    if(!translated){
      translated = await googleTranslate(original, sourceLang, targetLang);
      if(!translated) return;
      tcacheSet(key, translated);
    }
    el.textContent = translated;
    el.dataset.translated = targetLang;
  }

  function restoreElement(el){
    if(el.dataset.origText != null){ el.textContent = el.dataset.origText; delete el.dataset.translated; }
  }

  // Aplica a todo [data-i18n-live] dentro de root según el idioma activo de
  // VerboI18n. El sitio nace en español, así que sourceLang es 'es' salvo
  // que se indique otra cosa.
  async function applyLiveTranslation(root, sourceLang){
    if(!window.VerboI18n) return;
    sourceLang = sourceLang || 'es';
    const targetLang = VerboI18n.getUiLang();
    const els = [...(root||document).querySelectorAll('[data-i18n-live]')];
    if(targetLang===sourceLang){ els.forEach(restoreElement); return; }
    let i=0;
    for(const el of els){
      const id = el.getAttribute('data-i18n-live') || `${location.pathname}:${i++}`;
      await translateElement(el, id, sourceLang, targetLang);
    }
  }

  window.VerboSiteTranslate = { applyLiveTranslation };
})();
