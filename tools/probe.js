(() => {
  const out = {};
  const canvas = document.querySelector('canvas');
  out.canvasBox = canvas ? { w: canvas.width, h: canvas.height, rect: canvas.getBoundingClientRect().toJSON() } : null;
  const s = window.__stage;
  out.hasStage = !!s;
  if (s) {
    out.renderer = { w: s.renderer.domElement.width, h: s.renderer.domElement.height, info: JSON.parse(JSON.stringify(s.renderer.info.render)), progs: s.renderer.info.programs ? s.renderer.info.programs.length : null };
    out.camera = { pos: s.camera.position.toArray().map(v => +v.toFixed(3)), fov: s.camera.fov, aspect: +s.camera.aspect.toFixed(3) };
    out.groupChildren = s.group.children.length;
    out.mood = +s.state.mood.toFixed(3);
    out.bodyColor = '#' + s.bodyMat.color.getHexString();
  }
  // read back the webgl canvas
  try {
    const tmp = document.createElement('canvas');
    tmp.width = 160; tmp.height = 100;
    const g = tmp.getContext('2d');
    g.drawImage(canvas, 0, 0, 160, 100);
    const d = g.getImageData(0, 0, 160, 100).data;
    let sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    const n = d.length / 4;
    out.canvasMean = sum.map(v => +(v / n).toFixed(1));
    const px = (x, y) => { const i = (y * 160 + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    out.samples = { topLeft: px(10, 10), centre: px(80, 50), lowerRight: px(130, 80) };
  } catch (e) { out.readbackErr = String(e); }
  out.webgl = (() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); return gl ? 'webgl2 ok' : 'no webgl2'; } catch (e) { return 'err ' + e; } })();
  return JSON.stringify(out, null, 1);
})()
