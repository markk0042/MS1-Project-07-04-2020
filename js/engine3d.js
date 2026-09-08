/* PARA-LIFE — 3D chase-cam engine (Ambulance Rescue Duty style) */

class DriveEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.map = null;
    this.ambulance = null;
    this.ambMesh = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.traffic = [];
    this.phase = "idle";
    this.target = null;
    this.targetMesh = null;
    this.siren = false;
    this.sirenMats = [];
    this.input = { steer: 0, throttle: 0, brake: false };
    this.lastTs = 0;
    this.running = false;
    this.arrived = false;
    this.onArrive = null;
    this.distanceDriven = 0;
    this.flash = 0;
    this.buildingGroup = null;
    this.minimap = document.getElementById("minimap");
    this.minimapCtx = this.minimap ? this.minimap.getContext("2d") : null;
    this._raf = null;
    this._resize = () => this.resize();
    this.worldScale = 1; // 1 unit = 1 tile meter-ish; tile size in 3D
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.viewW = w;
    this.viewH = h;
    if (this.renderer && this.camera) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer.setPixelRatio(dpr);
    }
    if (this.minimap) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    this.tile = 8; // 3D units per map tile

    const start = {
      x: (startTile.x + 0.5) * this.tile,
      z: (startTile.y + 0.5) * this.tile,
    };
    this.ambulance = {
      x: start.x,
      z: start.z,
      angle: 0,
      speed: 0,
      maxSpeed: 38,
      accel: 42,
      brake: 55,
      turnRate: 2.6,
      width: 1.8,
      length: 4.2,
    };
    this.target = {
      x: (targetTile.x + 0.5) * this.tile,
      z: (targetTile.y + 0.5) * this.tile,
      tile: targetTile,
      radius: this.tile * 0.95,
    };

    this.initThree();
    this.buildCity();
    this.buildAmbulance();
    this.buildTarget();
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
    const parent = this.canvas.parentElement;
    if (this.renderer) {
      try {
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
      } catch (_) {}
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    if (parent) {
      [...parent.querySelectorAll("canvas")].forEach((c) => {
        if (c !== this.canvas && c.id !== "minimap") c.remove();
      });
    }
    this.canvas.style.display = "";
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.ambMesh = null;
    this.traffic = [];
    this.sirenMats = [];
  }

  initThree() {
    // Hide 2D canvas; Three.js creates its own
    this.canvas.style.display = "none";
    const parent = this.canvas.parentElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6ec8ff);
    this.scene.fog = new THREE.Fog(0xa8dfff, 60, 180);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(0x6ec8ff);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    parent.insertBefore(this.renderer.domElement, this.canvas);

    // Lights — bright daytime
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff2cc, 0.95);
    sun.position.set(40, 80, 20);
    this.scene.add(sun);
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x5cb85c, 0.45);
    this.scene.add(hemiLight);
  }

  buildCity() {
    const map = this.map;
    const t = this.tile;
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x5cb85c });
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x4a5562 });
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x8a949e });
    const colors = [0xe8eef5, 0xf2d6c2, 0xd4e4f7, 0xf5e6c8, 0xcfe8d8, 0xf0cfcf, 0xe6d5f0, 0xdde3ea];

    // Big grass plane
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(map.size * t + 40, map.size * t + 40),
      groundMat
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((map.size * t) / 2, -0.05, (map.size * t) / 2);
    this.scene.add(ground);

    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const cell = map.layout[y][x];
        const px = (x + 0.5) * t;
        const pz = (y + 0.5) * t;
        if (cell === 1) {
          const road = new THREE.Mesh(
            new THREE.BoxGeometry(t * 0.95, 0.12, t * 0.95),
            roadMat
          );
          road.position.set(px, 0.06, pz);
          this.scene.add(road);

          // Center line dash
          const up = y > 0 && map.layout[y - 1][x] === 1;
          const down = y < map.size - 1 && map.layout[y + 1][x] === 1;
          const left = x > 0 && map.layout[y][x - 1] === 1;
          const right = x < map.size - 1 && map.layout[y][x + 1] === 1;
          if ((up || down) && !(left && right && up && down)) {
            const line = new THREE.Mesh(
              new THREE.BoxGeometry(0.25, 0.14, t * 0.35),
              new THREE.MeshBasicMaterial({ color: 0xffdc3c })
            );
            line.position.set(px, 0.13, pz);
            this.scene.add(line);
          } else if (left || right) {
            const line = new THREE.Mesh(
              new THREE.BoxGeometry(t * 0.35, 0.14, 0.25),
              new THREE.MeshBasicMaterial({ color: 0xffdc3c })
            );
            line.position.set(px, 0.13, pz);
            this.scene.add(line);
          }
        } else if (cell === 2) {
          const h = 4 + ((x * 7 + y * 13) % 14);
          const mat = new THREE.MeshLambertMaterial({
            color: colors[(x * 3 + y) % colors.length],
          });
          const b = new THREE.Mesh(new THREE.BoxGeometry(t * 0.78, h, t * 0.78), mat);
          b.position.set(px, h / 2, pz);
          this.scene.add(b);
          // Roof accent
          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(t * 0.82, 0.35, t * 0.82),
            new THREE.MeshLambertMaterial({
              color: (x + y) % 5 === 0 ? 0xe74c3c : 0x7f8c9a,
            })
          );
          roof.position.set(px, h + 0.15, pz);
          this.scene.add(roof);
        } else if (cell === 0 && (x * 19 + y * 11) % 8 === 0) {
          // Tree
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.28, 1.2, 6),
            new THREE.MeshLambertMaterial({ color: 0x6d4c2f })
          );
          trunk.position.set(px, 0.6, pz);
          this.scene.add(trunk);
          const leaves = new THREE.Mesh(
            new THREE.SphereGeometry(1.1, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0x2e8b3d })
          );
          leaves.position.set(px, 2.0, pz);
          this.scene.add(leaves);
        }
      }
    }

    // Hospital / station pads
    this.addLandmark(map.hospital, 0xe53935, "H");
    this.addLandmark(map.station, 0x2ecc71, "S");
  }

  addLandmark(tile, color, letter) {
    const t = this.tile;
    const px = (tile.x + 0.5) * t;
    const pz = (tile.y + 0.5) * t;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.3, 16),
      new THREE.MeshLambertMaterial({ color })
    );
    pad.position.set(px, 0.2, pz);
    this.scene.add(pad);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 3.2, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    post.position.set(px, 2.0, pz);
    this.scene.add(post);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.6, 1.6),
      new THREE.MeshLambertMaterial({ color })
    );
    cross.position.set(px, 2.2, pz);
    this.scene.add(cross);
  }

  buildAmbulance() {
    const g = new THREE.Group();
    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 1.4, 4.4),
      new THREE.MeshLambertMaterial({ color: 0xffd400 })
    );
    body.position.y = 1.0;
    g.add(body);
    // Cab
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.95, 1.1, 1.5),
      new THREE.MeshLambertMaterial({ color: 0xf5f7fa })
    );
    cab.position.set(0, 1.55, 1.35);
    g.add(cab);
    // Windows
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.7, 0.1),
      new THREE.MeshLambertMaterial({ color: 0x3a7ab8, transparent: true, opacity: 0.7 })
    );
    win.position.set(0, 1.7, 2.1);
    g.add(win);
    // Red cross
    const cx = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xe53935 })
    );
    cx.position.set(1.02, 1.2, -0.3);
    g.add(cx);
    const cx2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.35, 1.3),
      new THREE.MeshLambertMaterial({ color: 0xe53935 })
    );
    cx2.position.set(1.02, 1.2, -0.3);
    g.add(cx2);
    // Green stripe
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.25, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1a9b8e })
    );
    stripe.position.set(0, 0.95, -0.6);
    g.add(stripe);
    // Battenburg
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 0.45),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffd400 : 0xe53935 })
      );
      c.position.set(1.02, 0.7, -1.5 + i * 0.5);
      g.add(c);
    }
    // Lightbar
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    bar.position.set(0, 2.0, 0.2);
    g.add(bar);
    const lightL = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.28, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x4da3ff, emissive: 0x000000 })
    );
    lightL.position.set(-0.3, 2.02, 0.2);
    g.add(lightL);
    const lightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.28, 0.35),
      new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0x000000 })
    );
    lightR.position.set(0.3, 2.02, 0.2);
    g.add(lightR);
    this.sirenMats = [lightL.material, lightR.material];

    // Wheels
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]].forEach(([x, z]) => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 10), wheelMat);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(x, 0.4, z);
      g.add(wh);
    });

    this.ambMesh = g;
    this.scene.add(g);
  }

  buildTarget() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.18, 8, 24),
      new THREE.MeshBasicMaterial({
        color: this.phase === "to_hospital" ? 0xe53935 : 0xffd400,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2.2, 8),
      new THREE.MeshLambertMaterial({
        color: this.phase === "to_hospital" ? 0xe53935 : 0xffd400,
      })
    );
    pin.position.y = 2.4;
    g.add(pin);
    g.position.set(this.target.x, 0, this.target.z);
    this.targetMesh = g;
    this.scene.add(g);
  }

  spawnTraffic() {
    this.traffic = [];
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xecf0f1, 0xe67e22];
    for (let i = 0; i < 16; i++) {
      const tile = randomRoadTile(this.map, [this.map.hospital, this.map.station], 3);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.0, 3.2),
        new THREE.MeshLambertMaterial({ color: colors[i % colors.length] })
      );
      body.position.y = 0.7;
      const car = new THREE.Group();
      car.add(body);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.7, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x333333 })
      );
      cabin.position.set(0, 1.3, 0.3);
      car.add(cabin);
      car.position.set((tile.x + 0.5) * this.tile, 0, (tile.y + 0.5) * this.tile);
      this.scene.add(car);
      this.traffic.push({
        mesh: car,
        x: car.position.x,
        z: car.position.z,
        angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][i % 4],
        speed: 8 + Math.random() * 10,
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

  getSpeedKmh() {
    if (!this.ambulance) return 0;
    return Math.round(this.ambulance.speed * 4.2);
  }

  loop(ts) {
    if (!this.running) return;
    const dt = Math.min(0.033, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.update(dt);
    this.render();
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
    const circ = 327;
    arc.style.strokeDashoffset = String(circ * (1 - Math.min(1, kmh / 140)));
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
      a.speed -= 12 * dt;
      if (a.speed < 0) a.speed = 0;
    }

    const boost = this.siren ? 1.2 : 1;
    a.speed = Math.min(a.speed, a.maxSpeed * boost);

    if (a.speed > 1) {
      a.angle += steer * a.turnRate * (0.5 + 0.5 * (a.speed / a.maxSpeed)) * dt;
    }

    const prevX = a.x;
    const prevZ = a.z;
    // Forward is -Z in Three when angle 0 faces -Z... use cos/sin on XZ
    const nx = a.x + Math.sin(a.angle) * a.speed * dt;
    const nz = a.z + Math.cos(a.angle) * a.speed * dt;

    if (!this.collides(nx, a.z)) a.x = nx;
    else a.speed *= 0.3;
    if (!this.collides(a.x, nz)) a.z = nz;
    else a.speed *= 0.3;

    this.distanceDriven += Math.hypot(a.x - prevX, a.z - prevZ) / this.tile;

    if (this.ambMesh) {
      this.ambMesh.position.set(a.x, 0, a.z);
      this.ambMesh.rotation.y = a.angle;
    }

    // Chase camera — behind and above, looking at ambulance (Rescue Duty style)
    if (this.camera) {
      const back = 11;
      const height = 6.5;
      const cx = a.x - Math.sin(a.angle) * back;
      const cz = a.z - Math.cos(a.angle) * back;
      this.camera.position.lerp(
        new THREE.Vector3(cx, height, cz),
        Math.min(1, dt * 6)
      );
      this.camera.lookAt(a.x, 1.4, a.z);
    }

    this.updateTraffic(dt);

    if (this.targetMesh) {
      this.targetMesh.rotation.y += dt * 1.5;
      this.targetMesh.position.y = Math.sin(performance.now() / 300) * 0.15;
    }

    if (this.siren) {
      this.flash += dt * 10;
      const on = Math.floor(this.flash) % 2 === 0;
      if (this.sirenMats[0]) {
        this.sirenMats[0].emissive.setHex(on ? 0x4da3ff : 0x000000);
        this.sirenMats[0].color.setHex(on ? 0x4da3ff : 0x222222);
        this.sirenMats[1].emissive.setHex(on ? 0xe53935 : 0x000000);
        this.sirenMats[1].color.setHex(on ? 0xe53935 : 0x222222);
      }
    } else if (this.sirenMats[0]) {
      this.sirenMats[0].emissive.setHex(0x000000);
      this.sirenMats[1].emissive.setHex(0x000000);
    }

    if (!this.arrived && this.target) {
      const d = Math.hypot(a.x - this.target.x, a.z - this.target.z);
      if (d < this.target.radius && a.speed < 6) {
        this.arrived = true;
        a.speed = 0;
        if (this.onArrive) this.onArrive(this.phase);
      }
    }
  }

  collides(x, z) {
    const map = this.map;
    const t = this.tile;
    const tx = Math.floor(x / t);
    const ty = Math.floor(z / t);
    if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size) return true;
    // Check nearby corners for width
    const offsets = [
      [0.7, 0],
      [-0.7, 0],
      [0, 0.7],
      [0, -0.7],
    ];
    for (const [ox, oz] of offsets) {
      const cx = Math.floor((x + ox) / t);
      const cy = Math.floor((z + oz) / t);
      if (cx < 0 || cy < 0 || cx >= map.size || cy >= map.size) return true;
      if (map.layout[cy][cx] === 2) return true;
    }
    return map.layout[ty][tx] === 2;
  }

  updateTraffic(dt) {
    const map = this.map;
    const t = this.tile;
    for (const c of this.traffic) {
      c.turnTimer -= dt;
      if (c.turnTimer <= 0) {
        c.turnTimer = 1.5 + Math.random() * 2;
        c.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(Math.random() * 4)];
        c.speed = 8 + Math.random() * 10;
      }
      let nx = c.x + Math.sin(c.angle) * c.speed * dt;
      let nz = c.z + Math.cos(c.angle) * c.speed * dt;
      const tx = Math.floor(nx / t);
      const ty = Math.floor(nz / t);
      if (tx < 0 || ty < 0 || tx >= map.size || ty >= map.size || map.layout[ty][tx] !== 1) {
        c.angle += Math.PI / 2;
        continue;
      }
      if (this.siren) {
        const d = Math.hypot(nx - this.ambulance.x, nz - this.ambulance.z);
        if (d < 14) c.speed = Math.max(2, c.speed - 15 * dt);
      }
      c.x = nx;
      c.z = nz;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.angle;
    }
  }

  render() {
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
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
        ctx.fillStyle = cell === 1 ? "#4a5562" : "#dfe7ef";
        ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
      }
    }
    ctx.fillStyle = "#e53935";
    ctx.fillRect(map.hospital.x * scale - 1, map.hospital.y * scale - 1, 3, 3);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(map.station.x * scale - 1, map.station.y * scale - 1, 3, 3);
    if (this.target) {
      ctx.fillStyle = "#ffd400";
      ctx.beginPath();
      ctx.arc(
        (this.target.x / this.tile) * scale,
        (this.target.z / this.tile) * scale,
        2.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    const a = this.ambulance;
    ctx.fillStyle = "#ffd400";
    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.arc((a.x / this.tile) * scale, (a.z / this.tile) * scale, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
