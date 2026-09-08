/* PARA-LIFE — app shell, shift flow, UI */

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screens = {
    landing: $("#screen-landing"),
    maps: $("#screen-maps"),
    garage: $("#screen-garage"),
    shop: $("#screen-shop"),
    profile: $("#screen-profile"),
    game: $("#screen-game"),
    scene: $("#screen-scene"),
    transport: $("#screen-transport"),
    results: $("#screen-results"),
    pause: $("#screen-pause"),
  };

  let engine = null;
  let heroStop = null;
  let pendingIap = null;
  let shift = null;

  const OVERLAYS = ["scene", "transport", "results", "pause"];

  function showScreen(name) {
    const isOverlay = OVERLAYS.includes(name);

    if (!isOverlay) {
      Object.keys(screens).forEach((key) => {
        const el = screens[key];
        if (!el) return;
        el.classList.toggle("active", key === name);
      });
      if (engine && name !== "game") {
        engine.stop();
        engine = null;
      }
    } else {
      // Keep driving canvas under clinical / pause overlays
      Object.keys(screens).forEach((key) => {
        const el = screens[key];
        if (!el) return;
        if (OVERLAYS.includes(key)) el.classList.toggle("active", key === name);
        else if (key === "game") el.classList.add("active");
        else el.classList.remove("active");
      });
    }

    if (name === "maps") renderMaps();
    if (name === "garage") renderGarage();
    if (name === "shop") renderShop();
    if (name === "profile") renderProfile();
    if (name === "landing") refreshChips();
  }

  function refreshChips() {
    const s = GameState.data;
    const chip = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    chip("maps-level-chip", `Lv ${s.level}`);
    chip("coins-chip", `€${s.coins.toFixed(2)}`);
    chip("shop-coins", `€${s.coins.toFixed(2)}`);
  }

  // Navigation
  document.body.addEventListener("click", (e) => {
    const goto = e.target.closest("[data-goto]");
    if (goto) {
      e.preventDefault();
      showScreen(goto.getAttribute("data-goto"));
    }
  });

  function renderMaps() {
    refreshChips();
    const grid = $("#map-grid");
    grid.innerHTML = "";
    MAPS.forEach((map) => {
      const locked = GameState.data.level < map.unlockLevel;
      const btn = document.createElement("button");
      btn.className = "map-card";
      btn.disabled = locked;
      btn.innerHTML = `
        <div class="map-card-preview"><canvas></canvas></div>
        <div class="map-card-body">
          <h3>${map.name}</h3>
          <p>${map.region} · cartoon sector map</p>
          <div class="map-meta">
            <span class="pill ${locked ? "locked" : "open"}">${locked ? `Unlock Lv ${map.unlockLevel}` : "Open"}</span>
            <span class="pill">Cat 1–3</span>
          </div>
        </div>
      `;
      if (!locked) {
        btn.addEventListener("click", () => startShift(map));
      }
      grid.appendChild(btn);
      const canvas = btn.querySelector("canvas");
      requestAnimationFrame(() => drawMapPreview(canvas, map));
    });
  }

  function renderGarage() {
    refreshChips();
    const root = $("#loadout");
    root.innerHTML = "";
    const owned = SHOP_ITEMS.filter((i) => GameState.owns(i.id));
    if (!owned.length) {
      root.innerHTML = `<p class="screen-sub">No kit yet — visit the Shop for €2.99 gear.</p>
        <button class="btn btn-primary" data-goto="shop">Open Shop</button>`;
      return;
    }
    owned.forEach((item) => {
      const on = GameState.isEquipped(item.id);
      const row = document.createElement("div");
      row.className = "item-card";
      row.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-info">
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
          <div class="boost">${item.boostLabel}</div>
        </div>
        <div class="item-action">
          <button class="equip-toggle ${on ? "on" : ""}">${on ? "Equipped" : "Equip"}</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", () => {
        GameState.toggleEquip(item.id);
        renderGarage();
      });
      root.appendChild(row);
    });
  }

  function renderShop() {
    refreshChips();
    const grid = $("#shop-grid");
    grid.innerHTML = "";
    SHOP_ITEMS.forEach((item) => {
      const owned = GameState.owns(item.id);
      const row = document.createElement("div");
      row.className = "item-card";
      row.innerHTML = `
        <div class="item-icon">${item.icon}</div>
        <div class="item-info">
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
          <div class="boost">${item.boostLabel}</div>
        </div>
        <div class="item-action">
          ${
            owned
              ? `<span class="owned">Owned</span>`
              : `<span class="price">€${item.price.toFixed(2)}</span>
                 <button class="btn btn-primary">Buy</button>`
          }
        </div>
      `;
      if (!owned) {
        row.querySelector("button").addEventListener("click", () => openIap(item));
      }
      grid.appendChild(row);
    });
  }

  function renderProfile() {
    const s = GameState.data;
    const rank = rankForLevel(s.level);
    const need = xpForLevel(s.level);
    const card = $("#profile-card");
    card.innerHTML = `
      <h3>Level ${s.level}</h3>
      <div class="rank-title">${rank.title}</div>
      <div class="level-bar-wrap">
        <div class="level-bar"><div class="level-fill" style="width:${GameState.levelProgress() * 100}%"></div></div>
        <span>${s.xpIntoLevel} / ${need} XP to next level</span>
      </div>
      <div class="stat-grid">
        <div class="stat-box"><div class="label">Shifts</div><div class="value">${s.shiftsCompleted}</div></div>
        <div class="stat-box"><div class="label">Calls</div><div class="value">${s.callsCompleted}</div></div>
        <div class="stat-box"><div class="label">Best score</div><div class="value">${s.bestScore}</div></div>
        <div class="stat-box"><div class="label">Kit owned</div><div class="value">${s.owned.length}</div></div>
      </div>
    `;
  }

  function openIap(item) {
    pendingIap = item;
    $("#iap-title").textContent = item.name;
    $("#iap-desc").textContent = item.desc;
    $("#iap-modal").classList.remove("hidden");
  }

  $("#iap-cancel").addEventListener("click", () => {
    pendingIap = null;
    $("#iap-modal").classList.add("hidden");
  });

  $("#iap-confirm").addEventListener("click", () => {
    if (!pendingIap) return;
    // Demo IAP: unlock for €2.99 (also grant coins display consistency)
    GameState.purchase(pendingIap.id);
    // Award a little bonus coin credit narrative
    GameState.data.coins = Math.max(0, GameState.data.coins);
    GameState.save();
    $("#iap-modal").classList.add("hidden");
    pendingIap = null;
    renderShop();
    refreshChips();
  });

  /* —— Shift flow —— */
  function startShift(map) {
    const call = pickCall();
    const callTile = pickCallNearStation(map);
    shift = {
      map,
      call,
      callTile,
      decision: null,
      transport: null,
      decisionScore: 0,
      transportScore: 0,
      phase: "to_call",
      startedAt: Date.now(),
      driveTime: 0,
      distance: 0,
      timerId: null,
      paused: false,
    };

    showScreen("game");
    setupHud();
    startDriving("to_call");
    startTimer();
  }

  function setupHud() {
    const cat = shift.call.cat;
    const el = $("#hud-cat");
    el.textContent = `CAT ${cat}`;
    el.style.color = cat === 1 ? "#ff6b6b" : cat === 2 ? "#f0b429" : "#4da3ff";
    $("#hud-objective").textContent =
      shift.phase === "to_call"
        ? `Respond — ${shift.call.title}`
        : `Transport to hospital`;
    $("#hud-xp").textContent = String(GameState.data.xpIntoLevel);
    $(".siren-lights").classList.remove("on");
    $("#btn-siren").classList.remove("on");
  }

  function startTimer() {
    if (shift.timerId) clearInterval(shift.timerId);
    shift.timerId = setInterval(() => {
      if (shift.paused) return;
      shift.driveTime += 1;
      const m = Math.floor(shift.driveTime / 60);
      const s = shift.driveTime % 60;
      $("#hud-timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
    }, 1000);
  }

  function startDriving(phase) {
    shift.phase = phase;
    setupHud();

    const canvas = $("#game-canvas");
    if (engine) engine.stop();
    engine = new DriveEngine(canvas);
    engine.onArrive = onArrive;

    const startTile =
      phase === "to_call"
        ? shift.map.station
        : shift.callTile;
    const targetTile =
      phase === "to_call" ? shift.callTile : shift.map.hospital;

    engine.start(shift.map, startTile, targetTile, phase);
    bindControls();
  }

  function onArrive(phase) {
    if (phase === "to_call") {
      openScene();
    } else if (phase === "to_hospital") {
      finishShift();
    }
  }

  function openScene() {
    shift.paused = true;
    if (engine) engine.setInput({ throttle: 0, steer: 0, brake: true });

    const call = shift.call;
    const badge = $("#scene-cat");
    badge.textContent = `CAT ${call.cat}`;
    badge.className = `cat-badge cat${call.cat}`;
    $("#scene-title").textContent = call.title;
    $("#scene-desc").textContent = call.desc;
    $("#scene-vitals").innerHTML = `
      <div class="vital"><span class="k">HR</span><span class="v">${call.vitals.hr}</span></div>
      <div class="vital"><span class="k">BP</span><span class="v">${call.vitals.bp}</span></div>
      <div class="vital"><span class="k">SpO₂</span><span class="v">${call.vitals.spo2}</span></div>
    `;
    const choices = $("#scene-choices");
    choices.innerHTML = "";
    call.decisions.forEach((d) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.innerHTML = `${d.label}<span class="hint">${d.hint}</span>`;
      b.addEventListener("click", () => {
        shift.decision = d;
        shift.decisionScore = d.score;
        openTransport();
      });
      choices.appendChild(b);
    });
    showScreen("scene");
  }

  function openTransport() {
    const choices = $("#transport-choices");
    choices.innerHTML = "";
    shift.transport = null;
    shift.call.transport.forEach((t) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.innerHTML = `${t.label}<span class="hint">${t.hint}</span>`;
      b.addEventListener("click", () => {
        $$(".choice-btn", choices).forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        shift.transport = t;
        shift.transportScore = t.score;
      });
      choices.appendChild(b);
    });
    // preselect best clinically
    const best = shift.call.transport.reduce((a, b) => (a.score >= b.score ? a : b));
    shift.transport = null;
    showScreen("transport");
  }

  $("#btn-load-go").addEventListener("click", () => {
    if (!shift.transport) {
      // gently nudge — select first if none
      const first = shift.call.transport[0];
      shift.transport = first;
      shift.transportScore = first.score;
    }
    screens.scene.classList.remove("active");
    screens.transport.classList.remove("active");
    shift.paused = false;
    shift.phase = "to_hospital";
    startDriving("to_hospital");
    if (engine) {
      engine.siren = shift.call.cat <= 2;
      $(".siren-lights").classList.toggle("on", engine.siren);
      $("#btn-siren").classList.toggle("on", engine.siren);
    }
  });

  function finishShift() {
    shift.paused = true;
    if (shift.timerId) clearInterval(shift.timerId);
    if (engine) {
      shift.distance += engine.distanceDriven;
      engine.stop();
    }

    const timeBonus = Math.max(0, 120 - shift.driveTime);
    const catMult = shift.call.cat === 1 ? 1.4 : shift.call.cat === 2 ? 1.2 : 1;
    const rawScore = Math.round(
      (shift.decisionScore * 0.5 + shift.transportScore * 0.5 + timeBonus) * catMult
    );
    const rawXp = Math.round(40 + shift.decisionScore * 0.35 + shift.transportScore * 0.25 + timeBonus * 0.5);
    const coins = Number((0.4 + shift.call.cat * 0.15 + (rawScore > 80 ? 0.3 : 0)).toFixed(2));

    const reward = GameState.addRewards({
      xp: rawXp,
      score: rawScore,
      coins,
      distance: shift.distance,
    });
    GameState.completeShift();

    $("#results-title").textContent =
      reward.leveled > 0
        ? `Promoted to Level ${reward.level}!`
        : rawScore >= 80
          ? "Excellent clinical call"
          : rawScore >= 50
            ? "Solid shift work"
            : "Debrief & improve";

    $("#results-stats").innerHTML = `
      <div class="stat-box"><div class="label">Score</div><div class="value">${reward.gainedScore}</div></div>
      <div class="stat-box"><div class="label">XP</div><div class="value">+${reward.gainedXp}</div></div>
      <div class="stat-box"><div class="label">Earn</div><div class="value">€${reward.gainedCoins.toFixed(2)}</div></div>
      <div class="stat-box"><div class="label">Cat</div><div class="value">${shift.call.cat}</div></div>
    `;
    $("#results-level-fill").style.width = `${GameState.levelProgress() * 100}%`;
    $("#results-level-text").textContent = `Level ${GameState.data.level} · ${rankForLevel(GameState.data.level).title}`;

    showScreen("results");
  }

  /* Controls */
  function bindControls() {
    const knob = $("#joystick-knob");
    const base = $("#joystick-base");
    let active = false;
    let pid = null;

    const setKnob = (dx, dy) => {
      const max = 32;
      const dist = Math.hypot(dx, dy);
      const scale = dist > max ? max / dist : 1;
      const x = dx * scale;
      const y = dy * scale;
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      if (engine) engine.setInput({ steer: x / max });
    };

    const onDown = (e) => {
      active = true;
      pid = e.pointerId;
      base.setPointerCapture?.(pid);
      onMove(e);
    };
    const onMove = (e) => {
      if (!active) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setKnob(e.clientX - cx, e.clientY - cy);
    };
    const onUp = () => {
      active = false;
      setKnob(0, 0);
      if (engine) engine.setInput({ steer: 0 });
    };

    base.onpointerdown = onDown;
    base.onpointermove = onMove;
    base.onpointerup = onUp;
    base.onpointercancel = onUp;

    const accel = $("#btn-accel");
    const brake = $("#btn-brake");
    const hold = (el, key, val) => {
      const start = (e) => {
        e.preventDefault();
        el.classList.add("active");
        if (engine) engine.setInput({ [key]: val });
      };
      const end = () => {
        el.classList.remove("active");
        if (engine) engine.setInput({ [key]: key === "brake" ? false : 0 });
      };
      el.onpointerdown = start;
      el.onpointerup = end;
      el.onpointerleave = end;
      el.onpointercancel = end;
    };
    hold(accel, "throttle", 1);
    hold(brake, "brake", true);

    $("#btn-siren").onclick = () => {
      if (!engine) return;
      const on = engine.toggleSiren();
      $("#btn-siren").classList.toggle("on", on);
      $(".siren-lights").classList.toggle("on", on);
    };
  }

  // Keyboard for desktop testing
  window.addEventListener("keydown", (e) => {
    if (!engine || !screens.game.classList.contains("active")) return;
    if (e.key === "ArrowUp" || e.key === "w") engine.setInput({ throttle: 1 });
    if (e.key === "ArrowDown" || e.key === "s") engine.setInput({ brake: true });
    if (e.key === "ArrowLeft" || e.key === "a") engine.setInput({ steer: -1 });
    if (e.key === "ArrowRight" || e.key === "d") engine.setInput({ steer: 1 });
    if (e.key === " ") {
      e.preventDefault();
      const on = engine.toggleSiren();
      $("#btn-siren").classList.toggle("on", on);
      $(".siren-lights").classList.toggle("on", on);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (!engine) return;
    if (e.key === "ArrowUp" || e.key === "w") engine.setInput({ throttle: 0 });
    if (e.key === "ArrowDown" || e.key === "s") engine.setInput({ brake: false });
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ArrowRight" || e.key === "d")
      engine.setInput({ steer: 0 });
  });

  $("#btn-pause").addEventListener("click", () => {
    if (!shift) return;
    shift.paused = true;
    if (engine) engine.setInput({ throttle: 0, brake: true, steer: 0 });
    showScreen("pause");
  });

  $("#btn-resume").addEventListener("click", () => {
    if (!shift) return;
    shift.paused = false;
    screens.pause.classList.remove("active");
  });

  $("#btn-quit-shift").addEventListener("click", () => {
    if (shift?.timerId) clearInterval(shift.timerId);
    if (engine) {
      engine.stop();
      engine = null;
    }
    shift = null;
    screens.pause.classList.remove("active");
    showScreen("maps");
  });

  // Results buttons use data-goto but need to clear overlays
  $$("#screen-results [data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      screens.results.classList.remove("active");
      if (engine) {
        engine.stop();
        engine = null;
      }
    });
  });

  // Boot
  heroStop = startHeroAnimation($("#hero-canvas"));
  refreshChips();
  showScreen("landing");
})();
