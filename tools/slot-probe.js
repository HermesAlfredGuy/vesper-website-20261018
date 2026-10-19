(() => {
  // how many pixels the aperture and the emitter actually occupy at the shipped hero
  // framing. Pure projection of the same numbers the mesh is built from — no guessing.
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
  const across = Math.cos(slope);         // the slot's width is mostly vertical on the surface
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
    // outward normal, with the group's 1.24 x scale
    const n = new V3(dir.x * 1.24, 0, dir.z).normalize();
    const p = new V3(dir.x * r * 1.24, y, dir.z * r);
    const toCam = camPos.clone().sub(p).normalize();
    const facing = n.dot(toCam);                       // 1 = slot square to the lens
    const pUp = new V3(dir.x * r * 1.24, y + 0.5 * ap * across, dir.z * r);
    const pDn = new V3(dir.x * r * 1.24, y - 0.5 * ap * across, dir.z * r);
    const su = proj(pUp), sd = proj(pDn), sc = proj(p);
    const px = Math.hypot(su.x - sd.x, su.y - sd.y);
    rows.push({
      t: +t.toFixed(3), y: +y.toFixed(4), facing: +facing.toFixed(3),
      cx: Math.round(sc.x), cy: Math.round(sc.y), aperturePx: +px.toFixed(2),
    });
  }
  const facingRows = rows.filter((r) => r.facing > 0.55).sort((a, b) => b.facing - a.facing);
  const best = facingRows[0] || rows[0];
  // distance from the lens to the slot at that height (the plane the aperture lies in)
  const bestPoint = new V3(
    Math.cos(s.CHANNEL.phase + best.t * s.CHANNEL.turns * Math.PI * 2) * s.outerRadius(best.y) * 1.24,
    best.y,
    Math.sin(s.CHANNEL.phase + best.t * s.CHANNEL.turns * Math.PI * 2) * s.outerRadius(best.y)
  );
  const dist = camPos.distanceTo(bestPoint);
  const mmPerPx = (2 * dist * Math.tan((s.camera.fov * Math.PI / 180) / 2)) / H;
  const em = s.emitterProbe();
  return {
    W, H, apertureM: ap,
    distanceToSlot: +dist.toFixed(4),
    metresPerPx: +mmPerPx.toFixed(5),
    bestFacing: best,
    aperturePxAtBest: best.aperturePx,
    emitterMm: +(em.visibleSection * 1000).toFixed(2),
    emitterPxAtBest: +(em.visibleSection / mmPerPx).toFixed(2),
    visibleAperturePx: rows.filter((r) => r.facing > 0.55).map((r) => r.aperturePx),
    rows: rows.filter((_, i) => i % 6 === 0),
  };
})()
