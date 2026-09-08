/* PARA-LIFE — Ambulance Rescue Duty–style chase-cam engine */

class DriveEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minimap = document.getElementById("minimap");
    this.minimapCtx = this.minimap ? this.minimap.getContext("2d") : null;
    this.map = null;
    this.ambulance = null;
    this.traffic = [];
    this.trees = [];
    this.phase = "idle";
    this.target = null;
    this.siren = false;
    this.input = { steer: 0, throttle: 0, brake: false };
    this.lastTs = 0;
    this.running = false;
    this.arrived = false;
    this.onArrive = null;
    this.distanceDriven = 0;
    this.flash = 0;
    this.particles = [];
    this.buildingColors = [
      "#e8eef5", "#f2d6c2", "#d4e4f7", "#f5e6c8", "#cfe8d8",
      "#f0cfcf", "#dde3ea", "#e6d5f0",
    ];
    this._raf = null;
    this._resize = () => this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = w;
    this.viewH = h;

    if (this.minimap) {
      const ms = 84;
      this.minimap.width = ms * dpr;
      this.minimap.height = ms * dpr;
      this.minimap.style.width = ms + "px";
      this.minimap.style.height = ms + "px";
      this.minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  start(map, startTile, targetTile, phase) {
    this.map = map;
    this.phase = phase;
    this.arrived = false;
    this.distanceDriven = 0;
    this.flash = 0;
    this.particles = [];
    const start = worldPos(map, startTile.x, startTile.y);
    this.ambulance = {
      x: start.x,
      y: start.y,
      angle: -Math.PI / 2,
      speed: 0,
      maxSpeed: 300,
      accel: 360,
      brake: 520,
      turnRate: 3.2,
      width: 26,
      length: 46,
    };
    this.target = {
      ...worldPos(map, targetTile.x, targetTile.y),
      tile: targetTile,
      radius: map.tile * 1.0,
    };
    this.spawnTraffic();
    this.spawnTrees();
    this.resize();
    window.addEventListener("resize", this._resize);
    this.running = true;
    this.lastTs = performance.now();
    this.loop(this.lastTs);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._resize);
  }

  spawnTraffic() {
    this.traffic = [];
    const count = 18;
    const colors = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#ecf0f1", "#e67e22", "#1abc9c"];
    for (let i = 0; i < count; i++) {
      const tile = randomRoadTile(this.map, [this.map.hospital, this.map.station], 3);
      const p = worldPos(this.map, tile.x, tile.y);
      this.traffic.push({
        x: p.x,
        y: p.y,
        angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][i % 4],
        speed: 50 + Math.random() * 70,
        color: colors[i % colors.length],
        w: 18,
        l: 32,
        turnTimer: Math.random() * 2,
      });
    }
  }

  spawnTrees() {
    this.trees = [];
    const map = this.map;
    for (let y = 1; y < map.size - 1; y++) {
      for (let x = 1; x < map.size - 1; x++) {
        if (map.layout[y][x] !== 0) continue;
        if ((x * 19 + y * 11) % 7 === 0) {
          this.trees.push({
            x: (x + 0.5) * map.tile,
            y: (y + 0.5) * map.tile,
          });
        }
      }
    }
  }

  setInput(partial) {
    Object.assign(this.input, partial);
  }

  toggleSiren() {
    this.siren = !this.siren;
    return this.siren;
  }

  getSpeedKmh() {
    if (!this.ambulance) return 0;
    return Math.round(this.ambulance.speed * 0.42);
  }

  loop(ts) {
    if (!this.running) return;
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.update(dt);
    this.draw();
    this.drawMinimap();
    this.updateSpeedo();
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  updateSpeedo() {
    const val = document.getElementById("speedo-val");
    const arc = document.getElementById("speedo-arc");
    if (!val || !arc) return;
    const kmh = this.getSpeedKmh();
    val.textContent = String(kmh);
    const max = 140;
    const circ = 327;
    const pct = Math.min(1, kmh / max);
    arc.style.strokeDashoffset = String(circ * (1 - pct));
  }

  update(dt) {
    const a = this.ambulance;
    const { steer, throttle, brake } = this.input;

    if (brake) {
      a.speed -= a.brake * dt;
      if (a.speed < 0) a.speed = 0;
    } else if (throttle > 0) {
      a.speed += a.accel * throttle * dt;
    } else {
      a.speed -= 90 * dt;
      if (a.speed < 0) a.speed = 0;
    }

    const boost = this.siren ? 1.22 : 1;
    a.speed = Math.min(a.speed, a.maxSpeed * boost);

    if (a.speed > 8) {
      a.angle += steer * a.turnRate * (0.55 + 0.45 * (a.speed / a.maxSpeed)) * dt;
    }

    const prevX = a.x;
    const prevY = a.y;
    let nx = a.x + Math.cos(a.angle) * a.speed * dt;
    let ny = a.y + Math.sin(a.angle) * a.speed * dt;

    if (!this.collides(nx, a.y, a)) a.x = nx;
    else a.speed *= 0.35;
    if (!this.collides(a.x, ny, a)) a.y = ny;
    else a.speed *= 0.35;

    this.distanceDriven += Math.hypot(a.x - prevX, a.y - prevY) / 40;
    this.updateTraffic(dt);
    if (this.siren) this.flash += dt * 10;

    if (!this.arrived && this.target) {
      const d = Math.hypot(a.x - this.target.x, a.y - this.target.y);
      if (d < this.target.radius && a.speed < 45) {
        this.arrived = true;
        a.speed = 0;
        if (this.onArrive) this.onArrive(this.phase);
      }
    }

    if (throttle > 0.3 && a.speed > 25 && Math.random() < 0.45) {
      this.particles.push({
        x: a.x - Math.cos(a.angle) * 20,
        y: a.y - Math.sin(a.angle) * 20,
        life: 0.35,
        vx: (Math.random() - 0.5) * 24,
        vy: (Math.random() - 0.5) * 24,
      });
    }
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.life > 0;
    });
  }

  collides(x, y, a) {
    const map = this.map;
    const half = a.width * 0.42;
    const points = [
      [x, y],
      [x + half, y],
      [x - half, y],
      [x, y + half],
      [x, y - half],
    ];
    for (const [px, py] of points) {
      const tx = Math.floor(px / map.tile);
      const ty = Math.floor(py / map.tile);
      if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) return true;
      if (map.layout[ty][tx] === 2) return true;
    }
    return false;
  }

  updateTraffic(dt) {
    const map = this.map;
    for (const c of this.traffic) {
      c.turnTimer -= dt;
      if (c.turnTimer <= 0) {
        c.turnTimer = 1.2 + Math.random() * 2.2;
        const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        c.angle = dirs[Math.floor(Math.random() * 4)];
        c.speed = 50 + Math.random() * 70;
      }
      let nx = c.x + Math.cos(c.angle) * c.speed * dt;
      let ny = c.y + Math.sin(c.angle) * c.speed * dt;
      const tx = Math.floor(nx / map.tile);
      const ty = Math.floor(ny / map.tile);
      if (
        tx < 0 || ty < 0 || tx >= map.size || ty >= map.size ||
        map.layout[ty][tx] !== 1
      ) {
        c.angle += Math.PI / 2;
        continue;
      }
      if (this.siren) {
        const d = Math.hypot(nx - this.ambulance.x, ny - this.ambulance.y);
        if (d < 90) c.speed = Math.max(12, c.speed - 100 * dt);
      }
      c.x = nx;
      c.y = ny;
    }
  }

  /** Chase-cam: world rotates so ambulance always faces up on screen */
  worldToScreen(wx, wy) {
    const a = this.ambulance;
    const dx = wx - a.x;
    const dy = wy - a.y;
    const ang = -a.angle - Math.PI / 2;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    // Ambulance sits lower-center like 3D chase games
    return {
      x: this.viewW * 0.5 + rx,
      y: this.viewH * 0.62 + ry,
    };
  }

  draw() {
    const ctx = this.ctx;
    const map = this.map;
    const t = map.tile;
    const a = this.ambulance;

    // Bright daytime sky (Ambulance Rescue Duty look)
    const sky = ctx.createLinearGradient(0, 0, 0, this.viewH * 0.45);
    sky.addColorStop(0, "#6ec8ff");
    sky.addColorStop(1, "#a8e0ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.viewW, this.viewH * 0.42);

    // Distant city silhouette
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 12; i++) {
      const bx = (i * 47 + (a.angle * 40)) % (this.viewW + 40) - 20;
      const bh = 20 + (i * 17) % 50;
      ctx.fillRect(bx, this.viewH * 0.42 - bh, 28, bh);
    }

    // Ground fill
    ctx.fillStyle = "#5cb85c";
    ctx.fillRect(0, this.viewH * 0.4, this.viewW, this.viewH * 0.6);

    // Visible tile range (generous for rotation)
    const range = Math.ceil(Math.hypot(this.viewW, this.viewH) / t) + 3;
    const cx = Math.floor(a.x / t);
    const cy = Math.floor(a.y / t);
    const startTX = Math.max(0, cx - range);
    const startTY = Math.max(0, cy - range);
    const endTX = Math.min(map.size, cx + range);
    const endTY = Math.min(map.size, cy + range);

    // Sort buildings by depth (screen Y) for pseudo-3D
    const buildings = [];

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        const cell = map.layout[ty][tx];
        const wx = tx * t;
        const wy = ty * t;
        const p = this.worldToScreen(wx + t / 2, wy + t / 2);

        if (cell === 0) {
          ctx.fillStyle = ((tx + ty) % 2 === 0) ? "#58b358" : "#62c062";
          this.fillDiamond(ctx, p.x, p.y, t * 0.72);
        } else if (cell === 1) {
          ctx.fillStyle = "#4a5562";
          this.fillDiamond(ctx, p.x, p.y, t * 0.78);
          // sidewalk edge
          ctx.fillStyle = "#8a949e";
          this.fillDiamond(ctx, p.x, p.y, t * 0.78, true);

          // lane dash relative to world
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-a.angle - Math.PI / 2);
          ctx.strokeStyle = "rgba(255, 220, 60, 0.85)";
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 9]);
          const up = ty > 0 && map.layout[ty - 1][tx] === 1;
          const down = ty < map.size - 1 && map.layout[ty + 1][tx] === 1;
          const left = tx > 0 && map.layout[ty][tx - 1] === 1;
          const right = tx < map.size - 1 && map.layout[ty][tx + 1] === 1;
          ctx.beginPath();
          if (up || down) {
            ctx.moveTo(0, -t * 0.35);
            ctx.lineTo(0, t * 0.35);
          }
          if (left || right) {
            ctx.moveTo(-t * 0.35, 0);
            ctx.lineTo(t * 0.35, 0);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        } else if (cell === 2) {
          buildings.push({ tx, ty, p, h: 18 + ((tx * 7 + ty * 13) % 28) });
        }
      }
    }

    // Trees (behind buildings somewhat)
    for (const tree of this.trees) {
      const p = this.worldToScreen(tree.x, tree.y);
      if (p.x < -40 || p.y < -40 || p.x > this.viewW + 40 || p.y > this.viewH + 40) continue;
      ctx.fillStyle = "#3d8b3d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2e6b2e";
      ctx.beginPath();
      ctx.arc(p.x - 3, p.y - 4, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Extruded buildings (pseudo-3D boxes)
    buildings.sort((b1, b2) => b1.p.y - b2.p.y);
    for (const b of buildings) {
      this.drawBuilding(b.p.x, b.p.y, t * 0.55, b.h, b.tx, b.ty);
    }

    // Landmarks
    this.drawLandmarkWorld(map.hospital, "#e53935", "H");
    this.drawLandmarkWorld(map.station, "#2ecc71", "S");

    // Target marker (accident / hospital)
    if (this.target) {
      const tp = this.worldToScreen(this.target.x, this.target.y);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 22 + pulse * 12, 0, Math.PI * 2);
      ctx.fillStyle =
        this.phase === "to_hospital"
          ? `rgba(229,57,53,${0.3 + pulse * 0.25})`
          : `rgba(255,212,0,${0.35 + pulse * 0.25})`;
      ctx.fill();
      ctx.strokeStyle = this.phase === "to_hospital" ? "#e53935" : "#ffd400";
      ctx.lineWidth = 4;
      ctx.stroke();

      // 3D pin
      ctx.fillStyle = this.phase === "to_hospital" ? "#e53935" : "#ffd400";
      ctx.beginPath();
      ctx.moveTo(tp.x, tp.y - 36);
      ctx.lineTo(tp.x + 12, tp.y - 18);
      ctx.lineTo(tp.x, tp.y - 8);
      ctx.lineTo(tp.x - 12, tp.y - 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Exo 2, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.phase === "to_hospital" ? "ED" : "!", tp.x, tp.y - 20);
    }

    // Traffic cars
    for (const c of this.traffic) this.drawCar3D(c);

    // Particles
    for (const p of this.particles) {
      const sp = this.worldToScreen(p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life * 2.2);
      ctx.fillStyle = "#777";
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawAmbulanceChase();
    this.drawNavArrow();

    if (this.siren) {
      const on = Math.floor(this.flash) % 2 === 0;
      ctx.fillStyle = on ? "rgba(77,163,255,0.1)" : "rgba(229,57,53,0.1)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  fillDiamond(ctx, x, y, size, strokeOnly = false) {
    // Approximate rotated tile as rounded rect for performance
    const s = size;
    if (strokeOnly) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      return;
    }
    ctx.fillRect(x - s / 2, y - s / 2, s + 0.5, s + 0.5);
  }

  drawBuilding(x, y, w, h, tx, ty) {
    const ctx = this.ctx;
    const color = this.buildingColors[(tx * 3 + ty) % this.buildingColors.length];
    const depth = h;

    // Side face
    ctx.fillStyle = shadeColor(color, -25);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - w / 4);
    ctx.lineTo(x - w / 2, y - w / 4 - depth);
    ctx.lineTo(x + w / 2, y - w / 4 - depth);
    ctx.lineTo(x + w / 2, y - w / 4);
    ctx.closePath();
    ctx.fill();

    // Front face
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - w / 4 - depth, w, depth);

    // Roof
    ctx.fillStyle = shadeColor(color, -40);
    ctx.fillRect(x - w / 2, y - w / 4 - depth - 6, w, 8);
    ctx.fillStyle = "#ff6b4a";
    if ((tx + ty) % 5 === 0) {
      ctx.fillRect(x - w / 2, y - w / 4 - depth - 6, w, 5);
    }

    // Windows
    ctx.fillStyle = "rgba(80, 140, 200, 0.55)";
    const rows = Math.max(1, Math.floor(depth / 10));
    for (let r = 0; r < rows; r++) {
      ctx.fillRect(x - w / 2 + 4, y - w / 4 - depth + 4 + r * 10, 5, 5);
      ctx.fillRect(x + 2, y - w / 4 - depth + 4 + r * 10, 5, 5);
    }
  }

  drawLandmarkWorld(tile, color, letter) {
    const p = worldPos(this.map, tile.x, tile.y);
    const s = this.worldToScreen(p.x, p.y);
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(s.x - 14, s.y - 28, 28, 28, 6);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Exo 2, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, s.x, s.y - 14);
  }

  drawCar3D(c) {
    const s = this.worldToScreen(c.x, c.y);
    if (s.x < -50 || s.y < -50 || s.x > this.viewW + 50 || s.y > this.viewH + 50) return;
    const ctx = this.ctx;
    const rel = -this.ambulance.angle - Math.PI / 2 + c.angle;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(rel);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(1, 3, c.l * 0.48, c.w * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.roundRect(-c.l / 2, -c.w / 2, c.l, c.w, 4);
    ctx.fill();
    // roof
    ctx.fillStyle = shadeColor(c.color, -20);
    ctx.fillRect(-c.l * 0.15, -c.w * 0.38, c.l * 0.4, c.w * 0.76);
    // windshield
    ctx.fillStyle = "rgba(40,90,140,0.55)";
    ctx.fillRect(c.l * 0.18, -c.w * 0.32, 7, c.w * 0.64);
    ctx.restore();
  }

  drawAmbulanceChase() {
    const ctx = this.ctx;
    const a = this.ambulance;
    // Fixed on screen — always faces up (chase cam)
    const x = this.viewW * 0.5;
    const y = this.viewH * 0.62;

    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(2, 8, a.length * 0.52, a.width * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body — bright yellow rescue ambulance
    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.roundRect(-a.length / 2, -a.width / 2, a.length, a.width, 6);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cab white front
    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(a.length * 0.08, -a.width / 2 + 2, a.length * 0.38, a.width - 4);

    // Battenburg checkered sides (UK/IE emergency look)
    const check = 6;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#e53935" : "#ffd400";
      ctx.fillRect(-a.length / 2 + 4 + i * check, -a.width / 2 + 2, check, 5);
      ctx.fillStyle = i % 2 === 0 ? "#ffd400" : "#e53935";
      ctx.fillRect(-a.length / 2 + 4 + i * check, a.width / 2 - 7, check, 5);
    }

    // Green stripe
    ctx.fillStyle = "#1a9b8e";
    ctx.fillRect(-a.length / 2 + 4, -2.5, a.length * 0.42, 5);

    // Red cross
    ctx.fillStyle = "#e53935";
    ctx.fillRect(-a.length * 0.18, -3, 16, 6);
    ctx.fillRect(-a.length * 0.18 + 5, -8, 6, 16);

    // Windshield
    ctx.fillStyle = "rgba(40, 110, 180, 0.65)";
    ctx.fillRect(a.length * 0.22, -a.width / 2 + 4, 11, a.width - 8);

    // Headlights
    ctx.fillStyle = "#fff8c0";
    ctx.beginPath();
    ctx.arc(a.length / 2 - 2, -a.width / 2 + 6, 3, 0, Math.PI * 2);
    ctx.arc(a.length / 2 - 2, a.width / 2 - 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Lightbar
    if (this.siren) {
      const on = Math.floor(this.flash) % 2 === 0;
      ctx.fillStyle = on ? "#4da3ff" : "#e53935";
      ctx.fillRect(-8, -a.width / 2 - 6, 8, 5);
      ctx.fillStyle = on ? "#e53935" : "#4da3ff";
      ctx.fillRect(0, -a.width / 2 - 6, 8, 5);
      // glow
      ctx.fillStyle = on ? "rgba(77,163,255,0.35)" : "rgba(229,57,53,0.35)";
      ctx.beginPath();
      ctx.arc(0, -a.width / 2 - 4, 18, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#222";
      ctx.fillRect(-8, -a.width / 2 - 5, 16, 4);
    }

    // Wheels
    ctx.fillStyle = "#222";
    ctx.fillRect(-a.length * 0.28, -a.width / 2 - 3, 10, 4);
    ctx.fillRect(-a.length * 0.28, a.width / 2 - 1, 10, 4);
    ctx.fillRect(a.length * 0.12, -a.width / 2 - 3, 10, 4);
    ctx.fillRect(a.length * 0.12, a.width / 2 - 1, 10, 4);

    ctx.restore();
  }

  drawNavArrow() {
    if (!this.target || this.arrived) return;
    const a = this.ambulance;
    const dx = this.target.x - a.x;
    const dy = this.target.y - a.y;
    // Direction in screen space (chase cam)
    const ang = Math.atan2(dy, dx) - a.angle - Math.PI / 2;
    const dist = Math.hypot(dx, dy);
    const ax = this.viewW / 2;
    const ay = this.viewH * 0.62 - 70;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ax + Math.sin(ang) * 50, ay - Math.cos(ang) * 8);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = this.phase === "to_hospital" ? "#e53935" : "#ffd400";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 10);
    ctx.lineTo(0, 4);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(6,42,88,0.85)";
    ctx.beginPath();
    ctx.roundRect(this.viewW / 2 - 36, 92, 72, 20, 8);
    ctx.fill();
    ctx.fillStyle = "#ffd400";
    ctx.font = "800 11px Exo 2, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${(dist / 40).toFixed(1)} km`, this.viewW / 2, 106);
  }

  drawMinimap() {
    if (!this.minimapCtx || !this.map) return;
    const ctx = this.minimapCtx;
    const map = this.map;
    const size = 84;
    const scale = size / map.size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#5cb85c";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const cell = map.layout[y][x];
        if (cell === 0) continue;
        ctx.fillStyle = cell === 1 ? "#4a5562" : "#c9d6e3";
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }
    // hospital / station
    ctx.fillStyle = "#e53935";
    ctx.fillRect(map.hospital.x * scale - 1, map.hospital.y * scale - 1, 3, 3);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(map.station.x * scale - 1, map.station.y * scale - 1, 3, 3);
    // target
    if (this.target) {
      ctx.fillStyle = "#ffd400";
      ctx.beginPath();
      ctx.arc(
        (this.target.x / map.tile) * scale,
        (this.target.y / map.tile) * scale,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    // player
    const a = this.ambulance;
    const px = (a.x / map.tile) * scale;
    const py = (a.y / map.tile) * scale;
    ctx.fillStyle = "#ffd400";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function shadeColor(hex, pct) {
  const n = hex.replace("#", "");
  const num = parseInt(n, 16);
  let r = (num >> 16) + pct;
  let g = ((num >> 8) & 0xff) + pct;
  let b = (num & 0xff) + pct;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

/* Map preview for mission cards */
function drawMapPreview(canvas, map) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 140;
  const h = canvas.clientHeight || 118;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(w / map.size, h / map.size);
  // sky strip
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  sky.addColorStop(0, "#6ec8ff");
  sky.addColorStop(1, "#5cb85c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#5cb85c";
  ctx.fillRect(0, h * 0.25, w, h);
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const cell = map.layout[y][x];
      if (cell === 0) continue;
      ctx.fillStyle = cell === 1 ? "#4a5562" : "#dfe7ef";
      ctx.fillRect(x * scale, y * scale * 0.85 + h * 0.12, scale + 0.5, scale * 0.85 + 0.5);
    }
  }
  ctx.fillStyle = "#e53935";
  ctx.fillRect(map.hospital.x * scale, map.hospital.y * scale * 0.85 + h * 0.12, 3, 3);
  // mini ambulance icon
  ctx.fillStyle = "#ffd400";
  ctx.fillRect(map.station.x * scale - 1, map.station.y * scale * 0.85 + h * 0.12, 5, 3);
}

/* Arcade title screen — bright city + hero ambulance */
function startHeroAnimation(canvas) {
  const ctx = canvas.getContext("2d");
  let raf;
  const cars = [];
  for (let i = 0; i < 7; i++) {
    cars.push({
      x: Math.random() * 400,
      lane: i,
      speed: 40 + Math.random() * 60,
      color: ["#e74c3c", "#3498db", "#2ecc71", "#ecf0f1", "#9b59b6", "#e67e22"][i % 6],
    });
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.parentElement.clientWidth;
    const h = canvas.parentElement.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._w = w;
    canvas._h = h;
  }
  resize();
  window.addEventListener("resize", resize);

  let last = performance.now();
  let flash = 0;
  let ambX = 0;

  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    flash += dt;
    ambX += dt * 0.4;
    const w = canvas._w;
    const h = canvas._h;

    // Bright sky
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, "#5ec0ff");
    sky.addColorStop(0.6, "#8ed4ff");
    sky.addColorStop(1, "#6ec070");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Sun
    ctx.fillStyle = "rgba(255, 240, 150, 0.9)";
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.14, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 240, 150, 0.25)";
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.14, 48, 0, Math.PI * 2);
    ctx.fill();

    // City skyline blocks
    for (let i = 0; i < 14; i++) {
      const bx = i * (w / 12) - 10;
      const bh = 50 + ((i * 37) % 90);
      const base = h * 0.42;
      ctx.fillStyle = i % 3 === 0 ? "#dfe8f2" : i % 3 === 1 ? "#f0dcc8" : "#c8dce8";
      ctx.fillRect(bx, base - bh, w / 14, bh);
      ctx.fillStyle = "rgba(80,140,200,0.45)";
      for (let wy = 8; wy < bh - 8; wy += 12) {
        ctx.fillRect(bx + 6, base - bh + wy, 5, 5);
        ctx.fillRect(bx + 16, base - bh + wy, 5, 5);
      }
    }

    // Road
    const roadY = h * 0.55;
    ctx.fillStyle = "#4a5562";
    ctx.fillRect(0, roadY, w, h * 0.28);
    ctx.fillStyle = "#8a949e";
    ctx.fillRect(0, roadY, w, 8);
    ctx.fillRect(0, roadY + h * 0.26, w, 8);
    ctx.strokeStyle = "rgba(255,220,60,0.85)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.moveTo(0, roadY + h * 0.13);
    ctx.lineTo(w, roadY + h * 0.13);
    ctx.stroke();
    ctx.setLineDash([]);

    // Traffic
    for (const c of cars) {
      c.x += c.speed * dt;
      if (c.x > w + 50) c.x = -50;
      const cy = roadY + 18 + (c.lane % 3) * 28;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.roundRect(c.x, cy, 36, 16, 3);
      ctx.fill();
    }

    // Hero ambulance — large, bouncing slightly
    const ax = w * 0.5 + Math.sin(ambX) * 12;
    const ay = roadY + h * 0.08 + Math.sin(ambX * 2) * 3;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(1.55, 1.55);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(2, 14, 38, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffd400";
    ctx.beginPath();
    ctx.roundRect(-40, -16, 80, 32, 6);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(8, -14, 28, 28);

    // checks
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#e53935" : "#ffd400";
      ctx.fillRect(-36 + i * 7, -14, 7, 5);
      ctx.fillStyle = i % 2 === 0 ? "#ffd400" : "#e53935";
      ctx.fillRect(-36 + i * 7, 9, 7, 5);
    }

    ctx.fillStyle = "#e53935";
    ctx.fillRect(-18, -4, 18, 7);
    ctx.fillRect(-12, -10, 7, 18);

    ctx.fillStyle = "rgba(40,110,180,0.65)";
    ctx.fillRect(18, -12, 12, 24);

    const on = Math.floor(flash * 7) % 2 === 0;
    ctx.fillStyle = on ? "#4da3ff" : "#e53935";
    ctx.fillRect(-10, -22, 10, 6);
    ctx.fillStyle = on ? "#e53935" : "#4da3ff";
    ctx.fillRect(0, -22, 10, 6);
    ctx.fillStyle = on ? "rgba(77,163,255,0.3)" : "rgba(229,57,53,0.3)";
    ctx.beginPath();
    ctx.arc(0, -18, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // "911" style mission tag
    ctx.fillStyle = "rgba(229,57,53,0.9)";
    ctx.beginPath();
    ctx.roundRect(16, h * 0.22, 110, 28, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "900 13px Exo 2, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("EMERGENCY", 28, h * 0.22 + 19);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const radius = typeof r === "number" ? r : 4;
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
  };
}
