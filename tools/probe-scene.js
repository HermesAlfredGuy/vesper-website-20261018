(() => {
  const s = window.__stage;
  const cam = s.camera;
  const out = [];
  const v = new (window.__stage.scene.constructor === Object ? Object : Object)();
  s.scene.traverse((o) => {
    if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return;
    const box = new (s.scene.children[0].constructor === Object ? Object : Object)();
    // project the object's own bounding box corners with three's Box3 via the mesh geometry
    let r = null;
    try {
      const g = o.geometry;
      if (g && g.computeBoundingBox) {
        g.computeBoundingBox();
        const bb = g.boundingBox;
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let i = 0; i < 8; i++) {
          const p = { x: (i & 1 ? bb.max.x : bb.min.x), y: (i & 2 ? bb.max.y : bb.min.y), z: (i & 4 ? bb.max.z : bb.min.z) };
          const world = { x: p.x, y: p.y, z: p.z };
          o.updateWorldMatrix(true, false);
          const m = o.matrixWorld.elements;
          const wx = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
          const wy = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
          const wz = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
          const pv = { x: wx, y: wy, z: wz };
          // manual projection
          const cam3 = cam;
          cam3.updateMatrixWorld();
          const e = cam3.matrixWorldInverse.elements;
          const cx = e[0] * pv.x + e[4] * pv.y + e[8] * pv.z + e[12];
          const cy = e[1] * pv.x + e[5] * pv.y + e[9] * pv.z + e[13];
          const cz = e[2] * pv.x + e[6] * pv.y + e[10] * pv.z + e[14];
          const f = 1 / Math.tan((cam3.fov * Math.PI / 180) / 2);
          const asp = cam3.aspect;
          const ndcx = (cx * f / asp) / -cz;
          const ndcy = (cy * f) / -cz;
          const sx = (ndcx * 0.5 + 0.5) * window.innerWidth;
          const sy = (-ndcy * 0.5 + 0.5) * window.innerHeight;
          if (sx < left) left = sx; if (sx > right) right = sx;
          if (sy < top) top = sy; if (sy > bottom) bottom = sy;
        }
        r = [Math.round(left), Math.round(top), Math.round(right), Math.round(bottom)];
      }
    } catch (err) { r = 'err ' + err.message; }
    out.push({
      type: o.type, geom: o.geometry ? o.geometry.type : null,
      mat: o.material ? o.material.type : null,
      blend: o.material && o.material.blending, op: o.material && o.material.opacity,
      pos: [o.position.x, o.position.y, o.position.z].map((n) => +n.toFixed(3)),
      scale: [o.scale.x, o.scale.y, o.scale.z].map((n) => +n.toFixed(3)),
      screen: r,
    });
  });
  return JSON.stringify(out, null, 1);
})()
