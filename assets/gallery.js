(function() {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const VIEWS = ["home", "promo", "console"];
  let group = null;
  document.addEventListener("play", (ev) => {
    const v = ev.target;
    if (!(v instanceof HTMLVideoElement) || v.classList.contains("bg") || v.id === "previz") return;
    document.querySelectorAll("video").forEach((o) => {
      if (o === v || o.paused || o.classList.contains("bg") || o.id === "previz") return;
      if (group && group.includes(o) && group.includes(v)) return;
      o.pause();
    });
  }, true);
  let C = null, D = null, M = null;
  async function consoleData() {
    if (!D) [D, M] = await Promise.all([fetch("data/consoles.json").then((r) => r.json()), fetch("data/media.json").then((r) => r.json())]);
  }
  const tierOf = (key) => {
    const c = $("c-" + key);
    return c ? c.closest(".grid") : null;
  };
  async function openConsole(key, at) {
    await consoleData();
    if (!C) {
      C = window.FilmConsole(D, M, {
        onBack: () => {
          location.hash = "#films";
        },
        peers: (F) => {
          const g = tierOf(F.key);
          return g ? [...g.querySelectorAll(".card")].map((c) => D.films.findIndex((G) => G.key === c.dataset.k)).filter((i) => i >= 0) : [D.films.indexOf(F)];
        }
      });
      $("back").textContent = "← 回到片子";
    }
    let k = D.films.findIndex((f) => f.key === key);
    if (k < 0) k = Math.max(0, D.films.findIndex((f) => f.key === "rain-night"));
    C.open(k, at);
  }
  function show(v) {
    VIEWS.forEach((n) => {
      $("v-" + n).hidden = n !== v;
    });
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
    document.querySelectorAll("main video").forEach((x) => {
      if (!x.classList.contains("bg") && !x.closest("#v-" + v)) x.pause();
    });
    if (v !== "console" && C) C.close();
    const bg = document.querySelector(".hero .bg");
    if (bg) {
      if (v === "home") bg.play().catch(() => {
      });
      else bg.pause();
    }
    if (v === "promo") playPromo();
  }
  function playPromo() {
    const pv = $("promo-v"), um = $("promo-unmute");
    if (!pv || !pv.paused) return;
    pv.muted = false;
    pv.play().then(() => {
      um.hidden = true;
    }).catch(() => {
      pv.muted = true;
      pv.play().then(() => {
        um.hidden = false;
      }).catch(() => {
      });
    });
  }
  if ($("promo-unmute")) $("promo-unmute").onclick = () => {
    const pv = $("promo-v");
    pv.muted = false;
    pv.play().catch(() => {
    });
    $("promo-unmute").hidden = true;
  };
  if ($("promo-v")) $("promo-v").addEventListener("volumechange", (ev) => {
    if (!ev.target.muted) $("promo-unmute").hidden = true;
  });
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || "home";
    const [v, a, b] = h.split("/");
    if (VIEWS.includes(v)) {
      show(v);
      if (v === "console") openConsole(a, b);
      if (v !== "home" || !a) window.scrollTo(0, 0);
      return;
    }
    show("home");
    const el = $(v);
    if (el) requestAnimationFrame(() => el.scrollIntoView());
  }
  addEventListener("hashchange", route);
  const ctabs = [...document.querySelectorAll(".ctab")], slides = [...document.querySelectorAll(".slide")];
  let ci = 0;
  function pick(i) {
    ci = (i + slides.length) % slides.length;
    ctabs.forEach((t, j) => t.setAttribute("aria-selected", String(j === ci)));
    slides.forEach((s, j) => {
      if (j !== ci) s.querySelectorAll("video").forEach((v) => v.pause());
      s.hidden = j !== ci;
    });
    $("cmp-n").textContent = String(ci + 1).padStart(2, "0");
    $("cmp-prog").style.marginLeft = 100 * ci / slides.length + "%";
  }
  ctabs.forEach((t, j) => t.onclick = () => pick(j));
  document.querySelectorAll(".pager .arr").forEach((b) => b.onclick = () => pick(ci + +b.dataset.d));
  slides.forEach((s) => {
    const vs = [...s.querySelectorAll("video")];
    s.querySelector(".playall").onclick = () => {
      group = vs;
      vs.forEach((v, i) => {
        v.muted = i > 0;
        v.currentTime = 0;
        v.play().catch(() => {
        });
      });
    };
  });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("a.soon")) ev.preventDefault();
  });
  route();
})();
