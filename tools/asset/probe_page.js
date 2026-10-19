(() => {
  const s = window.__stage;
  if (!s) return { error: 'no stage' };
  const b = s.bodyMat;
  return {
    loaded: !!(s.body.geometry && s.body.geometry.getAttribute('position')),
    verts: s.body.geometry.getAttribute('position').count,
    groove: [0.11, 0.17, 0.24].map((y) => s.grooveProbe(y)),
    emitter: s.emitterProbe(),
    rect: s.objectRect(),
    mat: {
      color: b.color.getHexString(), metalness: b.metalness, roughness: b.roughness,
      env: b.envMapIntensity, hasNormal: !!b.normalMap, hasAO: !!b.aoMap,
      hasRoughnessMap: !!b.roughnessMap, hasMap: !!b.map,
      normalScale: b.normalScale.x,
    },
    visible: s.group.children.map((o) => o.name + ':' + (o.isMesh ? o.geometry.getAttribute('position').count : o.type)),
  };
})()
