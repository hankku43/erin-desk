// 多顯示器定位：每台顯示器各自記住「展開」「縮小」的位置；可固定在某台，或跟著目前位置
'use strict';

function dispSig(d) { return `${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}`; }

function centerIn(rect, d) {
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  const b = d.bounds;
  return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
}

// screen：Electron 的 screen（測試時可換成假的）；state：engine.state
function create({ screen, state, sizes, isMini, win }) {
  const { WIN_W, WIN_H, MINI_SIZE } = sizes;
  const all = () => screen.getAllDisplays();

  function displaysSorted() {
    return [...all()].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  }

  function displayLabel(d, i) {
    const primary = d.id === screen.getPrimaryDisplay().id;
    const name = d.label && d.label.trim() ? ` ${d.label.trim()}` : '';
    return `顯示器 ${i + 1}${primary ? '（主）' : ''}${name}　${d.size.width}×${d.size.height}`;
  }

  function pinnedDisplay() {
    const pin = state.ui && state.ui.display;
    if (!pin || pin === 'auto') return null;
    return all().find((d) => String(d.id) === String(pin.id)) || all().find((d) => dispSig(d) === pin.sig) || null;
  }

  // 該放哪台：固定的那台 → 視窗目前所在 → 上次所在 → 舊存檔位置 → 主顯示器
  function targetDisplay() {
    const pinned = pinnedDisplay();
    if (pinned) return pinned;
    const w = win && win();
    if (w && !w.isDestroyed()) return screen.getDisplayMatching(w.getBounds());
    const last = state.lastDisplay && all().find((d) => dispSig(d) === state.lastDisplay);
    if (last) return last;
    const legacy = isMini() ? state.miniWindow : state.window;
    if (legacy && typeof legacy.x === 'number') return screen.getDisplayNearestPoint({ x: legacy.x + 20, y: legacy.y + 20 });
    return screen.getPrimaryDisplay();
  }

  function savedPos(d, kind) {
    const per = (state.positions || {})[dispSig(d)];
    if (per && per[kind]) return per[kind];
    return kind === 'mini' ? state.miniWindow : state.window; // 舊版存檔只有一組位置
  }

  function boundsOn(d, kind) {
    const w = kind === 'mini' ? MINI_SIZE : WIN_W;
    const h = kind === 'mini' ? MINI_SIZE : WIN_H;
    const wa = d.workArea;
    const s = savedPos(d, kind);
    if (s && typeof s.x === 'number') {
      const x = kind === 'full' ? s.x - (WIN_W - (s.w || 540)) : s.x; // 視窗寬度改過時，維持右邊界
      const r = { x, y: s.y, width: w, height: h };
      if (centerIn(r, d)) {
        r.x = Math.min(Math.max(r.x, wa.x - w + 80), wa.x + wa.width - 80);
        r.y = Math.min(Math.max(r.y, wa.y - 60), wa.y + wa.height - h);
        return r;
      }
    }
    const pad = kind === 'mini' ? 6 : 10;
    return { x: wa.x + wa.width - w - pad, y: wa.y + wa.height - h - (kind === 'mini' ? pad : 0), width: w, height: h };
  }

  return { displaysSorted, displayLabel, pinnedDisplay, targetDisplay, savedPos, boundsOn };
}

module.exports = { create, dispSig, centerIn };
