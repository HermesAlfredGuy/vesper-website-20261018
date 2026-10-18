(() => {
  const s = window.__stage.scene;
  const out = [];
  s.traverse((o) => {
    if (!o.geometry || !o.geometry.parameters) return;
    const p = o.geometry.parameters;
    out.push([o.geometry.type, p.width, p.height, o.visible, [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2)), o.material.type, o.material.opacity, o.material.blending]);
    if (o.geometry.type === 'PlaneGeometry' && p.width === 10 && p.height === 5.4) o.visible = false;   // hide the wall
  });
  window.__stage.update(0.016);
  return JSON.stringify(out);
})()
