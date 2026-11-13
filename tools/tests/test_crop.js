// Cropping pictures (images.js): the frame while dragging, aspect ratios, and where the
// note lands after a crop. Expected values in brackets.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = process.argv[2], out = [];
try {
  const w = { MM: { state: {} } };
  const ctx = vm.createContext({ window: w, console, document: {}, Math });
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'images.js'), 'utf8'), ctx, { filename: 'images.js' });
  const IMG = w.MM.images;
  const f = (r) => [r.x, r.y, r.w, r.h].map((v) => Math.round(v * 10) / 10).join(' ');
  const W = 400, H = 300, full = { x: 0, y: 0, w: W, h: H };

  // ---- free frame ----
  out.push('move inside      | ' + f(IMG.cropBox({ x: 50, y: 50, w: 100, h: 100 }, 'move', 30, -20, W, H, 0, 10)) + ' (80 30 100 100)');
  out.push('move past edge   | ' + f(IMG.cropBox({ x: 50, y: 50, w: 100, h: 100 }, 'move', 500, -500, W, H, 0, 10)) + ' (300 0 100 100)');
  out.push('corner se in     | ' + f(IMG.cropBox(full, 'se', -100, -50, W, H, 0, 10)) + ' (0 0 300 250)');
  out.push('corner nw in     | ' + f(IMG.cropBox(full, 'nw', 40, 30, W, H, 0, 10)) + ' (40 30 360 270)');
  out.push('edge e past left | ' + f(IMG.cropBox(full, 'e', -1000, 0, W, H, 0, 10)) + ' (0 0 10 300 - smallest width)');
  out.push('edge n outside   | ' + f(IMG.cropBox({ x: 0, y: 50, w: W, h: 100 }, 'n', 0, -200, W, H, 0, 10)) + ' (0 0 400 150)');
  out.push('new to lower rt  | ' + f(IMG.cropBox({ x: 100, y: 100, w: 0, h: 0 }, 'new', 50, 40, W, H, 0, 10)) + ' (100 100 50 40)');
  out.push('new to upper lt  | ' + f(IMG.cropBox({ x: 100, y: 100, w: 0, h: 0 }, 'new', -150, -40, W, H, 0, 10)) + ' (0 60 100 40)');

  // ---- fixed aspect ratio ----
  out.push('1:1 corner se    | ' + f(IMG.cropBox(full, 'se', -100, -10, W, H, 1, 10)) + ' (0 0 300 300 - wide wins, height limits)');
  out.push('1:1 edge e       | ' + f(IMG.cropBox({ x: 0, y: 100, w: 100, h: 100 }, 'e', 50, 0, W, H, 1, 10)) + ' (0 75 150 150 - grows around the middle)');
  out.push('16:9 new         | ' + f(IMG.cropBox({ x: 0, y: 0, w: 0, h: 0 }, 'new', 160, 10, W, H, 16 / 9, 10)) + ' (0 0 160 90)');
  out.push('ratio frame 1:1  | ' + f(IMG.ratioFrame(full, W, H, 1)) + ' (50 0 300 300)');
  out.push('ratio frame 16:9 | ' + f(IMG.ratioFrame(full, W, H, 16 / 9)) + ' (0 37.5 400 225)');
  out.push('ratio 3:4 at lt  | ' + f(IMG.ratioFrame({ x: 0, y: 0, w: 10, h: 10 }, W, H, 3 / 4)) + ' (0 0 225 300)');

  // ---- the note after the crop: same scale, the kept part stays in place ----
  const n = { x: 1000, y: 500, w: 200, h: 150 }; // picture 400 x 300 shown at half size
  out.push('note right half  | ' + f(IMG.croppedFrame(n, { x: 200, y: 0, w: 200, h: 300 }, W, H)) + ' (1100 500 100 150)');
  out.push('note centre      | ' + f(IMG.croppedFrame(n, { x: 100, y: 75, w: 200, h: 150 }, W, H)) + ' (1050 538 100 75)');
  // turned by 180 degrees: the right half of the picture is shown on the left
  const r = Object.assign({ rotate: 180 }, n);
  out.push('rotated 180      | ' + f(IMG.croppedFrame(r, { x: 200, y: 0, w: 200, h: 300 }, W, H)) + ' (1000 500 100 150)');
} catch (e) { out.push('ERROR ' + e.stack); }
fs.writeFileSync(process.argv[3], out.join('\n'));
