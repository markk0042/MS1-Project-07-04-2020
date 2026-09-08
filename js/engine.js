/* PARA-LIFE — menu hero + map preview helpers (2D canvas) */

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
