(() => {
  // (a) how many pixels the aperture and emitter occupy at the shipped hero framing,
  // (b) then a body-only mask so p50/p90 can be read off named pixels.
  const s = window.__stage;
  const V3 = s.camera.position.constructor;
  s.camera.updateMatrixWorld(true);
  s.camera.updateProjectionMatrix();
  const size = new V3(0, 0, 0);
  s.renderer.getSize(size);
  const W = size.x, H = size.y;
  const ap = s.CHANNEL.aperture;
  const yMin = s.CHANNEL.yMin, yMax = s.CHANNEL.yMax;
  const slope = Math.atan2((yMax - yMin) / (s.CHANNEL.turns * Math.PI * 2), s.outerRadius(0.16));
  const across = Math.cos(slope);
  const camPos = s.camera.position.clone();

  const proj = (p) => {
    const v = p.clone().project(s.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, z: v.z };
  };

  const rows = [];
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = yMin + (yMax - yMin) * t;
    const a = s.CHANNEL.phase + t * s.CHANNEL.turns * Math.PI * 2;
    const r = s.outerRadius(y);
    const dir = new V3(Math.cos(a), 0, Math.sin(a));
    const n = new V3(dir.x * 1.24, 0, dir.z).normalize();
    const p = new V3(dir.x * r * 1.24, y, dir.z * r);
    const facing = n.dot(camPos.clone().sub(p).normalize());
    const pUp = new V3(dir.x * r * 1.24, y + 0.5 * ap * across, dir.z * r);
    const pDn = new V3(dir.x * r * 1.24, y - 0.5 * ap * across, dir.z * r);
    const su = proj(pUp), sd = proj(pDn), sc = proj(p);
    rows.push({
      t: +t.toFixed(3), y: +y.toFixed(4), facing: +facing.toFixed(3),
      cx: Math.round(sc.x), cy: Math.round(sc.y),
      aperturePx: +Math.hypot(su.x - sd.x, su.y - sd.y).toFixed(2),
    });
  }
  const facingRows = rows.filter((r) => r.facing > 0.55).sort((a, b) => b.facing - a.facing);
  const best = facingRows[0] || rows[0];
  const ba = s.CHANNEL.phase + best.t * s.CHANNEL.turns * Math.PI * 2;
  const bestPoint = new V3(Math.cos(ba) * s.outerRadius(best.y) * 1.24, best.y, Math.sin(ba) * s.outerRadius(best.y));
  const dist = camPos.distanceTo(bestPoint);
  const mmPerPx = (2 * dist * Math.tan((s.camera.fov * Math.PI / 180) / 2)) / H;
  const em = s.emitterProbe();
  const probe = {
    W, H, apertureM: ap,
    distanceToSlot: +dist.toFixed(4),
    mmPerPx: +mmPerPx.toFixed(3),
    bestFacing: best,
    aperturePxAtBest: best.aperturePx,
    emitterMm: +(em.visibleSection * 1000).toFixed(2),
    emitterPxAtBest: +(em.visibleSection / mmPerPx).toFixed(2),
    visibleAperturePx: facingRows.map((r) => r.aperturePx),
    rows: rows.filter((_, i) => i % 5 === 0),
  };

  const st = document.createElement('style');
  st.textContent = 'body>*:not(#stage),#stagePoster,.stage__scrim{display:none!important}';
  document.head.appendChild(st);
  // update() rewrites scene.background every frame, so pin this one Colour instance and
  // keep a frame loop running: without a fresh frame the compositor can present a cleared
  // buffer and the mask reads as an empty page.
  s.scene.traverse((o) => { if (o.isMesh) o.visible = (o === s.body || o === s.opal); });
  // a silhouette needs no light and no shadow pass: under SwiftShader the full frame takes
  // longer than the capture's settle window, and a screenshot can land between gl.clear()
  // and the last draw, which reads as an empty page.
  s.renderer.shadowMap.enabled = false;
  const T2 = s.body.material.constructor;
  const flat = new T2({ color: 0xffffff, side: 2 });
  s.body.material = flat;
  s.opal.visible = false;
  s.renderer.setClearColor(0xff00ff, 1);
  const bg = s.scene.background;
  bg.set(0xff00ff);
  bg.copy = () => bg;
  bg.lerp = () => bg;
  const draw = () => { s.update(0.016); bg.set(0xff00ff); requestAnimationFrame(draw); };
  draw();
  return probe;
})()
