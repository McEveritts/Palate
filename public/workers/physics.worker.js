/**
 * Sage 🌿 - Off-Thread Force-Directed Graph Simulation Web Worker
 *
 * Implements a standalone, highly-optimized 2D force-directed layout simulation.
 * Coordinates are calculated off-thread and streamed back to the main thread
 * for silky-smooth 60fps renders, preventing UI thread blockage during complex
 * recipe-ingredient visual query parses.
 *
 * Features:
 * - Many-body Coulomb-like repulsion: F_repel = k_repel / d^2
 * - Hooke spring-like linkage attraction: F_spring = k_spring * (d - l_0)
 * - Centripetal gravity pulling nodes to the viewport center
 * - Boundary collisions with elastic damping
 * - Velocity damping / frictional resistance
 * - Interactive pinning and dragging coordinates
 *
 * Zero external package dependencies. Pure browser-native modern JavaScript.
 */

// Simulation Space and Nodes/Links State
let nodes = [];
let links = [];
let nodeMap = {};
let width = 800;
let height = 600;

// Highly-tuned default physics parameters (can be overridden in 'init')
let kRepel = 12000;    // Many-body repulsion coefficient
let kSpring = 0.06;    // Hooke's spring constant
let l0 = 80;           // Rest length of linkages
let gravity = 0.03;    // Centripetal gravitational pull to center
let damping = 0.85;    // Frictional velocity damping factor
let padding = 40;      // Outer viewport boundary padding

/**
 * Main Web Worker message listener.
 */
self.onmessage = function (e) {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      initializeSimulation(data);
      break;

    case 'tick':
      tickSimulation();
      postPositions();
      break;

    case 'drag':
      pinNode(data.id, data.x, data.y);
      break;

    case 'undrag':
      unpinNode(data.id);
      break;
  }
};

/**
 * Sets up the simulation space, loads node details, indexes, and linkages.
 */
function initializeSimulation(data) {
  width = data.width || 800;
  height = data.height || 600;
  
  // Custom physics parameter overrides
  kRepel = data.kRepel !== undefined ? data.kRepel : 12000;
  kSpring = data.kSpring !== undefined ? data.kSpring : 0.06;
  l0 = data.l0 !== undefined ? data.l0 : 80;
  gravity = data.gravity !== undefined ? data.gravity : 0.03;
  damping = data.damping !== undefined ? data.damping : 0.85;
  padding = data.padding !== undefined ? data.padding : 40;

  // Initialize node arrays and assign unique index pointers for O(1) force accumulation loops
  nodes = (data.nodes || []).map((nodeData, idx) => {
    const node = {
      id: nodeData.id,
      index: idx,
      // Provide organic initial positions if none exist
      x: nodeData.x !== undefined ? nodeData.x : (width / 2 + (Math.random() - 0.5) * 120),
      y: nodeData.y !== undefined ? nodeData.y : (height / 2 + (Math.random() - 0.5) * 120),
      vx: nodeData.vx || 0,
      vy: nodeData.vy || 0,
      fx: nodeData.fx !== undefined ? nodeData.fx : null,
      fy: nodeData.fy !== undefined ? nodeData.fy : null,
      isRecipe: !!nodeData.isRecipe,
      type: nodeData.type || 'ingredient'
    };

    // If initial node is already pinned, override current position
    if (node.fx !== null && node.fy !== null) {
      node.x = node.fx;
      node.y = node.fy;
    }
    return node;
  });

  // Map representation for fast edge source/target resolves
  nodeMap = {};
  nodes.forEach(n => {
    nodeMap[n.id] = n;
  });

  // Links represent visual pairings (e.g., Recipe <-> Ingredient)
  links = (data.links || []).map(linkData => ({
    source: linkData.source,
    target: linkData.target
  }));
}

/**
 * Pin a node's location dynamically on user interaction.
 */
function pinNode(id, x, y) {
  const node = nodeMap[id];
  if (node) {
    node.fx = x;
    node.fy = y;
    node.x = x;
    node.y = y;
    node.vx = 0;
    node.vy = 0;
  }
}

/**
 * Unpin a node, allowing the force simulation to pull/push it again.
 */
function unpinNode(id) {
  const node = nodeMap[id];
  if (node) {
    node.fx = null;
    node.fy = null;
  }
}

/**
 * Performs one full step of the physics simulation (integrating all forces).
 */
function tickSimulation() {
  const n = nodes.length;
  if (n === 0) return;

  // Force accumulators
  const Fx = new Float64Array(n);
  const Fy = new Float64Array(n);

  // 1. Coulomb-like repulsion between all pairs: F_repel = k_repel / d^2
  for (let i = 0; i < n; i++) {
    const u = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const v = nodes[j];

      let dx = u.x - v.x;
      let dy = u.y - v.y;

      // Handle direct overlapping singularities elegantly
      if (dx === 0 && dy === 0) {
        dx = (Math.random() - 0.5) * 0.2;
        dy = (Math.random() - 0.5) * 0.2;
      }

      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);

      // Protect against dividing by zero or infinite force spikes
      const cappedD = Math.max(d, 6.0);
      const repForce = kRepel / (cappedD * cappedD);

      // Decompose force vector and distribute equally
      const fx = (dx / cappedD) * repForce;
      const fy = (dy / cappedD) * repForce;

      Fx[i] += fx;
      Fy[i] += fy;
      Fx[j] -= fx;
      Fy[j] -= fy;
    }
  }

  // 2. Hooke's spring-like linkages attraction: F_spring = k_spring * (d - l_0)
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const u = nodeMap[link.source];
    const v = nodeMap[link.target];

    if (!u || !v) continue;

    const uIdx = u.index;
    const vIdx = v.index;

    let dx = v.x - u.x;
    let dy = v.y - u.y;

    if (dx === 0 && dy === 0) {
      dx = (Math.random() - 0.5) * 0.2;
      dy = (Math.random() - 0.5) * 0.2;
    }

    const d = Math.sqrt(dx * dx + dy * dy);
    const cappedD = Math.max(d, 0.1);

    const springForce = kSpring * (cappedD - l0);

    // Decompose force vector and pull nodes towards/away from each other
    const fx = (dx / cappedD) * springForce;
    const fy = (dy / cappedD) * springForce;

    Fx[uIdx] += fx;
    Fy[uIdx] += fy;
    Fx[vIdx] -= fx;
    Fy[vIdx] -= fy;
  }

  // 3. Central gravity force (centripetal restraint to prevent layout drift)
  const centerX = width / 2;
  const centerY = height / 2;
  for (let i = 0; i < n; i++) {
    const u = nodes[i];
    const dx = centerX - u.x;
    const dy = centerY - u.y;

    Fx[i] += dx * gravity;
    Fy[i] += dy * gravity;
  }

  // 4. Boundary collisions and velocity updates
  for (let i = 0; i < n; i++) {
    const u = nodes[i];

    if (u.fx !== null && u.fy !== null) {
      // Dragged/Pinned nodes remain anchored
      u.x = u.fx;
      u.y = u.fy;
      u.vx = 0;
      u.vy = 0;
    } else {
      // Integrate forces to update velocities and positions
      u.vx = (u.vx + Fx[i]) * damping;
      u.vy = (u.vy + Fy[i]) * damping;

      u.x += u.vx;
      u.y += u.vy;

      // Rigid boundary collisions with minimal elastic coefficient (0.2)
      const xMin = padding;
      const xMax = width - padding;
      const yMin = padding;
      const yMax = height - padding;

      if (u.x < xMin) {
        u.x = xMin;
        u.vx = -u.vx * 0.2;
      } else if (u.x > xMax) {
        u.x = xMax;
        u.vx = -u.vx * 0.2;
      }

      if (u.y < yMin) {
        u.y = yMin;
        u.vy = -u.vy * 0.2;
      } else if (u.y > yMax) {
        u.y = yMax;
        u.vy = -u.vy * 0.2;
      }
    }
  }
}

/**
 * Stream updated positions array back to the main UI thread.
 */
function postPositions() {
  const result = nodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    fx: n.fx,
    fy: n.fy
  }));

  self.postMessage({
    type: 'tick',
    nodes: result
  });
}
