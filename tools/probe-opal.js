(() => {
  // is the emitter actually in front of the slot floor, and is it in the frame at all?
  const s = window.__stage;
  s.opal.geometry.computeBoundingBox();
  const bb = s.opal.geometry.boundingBox;
  const out = {
    opalVisible: s.opal.visible,
    opalInScene: !!s.opal.parent,
    opalMat: s.opal.material.type,
    emissive: s.opal.material.emissive.getHexString(),
    emissiveIntensity: s.opal.material.emissiveIntensity,
    bbox: { min: bb.min.toArray().map((v) => +v.toFixed(4)), max: bb.max.toArray().map((v) => +v.toFixed(4)) },
    renderOrder: s.opal.renderOrder,
    bodyRenderOrder: s.body.renderOrder,
    bodySide: s.body.material.side,
  };
  // paint the tube flat green for one capture: update() rewrites the emissive every
  // frame, so the colour has to live in a material it does not know about
  const M = s.opal.material.constructor;
  s.opal.material = new M({ color: 0x00ff00, emissive: 0x00ff00 });
  const draw = () => { s.update(0.016); requestAnimationFrame(draw); };
  draw();
  return out;
})()
