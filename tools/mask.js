(() => {
  // body-only mask. The scene rewrites scene.background from the mood every frame, so the
  // background colour is pinned by shadowing copy()/lerp() on that one Color instance —
  // the renderer still clears with a real Color, and the frame loop cannot repaint it.
  const s = window.__stage;
  const st = document.createElement('style');
  st.textContent = 'body>*:not(#stage),#stagePoster,.stage__scrim{display:none!important}';
  document.head.appendChild(st);
  const bg = s.scene.background;
  bg.set(0xff00ff);
  bg.copy = () => bg;
  bg.lerp = () => bg;
  s.renderer.setClearColor(0xff00ff, 1);
  s.scene.traverse((o) => { if (o.isMesh) o.visible = (o === s.body || o === s.opal); });
  // keep drawing: without a fresh frame the compositor can present a cleared buffer and
  // the mask reads as an empty page
  const draw = () => { s.update(0.016); requestAnimationFrame(draw); };
  draw();
  return 'mask ' + s.scene.background.getHexString();
})()
