(() => {
  const s = window.__stage.scene;
  const out = [];
  s.traverse((o) => {
    if (o.isPointLight || o.isDirectionalLight || o.isHemisphereLight || o.isAmbientLight) {
      out.push([o.type, +o.intensity.toFixed(2), o.position ? [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(2)) : null]);
      o.intensity = 0;
    }
    if (o.material && o.material.uniforms && o.material.uniforms.uPower) o.material.uniforms.uPower.value = 0;
    if (o.isSprite) o.visible = false;
  });
  window.__stage.update(0.016);
  return JSON.stringify(out);
})()
