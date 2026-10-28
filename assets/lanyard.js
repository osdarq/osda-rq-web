// A small spring/pendulum model for the badge, with constrained cloth strands.
// All dimensions are in the scene's 440 × 580 coordinate system.
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function createLanyardSimulation({
  reduced = false,
  intro = true,
} = {}) {
  const width = 440,
    height = 580,
    cardWidth = 270,
    cardHeight = 382;
  const anchors = [
    { x: 182, y: 10 },
    { x: 258, y: 10 },
  ];
  const length = 134,
    spring = 140,
    gravity = 1850;
  let low = 10,
    high = 210;
  for (let i = 0; i < 50; i++) {
    const y = (low + high) / 2,
      distance = Math.hypot(38, y - 10);
    const force =
      (2 * spring * Math.max(0, distance - length) * (y - 10)) / distance;
    if (force > gravity) high = y;
    else low = y;
  }
  const rest = { x: width / 2, y: (low + high) / 2 };
  const body = { x: rest.x, y: rest.y, vx: 0, vy: 0, angle: 0, omega: 0 };
  let grab = null,
    quiet = 0,
    elapsed = 0;
  const ropes = anchors.map((anchor) =>
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8,
        x = anchor.x + (body.x - anchor.x) * t,
        y = anchor.y + (body.y - anchor.y) * t;
      return { x, y, px: x, py: y };
    }),
  );
  function fit() {
    const c = Math.cos(body.angle),
      s = Math.sin(body.angle);
    const corners = [
      [-cardWidth / 2, 0],
      [cardWidth / 2, 0],
      [-cardWidth / 2, cardHeight],
      [cardWidth / 2, cardHeight],
    ].map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }));
    const minX = Math.min(...corners.map((p) => p.x)),
      maxX = Math.max(...corners.map((p) => p.x));
    const minY = Math.min(...corners.map((p) => p.y)),
      maxY = Math.max(...corners.map((p) => p.y));
    const x = clamp(body.x, 8 - minX, width - 8 - maxX);
    const y = clamp(body.y, 40 - minY, height - 14 - maxY);
    if (x !== body.x) body.vx *= -0.12;
    if (y !== body.y) body.vy *= -0.12;
    body.x = x;
    body.y = y;
  }
  function syncRopes(dt, reset = false) {
    for (let side = 0; side < ropes.length; side++) {
      const nodes = ropes[side],
        anchor = anchors[side];
      const segment =
        Math.max(length, Math.hypot(body.x - anchor.x, body.y - anchor.y)) / 8;
      if (reset) {
        nodes.forEach((node, i) => {
          node.x = node.px = anchor.x + ((body.x - anchor.x) * i) / 8;
          node.y = node.py = anchor.y + ((body.y - anchor.y) * i) / 8;
        });
      } else {
        for (let i = 1; i < nodes.length - 1; i++) {
          const node = nodes[i],
            dx = (node.x - node.px) * 0.965,
            dy = (node.y - node.py) * 0.965;
          node.px = node.x;
          node.py = node.y;
          node.x += dx;
          node.y += dy + gravity * dt * dt;
        }
      }
      for (let iteration = 0; iteration < 10; iteration++) {
        nodes[0].x = anchor.x;
        nodes[0].y = anchor.y;
        nodes[8].x = body.x;
        nodes[8].y = body.y;
        for (let i = 0; i < 8; i++) {
          const a = nodes[i],
            b = nodes[i + 1],
            dx = b.x - a.x,
            dy = b.y - a.y;
          const distance = Math.hypot(dx, dy) || 1;
          const difference = (distance - segment) / distance;
          const wa = i === 0 ? 0 : 1,
            wb = i === 7 ? 0 : 1;
          const weight = wa + wb;
          a.x += (dx * difference * wa) / weight;
          a.y += (dy * difference * wa) / weight;
          b.x -= (dx * difference * wb) / weight;
          b.y -= (dy * difference * wb) / weight;
        }
      }
      nodes[0].x = anchor.x;
      nodes[0].y = anchor.y;
      nodes[8].x = body.x;
      nodes[8].y = body.y;
    }
  }
  function reset(animate = false) {
    grab = null;
    quiet = 0;
    elapsed = 0;
    Object.assign(body, {
      x: rest.x + (animate && !reduced ? -20 : 0),
      y: rest.y - (animate && !reduced ? 34 : 0),
      vx: animate && !reduced ? 30 : 0,
      vy: 0,
      angle: animate && !reduced ? -0.09 : 0,
      omega: 0,
    });
    syncRopes(0, true);
  }
  function move(point) {
    if (!grab) return;
    grab.point = {
      x: clamp(point.x, -60, width + 60),
      y: clamp(point.y, -60, height + 60),
    };
    if (reduced) {
      body.x = grab.point.x - grab.offset.x;
      body.y = grab.point.y - grab.offset.y;
      body.angle = 0;
      fit();
      syncRopes(0, true);
    }
  }
  function begin(point) {
    const c = Math.cos(body.angle),
      s = Math.sin(body.angle),
      dx = point.x - body.x,
      dy = point.y - body.y;
    grab = {
      point: { ...point },
      offset: { x: dx * c + dy * s, y: -dx * s + dy * c },
    };
    quiet = 0;
  }
  function release(cancelled = false) {
    grab = null;
    quiet = 0;
    if (reduced) reset();
    else if (cancelled) {
      body.vx *= 0.25;
      body.vy *= 0.25;
      body.omega *= 0.25;
    }
  }
  function step(dt = 1 / 120) {
    if (reduced) return;
    dt = clamp(dt, 0, 1 / 120);
    elapsed += dt;
    let ax = -body.vx * 3.3,
      ay = gravity - body.vy * 3.3;
    for (const anchor of anchors) {
      const dx = body.x - anchor.x,
        dy = body.y - anchor.y,
        distance = Math.hypot(dx, dy) || 1;
      if (distance > length) {
        const radial = (body.vx * dx + body.vy * dy) / distance;
        const force = spring * (distance - length) + radial * 3;
        ax -= (dx / distance) * force;
        ay -= (dy / distance) * force;
      }
    }
    if (grab) {
      const c = Math.cos(body.angle),
        s = Math.sin(body.angle);
      const ox = grab.offset.x * c - grab.offset.y * s,
        oy = grab.offset.x * s + grab.offset.y * c;
      ax += (grab.point.x - body.x - ox) * 850 - body.vx * 27;
      ay += (grab.point.y - body.y - oy) * 850 - body.vy * 27;
    }
    body.vx = clamp(body.vx + ax * dt, -1200, 1200);
    body.vy = clamp(body.vy + ay * dt, -1200, 1200);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    const target = clamp(
      body.vx / 1200 + (grab ? (grab.offset.x / cardWidth) * 0.32 : 0),
      -0.23,
      0.23,
    );
    body.omega += ((target - body.angle) * 42 - body.omega * 5.5) * dt;
    body.angle = clamp(body.angle + body.omega * dt, -0.28, 0.28);
    fit();
    syncRopes(dt);
    const calm =
      !grab &&
      Math.hypot(body.vx, body.vy) < 1.1 &&
      Math.abs(body.omega) < 0.008 &&
      Math.hypot(body.x - rest.x, body.y - rest.y) < 0.7;
    quiet = calm ? quiet + dt : 0;
    if (quiet > 0.45) {
      Object.assign(body, {
        x: rest.x,
        y: rest.y,
        vx: 0,
        vy: 0,
        angle: 0,
        omega: 0,
      });
      syncRopes(0, true);
    }
  }
  reset(intro);
  return {
    step,
    begin,
    move,
    release,
    reset,
    kick(dx, dy) {
      if (reduced) {
        reset();
        return;
      }
      body.vx += dx * 7;
      body.vy += dy * 7;
      quiet = 0;
    },
    setReduced(value) {
      reduced = Boolean(value);
      reset();
    },
    sample() {
      return {
        ...body,
        ropes: ropes.map((nodes) => nodes.map(({ x, y }) => ({ x, y }))),
        rest: { ...rest },
        width,
        height,
        cardWidth,
        cardHeight,
        dragging: Boolean(grab),
        reduced,
        settled: reduced || quiet > 0.45,
        elapsed,
      };
    },
  };
}

export function lanyardPath(points, offset = 0) {
  const nodes = points.map((point, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      size = Math.hypot(dx, dy) || 1;
    return {
      x: point.x - (dy / size) * offset,
      y: point.y + (dx / size) * offset,
    };
  });
  const n = (value) => value.toFixed(2);
  let path = `M${n(nodes[0].x)} ${n(nodes[0].y)}`;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[Math.max(0, i - 1)],
      b = nodes[i],
      c = nodes[i + 1],
      d = nodes[Math.min(nodes.length - 1, i + 2)];
    path += `C${n(b.x + (c.x - a.x) / 6)} ${n(b.y + (c.y - a.y) / 6)} ${n(c.x - (d.x - b.x) / 6)} ${n(c.y - (d.y - b.y) / 6)} ${n(c.x)} ${n(c.y)}`;
  }
  return path;
}

export function mountLanyard(root, win = window, doc = document) {
  if (!root || root.dataset.lanyardReady || !win.requestAnimationFrame)
    return null;
  const body = root.querySelector("[data-lanyard-body]"),
    plane = root.querySelector("[data-lanyard-plane]");
  if (!body || !plane) return null;
  const resetButton = root.parentElement.querySelector("[data-lanyard-reset]");
  const shadow = root.querySelector("[data-lanyard-shadow]");
  const preference = win.matchMedia?.("(prefers-reduced-motion: reduce)");
  const simulation = createLanyardSimulation({ reduced: preference?.matches });
  const listeners = [];
  let frame = 0,
    last = 0,
    accumulator = 0,
    pointer = null,
    ropeGrab = null,
    visible = true,
    destroyed = false;
  const listen = (node, type, callback, options) => {
    node?.addEventListener?.(type, callback, options);
    listeners.push(() => node?.removeEventListener?.(type, callback, options));
  };
  function paint() {
    const state = simulation.sample(),
      degrees = (state.angle * 180) / Math.PI;
    body.style.transform = `translate3d(${(state.x - state.cardWidth / 2).toFixed(2)}px,${state.y.toFixed(2)}px,0) rotate(${degrees.toFixed(2)}deg)`;
    body.style.setProperty(
      "--badge-yaw",
      (state.reduced ? 0 : clamp(state.vx / 90, -5, 5)).toFixed(2) + "deg",
    );
    body.style.setProperty(
      "--badge-pitch",
      (state.reduced ? 0 : clamp(state.vy / 140, -3, 3)).toFixed(2) + "deg",
    );
    body.style.setProperty(
      "--badge-glow-x",
      (50 + degrees * 1.5).toFixed(1) + "%",
    );
    for (const [i, side] of ["left", "right"].entries()) {
      root
        .querySelector(`[data-lanyard-curve="${side}"]`)
        .setAttribute("d", lanyardPath(state.ropes[i]));
      root
        .querySelector(`[data-lanyard-stitch="${side}-a"]`)
        .setAttribute("d", lanyardPath(state.ropes[i], -8));
      root
        .querySelector(`[data-lanyard-stitch="${side}-b"]`)
        .setAttribute("d", lanyardPath(state.ropes[i], 8));
    }
    if (shadow) {
      shadow.style.transform = `translateX(${(state.x - 220).toFixed(2)}px) scale(${clamp(1 + (state.y - state.rest.y) / 180, 0.7, 1.3).toFixed(3)})`;
      shadow.style.opacity = clamp(
        0.25 + (state.y - state.rest.y) / 180,
        0.12,
        0.45,
      ).toFixed(3);
    }
    root.classList.toggle("is-dragging", state.dragging);
  }
  function allowed() {
    return !destroyed && visible && !doc.hidden;
  }
  function animate(time) {
    frame = 0;
    if (!allowed()) {
      last = 0;
      return;
    }
    accumulator += last
      ? Math.min(0.05, Math.max(0, (time - last) / 1000))
      : 1 / 60;
    last = time;
    for (let i = 0; accumulator >= 1 / 120 && i < 7; i++) {
      simulation.step();
      accumulator -= 1 / 120;
    }
    paint();
    if (!simulation.sample().settled && !simulation.sample().reduced)
      frame = win.requestAnimationFrame(animate);
    else {
      last = 0;
      accumulator = 0;
    }
  }
  function wake() {
    paint();
    if (!frame && allowed() && !simulation.sample().reduced)
      frame = win.requestAnimationFrame(animate);
  }
  function size() {
    const bounds = root.getBoundingClientRect();
    if (bounds.width > 0) {
      plane.style.setProperty(
        "--lanyard-scale",
        (bounds.width / 440).toFixed(5),
      );
      root.classList.add("is-ready");
    }
    paint();
  }
  function point(event) {
    const bounds = root.getBoundingClientRect(),
      scale = bounds.width / 440 || 1;
    return {
      x: (event.clientX - bounds.left) / scale,
      y: (event.clientY - bounds.top) / scale,
    };
  }
  function end(cancelled = false) {
    const id = pointer;
    pointer = null;
    ropeGrab = null;
    if (id === null) return;
    simulation.release(cancelled);
    try {
      if (body.hasPointerCapture?.(id)) body.releasePointerCapture(id);
    } catch (_) {}
    wake();
  }
  listen(root, "pointerdown", (event) => {
    const handle = event.target.closest?.("[data-lanyard-handle]");
    if (!body.contains(event.target) && !handle) return;
    if (
      pointer !== null ||
      event.isPrimary === false ||
      (event.button !== undefined && event.button !== 0)
    )
      return;
    pointer = event.pointerId;
    const start = point(event),
      state = simulation.sample();
    if (handle) {
      const nodes =
        state.ropes[handle.dataset.lanyardHandle === "left" ? 0 : 1];
      let nearest = 1;
      for (let i = 2; i < nodes.length; i++)
        if (
          Math.hypot(nodes[i].x - start.x, nodes[i].y - start.y) <
          Math.hypot(nodes[nearest].x - start.x, nodes[nearest].y - start.y)
        )
          nearest = i;
      ropeGrab = {
        start,
        x: state.x,
        y: state.y,
        fraction: clamp(nearest / 8, 0.3, 1),
      };
      simulation.begin({ x: state.x, y: state.y });
    } else simulation.begin(start);
    body.focus?.({ preventScroll: true });
    try {
      body.setPointerCapture?.(pointer);
    } catch (_) {}
    event.preventDefault();
    wake();
  });
  listen(
    win,
    "pointermove",
    (event) => {
      if (pointer !== event.pointerId) return;
      const next = point(event);
      simulation.move(
        ropeGrab
          ? {
              x: ropeGrab.x + (next.x - ropeGrab.start.x) / ropeGrab.fraction,
              y: ropeGrab.y + (next.y - ropeGrab.start.y) / ropeGrab.fraction,
            }
          : next,
      );
      event.preventDefault();
      wake();
    },
    { passive: false },
  );
  listen(win, "pointerup", (event) => {
    if (pointer === event.pointerId) end();
  });
  listen(win, "pointercancel", (event) => {
    if (pointer === event.pointerId) end(true);
  });
  listen(body, "lostpointercapture", (event) => {
    if (pointer === event.pointerId) end(true);
  });
  listen(body, "dragstart", (event) => event.preventDefault());
  listen(win, "blur", () => end(true));
  listen(body, "keydown", (event) => {
    const keys = {
      ArrowLeft: [-30, 0],
      ArrowRight: [30, 0],
      ArrowUp: [0, -30],
      ArrowDown: [0, 30],
      Enter: [0, 50],
      " ": [0, 50],
    };
    if (["Home", "Escape"].includes(event.key)) {
      event.preventDefault();
      end(true);
      simulation.reset();
      wake();
    } else if (keys[event.key]) {
      event.preventDefault();
      simulation.kick(...keys[event.key]);
      wake();
    }
  });
  listen(resetButton, "click", () => {
    end(true);
    simulation.reset(!preference?.matches);
    wake();
  });
  listen(preference, "change", (event) => {
    end(true);
    simulation.setReduced(event.matches);
    wake();
  });
  listen(doc, "visibilitychange", () => {
    if (doc.hidden) {
      end(true);
      if (frame) win.cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      accumulator = 0;
    } else wake();
  });
  listen(win, "pageshow", () => {
    last = 0;
    accumulator = 0;
    wake();
  });
  listen(win, "resize", size, { passive: true });
  const observer =
    typeof win.IntersectionObserver === "function"
      ? new win.IntersectionObserver(
          (entries) => {
            visible = entries.some((entry) => entry.isIntersecting);
            if (!visible) {
              end(true);
              if (frame) win.cancelAnimationFrame(frame);
              frame = 0;
              last = 0;
              accumulator = 0;
            } else wake();
          },
          { threshold: 0.01 },
        )
      : null;
  observer?.observe(root);
  const resize =
    typeof win.ResizeObserver === "function"
      ? new win.ResizeObserver(size)
      : null;
  resize?.observe(root);
  root.dataset.lanyardReady = "true";
  size();
  wake();
  return {
    simulation,
    destroy() {
      destroyed = true;
      end(true);
      if (frame) win.cancelAnimationFrame(frame);
      observer?.disconnect();
      resize?.disconnect();
      listeners.forEach((off) => off());
      delete root.dataset.lanyardReady;
      root.classList.remove("is-dragging");
    },
  };
}
