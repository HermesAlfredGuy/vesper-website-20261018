(() => {
  // turn the object: the spill is sampled from the helix, so it must move with it.
  // Snap rather than damp — 240 stepped updates is 240 full renders on a software GL.
  const s = window.__stage;
  s.state.orbit = 1.15;
  s.state.targetOrbit = 1.15;
  s.update(0.016);
  const draw = () => { s.update(0.016); s.state.orbit = 1.15; requestAnimationFrame(draw); };
  draw();
  return { orbit: +s.state.orbit.toFixed(3), group: +s.group.rotation.y.toFixed(3) };
})()
