(async () => {
  const THREE = await import('/vendor/three.module.js');
  const s = window.__stage;
  const pts = [[0.736, 0.867], [0.30, 0.80], [-0.60, 0.60], [0.0, 0.0]];
  const rc = new THREE.Raycaster();
  const out = [];
  for (const [x, y] of pts) {
    rc.setFromCamera(new THREE.Vector2(x, y), s.camera);
    const hits = rc.intersectObjects(s.scene.children, true).filter((h) => h.object.visible);
    out.push({
      ndc: [x, y],
      hits: hits.slice(0, 3).map((h) => ({
        g: h.object.geometry ? h.object.geometry.type : h.object.type,
        p: h.object.geometry && h.object.geometry.parameters ? h.object.geometry.parameters : null,
        d: +h.distance.toFixed(2),
        mat: h.object.material ? h.object.material.type : null,
        blend: h.object.material ? h.object.material.blending : null,
        pos: [h.object.position.x, h.object.position.y, h.object.position.z].map((v) => +v.toFixed(2)),
      })),
    });
  }
  return JSON.stringify(out);
})()
