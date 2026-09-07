/* PARA-LIFE — City Ambulance–style top-down driving engine */

class DriveEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = null;
    this.ambulance = null;
    this.camera = { x: 0, y: 0 };
    this.traffic = [];
    this.markers = [];
    this.phase = "idle"; // to_call | to_hospital | done
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
      maxSpeed: 220,
      accel: 280,
      brake: 420,
      turnRate: 2.8,
      width: 22,
      length: 38,
    };
    this.target = {
      ...worldPos(map, targetTile.x, targetTile.y),
      tile: targetTile,
      radius: map.tile * 0.85,
    };
    this.spawnTraffic();
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
    const count = 14;
    for (let i = 0; i < count; i++) {
      const tile = randomRoadTile(this.map, [this.map.hospital, this.map.station], 3);
      const p = worldPos(this.map, tile.x, tile.y);
      const colors = ["#d9544f", "#4a90d9", "#f0c040", "#6bbf59", "#9b59b6", "#ecf0f1"];
      this.traffic.push({
        x: p.x,
        y: p.y,
        angle: Math.random() * Math.PI * 2,
        speed: 40 + Math.random() * 60,
        color: colors[i % colors.length],
        w: 16,
        l: 28,
        turnTimer: Math.random() * 2,
      });
    }
  }

  setInput(partial) {
    Object.assign(this.input, partial);
  }

  toggleSiren() {
    this.siren = !this.siren;
    return this.siren;
  }

  loop(ts) {
    if (!this.running) return;
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.update(dt);
    this.draw();
    this._raf = requestAnimationFrame((t) => this.loop(t));
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
      a.speed -= 80 * dt;
      if (a.speed < 0) a.speed = 0;
    }

    const boost = this.siren ? 1.18 : 1;
    a.speed = Math.min(a.speed, a.maxSpeed * boost);

    if (a.speed > 8) {
      a.angle += steer * a.turnRate * (a.speed / a.maxSpeed) * dt;
    }

    const prevX = a.x;
    const prevY = a.y;
    let nx = a.x + Math.cos(a.angle) * a.speed * dt;
    let ny = a.y + Math.sin(a.angle) * a.speed * dt;

    if (!this.collides(nx, a.y, a)) a.x = nx;
    else a.speed *= 0.4;
    if (!this.collides(a.x, ny, a)) a.y = ny;
    else a.speed *= 0.4;

    this.distanceDriven += Math.hypot(a.x - prevX, a.y - prevY) / 40;

    this.camera.x = a.x - this.viewW / 2;
    this.camera.y = a.y - this.viewH / 2;
    const worldW = this.map.size * this.map.tile;
    const worldH = this.map.size * this.map.tile;
    this.camera.x = Math.max(0, Math.min(this.camera.x, worldW - this.viewW));
    this.camera.y = Math.max(0, Math.min(this.camera.y, worldH - this.viewH));

    this.updateTraffic(dt);
    if (this.siren) this.flash += dt * 8;

    // Arrival
    if (!this.arrived && this.target) {
      const d = Math.hypot(a.x - this.target.x, a.y - this.target.y);
      if (d < this.target.radius && a.speed < 40) {
        this.arrived = true;
        a.speed = 0;
        if (this.onArrive) this.onArrive(this.phase);
      }
    }

    // Exhaust particles when accelerating
    if (throttle > 0.3 && a.speed > 20 && Math.random() < 0.4) {
      this.particles.push({
        x: a.x - Math.cos(a.angle) * 18,
        y: a.y - Math.sin(a.angle) * 18,
        life: 0.4,
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
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
    const half = a.width * 0.45;
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
        c.turnTimer = 1.5 + Math.random() * 2.5;
        // Prefer staying on roads — snap angle to cardinal if near intersection
        const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        c.angle = dirs[Math.floor(Math.random() * 4)];
      }
      let nx = c.x + Math.cos(c.angle) * c.speed * dt;
      let ny = c.y + Math.sin(c.angle) * c.speed * dt;
      const tx = Math.floor(nx / map.tile);
      const ty = Math.floor(ny / map.tile);
      if (
        tx < 0 ||
        ty < 0 ||
        tx >= map.size ||
        ty >= map.size ||
        map.layout[ty][tx] !== 1
      ) {
        c.angle += Math.PI / 2;
        continue;
      }
      // Yield to siren ambulance
      if (this.siren) {
        const d = Math.hypot(nx - this.ambulance.x, ny - this.ambulance.y);
        if (d < 80) c.speed = Math.max(10, c.speed - 80 * dt);
      }
      c.x = nx;
      c.y = ny;
    }
  }

  draw() {
    const ctx = this.ctx;
    const map = this.map;
    const t = map.tile;
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // Atmosphere gradient sky wash
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, "#7eb8d4");
    g.addColorStop(1, map.palette.grass);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const startTX = Math.max(0, Math.floor(this.camera.x / t) - 1);
    const startTY = Math.max(0, Math.floor(this.camera.y / t) - 1);
    const endTX = Math.min(map.size, Math.ceil((this.camera.x + this.viewW) / t) + 1);
    const endTY = Math.min(map.size, Math.ceil((this.camera.y + this.viewH) / t) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
      for (let tx = startTX; tx < endTX; tx++) {
        const cell = map.layout[ty][tx];
        const sx = tx * t - this.camera.x;
        const sy = ty * t - this.camera.y;
        if (cell === 0) {
          ctx.fillStyle = map.palette.grass;
          ctx.fillRect(sx, sy, t + 0.5, t + 0.5);
          // grass speckles
          if (((tx * 13 + ty * 7) % 5) === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.05)";
            ctx.fillRect(sx + 8, sy + 10, 4, 4);
          }
        } else if (cell === 1) {
          ctx.fillStyle = map.palette.road;
          ctx.fillRect(sx, sy, t + 0.5, t + 0.5);
          // lane markings
          ctx.strokeStyle = "rgba(255,220,80,0.55)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 8]);
          const up = ty > 0 && map.layout[ty - 1][tx] === 1;
          const down = ty < map.size - 1 && map.layout[ty + 1][tx] === 1;
          const left = tx > 0 && map.layout[ty][tx - 1] === 1;
          const right = tx < map.size - 1 && map.layout[ty][tx + 1] === 1;
          ctx.beginPath();
          if (up || down) {
            ctx.moveTo(sx + t / 2, sy);
            ctx.lineTo(sx + t / 2, sy + t);
          }
          if (left || right) {
            ctx.moveTo(sx, sy + t / 2);
            ctx.lineTo(sx + t, sy + t / 2);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (cell === 2) {
          // building block with roof accent
          ctx.fillStyle = map.palette.building;
          ctx.fillRect(sx + 2, sy + 2, t - 4, t - 4);
          ctx.fillStyle = map.palette.accent;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(sx + 2, sy + 2, t - 4, 6);
          ctx.globalAlpha = 1;
          // windows
          ctx.fillStyle = "rgba(255, 230, 150, 0.35)";
          ctx.fillRect(sx + 8, sy + 12, 6, 6);
          ctx.fillRect(sx + t - 16, sy + 12, 6, 6);
          ctx.fillRect(sx + 8, sy + t - 16, 6, 6);
        }
      }
    }

    // Hospital & station markers
    this.drawLandmark(map.hospital, "#e23b3b", "H");
    this.drawLandmark(map.station, "#1a9b8e", "S");

    // Call / destination pulse
    if (this.target) {
      const px = this.target.x - this.camera.x;
      const py = this.target.y - this.camera.y;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      ctx.beginPath();
      ctx.arc(px, py, 18 + pulse * 10, 0, Math.PI * 2);
      ctx.fillStyle =
        this.phase === "to_hospital"
          ? `rgba(226,59,59,${0.25 + pulse * 0.2})`
          : `rgba(240,180,41,${0.3 + pulse * 0.25})`;
      ctx.fill();
      ctx.strokeStyle = this.phase === "to_hospital" ? "#e23b3b" : "#f0b429";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.phase === "to_hospital" ? "ED" : "CALL", px, py + 5);
    }

    // Traffic
    for (const c of this.traffic) this.drawCar(c, c.color);

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = p.life * 2;
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(p.x - this.camera.x, p.y - this.camera.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawAmbulance();

    // Mini compass objective arrow
    this.drawObjectiveArrow();

    // Siren wash
    if (this.siren) {
      const on = Math.floor(this.flash) % 2 === 0;
      ctx.fillStyle = on ? "rgba(77,163,255,0.08)" : "rgba(226,59,59,0.08)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  drawLandmark(tile, color, letter) {
    const p = worldPos(this.map, tile.x, tile.y);
    const sx = p.x - this.camera.x;
    const sy = p.y - this.camera.y;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(sx - 16, sy - 16, 32, 32, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Barlow Condensed, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, sx, sy + 1);
  }

  drawCar(c, color) {
    const ctx = this.ctx;
    const x = c.x - this.camera.x;
    const y = c.y - this.camera.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-c.l / 2, -c.w / 2, c.l, c.w, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(50,80,120,0.5)";
    ctx.fillRect(c.l * 0.05, -c.w * 0.35, c.l * 0.25, c.w * 0.7);
    ctx.restore();
  }

  drawAmbulance() {
    const a = this.ambulance;
    const ctx = this.ctx;
    const x = a.x - this.camera.x;
    const y = a.y - this.camera.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a.angle);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(2, 4, a.length * 0.5, a.width * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // body — yellow ambulance
    ctx.fillStyle = "#f5c518";
    ctx.beginPath();
    ctx.roundRect(-a.length / 2, -a.width / 2, a.length, a.width, 5);
    ctx.fill();

    // cab
    ctx.fillStyle = "#f7f7f2";
    ctx.fillRect(a.length * 0.05, -a.width / 2 + 2, a.length * 0.35, a.width - 4);

    // green stripe (Irish/UK style)
    ctx.fillStyle = "#1a9b8e";
    ctx.fillRect(-a.length / 2 + 4, -3, a.length * 0.45, 6);

    // red cross
    ctx.fillStyle = "#e23b3b";
    ctx.fillRect(-a.length * 0.2, -2.5, 14, 5);
    ctx.fillRect(-a.length * 0.2 + 4.5, -7, 5, 14);

    // windshield
    ctx.fillStyle = "rgba(40,90,140,0.55)";
    ctx.fillRect(a.length * 0.22, -a.width / 2 + 3, 10, a.width - 6);

    // siren lights
    if (this.siren) {
      const on = Math.floor(this.flash) % 2 === 0;
      ctx.fillStyle = on ? "#4da3ff" : "#e23b3b";
      ctx.fillRect(-4, -a.width / 2 - 4, 8, 4);
      ctx.fillStyle = on ? "#e23b3b" : "#4da3ff";
      ctx.fillRect(-4, a.width / 2, 8, 4);
    } else {
      ctx.fillStyle = "#333";
      ctx.fillRect(-4, -a.width / 2 - 3, 8, 3);
    }

    ctx.restore();
  }

  drawObjectiveArrow() {
    if (!this.target || this.arrived) return;
    const ctx = this.ctx;
    const a = this.ambulance;
    const dx = this.target.x - a.x;
    const dy = this.target.y - a.y;
    const ang = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const radius = 70;
    const ax = this.viewW / 2 + Math.cos(ang) * radius;
    const ay = this.viewH / 2 + Math.sin(ang) * radius - 30;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = this.phase === "to_hospital" ? "#e23b3b" : "#f0b429";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(10,22,40,0.75)";
    ctx.font = "600 11px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(dist / 40 * 10) / 10} u`, this.viewW / 2, 86);
  }
}

/* Tiny map preview for map select cards */
function drawMapPreview(canvas, map) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 140;
  const h = canvas.clientHeight || 110;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scale = Math.min(w / map.size, h / map.size);
  ctx.fillStyle = map.palette.grass;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < map.size; y++) {
    for (let x = 0; x < map.size; x++) {
      const cell = map.layout[y][x];
      if (cell === 0) continue;
      ctx.fillStyle = cell === 1 ? map.palette.road : map.palette.building;
      ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
    }
  }
  // hospital blink
  ctx.fillStyle = "#e23b3b";
  ctx.fillRect(map.hospital.x * scale - 1, map.hospital.y * scale - 1, 3, 3);
  ctx.fillStyle = "#1a9b8e";
  ctx.fillRect(map.station.x * scale - 1, map.station.y * scale - 1, 3, 3);
}

/* Animated hero backdrop */
function startHeroAnimation(canvas) {
  const ctx = canvas.getContext("2d");
  let raf;
  const map = MAPS[0];
  const cars = [];
  for (let i = 0; i < 6; i++) {
    cars.push({
      x: Math.random() * 400,
      y: 120 + i * 36,
      speed: 30 + Math.random() * 50,
      color: ["#f5c518", "#4da3ff", "#e23b3b", "#ecf0f1", "#2ec4b6"][i % 5],
      ambulance: i === 0,
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
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    flash += dt;
    const w = canvas._w;
    const h = canvas._h;
    // city night-to-dusk wash
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#0d2137");
    bg.addColorStop(0.55, "#1a3a4a");
    bg.addColorStop(1, "#0a1628");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // faux road grid
    ctx.strokeStyle = "rgba(80,100,120,0.35)";
    ctx.lineWidth = 10;
    for (let y = 80; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(240,180,41,0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(80,100,120,0.35)";
      ctx.lineWidth = 10;
    }
    for (let x = 40; x < w; x += 70) {
      ctx.fillStyle = "rgba(90,110,130,0.45)";
      const bh = 40 + ((x * 13) % 90);
      ctx.fillRect(x, h * 0.35 - bh, 36, bh);
      ctx.fillStyle = "rgba(255,220,120,0.15)";
      ctx.fillRect(x + 6, h * 0.35 - bh + 10, 8, 8);
      ctx.fillRect(x + 20, h * 0.35 - bh + 10, 8, 8);
    }

    for (const c of cars) {
      c.x += c.speed * dt;
      if (c.x > w + 40) c.x = -40;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.ambulance) {
        ctx.fillStyle = "#f5c518";
        ctx.beginPath();
        ctx.roundRect(-22, -10, 44, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#e23b3b";
        ctx.fillRect(-8, -3, 12, 6);
        ctx.fillRect(-3, -8, 6, 16);
        const on = Math.floor(flash * 6) % 2 === 0;
        ctx.fillStyle = on ? "#4da3ff" : "#e23b3b";
        ctx.fillRect(-4, -14, 8, 4);
        ctx.fillStyle = "rgba(77,163,255,0.12)";
        ctx.beginPath();
        ctx.arc(0, 0, 50 + Math.sin(flash * 8) * 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.roundRect(-16, -8, 32, 16, 3);
        ctx.fill();
      }
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

// polyfill roundRect if needed
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
