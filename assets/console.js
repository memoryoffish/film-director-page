window.FilmConsole = function(DATA, M, opt) {
  "use strict";
  opt = opt || {};
  const U = (f) => f && M[f] || null;
  const $ = (id) => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  }
  const clock = (t, d = 1) => {
    t = Math.floor(Math.max(0, t) * 10 ** d + 1e-6) / 10 ** d;
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(d).padStart(d ? 3 + d : 2, "0")}`;
  };
  const previz = $("previz"), track = $("track"), head = $("head"), slot = $("filmslot");
  let own = null;
  let film = null, back = null, ac = null;
  const flagShot = (F2) => {
    const n = F2.flag && F2.flag.shots && F2.flag.shots[0];
    const i = F2.shots.findIndex((s) => s.n === n);
    return i < 0 ? 0 : i;
  };
  $("back").onclick = () => {
    close();
    if (opt.onBack) opt.onBack();
  };
  let F = null, T = 0, cur = -1, bars = [], raf = 0;
  const shotAt = (t) => {
    const S = F.shots;
    for (let i = 0; i < S.length - 1; i++) if (t < S[i].t1) return i;
    return S.length - 1;
  };
  function stop() {
    if (film) film.pause();
    previz.pause();
  }
  function attach(v) {
    ac = new AbortController();
    const o = { signal: ac.signal };
    v.addEventListener("play", () => {
      $("play").textContent = "❚❚";
      syncPreviz();
      if (!raf) loop();
    }, o);
    v.addEventListener("pause", () => {
      $("play").textContent = "▶";
      syncPreviz();
    }, o);
    v.addEventListener("seeked", () => {
      if (v.readyState) {
        T = v.currentTime;
        render();
        syncPreviz();
      }
    }, o);
    v.addEventListener("timeupdate", () => {
      if (v.readyState && !drag) {
        T = v.currentTime;
        render();
      }
    }, o);
  }
  function close() {
    if (!F) return;
    stop();
    if (ac) ac.abort();
    ac = null;
    cancelAnimationFrame(raf);
    raf = 0;
    if (back) {
      if (back.poster == null) film.removeAttribute("poster");
      else film.setAttribute("poster", back.poster);
      back.parent.insertBefore(film, back.next);
      back = null;
    }
    previz.removeAttribute("src");
    previz.load();
    F = null;
    film = null;
  }
  function open(k, at) {
    close();
    shownJob = null;
    F = DATA.films[k];
    if ($("home")) $("home").hidden = true;
    $("console").hidden = false;
    $("title").textContent = `《${F.title}》`;
    $("meta").textContent = [F.plan ? "还没开拍" : null, F.genre, clock(F.seconds, 0), `${F.shots.length} 镜`, F.model, F.note].filter(Boolean).join(" · ");
    $("meta").title = F.note || "";
    const peers = opt.peers ? opt.peers(F) : DATA.films.map((_, j) => j);
    $("chips").replaceChildren(...(peers.length > 1 ? peers : []).map((j) => {
      const G2 = DATA.films[j];
      return h(
        "button",
        { class: "chip", type: "button", "aria-pressed": String(j === k), onclick: () => open(j) },
        `《${G2.title}》${G2.label ? " " + G2.label : ""}`,
        G2.flag ? h("b", { text: clock(G2.flag.t, 0) }) : null
      );
    }));
    if (opt.video) {
      film = opt.video(F);
      back = { parent: film.parentNode, next: film.nextSibling, poster: film.getAttribute("poster") };
      slot.append(film);
    } else {
      if (!own) {
        own = h("video", { id: "film", preload: "none", playsinline: "", controls: "" });
        slot.append(own);
      }
      film = own;
      film.removeAttribute("src");
      film.load();
      film.src = U(F.film) || "";
    }
    attach(film);
    $("play").textContent = film.paused ? "▶" : "❚❚";
    $("pvbox").hidden = !F.previz;
    if (F.previz) previz.src = U(F.previz) || "";
    $("total").textContent = clock(F.seconds, 0);
    buildTrack();
    cur = -1;
    graphOpen();
    size();
    const ai = at ? F.shots.findIndex((s) => s.n === at) : -1;
    if (ai >= 0) seek(F.shots[ai].t0 + 0.01);
    else if (film.readyState && film.currentTime > 0.05) {
      T = film.currentTime;
      render();
      if (!film.paused) loop();
    } else seek(F.shots[flagShot(F)].t0 + 0.01);
    (opt.scroller || window).scrollTo(0, 0);
  }
  function buildTrack() {
    bars.forEach((b) => b.remove());
    track.querySelectorAll(".mark").forEach((m) => m.remove());
    const D = F.seconds, flagged2 = new Set(F.flag && F.flag.shots || []);
    bars = F.shots.map((s, i) => {
      const b = h("button", {
        class: "bar" + (s.last ? " two" : "") + (flagged2.has(s.n) ? " flag" : ""),
        type: "button",
        "data-i": i,
        "aria-label": `${s.n} ${s.what}`,
        style: `left:${s.t0 / D * 100}%;width:calc(${(s.t1 - s.t0) / D * 100}% - 2px)`
      }, s.n);
      track.insertBefore(b, head);
      return b;
    });
    if (F.flag) track.insertBefore(h("i", { class: "mark", style: `left:${F.flag.t / D * 100}%`, title: F.flag.note }), head);
    requestAnimationFrame(tinyBars);
  }
  function ticks() {
    const D = F.seconds, most = Math.min(12, Math.max(3, Math.floor(track.clientWidth / 64)));
    const step = [5, 10, 15, 30, 60, 120, 300, 600].find((x) => D / x <= most) || 1200, out = [];
    for (let t = 0; t <= D + 1e-6; t += step) out.push(h("span", { class: t === 0 ? "s" : "", style: `left:${t / D * 100}%`, text: clock(t, 0) }));
    $("ticks").replaceChildren(...out);
  }
  function tinyBars() {
    if (!F) return;
    bars.forEach((b) => b.classList.toggle("tiny", b.offsetWidth < 30));
    ticks();
  }
  new ResizeObserver(() => F && !$("console").hidden && tinyBars()).observe(track);
  const timeAtX = (x) => {
    const r = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * F.seconds;
  };
  let drag = null;
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !F) return;
    track.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, moved: false, bar: e.target.closest(".bar") };
  });
  track.addEventListener("pointermove", (e) => {
    if (!F) return;
    peek(e.clientX);
    if (!drag || e.pointerId !== drag.id) return;
    if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
    if (drag.moved) seek(timeAtX(e.clientX));
  });
  track.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, bar } = drag;
    drag = null;
    if (moved) seek(timeAtX(e.clientX));
    else if (bar) seek(F.shots[+bar.dataset.i].t0 + 0.01);
    else seek(timeAtX(e.clientX));
  });
  track.addEventListener("pointercancel", () => {
    drag = null;
  });
  track.addEventListener("pointerleave", () => {
    $("peek").hidden = true;
  });
  function peek(x) {
    const r = track.getBoundingClientRect(), s = F.shots[shotAt(timeAtX(x))], p = $("peek");
    p.hidden = false;
    p.style.left = `${Math.min(Math.max(x - r.left + 14, 110), r.width - 96)}px`;
    const src = U(s.th);
    if (p.firstElementChild.getAttribute("src") !== src) p.firstElementChild.src = src || "";
    p.lastElementChild.textContent = `${s.n} · ${clock(s.t0)}–${clock(s.t1)} · ${s.what}`;
  }
  function seek(t) {
    T = Math.min(Math.max(0, t), F.seconds - 0.04);
    film.currentTime = T;
    if (F.previz) previz.currentTime = T;
    render();
  }
  function render() {
    if (view === "graph") loopShot();
    head.style.left = `${T / F.seconds * 100}%`;
    $("now").textContent = clock(T);
    const i = shotAt(T);
    if (i !== cur) show(i);
  }
  function syncPreviz() {
    if (!F || !F.previz || view === "graph") return;
    if (Math.abs(previz.currentTime - film.currentTime) > 0.25) previz.currentTime = film.currentTime;
    if (film.paused !== previz.paused) film.paused ? previz.pause() : previz.play().catch(() => {
    });
  }
  function loop() {
    if (!F) {
      raf = 0;
      return;
    }
    T = film.currentTime;
    render();
    syncPreviz();
    raf = film.paused ? 0 : requestAnimationFrame(loop);
  }
  $("play").onclick = () => film.paused ? film.play().catch(() => {
  }) : film.pause();
  $("prev").onclick = () => seek(F.shots[Math.max(0, cur - 1)].t0 + 0.01);
  $("next").onclick = () => seek(F.shots[Math.min(F.shots.length - 1, cur + 1)].t0 + 0.01);
  let G = [];
  function fig(f, label, cls, tag) {
    const src = U(f);
    if (!src) return h("div", { class: "none", text: label ? `${label}（没有文件）` : "没有" });
    const k = G.push({ src, label }) - 1;
    return h(
      "figure",
      { class: "im" + (cls ? " " + cls : ""), title: tag ? `${label} · ${tag[0]}` : label, onclick: () => zoom(k) },
      h("img", { src, alt: label, loading: "lazy" }),
      tag ? h("span", { class: "tg " + (tag[1] || ""), text: tag[0] }) : null,
      h("figcaption", { text: label })
    );
  }
  const none = (t) => h("div", { class: "none", text: t });
  const ar = (on) => h("div", { class: "ar", text: on ? "→" : "" });
  function filmCell(f, t, lab) {
    if (F.plan) return none("还没开拍");
    if (f) return fig(f, `${lab} ${clock(t)}`);
    return h(
      "button",
      { class: "none seek", type: "button", onclick: () => {
        if (!film.readyState) film.preload = "auto";
        seek(t);
      } },
      h("span", { text: `${lab} ${clock(t)}` }),
      h("span", { text: "点了在左边成片里看" })
    );
  }
  function inputs(fr, wmf) {
    const kj = fr && fr.k && F.keys[fr.k];
    if (!fr) return none("");
    if (!kj) return none("不是 gpt-image 出的，没有出图的输入");
    const same = kj.in.filter((x) => x.f && x.f === wmf), rest = kj.in.filter((x) => !(x.f && x.f === wmf));
    return h(
      "div",
      { class: "insbox" },
      same.length ? h("div", { class: "eq", text: `${same.map((x) => x.l.split(" ")[0]).join("、")} = 左边的白模静帧（只给 gpt-image 看）` }) : null,
      h("div", { class: "ins fit" }, rest.map((x) => fig(x.f, x.l, "", isWm(x.f) ? ["不进视频", "no"] : null)))
    );
  }
  const isWm = (f) => !!f && f.startsWith(`${F.key}/wm/`);
  const rvName = (r) => (/previz|(^|\/)wm\//i.test(r) ? "白模预演" : "参考视频") + " " + r.split("/").pop();
  function noFirst(s) {
    if (F.plan) return "还没开拍，还没有喂给视频模型的帧";
    if (!s.job) return "没找到这一镜的视频任务";
    if (s.rv) return "这一镜没有首帧：参考视频喂给视频模型";
    if (s.refs.length) return "这一镜没有首帧：参考图喂给视频模型";
    return "这一镜没有首帧：只有文字 prompt";
  }
  let shownJob = null;
  const stemOf2 = (f) => (f || "").split("/").pop().replace(/\.[^.]+$/, "");
  const dirOf = (f) => (f || "").split("/").slice(1, -1)[0] || "";
  const refName = (f) => /^(ref|cast|char|costume|style|look|plate)/i.test(stemOf2(f));
  let frameSet = null, frameOf = null;
  const frames = () => {
    if (frameOf !== F) {
      frameOf = F;
      frameSet = new Set(F.shots.flatMap((x) => [x.first && x.first.f, x.last && x.last.f]).filter(Boolean));
    }
    return frameSet;
  };
  const isKeyImg = (f, k) => !!f && !isWm(f) && !refName(f) && !/^(refs|refs_img|cast)$/.test(dirOf(f)) && (frames().has(f) || !!k || /^(keys|kf\w*)$/.test(dirOf(f)));
  const keyShot = (f) => {
    if (!isKeyImg(f)) return null;
    const m = stemOf2(f).match(/^[kK]_?(.+)$/);
    if (!m) return null;
    const names = new Set(F.shots.map((x) => x.n));
    return [m[1], m[1].replace(/_?[ab]\d*$/, "")].find((c) => names.has(c)) || null;
  };
  function roleOf(x, n, vp) {
    const m = n && (vp || "").match(new RegExp(`(?:图|Image\\s?)${n}\\s*(?:是|为|=|：|:|is)\\s*([^，,。.；;\\n（(、]{1,20})`));
    const st = stemOf2(x.f), said = m ? m[1].trim() : null;
    if (isWm(x.f)) return `白模 · ${said || st}`;
    if (isKeyImg(x.f, x.k)) {
      const ks = keyShot(x.f);
      return `关键帧 · ${said || (ks ? ks : st)}`;
    }
    if (x.f) return `参考图 · ${said || (F.roles || {})[st] || st}`;
    return x.l || st;
  }
  const clipShots = (s) => s.job ? F.shots.map((x, k) => [x, k]).filter(([x]) => x.job === s.job) : [[s, F.shots.indexOf(s)]];
  function keyFor(x, pos, clip, s) {
    if (x.first && x.first.f && !isWm(x.first.f)) return { f: x.first.f, k: x.first.k };
    if (x.kref != null && s.refs[x.kref]) return { f: s.refs[x.kref].f, k: s.refs[x.kref].k };
    const kr = s.refs.filter((r2) => isKeyImg(r2.f, r2.k));
    const r = kr.length === clip.length ? kr[pos] : kr.find((q) => keyShot(q.f) === x.n);
    return r ? { f: r.f, k: r.k } : null;
  }
  function richText(text, at) {
    const out = [], re = /(图\s?(\d+)|Image\s?(\d+))/g;
    let m, last = 0;
    while (m = re.exec(text)) {
      out.push(text.slice(last, m.index));
      const k = at[+(m[2] || m[3])];
      out.push(k != null ? h("a", { class: "imref", title: "看这张图", onclick: () => zoom(k) }, m[1]) : m[1]);
      last = re.lastIndex;
    }
    out.push(text.slice(last));
    return out;
  }
  function showClip(i) {
    const s = F.shots[i], clip = clipShots(s), model = s.model || (F.model || "").split(/[（(；;]/)[0].trim();
    const flagged2 = F.flag && F.flag.shots.includes(s.n);
    $("info").replaceChildren(...[
      h("h2", { text: s.n }),
      h("span", { class: "t", text: `${clock(s.t0)}–${clock(s.t1)} · 第 ${i + 1}/${F.shots.length} 镜` }),
      h("span", { class: "what", text: s.what, title: s.what }),
      flagged2 ? h("span", { class: "badge", text: `${clock(F.flag.t, 0)} 有问题：${F.flag.note}`, title: F.flag.note }) : null,
      h(
        "div",
        { class: "sub", title: s.feed || "" },
        s.job ? `这条生成 ${s.job} 用在 ${clip.length} 镜：` : `喂法：${s.feed || "—"}`,
        ...s.job ? clip.map(([x, k]) => h(
          "button",
          { class: "use" + (k === i ? " on" : ""), type: "button", onclick: () => seek(x.t0 + 0.01) },
          `${x.n} ${clock(x.t0, 0)}–${clock(x.t1, 0)}`
        )) : []
      )
    ].filter(Boolean));
    const id = `${F.key}|${s.job || "shot:" + s.n}`;
    if (shownJob === id) {
      $("pipe").querySelectorAll("[data-i]").forEach((r) => r.classList.toggle("cur", +r.dataset.i === i));
      return;
    }
    shownJob = id;
    G = [];
    const at = {}, seen = {}, tiles = [];
    const sent = (x, lab) => fig(x.f, lab, isWm(x.f) ? "bl" : "vin", isWm(x.f) ? ["Blender 图直接进视频模型", "bl"] : null);
    if (s.first) tiles.push(sent(s.first, `首帧 · ${roleOf(s.first, 0, "")}`));
    if (s.last) tiles.push(sent(s.last, `尾帧 · ${roleOf(s.last, 0, "")}`));
    const picOf = {};
    clip.forEach(([x]) => {
      if (x.kref != null && picOf[x.kref] == null) picOf[x.kref] = x.n;
    });
    s.refs.forEach((x, j) => {
      const n = j + 1, dup = seen[x.f];
      seen[x.f] = seen[x.f] || n;
      at[n] = G.length;
      const role = picOf[j] != null && !isWm(x.f) ? `关键帧 · ${picOf[j]} 的画面` : roleOf(x, n, s.vp);
      tiles.push(sent(x, `图${n} ${role}${dup ? `（和图${dup} 同一张）` : ""}`));
    });
    const params = Object.entries(s.params || { model: s.model, duration: s.dur, seed: s.seed }).filter(([, v]) => v != null && v !== "");
    const vp = h("div", { class: "vp" }, ...richText(s.vp || "（没有 prompt）", at));
    const more = h("button", { class: "cb-x", type: "button", onclick: () => {
      vp.classList.toggle("open");
      more.textContent = vp.classList.contains("open") ? "收起" : "展开全文";
    } }, "展开全文");
    $("sent").replaceChildren(...[
      h(
        "div",
        { class: "cb-h" },
        h("b", { text: "喂进视频模型的" }),
        h("span", { class: "dim", text: [s.job || "", model].filter(Boolean).join(" · ") }),
        h("span", { class: "dim", text: [s.first && "首帧", s.last && "尾帧", s.refs.length && `参考图 ${s.refs.length} 张`, s.rv && "参考视频"].filter(Boolean).join(" + ") || noFirst(s) })
      ),
      tiles.length ? h("div", { class: "sent" }, tiles) : null,
      s.rv ? h("div", { class: "rvl" }, `参考视频：${rvName(s.rv)}`) : null,
      params.length ? h("div", { class: "prm" }, params.map(([k, v]) => h("span", { text: `${k} ${v}` }))) : null,
      s.job ? h("div", { class: "vpbox" }, vp, more) : null
    ].filter(Boolean));
    const hd = (t) => h("div", { class: "ch-h", text: t });
    const rows = [hd(""), hd("Blender 白模静帧 · 只给 gpt-image 看"), hd("这一镜用的 gpt-image 关键帧"), hd("成片这一镜")];
    clip.forEach(([x, k], pos) => {
      const kf = keyFor(x, pos, clip, s);
      const inFed = kf && (s.first && s.first.f === kf.f ? "首帧" : s.last && s.last.f === kf.f ? "尾帧" : ((n) => n ? `图${n}` : "")(s.refs.findIndex((r) => r.f === kf.f) + 1));
      const ks = kf && keyShot(kf.f), reuse = ks && ks !== x.n;
      const kcell = kf ? [fig(kf.f, `${reuse ? `沿用 ${ks} 的关键帧` : "关键帧"} ${stemOf2(kf.f)}`, inFed ? "vin" : "", inFed ? [`进视频模型 · ${inFed}`, ""] : null)] : [none(F.plan ? "还没开拍" : x.first ? "首帧不是 gpt-image 出的" : "这一镜没有关键帧")];
      const KJ = kf && kf.k && F.keys[kf.k];
      if (KJ) kcell.push(h(
        "details",
        { class: "mk" },
        h("summary", { text: "这张图怎么来的" }),
        h("div", { class: "mk-in" }, KJ.in.map((q) => fig(q.f, q.l, "", isWm(q.f) ? ["白模 · 只给 gpt-image", "no"] : null))),
        h("div", { class: "mk-p", text: KJ.prompt || "（没有出图 prompt）" })
      ));
      const wd = x.wm[0] && vin(x).includes(x.wm[0]);
      rows.push(
        h(
          "div",
          { class: "ch-n", "data-i": k },
          h("button", { class: "use" + (k === i ? " on" : ""), type: "button", onclick: () => seek(x.t0 + 0.01) }, x.n),
          h("small", { text: `${clock(x.t0, 0)}–${clock(x.t1, 0)}` })
        ),
        h("div", { class: "ch-c", "data-i": k }, x.wm[0] ? fig(x.wm[0], `白模 ${x.n}`, wd ? "bl" : "", wd ? ["Blender 图直接进视频模型", "bl"] : ["不进视频", "no"]) : none("这一镜没有白模")),
        h("div", { class: "ch-c", "data-i": k }, kcell),
        h("div", { class: "ch-c", "data-i": k }, x.film[1] ? fig(x.film[1], `成片 ${x.n} ${clock((x.t0 + x.t1) / 2)}`) : filmCell(null, (x.t0 + x.t1) / 2, x.n))
      );
    });
    $("pipe").className = "chain";
    $("pipe").replaceChildren(...rows);
    $("pipe").querySelectorAll("[data-i]").forEach((r) => r.classList.toggle("cur", +r.dataset.i === i));
    $("prompts").replaceChildren();
  }
  const vin = (s) => [s.first, s.last, ...s.refs].filter((x) => x && x.f).map((x) => x.f);
  function fitTiles() {
    document.querySelectorAll("#pipe .ins.fit").forEach((box) => {
      const n = box.children.length;
      if (!n) return;
      const W = box.clientWidth, H = box.clientHeight, g = 4;
      let best = 0;
      for (let r = 1; r <= n; r++) {
        const c = Math.ceil(n / r);
        best = Math.max(best, Math.min((H - (r - 1) * g) / r, (W - (c - 1) * g) / c * 9 / 16));
      }
      box.style.setProperty("--th", `${Math.floor(best)}px`);
    });
  }
  function size() {
    graphSize();
    const st = $("console").style, vw = Math.min(innerWidth, 1600), vh = innerHeight;
    if (innerWidth <= 1e3) {
      st.removeProperty("--lw");
      st.setProperty("--rh", "90px");
      fitTiles();
      return;
    }
    const box = $("console").getBoundingClientRect(), strip = $("console").querySelector(".strip").getBoundingClientRect();
    const avail = vh - (strip.bottom - box.top) - 12 - 26 - track.closest(".tl").offsetHeight - 16;
    const lwFit = ($("pvbox").hidden ? avail - 30 : (avail - 64) / 2) * 16 / 9;
    const lw = Math.max(300, Math.min(0.32 * vw, lwFit, 560));
    const W = vw - 32 - 30 - lw - 16;
    st.setProperty("--lw", `${Math.round(lw)}px`);
    st.setProperty("--rh", `${Math.round(Math.max(76, Math.min((0.7 * W - 90) / (3 * 16 / 9), (vh - 440) / 3, 150)))}px`);
    st.setProperty("--rmax", `${Math.max(240, Math.round(avail))}px`);
    fitTiles();
  }
  addEventListener("resize", () => F && size());
  function show(i) {
    cur = i;
    const s = F.shots[i];
    bars.forEach((b, k) => b.classList.toggle("live", k === i));
    G = [];
    if (film.readyState === 0) film.poster = U(s.film[1]) || F.plan && U(s.th) || "";
    if (F.previz && previz.readyState === 0) previz.poster = U(s.wm[0]) || "";
    if (view === "graph") return graphShow(i);
    showClip(i);
  }
  const lb = $("lb");
  let zi = 0;
  function zoom(k) {
    zi = k;
    paint();
    if (!lb.open) lb.showModal();
  }
  function paint() {
    const g = G[zi];
    $("lb-i").src = g.src;
    $("lb-t").textContent = g.label;
    $("lb-n").textContent = `${zi + 1} / ${G.length}`;
    $("lb-b").classList.remove("full");
  }
  $("lb-i").onclick = () => $("lb-b").classList.toggle("full");
  $("lb-x").onclick = () => lb.close();
  lb.addEventListener("click", (e) => {
    if (e.target === lb) lb.close();
  });
  document.addEventListener("keydown", (e) => {
    if (lb.open) {
      if (e.key === "ArrowRight") {
        zi = (zi + 1) % G.length;
        paint();
        e.preventDefault();
      }
      if (e.key === "ArrowLeft") {
        zi = (zi - 1 + G.length) % G.length;
        paint();
        e.preventDefault();
      }
      return;
    }
    if (!F || $("console").hidden) return;
    if (e.key === "ArrowRight") {
      $("next").click();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      $("prev").click();
      e.preventDefault();
    } else if (e.key === " " && !e.target.closest("button,video,input,textarea")) {
      $("play").click();
      e.preventDefault();
    }
  });
  let view = "console";
  const GV = { s: 1, x: 0, y: 0, i: -1, wf: null, box: null, pin: null };
  const canvas = $("gv-canvas"), world = $("gv-world"), dyn = $("gv-dyn"), svg = $("gv-links");
  const TITLE = 30, ROW = 20, WIDGET = 24, PROMPT = { key: 112, job: 132 };
  const LINK = { IMAGE: "#64b5f6", VIDEO: "#9a9" };
  const ZH = {
    prompt: "prompt",
    first_frame: "首帧",
    last_frame: "尾帧",
    reference_images: "参考图",
    images: "出图用的图",
    duration: "时长",
    seed: "seed",
    model: "模型",
    resolution: "分辨率",
    ratio: "比例"
  };
  const stemOf = (r) => (r || "").split("/").pop().replace(/\.[^.]+$/, "");
  const flagged = (s) => !!(F.flag && F.flag.shots && F.flag.shots.includes(s.n));
  const wfCache = new WeakMap();
  function workflows() {
    if (!wfCache.has(F)) wfCache.set(F, (async (wfz) => {
      const bin = Uint8Array.from(atob(wfz), (c) => c.charCodeAt(0));
      const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      return JSON.parse(text).map(([name, raw]) => ({ name, raw, wf: JSON.parse(raw) }));
    })(F.graph.wfz));
    return wfCache.get(F);
  }
  const kindOf = (n) => n.type === "FilmKitImage" ? "img" : n.type === "FilmKitKeyframe" ? "key" : n.type === "LoadVideo" ? "rv" : /^FilmKit(T2V|I2V|FLF2V|R2V)$/.test(n.type) ? "job" : "other";
  const shownIns = (n) => (n.inputs || []).filter((x) => x.link != null);
  const rowsOf = (n) => Math.max(shownIns(n).length, (n.outputs || []).length, 1);
  const takesOf = (n) => {
    const f = (n.properties || {}).filmkit || {}, D = F.graph;
    if (kindOf(n) === "job") return ((D.job || {})[f.job] || {}).takes || [];
    if (kindOf(n) === "key") return ((D.key || {})[stemOf(f.file)] || {}).takes || [];
    return [];
  };
  function nodeEl(n) {
    const k = kindOf(n), [x, y] = n.pos, [w, hh] = n.size, rows = rowsOf(n), W = n.widgets_values || [], f = (n.properties || {}).filmkit || {};
    const T2 = takesOf(n), bad = T2.some((t) => t.st === "failed");
    const el = h(
      "div",
      {
        class: `cn cn-${k}`,
        "data-state": "done",
        style: `left:${x}px;top:${y - TITLE}px;width:${w}px;height:${hh + TITLE}px;--tc:${n.color || "#222"};--bg:${n.bgcolor || "#353535"}`
      },
      h(
        "div",
        { class: "cn-t", title: n.title },
        h("span", { text: n.title }),
        T2.length > 1 ? h("button", {
          class: "cn-x" + (bad ? " bad" : ""),
          type: "button",
          text: `↻ ×${T2.length}`,
          "aria-label": `${k === "job" ? "重抽" : "重画"} ${T2.length} 次，点开看每一次`,
          onclick: (e) => {
            e.stopPropagation();
            showPop(n, e.currentTarget, true);
          },
          onpointerenter: (e) => showPop(n, e.currentTarget, false),
          onpointerleave: () => {
            if (!GV.pin) hidePop();
          }
        }) : null
      )
    );
    shownIns(n).forEach((p, r) => el.append(h("span", { class: "cn-i", style: `top:${TITLE + r * ROW}px;--lc:${LINK[p.type] || "#9a9"}`, text: p.label || p.name })));
    (n.outputs || []).forEach((o, r) => el.append(h("span", {
      class: "cn-o" + (o.links && o.links.length ? " on" : ""),
      style: `top:${TITLE + r * ROW}px;--lc:${LINK[o.type] || "#9a9"}`,
      text: o.label || o.name
    })));
    let top = TITLE + rows * ROW + 6;
    const pill = (name, val) => {
      el.append(h("div", { class: "cn-w", style: `top:${top + 2}px` }, h("span", { text: name }), h("b", { text: String(val) })));
      top += WIDGET;
    };
    const prompt = (text, ht, who) => {
      el.append(h("div", {
        class: "cn-p",
        style: `top:${top}px;height:${ht - 6}px`,
        title: "点了看全文",
        text: text || "（没有提示词）",
        onclick: (e) => {
          e.stopPropagation();
          showText(who, text || "（没有提示词）", e.currentTarget);
        }
      }));
      top += ht;
    };
    if (k === "key") prompt(W[0], PROMPT.key, `${n.title} 的出图提示词`);
    if (k === "job") {
      pill("model", W[0] || "—");
      prompt(W[1], PROMPT.job, `${n.title} 的提示词`);
      pill("duration", W[2] != null ? W[2] : "—");
    }
    const mh = hh + TITLE - top - 8;
    if (k === "img" || k === "key") {
      const src = (F.graph.media || {})[f.file];
      el.append(h("div", { class: "cn-m", style: `top:${top}px;height:${mh}px;padding:6px 0` }, h("div", { style: "height:100%" }, fig(src, n.title))));
    } else if (k === "rv") {
      el.append(h("div", { class: "cn-m", style: `top:${top}px;height:${mh}px` }, h("div", { class: "none", text: `参考视频 ${stemOf(f.file)}（页面里不放）` })));
    } else if (k === "job") {
      GV.vrect = [x + 6, y - TITLE + top + 6, w - 12, mh - 12];
    }
    return el;
  }
  async function graphShow(i, refit = true) {
    if (!F || !F.graph || !F.graph.wfz) return;
    if (GV.i !== i) {
      GV.i = i;
      hidePop();
    }
    lanesLive(i);
    const Fi = F, list = await workflows();
    if (F !== Fi || cur !== i || view !== "graph") return;
    GV.wf = list[i];
    paintWf(GV.wf.wf, F.shots[i]);
    if (refit) fit();
  }
  function paintWf(wf, s) {
    G = [];
    GV.vrect = null;
    const nodes = wf.nodes, byId = new Map(nodes.map((n) => [n.id, n]));
    dyn.replaceChildren(...nodes.map(nodeEl));
    const g = (wf.groups || [])[0];
    const extra = [];
    if (g) {
      const [x, y, w, hh] = g.bounding;
      extra.push(h("div", { class: "cg", style: `left:${x}px;top:${y}px;width:${w}px;height:${hh}px` }, h("b", { style: `font-size:${g.font_size || 24}px`, text: g.title })));
    }
    const R = new Map(((wf.extra || {}).reroutes || []).map((r) => [r.id, r]));
    const last = new Map(((wf.extra || {}).linkExtensions || []).map((e) => [e.id, e.parentId]));
    const outAt = (n, k) => [n.pos[0] + n.size[0] - 8, n.pos[1] + k * ROW + ROW / 2];
    const inAt = (n, k) => [n.pos[0] + 8, n.pos[1] + n.inputs.slice(0, k).filter((x) => x.link != null).length * ROW + ROW / 2];
    const NS = "http://www.w3.org/2000/svg", shapes = [], dots = [];
    for (const L of wf.links || []) {
      const a = byId.get(L[1]), b = byId.get(L[3]);
      if (!a || !b) continue;
      const via = [];
      let r = last.get(L[0]);
      while (r != null && R.has(r)) {
        via.push(R.get(r).pos);
        r = R.get(r).parentId;
      }
      const pts2 = [outAt(a, L[2]), ...via.reverse(), inAt(b, L[4])];
      const pl = document.createElementNS(NS, "polyline");
      pl.setAttribute("points", pts2.map((p) => p.join(",")).join(" "));
      pl.style.stroke = LINK[L[5]] || "#9a9";
      shapes.push(pl);
    }
    for (const r of R.values()) {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", r.pos[0]);
      c.setAttribute("cy", r.pos[1]);
      c.setAttribute("r", 4.5);
      c.style.fill = "#9cc9ee";
      dots.push(c);
    }
    svg.replaceChildren(...shapes, ...dots);
    world.querySelectorAll(".cg").forEach((e) => e.remove());
    world.prepend(...extra);
    const vb2 = vbox();
    vb2.hidden = !GV.vrect;
    if (GV.vrect) {
      const [x, y, w, hh] = GV.vrect;
      vb2.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${hh}px`;
    }
    GV.box = g ? g.bounding : boxOf(nodes);
    $("gv-flag").replaceChildren(...flagged(s) ? [h("span", { class: "badge", text: `${clock(F.flag.t, 0)} 有问题：${F.flag.note}`, title: F.flag.note })] : []);
  }
  const boxOf = (nodes) => {
    const xs = nodes.flatMap((n) => [n.pos[0], n.pos[0] + n.size[0]]), ys = nodes.flatMap((n) => [n.pos[1] - TITLE, n.pos[1] + n.size[1]]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  };
  let vb = null;
  function vbox() {
    if (!vb) {
      vb = h("div", { class: "cn-v" });
      world.append(vb);
    }
    return vb;
  }
  function placeVideos(on) {
    if (on) vbox().append(film);
    else slot.append(film);
  }
  function loopShot() {
    if (cur < 0 || !film || film.paused || film.seeking) return;
    const s = F.shots[cur];
    if (T >= s.t1 - 0.04 && T < s.t1 + 0.6) {
      T = s.t0 + 0.01;
      film.currentTime = T;
    }
  }
  function showPop(n, anchor, pin) {
    const T2 = takesOf(n), job = kindOf(n) === "job", p = $("gv-pop"), used = T2.find((t) => t.used);
    if (GV.pin && !pin) return;
    GV.pin = pin ? n.id : null;
    const what = (t) => t.used ? "" : !t.diff.length ? "输入一样" : t.diff.every((d) => d === "seed") ? "只换了 seed" : `改了 ${t.diff.map((d) => ZH[d] || d).join("、")}`;
    p.className = "gv-pop";
    p.replaceChildren(
      h("b", { text: `${job ? "重抽" : "重画"} ×${T2.length} · 节点上是用上的 ${used ? used.n : "—"}` }),
      h("table", {}, T2.map((t) => h(
        "tr",
        {},
        h("td", { text: t.n }),
        h("td", { class: t.used ? "use" : "no", text: t.used ? "用上" : "没用上" }),
        h("td", { class: t.st === "failed" ? "err" : "", title: t.err || null, text: t.st === "failed" ? `报错：${errShort(t.err)}` : t.st ? t.seed != null ? `seed ${t.seed}` : "出了" : "没有记录" }),
        h("td", { class: "dim", text: what(t) })
      ))),
      pin ? h("div", { class: "dim", style: "margin-top:4px;font-size:12px", text: "点空白处关上" }) : null
    );
    place(p, anchor);
  }
  function showText(title, text, anchor) {
    const p = $("gv-pop");
    GV.pin = "text";
    p.className = "gv-pop txt";
    p.replaceChildren(h("b", { style: "font-family:inherit", text: title }), text, h("div", { class: "dim", style: "margin-top:6px;font-size:12px", text: "点空白处关上" }));
    place(p, anchor);
  }
  function place(p, anchor) {
    p.hidden = false;
    p.scrollTop = 0;
    const r = anchor.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    p.style.left = `${Math.max(4, Math.min(r.left - c.left - 20, c.width - p.offsetWidth - 4))}px`;
    p.style.top = `${r.bottom - c.top + 6 + p.offsetHeight > c.height ? Math.max(4, r.top - c.top - p.offsetHeight - 6) : r.bottom - c.top + 6}px`;
  }
  function hidePop() {
    $("gv-pop").hidden = true;
    GV.pin = null;
  }
  const errShort = (e) => {
    if (!e) return "没写原因";
    const code = /code=(\w+)/.exec(e);
    return e.split(/[:：\s]/)[0] + (code ? `（${code[1]}）` : "");
  };
  function apply() {
    world.style.transform = `translate(${GV.x}px,${GV.y}px) scale(${GV.s})`;
    canvas.style.setProperty("--dot", `${20 * GV.s}px`);
    canvas.style.setProperty("--dotx", `${GV.x}px`);
    canvas.style.setProperty("--doty", `${GV.y}px`);
  }
  const band = () => Math.max(...[...canvas.querySelectorAll(".gv-tl,.gv-tr")].map((e) => e.offsetTop + e.offsetHeight)) + 6;
  function fit() {
    const b = GV.box;
    if (!b) return;
    const BAND = band(), [x0, y0, bw, bh] = b, W = canvas.clientWidth, H = canvas.clientHeight - BAND, m = 8;
    GV.s = Math.max(0.12, Math.min(1, (W - 2 * m) / bw, (H - m) / bh));
    if (W < 700) GV.s = Math.max(GV.s, Math.min(0.62, (H - m) / bh));
    GV.x = W < 700 && bw * GV.s > W ? m - x0 * GV.s : (W - bw * GV.s) / 2 - x0 * GV.s;
    GV.y = BAND + (H - bh * GV.s) / 2 - y0 * GV.s;
    apply();
  }
  function zoomAt(k, cx, cy) {
    const s = Math.max(0.12, Math.min(3, GV.s * k));
    GV.x = cx - (cx - GV.x) * s / GV.s;
    GV.y = cy - (cy - GV.y) * s / GV.s;
    GV.s = s;
    apply();
  }
  canvas.addEventListener("wheel", (e) => {
    if (e.target.closest(".gv-pop")) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 15e-4)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  const pts = new Map();
  let pan = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || e.target.closest("video,button,.gv-pop")) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pan = { moved: false, x: GV.x, y: GV.y, s: GV.s, ...pinch() };
  });
  function pinch() {
    const p = [...pts.values()];
    if (p.length < 2) return { cx: p[0] ? p[0].x : 0, cy: p[0] ? p[0].y : 0, d: 0 };
    return { cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
  }
  canvas.addEventListener("pointermove", (e) => {
    if (!pan || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const q = pinch(), r = canvas.getBoundingClientRect();
    if (!pan.moved && (Math.hypot(q.cx - pan.cx, q.cy - pan.cy) > 4 || pan.d && Math.abs(q.d - pan.d) > 4)) {
      pan.moved = true;
      canvas.classList.add("pan");
      for (const id of pts.keys()) try {
        canvas.setPointerCapture(id);
      } catch (_) {
      }
    }
    if (!pan.moved) return;
    GV.s = pan.s;
    GV.x = pan.x + q.cx - pan.cx;
    GV.y = pan.y + q.cy - pan.cy;
    if (pan.d && q.d) zoomAt(q.d / pan.d, q.cx - r.left, q.cy - r.top);
    else apply();
  });
  const endPan = (e) => {
    pts.delete(e.pointerId);
    if (pan && pan.moved) {
      canvas.dataset.dragged = "1";
      setTimeout(() => {
        delete canvas.dataset.dragged;
      }, 0);
    }
    pan = pts.size ? { moved: true, x: GV.x, y: GV.y, s: GV.s, ...pinch() } : null;
    if (!pan) canvas.classList.remove("pan");
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener("click", (e) => {
    if (canvas.dataset.dragged) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (GV.pin && !e.target.closest(".gv-pop,.cn-x,.cn-p")) hidePop();
  }, true);
  $("gv-fit").onclick = () => fit();
  $("gv-in").onclick = () => zoomAt(1.25, canvas.clientWidth / 2, canvas.clientHeight / 2);
  $("gv-out").onclick = () => zoomAt(0.8, canvas.clientWidth / 2, canvas.clientHeight / 2);
  new ResizeObserver(() => {
    if (view === "graph" && GV.wf && canvas.clientWidth) fit();
  }).observe(canvas);
  $("gv-export").onclick = async () => {
    const item = (await workflows())[cur];
    const a = h("a", { href: URL.createObjectURL(new Blob([item.raw], { type: "application/json" })), download: item.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
  };
  function chainOf(i) {
    const D = F.graph, s = F.shots[i], J = s.job && (D.job || {})[s.job], keys = new Map(), rels = new Set(), q = [];
    const push = (rel, d) => {
      rels.add(rel);
      const k = rel.startsWith("keys/") && D.key[stemOf(rel)] ? stemOf(rel) : null;
      if (k && !keys.has(k)) {
        keys.set(k, d);
        q.push([k, d]);
      }
    };
    if (J) [J.first, J.last, ...J.refs || []].filter(Boolean).forEach((r) => push(r, 1));
    while (q.length) {
      const [k, d] = q.shift();
      D.key[k].ins.forEach((r) => push(r, d + 1));
    }
    return { J, keys, rels };
  }
  let lanes = [];
  function lanesBuild() {
    const box = $("lanes");
    lanes = [];
    if (!F.graph || !F.graph.key) {
      box.replaceChildren();
      return;
    }
    const D = F.seconds, rows = [["白模", []], ["关键帧", []], ["生成", []]];
    F.shots.forEach((s, i) => {
      const { J, keys, rels } = chainOf(i), T2 = J && J.takes || [];
      const own2 = ((F.graph.shot[i] || {}).wm || []).filter(Boolean), fedOwn = own2.filter((r) => rels.has(r));
      const redraw = [...keys.keys()].filter((k) => ((F.graph.key[k] || {}).takes || []).length > 1);
      const pos = `left:${s.t0 / D * 100}%;width:calc(${(s.t1 - s.t0) / D * 100}% - 2px)`;
      const deep = Math.max(0, ...keys.values());
      const cells = [
        own2.length ? h("span", {
          class: "lc wm" + (fedOwn.length ? "" : " off"),
          style: pos,
          "data-i": i,
          "data-tip": fedOwn.length ? "白模喂进了关键帧" : "有白模静帧，没喂进去（节点图里不画）"
        }) : null,
        keys.size ? h("span", {
          class: "lc k",
          style: `${pos};--a:${(0.18 + 0.62 * Math.min(keys.size, 10) / 10).toFixed(2)}`,
          "data-i": i,
          "data-n": keys.size,
          "data-tip": `往上 ${keys.size} 张关键帧、${deep} 层（节点图里只放这一镜的那一层）${redraw.length ? `；重画 ${redraw.map((k) => `${k} ×${F.graph.key[k].takes.length}`).join("、")}` : ""}`
        }) : null,
        J ? h("span", {
          class: "lc g" + (T2.length > 1 ? " x" : "") + (T2.some((t) => t.st === "failed") ? " bad" : ""),
          style: pos,
          "data-i": i,
          "data-n": T2.length > 1 ? `×${T2.length}` : "",
          "data-tip": T2.length > 1 ? `${s.job} ×${T2.length}：${T2.filter((t) => !t.used).map((t) => t.n + (t.st === "failed" ? " 报错" : " 没用上")).join("、")}` : `${s.job} 一次就用上`
        }) : null
      ];
      cells.forEach((c, r) => {
        if (c) rows[r][1].push(c);
      });
      lanes.push(cells);
    });
    box.replaceChildren(...rows.map(([t, cs]) => h("div", { class: "lane" }, h("b", { text: t }), cs)));
    requestAnimationFrame(laneText);
  }
  function laneText() {
    lanes.flat().forEach((c) => {
      if (c && c.dataset.n) c.textContent = c.offsetWidth >= c.dataset.n.length * 5 + 4 ? c.dataset.n : "";
    });
  }
  new ResizeObserver(() => {
    if (view === "graph" && F && F.graph) laneText();
  }).observe($("lanes"));
  $("lanes").addEventListener("click", (e) => {
    const c = e.target.closest(".lc");
    if (c) seek(F.shots[+c.dataset.i].t0 + 0.01);
  });
  $("lanes").addEventListener("pointermove", (e) => {
    const c = e.target.closest(".lc");
    if (!c) {
      $("peek").hidden = true;
      return;
    }
    peek(e.clientX);
    const p = $("peek").lastElementChild;
    p.textContent = `${p.textContent} · ${c.dataset.tip}`;
  });
  $("lanes").addEventListener("pointerleave", () => {
    $("peek").hidden = true;
  });
  function lanesLive(i) {
    lanes.forEach((cells, k) => cells.forEach((c) => c && c.classList.toggle("live", k === i)));
  }
  function setView(v) {
    if (!F) return;
    if (v === "graph" && !(F.graph && F.graph.wfz)) v = "console";
    const was = view;
    view = v;
    $("views").querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    document.querySelector("#console .main").hidden = v === "graph";
    $("gv").hidden = v !== "graph";
    $("console").classList.toggle("gview", v === "graph");
    track.closest(".tl").classList.toggle("wl", v === "graph");
    $("lanes").hidden = v !== "graph";
    hidePop();
    if (v === "graph") previz.pause();
    if (was !== v || v === "graph") placeVideos(v === "graph");
    size();
    if (cur >= 0) {
      const i = cur;
      cur = -1;
      shownJob = null;
      show(i);
    }
    if (v === "graph") {
      lanesLive(cur);
      laneText();
    }
  }
  $("views").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (b) setView(b.dataset.v);
  });
  function graphOpen() {
    GV.i = -1;
    GV.wf = null;
    GV.box = null;
    $("views").hidden = !(F.graph && F.graph.wfz);
    lanesBuild();
    view = "";
    setView(opt.view || DATA.view || "console");
  }
  function graphSize() {
    if (view !== "graph") return;
    const top = canvas.getBoundingClientRect().top + scrollY, tl = track.closest(".tl").offsetHeight;
    const hgt = innerWidth <= 1e3 ? Math.max(300, Math.min(innerHeight * 0.55, 520)) : Math.max(300, innerHeight - top - tl - 6 - 2 - 6);
    canvas.style.setProperty("--gvh", `${Math.round(hgt)}px`);
  }
  return { open, close, isOpen: () => !!F };
};
