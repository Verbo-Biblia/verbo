/* ============================================================
   Verbo — filtro combinable (tipo / idioma / tema) para listas
   de contenido ya renderizadas en el HTML (Artículos y Reflexiones,
   Librería). No depende de fetch: filtra por atributos data-* que
   ya vienen impresos en cada tarjeta/fila. Progresivo: sin JS se ve
   la lista completa sin filtrar.
   ============================================================ */
(function () {
  "use strict";

  function initBar(bar) {
    var targetSel = bar.getAttribute("data-filter-target");
    var container = targetSel ? document.querySelector(targetSel) : null;
    if (!container) return;
    var items = Array.prototype.slice.call(container.querySelectorAll("[data-item]"));
    var groups = Array.prototype.slice.call(bar.querySelectorAll("[data-filter-group]"));
    var state = {};

    groups.forEach(function (g) {
      var key = g.getAttribute("data-filter-group");
      state[key] = "todos";
      if (g.tagName === "SELECT") {
        g.addEventListener("change", function () {
          state[key] = g.value;
          apply();
        });
      } else {
        g.addEventListener("click", function (e) {
          var btn = e.target.closest("[data-value]");
          if (!btn || !g.contains(btn)) return;
          state[key] = btn.getAttribute("data-value");
          Array.prototype.forEach.call(g.querySelectorAll("[data-value]"), function (b) {
            b.classList.toggle("is-active", b === btn);
          });
          apply();
        });
      }
    });

    var empty = bar.parentElement.querySelector(".r-filter-empty");

    function apply() {
      var visible = 0;
      items.forEach(function (it) {
        var ok = Object.keys(state).every(function (key) {
          if (state[key] === "todos") return true;
          var raw = it.getAttribute("data-" + key) || "";
          var vals = raw.split(",").map(function (s) { return s.trim(); });
          return vals.indexOf(state[key]) !== -1;
        });
        it.hidden = !ok;
        if (ok) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    }

    apply();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-filter-bar]"), initBar);
  });
})();
