(() => {
  const s = window.__stage.scene;
  const found = [];
  s.traverse((o) => {
    if (o.material && o.material.uniforms && o.material.uniforms.uPower) {
      found.push({
        geom: o.geometry.type,
        p: o.geometry.parameters,
        pos: [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(3)),
        power: +o.material.uniforms.uPower.value.toFixed(3),
      });
      o.material.uniforms.uPower.value = 0;
    }
  });
  window.__stage.update(0.016);
  return JSON.stringify(found);
})()
