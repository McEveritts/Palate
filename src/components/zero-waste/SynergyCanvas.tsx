"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Plus, Minus, Calendar, Flame, Utensils, 
  Sparkles, Check, Filter, ZoomIn, ZoomOut, RefreshCw 
} from "lucide-react";
import { useAppStore } from "@/lib/store";

interface Node {
  id: string;
  name: string;
  type: "ingredient" | "recipe";
  decay?: "critical" | "warning" | "fresh";
  amount?: string;
  macros?: {
    protein: string;
    carbs: string;
    fat: string;
    calories: number;
  };
  time?: string;
  difficulty?: string;
  portions?: number;
  description?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fixed?: boolean;
}

interface Link {
  source: string;
  target: string;
}

interface RecipeIngredient {
  id: string;
  name: string;
  baseAmount: number;
  unit: string;
}

const EMOJIS: Record<string, string> = {
  "ing-spinach": "🥬",
  "ing-bananas": "🍌",
  "ing-sourdough": "🥖",
  "ing-chicken": "🍗",
  "ing-broccoli": "🥦",
  "ing-tomatoes": "🍅",
  "ing-cream": "🥛",
  "ing-onions": "🌱",
  "ing-parm": "🧀",
  "rec-congee": "🥣",
  "rec-pesto": "🫙",
  "rec-panzanella": "🥗",
  "rec-bananabread": "🍞",
  "rec-stock": "🍲",
  "rec-pasta": "🍝"
};

const INITIAL_NODES: Node[] = [
  // Ingredients
  { id: "ing-spinach", name: "Wilted Spinach", type: "ingredient", decay: "warning", amount: "150g", description: "Slightly soft and wilted but perfect for cooked dishes, pesto, or pasta." },
  { id: "ing-bananas", name: "Overripe Bananas", type: "ingredient", decay: "critical", amount: "3 pieces", description: "Heavily spotted, soft, and sweet. Absolutely perfect for banana bread!" },
  { id: "ing-sourdough", name: "Stale Sourdough", type: "ingredient", decay: "critical", amount: "250g", description: "Hardened, dry, zero mold. Highly suitable for soups, salads, or breadcrumbs." },
  { id: "ing-chicken", name: "Leftover Roast Chicken", type: "ingredient", decay: "warning", amount: "220g", description: "Fully cooked tender chicken meat from Sunday dinner, ready to shred." },
  { id: "ing-broccoli", name: "Broccoli Stems", type: "ingredient", decay: "fresh", amount: "4 stems", description: "Crisp and sweet when peeled. Great in stocks, stir-fries, or pestos." },
  { id: "ing-tomatoes", name: "Soft Tomatoes", type: "ingredient", decay: "critical", amount: "400g", description: "Overripe tomatoes, rich in sweetness. Perfect for panzanella or simmered sauce." },
  { id: "ing-cream", name: "Heavy Cream", type: "ingredient", decay: "warning", amount: "120ml", description: "Open container, best used up to enrich pasta, soups, or desserts." },
  { id: "ing-onions", name: "Green Onions", type: "ingredient", decay: "fresh", amount: "1 bunch", description: "Crisp at the stems, slightly limp greens. Adds fresh onion flavor to everything." },
  { id: "ing-parm", name: "Parmesan Rind", type: "ingredient", decay: "fresh", amount: "1 piece", description: "Hard parmesan cheese rind. Do not discard! Explodes with umami when simmered." },

  // Recipes
  { 
    id: "rec-congee", 
    name: "Leftover Chicken Congee", 
    type: "recipe", 
    macros: { protein: "28g", carbs: "45g", fat: "8g", calories: 360 },
    time: "45 mins",
    difficulty: "Easy",
    portions: 4,
    description: "A comforting, restorative savory rice porridge slow-cooked with roast chicken bones and meat, garnished with finely sliced green onions."
  },
  { 
    id: "rec-pesto", 
    name: "Wilted Greens Pesto", 
    type: "recipe", 
    macros: { protein: "6g", carbs: "4g", fat: "22g", calories: 240 },
    time: "10 mins",
    difficulty: "Easy",
    portions: 6,
    description: "A vibrant, zesty green pesto blending wilted spinach, green onion tops, garlic, toasted seeds, olive oil, and grated parmesan rind."
  },
  { 
    id: "rec-panzanella", 
    name: "Stale Bread Panzanella", 
    type: "recipe", 
    macros: { protein: "8g", carbs: "38g", fat: "14g", calories: 310 },
    time: "15 mins",
    difficulty: "Medium",
    portions: 4,
    description: "A classic Tuscan chopped salad featuring stale bread cubes soaked in fresh juices from soft sweet tomatoes, tossed with basil and olive oil."
  },
  { 
    id: "rec-bananabread", 
    name: "Overripe Banana Bread", 
    type: "recipe", 
    macros: { protein: "5g", carbs: "48g", fat: "12g", calories: 320 },
    time: "60 mins",
    difficulty: "Easy",
    portions: 8,
    description: "An incredibly moist, aromatic quick bread utilizing highly caramelized overripe bananas, mildly spiced with cinnamon."
  },
  { 
    id: "rec-stock", 
    name: "Vegetable Scrap Stock", 
    type: "recipe", 
    macros: { protein: "1g", carbs: "3g", fat: "0g", calories: 15 },
    time: "90 mins",
    difficulty: "Easy",
    portions: 8,
    description: "A liquid gold base for soups and stews made by simmering broccoli stems, green onion roots, parmesan rinds, and other clean veggie trimmings."
  },
  { 
    id: "rec-pasta", 
    name: "Creamy Spinach Pasta", 
    type: "recipe", 
    macros: { protein: "12g", carbs: "58g", fat: "18g", calories: 440 },
    time: "20 mins",
    difficulty: "Easy",
    portions: 2,
    description: "A silky, indulgent quick pasta combining wilted spinach, heavy cream, and grated parmesan rind melted directly into the pasta water."
  }
];

const INITIAL_LINKS: Link[] = [
  { source: "ing-chicken", target: "rec-congee" },
  { source: "ing-onions", target: "rec-congee" },
  
  { source: "ing-spinach", target: "rec-pesto" },
  { source: "ing-onions", target: "rec-pesto" },
  { source: "ing-parm", target: "rec-pesto" },
  
  { source: "ing-sourdough", target: "rec-panzanella" },
  { source: "ing-tomatoes", target: "rec-panzanella" },
  { source: "ing-onions", target: "rec-panzanella" },
  
  { source: "ing-bananas", target: "rec-bananabread" },
  
  { source: "ing-broccoli", target: "rec-stock" },
  { source: "ing-onions", target: "rec-stock" },
  { source: "ing-parm", target: "rec-stock" },
  
  { source: "ing-spinach", target: "rec-pasta" },
  { source: "ing-cream", target: "rec-pasta" },
  { source: "ing-parm", target: "rec-pasta" }
];

const RECIPE_INGREDIENTS: Record<string, RecipeIngredient[]> = {
  "rec-congee": [
    { id: "ing-chicken", name: "Leftover Roast Chicken", baseAmount: 220, unit: "g" },
    { id: "ing-onions", name: "Green Onions", baseAmount: 1, unit: "bunch" }
  ],
  "rec-pesto": [
    { id: "ing-spinach", name: "Wilted Spinach", baseAmount: 150, unit: "g" },
    { id: "ing-onions", name: "Green Onions", baseAmount: 0.5, unit: "bunch" },
    { id: "ing-parm", name: "Parmesan Rind", baseAmount: 50, unit: "g" }
  ],
  "rec-panzanella": [
    { id: "ing-sourdough", name: "Stale Sourdough", baseAmount: 250, unit: "g" },
    { id: "ing-tomatoes", name: "Soft Tomatoes", baseAmount: 400, unit: "g" },
    { id: "ing-onions", name: "Green Onions", baseAmount: 0.5, unit: "bunch" }
  ],
  "rec-bananabread": [
    { id: "ing-bananas", name: "Overripe Bananas", baseAmount: 3, unit: "pcs" }
  ],
  "rec-stock": [
    { id: "ing-broccoli", name: "Broccoli Stems", baseAmount: 4, unit: "stems" },
    { id: "ing-onions", name: "Green Onions", baseAmount: 1, unit: "bunch" },
    { id: "ing-parm", name: "Parmesan Rind", baseAmount: 1, unit: "piece" }
  ],
  "rec-pasta": [
    { id: "ing-spinach", name: "Wilted Spinach", baseAmount: 100, unit: "g" },
    { id: "ing-cream", name: "Heavy Cream", baseAmount: 120, unit: "ml" },
    { id: "ing-parm", name: "Parmesan Rind", baseAmount: 30, unit: "g" }
  ]
};

export default function SynergyCanvas({ onSelectNode }: { onSelectNode?: (node: Node) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  
  // App store state
  const measurementSystem = useAppStore((state) => state.measurementSystem);
  const setMeasurementSystem = useAppStore((state) => state.setMeasurementSystem);

  // Layout positions stored in ref to prevent react lag during high speed animation ticks
  const nodesRef = useRef<Node[]>(INITIAL_NODES);
  const linksRef = useRef<Link[]>(INITIAL_LINKS);

  // View state refs (Zoom/Pan/Drag/Hover)
  const panXRef = useRef<number>(0);
  const panYRef = useRef<number>(0);
  const zoomRef = useRef<number>(0.9);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const lastMouseXRef = useRef<number>(0);
  const lastMouseYRef = useRef<number>(0);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 800, height: 550 });

  // React state (for Drawer and Filter UI)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [decayFilter, setDecayFilter] = useState<"all" | "critical" | "warning-critical">("all");
  const [portionsCount, setPortionsCount] = useState<number>(4);
  const [scheduledMeal, setScheduledMeal] = useState<{ day: string; meal: string }>({ day: "Tomorrow", meal: "Lunch" });
  const [isSuccessAction, setIsSuccessAction] = useState<boolean>(false);

  // Coordinate center helper
  const centerSimulation = (w: number, h: number) => {
    // Distribute nodes evenly initially
    nodesRef.current.forEach((node, index) => {
      const angle = (index / nodesRef.current.length) * Math.PI * 2;
      const radius = node.type === "recipe" ? 180 : 100;
      node.x = w / 2 + Math.cos(angle) * radius;
      node.y = h / 2 + Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
      node.fixed = false;
    });
    
    panXRef.current = 0;
    panYRef.current = 0;
    zoomRef.current = 0.9;
  };

  // Setup Web Worker & ResizeObserver
  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined" || !containerRef.current || !canvasRef.current) return;

    // Dynamically instantiate the physics Web Worker
    const worker = new Worker("/workers/physics.worker.js");
    workerRef.current = worker;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    // Set initial size
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;
    canvasSizeRef.current = { width, height };
    canvas.width = width;
    canvas.height = height;

    centerSimulation(width, height);

    // Initialize worker physics
    worker.postMessage({
      type: "init",
      data: {
        nodes: nodesRef.current.map(n => ({ id: n.id, x: n.x, y: n.y, type: n.type })),
        links: linksRef.current
      }
    });
    worker.postMessage({
      type: "resize",
      data: { width, height }
    });

    // Listen to tick coordinates from worker
    worker.onmessage = (e) => {
      if (e.data.type === "tick") {
        const updatedCoords = e.data.nodes;
        updatedCoords.forEach((coord: any) => {
          const node = nodesRef.current.find(n => n.id === coord.id);
          if (node) {
            node.x = coord.x;
            node.y = coord.y;
            node.vx = coord.vx;
            node.vy = coord.vy;
            node.fixed = coord.fixed;
          }
        });
      }
    };

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newW, height: newH } = entries[0].contentRect;
      if (newW <= 0 || newH <= 0) return;

      canvasSizeRef.current = { width: newW, height: newH };
      canvas.width = newW;
      canvas.height = newH;

      worker.postMessage({
        type: "resize",
        data: { width: newW, height: newH }
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Set portions if selected node changes
  useEffect(() => {
    if (selectedNode) {
      setPortionsCount(selectedNode.portions || 4);
      setIsSuccessAction(false);
    }
  }, [selectedNode]);

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear with elegant translucent indigo backdrop
      ctx.fillStyle = "#020617"; // slate-950
      ctx.fillRect(0, 0, width, height);

      // Save normal viewport state
      ctx.save();
      
      // Setup Pan and Zoom scale
      ctx.translate(panXRef.current, panYRef.current);
      ctx.scale(zoomRef.current, zoomRef.current);

      // 1. Draw concentric background rings (Cosmic Kitchen Grid)
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeStyle = "rgba(99, 102, 241, 0.04)";
      ctx.lineWidth = 1;
      for (let r = 100; r <= 600; r += 100) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw little glowing tick dots along the rings
        ctx.fillStyle = "rgba(99, 102, 241, 0.08)";
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Filter nodes list visually according to toggle
      const activeHoveredNodeId = hoveredNodeIdRef.current;
      const filteredNodes = nodesRef.current.map(node => {
        let isDimmed = false;
        
        // Apply decay filter (critical nodes vs warnings)
        if (node.type === "ingredient") {
          if (decayFilter === "critical" && node.decay !== "critical") {
            isDimmed = true;
          } else if (decayFilter === "warning-critical" && node.decay === "fresh") {
            isDimmed = true;
          }
        }

        // Apply hover highlight dimming
        if (activeHoveredNodeId) {
          const isConnected = linksRef.current.some(link => 
            (link.source === activeHoveredNodeId && link.target === node.id) ||
            (link.target === activeHoveredNodeId && link.source === node.id) ||
            node.id === activeHoveredNodeId
          );
          if (!isConnected) {
            isDimmed = true;
          }
        }

        return { ...node, isDimmed };
      });

      // 2. Draw connections (Glowing Bezier Arcs)
      linksRef.current.forEach((link) => {
        const sourceNode = filteredNodes.find(n => n.id === link.source);
        const targetNode = filteredNodes.find(n => n.id === link.target);

        if (!sourceNode || !targetNode || sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) return;

        // Is this line highlighted by hover?
        const isHighlighted = activeHoveredNodeId !== null && 
          (link.source === activeHoveredNodeId || link.target === activeHoveredNodeId);
        
        const isDimmed = (activeHoveredNodeId !== null && !isHighlighted) || 
                         sourceNode.isDimmed || targetNode.isDimmed;

        // Calculate control point for beautiful curved connections
        const mx = (sourceNode.x + targetNode.x) / 2;
        const my = (sourceNode.y + targetNode.y) / 2;
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        
        // Curved offset vector
        const curveOffset = Math.min(35, dist * 0.18);
        const ox = (-dy / dist) * curveOffset;
        const oy = (dx / dist) * curveOffset;
        
        const ctrlX = mx + ox;
        const ctrlY = my + oy;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, targetNode.x, targetNode.y);

        // Styling the neon wire
        ctx.save();
        if (isHighlighted) {
          // Glow effect (wide blur)
          ctx.strokeStyle = "rgba(236, 72, 153, 0.4)"; // Neon fuchsia
          ctx.lineWidth = 6;
          ctx.stroke();

          ctx.strokeStyle = "#ec4899";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (isDimmed) {
          ctx.strokeStyle = "rgba(99, 102, 241, 0.05)";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Standard glowing link
          ctx.strokeStyle = "rgba(99, 102, 241, 0.18)";
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.strokeStyle = "rgba(129, 140, 248, 0.5)"; // indigo-400
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      });

      // 3. Draw nodes
      filteredNodes.forEach((node) => {
        if (node.x === undefined || node.y === undefined) return;

        const isHovered = activeHoveredNodeId === node.id;
        const opacity = node.isDimmed ? 0.2 : 1.0;
        
        ctx.save();
        ctx.globalAlpha = opacity;

        if (node.type === "ingredient") {
          // Set decay color
          let color = "#10b981"; // emerald-500
          let glowColor = "rgba(16, 185, 129, 0.25)";
          if (node.decay === "warning") {
            color = "#f59e0b"; // amber-500
            glowColor = "rgba(245, 158, 11, 0.25)";
          } else if (node.decay === "critical") {
            color = "#f43f5e"; // rose-500
            glowColor = "rgba(244, 63, 94, 0.25)";
          }

          // Expiring (Critical) outer radiant pulsing glow aura
          if (node.decay === "critical" && !node.isDimmed) {
            const time = Date.now() / 250;
            const pulse = 1 + 0.28 * Math.sin(time);
            const baseRad = isHovered ? 20 : 15;
            const glowRadius = baseRad * pulse;

            const radialGlow = ctx.createRadialGradient(node.x, node.y, 8, node.x, node.y, glowRadius);
            radialGlow.addColorStop(0, "rgba(244, 63, 94, 0.45)");
            radialGlow.addColorStop(0.5, "rgba(244, 63, 94, 0.15)");
            radialGlow.addColorStop(1, "rgba(244, 63, 94, 0)");
            
            ctx.fillStyle = radialGlow;
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Ingredient circle backing
          ctx.beginPath();
          ctx.arc(node.x, node.y, isHovered ? 18 : 14, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(15, 23, 42, 0.75)"; // slate-900
          ctx.fill();
          
          // Solid inner circle colored by decay status
          ctx.beginPath();
          ctx.arc(node.x, node.y, isHovered ? 14 : 11, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          // Stroke highlight ring
          ctx.strokeStyle = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.3)";
          ctx.lineWidth = isHovered ? 2.5 : 1.5;
          ctx.stroke();

        } else if (node.type === "recipe") {
          // Recipe Diamond Layout
          const size = isHovered ? 22 : 17;
          
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(Math.PI / 4); // Rotate 45deg to create diamond

          if (!node.isDimmed) {
            ctx.shadowColor = "#6366f1"; // Glowing sapphire
            ctx.shadowBlur = isHovered ? 16 : 8;
          }

          // Dark backing for transparency overlays
          ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
          ctx.fillRect(-size / 2, -size / 2, size, size);

          // Deep Indigo base fill
          ctx.fillStyle = "#4f46e5"; // indigo-600
          ctx.fillRect(-size / 2, -size / 2, size, size);

          // Crisp neon borders
          ctx.strokeStyle = isHovered ? "#ffffff" : "#c7d2fe"; // indigo-200
          ctx.lineWidth = isHovered ? 2.5 : 1.5;
          ctx.strokeRect(-size / 2, -size / 2, size, size);

          ctx.restore();
        }

        // 4. Sleek typography labels with drop-shadows
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1.5;
        
        // Hover node has full white bold text, standard nodes are slightly transparent
        ctx.fillStyle = isHovered ? "#ffffff" : "rgba(241, 245, 249, 0.85)";
        ctx.font = isHovered 
          ? "bold 13px JetBrains Mono, Monaco, Consolas, monospace" 
          : "11px JetBrains Mono, Monaco, Consolas, monospace";

        const emoji = EMOJIS[node.id] || "🍽️";
        const labelText = `${emoji} ${node.name}`;
        
        // Draw text label to the right of node
        const textOffset = node.type === "ingredient" ? (isHovered ? 26 : 20) : (isHovered ? 28 : 22);
        ctx.fillText(labelText, node.x + textOffset, node.y + 4.5);
        ctx.restore();

        ctx.restore();
      });

      ctx.restore();
      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [decayFilter]);

  // Convert Screen Coordinates (Mouse) to World Coordinates (Simulation Space)
  const getEventWorldCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { worldX: 0, worldY: 0, screenX: 0, screenY: 0 };

    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const worldX = (screenX - panXRef.current) / zoomRef.current;
    const worldY = (screenY - panYRef.current) / zoomRef.current;

    return { worldX, worldY, screenX, screenY };
  };

  // Find node under mouse cursor
  const findNodeAtCoords = (worldX: number, worldY: number) => {
    return nodesRef.current.find(node => {
      if (node.x === undefined || node.y === undefined) return false;
      
      // Account for decay visibility filters - dimmed nodes are still clickable
      if (decayFilter === "critical" && node.type === "ingredient" && node.decay !== "critical") {
        return false;
      }
      if (decayFilter === "warning-critical" && node.type === "ingredient" && node.decay === "fresh") {
        return false;
      }

      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const hitRadius = node.type === "recipe" ? 22 : 18;
      return dist <= hitRadius;
    });
  };

  // Mouse Interactions
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only trigger left click

    const { worldX, worldY, screenX, screenY } = getEventWorldCoords(e.clientX, e.clientY);
    const hitNode = findNodeAtCoords(worldX, worldY);

    if (hitNode) {
      // Start Dragging Node
      draggedNodeIdRef.current = hitNode.id;
      isDraggingRef.current = true;
      
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: "drag",
          data: { id: hitNode.id, x: worldX, y: worldY }
        });
      } else {
        hitNode.fixed = true;
        hitNode.x = worldX;
        hitNode.y = worldY;
      }
    } else {
      // Start Panning Viewport
      isPanningRef.current = true;
      lastMouseXRef.current = screenX;
      lastMouseYRef.current = screenY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { worldX, worldY, screenX, screenY } = getEventWorldCoords(e.clientX, e.clientY);

    // Update hovered node
    const hitNode = findNodeAtCoords(worldX, worldY);
    hoveredNodeIdRef.current = hitNode ? hitNode.id : null;

    if (isDraggingRef.current && draggedNodeIdRef.current) {
      // Send Drag to Worker
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: "drag",
          data: { id: draggedNodeIdRef.current, x: worldX, y: worldY }
        });
      } else {
        const node = nodesRef.current.find(n => n.id === draggedNodeIdRef.current);
        if (node) {
          node.x = worldX;
          node.y = worldY;
        }
      }
    } else if (isPanningRef.current) {
      // Perform Panning
      const dx = screenX - lastMouseXRef.current;
      const dy = screenY - lastMouseYRef.current;
      
      panXRef.current += dx;
      panYRef.current += dy;
      
      lastMouseXRef.current = screenX;
      lastMouseYRef.current = screenY;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDraggingRef.current && draggedNodeIdRef.current) {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: "undrag",
          data: { id: draggedNodeIdRef.current }
        });
      } else {
        const node = nodesRef.current.find(n => n.id === draggedNodeIdRef.current);
        if (node) {
          node.fixed = false;
        }
      }
      
      // If click was extremely quick and short, count it as a Node Selection click
      const { worldX, worldY } = getEventWorldCoords(e.clientX, e.clientY);
      const clickedNode = findNodeAtCoords(worldX, worldY);
      if (clickedNode && draggedNodeIdRef.current === clickedNode.id) {
        setSelectedNode(clickedNode);
        if (onSelectNode) {
          onSelectNode(clickedNode);
        }
      }
    }
    
    isDraggingRef.current = false;
    draggedNodeIdRef.current = null;
    isPanningRef.current = false;
  };

  const handleMouseLeave = () => {
    if (isDraggingRef.current && draggedNodeIdRef.current) {
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: "undrag",
          data: { id: draggedNodeIdRef.current }
        });
      } else {
        const node = nodesRef.current.find(n => n.id === draggedNodeIdRef.current);
        if (node) {
          node.fixed = false;
        }
      }
    }
    isDraggingRef.current = false;
    draggedNodeIdRef.current = null;
    isPanningRef.current = false;
    hoveredNodeIdRef.current = null;
  };

  // Wheel Zoom (Centered on Mouse Cursor)
  const handleWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const worldX = (screenX - panXRef.current) / zoomRef.current;
    const worldY = (screenY - panYRef.current) / zoomRef.current;

    const zoomFactor = 1.08;
    let nextZoom = e.deltaY < 0 ? zoomRef.current * zoomFactor : zoomRef.current / zoomFactor;
    
    // Clamp zoom scale between 0.35 and 2.5
    nextZoom = Math.max(0.35, Math.min(2.5, nextZoom));

    // Shift pan coordinates so zoom keeps cursor stationary in world space
    panXRef.current = screenX - worldX * nextZoom;
    panYRef.current = screenY - worldY * nextZoom;
    zoomRef.current = nextZoom;
  };

  // Zoom Button Controls
  const adjustZoom = (zoomIn: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const worldX = (cx - panXRef.current) / zoomRef.current;
    const worldY = (cy - panYRef.current) / zoomRef.current;

    const zoomFactor = 1.25;
    let nextZoom = zoomIn ? zoomRef.current * zoomFactor : zoomRef.current / zoomFactor;
    nextZoom = Math.max(0.35, Math.min(2.5, nextZoom));

    panXRef.current = cx - worldX * nextZoom;
    panYRef.current = cy - worldY * nextZoom;
    zoomRef.current = nextZoom;
  };

  const handleResetView = () => {
    if (canvasRef.current) {
      centerSimulation(canvasRef.current.width, canvasRef.current.height);
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: "init",
          data: {
            nodes: INITIAL_NODES.map(n => ({ id: n.id, x: n.x, y: n.y, type: n.type })),
            links: INITIAL_LINKS
          }
        });
      }
    }
  };

  // Convert Ingredient Weights for Metric/Imperial Toggles
  const renderIngredientAmount = (baseAmount: number, unit: string) => {
    if (measurementSystem === "imperial") {
      if (unit === "g") {
        const oz = baseAmount * 0.035274;
        return `${oz.toFixed(1)} oz`;
      }
      if (unit === "ml") {
        const floz = baseAmount * 0.033814;
        return `${floz.toFixed(1)} fl oz`;
      }
    }
    // Default Metric
    return `${baseAmount}${unit}`;
  };

  // Find all recipe connections to an ingredient
  const connectedRecipes = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "ingredient") return [];
    return INITIAL_LINKS
      .filter(link => link.source === selectedNode.id)
      .map(link => INITIAL_NODES.find(n => n.id === link.target))
      .filter(Boolean) as Node[];
  }, [selectedNode]);

  // Scaled recipe list ingredients based on slider count
  const scaledRecipeIngredients = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "recipe") return [];
    const recipeIngredients = RECIPE_INGREDIENTS[selectedNode.id] || [];
    const basePortions = selectedNode.portions || 4;
    const ratio = portionsCount / basePortions;

    return recipeIngredients.map(ing => {
      // Find matching node for decay colors
      const fullNode = INITIAL_NODES.find(n => n.id === ing.id);
      return {
        ...ing,
        amount: ing.baseAmount * ratio,
        decay: fullNode?.decay
      };
    });
  }, [selectedNode, portionsCount]);

  // Dynamic scaled macros
  const scaledMacros = useMemo(() => {
    if (!selectedNode || selectedNode.type !== "recipe" || !selectedNode.macros) return null;
    const basePortions = selectedNode.portions || 4;
    const ratio = portionsCount / basePortions;
    
    return {
      protein: Math.round(parseFloat(selectedNode.macros.protein) * ratio) + "g",
      carbs: Math.round(parseFloat(selectedNode.macros.carbs) * ratio) + "g",
      fat: Math.round(parseFloat(selectedNode.macros.fat) * ratio) + "g",
      calories: Math.round(selectedNode.macros.calories * ratio)
    };
  }, [selectedNode, portionsCount]);

  return (
    <div 
      ref={containerRef} 
      className="glass-panel bg-slate-950/40 backdrop-blur-2xl border border-white/10 w-full h-[550px] rounded-3xl relative overflow-hidden flex select-none shadow-[inset_0_1px_2px_rgba(255,255,255,0.05),0_15px_30px_rgba(0,0,0,0.5)]"
    >
      {/* 1. Underlying Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* 2. Top-Left Floating Controls: Decay Filters */}
      <div className="absolute top-5 left-5 z-10 flex flex-col gap-3">
        <div className="bg-slate-900/80 backdrop-blur-lg border border-white/10 rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl max-w-[240px]">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 font-mono tracking-wider px-1">
            <Filter size={13} className="text-indigo-400" />
            PANTRY DECAY STATUS
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setDecayFilter("all")}
              className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl transition-all font-mono font-medium ${
                decayFilter === "all" 
                  ? "bg-indigo-600/35 border border-indigo-500/50 text-white" 
                  : "bg-white/5 hover:bg-white/10 border border-transparent text-slate-300"
              }`}
            >
              <span>Show All Pantry</span>
              <span className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded-md border border-white/5">9</span>
            </button>
            <button
              onClick={() => setDecayFilter("warning-critical")}
              className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl transition-all font-mono font-medium ${
                decayFilter === "warning-critical" 
                  ? "bg-amber-600/30 border border-amber-500/50 text-white" 
                  : "bg-white/5 hover:bg-white/10 border border-transparent text-slate-300"
              }`}
            >
              <span className="flex items-center gap-1.5">🔴 + 🟡 Alert</span>
              <span className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded-md border border-white/5">6</span>
            </button>
            <button
              onClick={() => setDecayFilter("critical")}
              className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl transition-all font-mono font-medium ${
                decayFilter === "critical" 
                  ? "bg-rose-600/30 border border-rose-500/50 text-white" 
                  : "bg-white/5 hover:bg-white/10 border border-transparent text-slate-300"
              }`}
            >
              <span className="flex items-center gap-1.5">🔴 Only Critical</span>
              <span className="text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded-md border border-white/5">3</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Top-Right Floating Controls: Navigation */}
      <div className="absolute top-5 right-5 z-10 flex items-center gap-2">
        <button
          onClick={() => adjustZoom(true)}
          className="w-10 h-10 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/90 transition-all shadow-lg"
          title="Zoom In"
        >
          <ZoomIn size={18} />
        </button>
        <button
          onClick={() => adjustZoom(false)}
          className="w-10 h-10 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/90 transition-all shadow-lg"
          title="Zoom Out"
        >
          <ZoomOut size={18} />
        </button>
        <button
          onClick={handleResetView}
          className="w-10 h-10 rounded-xl bg-slate-900/85 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800/90 transition-all shadow-lg"
          title="Recenter & Re-simulate Layout"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* 4. Side Drawer - Clicked Node Details (Framer Motion Slide-In) */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ x: "100%", opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.9 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            className="absolute top-0 right-0 h-full w-[380px] bg-slate-950/95 backdrop-blur-3xl border-l border-white/15 shadow-[-10px_0_30px_rgba(0,0,0,0.7)] z-20 flex flex-col relative overflow-hidden"
          >
            {/* Soft pink or indigo glow behind the drawer content */}
            <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-25 ${
              selectedNode.type === "recipe" ? "bg-indigo-500" : selectedNode.decay === "critical" ? "bg-rose-500" : "bg-emerald-500"
            }`} />

            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-start justify-between relative z-10">
              <div className="flex items-center gap-3">
                <span className="text-3xl filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                  {EMOJIS[selectedNode.id] || "🍽️"}
                </span>
                <div>
                  <h3 className="text-xl font-bold text-white leading-tight drop-shadow-sm">
                    {selectedNode.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      {selectedNode.type}
                    </span>
                    {selectedNode.type === "ingredient" && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                        selectedNode.decay === "critical" ? "bg-rose-500/20 border border-rose-500/40 text-rose-300" :
                        selectedNode.decay === "warning" ? "bg-amber-500/20 border border-amber-500/40 text-amber-300" :
                        "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                      }`}>
                        {selectedNode.decay}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative z-10">
              
              {/* Description */}
              <div className="text-slate-300 text-sm leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
                {selectedNode.description}
              </div>

              {/* Dynamic Measurement Toggle inside Drawer */}
              <div className="flex items-center justify-between bg-slate-900/60 border border-white/5 p-3.5 rounded-2xl">
                <span className="text-xs text-slate-400 font-mono">MEASUREMENT SYSTEM</span>
                <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                  <button
                    onClick={() => setMeasurementSystem("metric")}
                    className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg transition-all ${
                      measurementSystem === "metric" 
                        ? "bg-indigo-600 text-white shadow-md" 
                        : "text-slate-400 hover:text-white bg-transparent"
                    }`}
                  >
                    METRIC
                  </button>
                  <button
                    onClick={() => setMeasurementSystem("imperial")}
                    className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg transition-all ${
                      measurementSystem === "imperial" 
                        ? "bg-indigo-600 text-white shadow-md" 
                        : "text-slate-400 hover:text-white bg-transparent"
                    }`}
                  >
                    IMPERIAL
                  </button>
                </div>
              </div>

              {/* INGREDIENT SPECIFIC VIEW */}
              {selectedNode.type === "ingredient" && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center bg-white/5 px-4 py-3 rounded-xl border border-white/5">
                    <span className="text-xs font-mono text-slate-400">STOCK VOLUME</span>
                    <span className="text-sm font-bold text-white font-mono">{selectedNode.amount}</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold text-slate-400 font-mono tracking-wider px-1">
                      🌿 SYNERGETIC DISHES
                    </div>
                    {connectedRecipes.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {connectedRecipes.map(recipe => (
                          <button
                            key={recipe.id}
                            onClick={() => setSelectedNode(recipe)}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/65 hover:bg-slate-800/60 border border-white/15 text-left transition-all hover:translate-x-1 group/item"
                          >
                            <span className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{EMOJIS[recipe.id] || "🥣"}</span>
                              <span className="group-hover/item:text-indigo-300 transition-colors">{recipe.name}</span>
                            </span>
                            <span className="text-xs text-slate-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded font-mono">
                              {recipe.time}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic p-2 bg-white/5 rounded-xl border border-white/5">
                        No immediate zero-waste recipes found in vault.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* RECIPE SPECIFIC VIEW */}
              {selectedNode.type === "recipe" && scaledMacros && (
                <div className="flex flex-col gap-6">
                  
                  {/* Portions Scale Controller */}
                  <div className="flex flex-col gap-3 bg-slate-900/60 border border-white/10 p-4 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400 font-mono tracking-wide">RECIPE PORTIONS</span>
                      <span className="text-sm font-mono font-black text-indigo-300 bg-indigo-950/50 border border-indigo-500/20 px-2.5 py-0.5 rounded-md">
                        {portionsCount} Portions
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => setPortionsCount(p => Math.max(1, p - 1))}
                        disabled={portionsCount <= 1}
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white disabled:opacity-35 transition-all cursor-pointer"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        value={portionsCount}
                        onChange={(e) => setPortionsCount(parseInt(e.target.value))}
                        className="flex-1 accent-indigo-500 bg-slate-950 rounded-lg appearance-none h-1.5 cursor-pointer"
                      />
                      <button
                        onClick={() => setPortionsCount(p => Math.min(12, p + 1))}
                        disabled={portionsCount >= 12}
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white disabled:opacity-35 transition-all cursor-pointer"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Macros Board */}
                  <div className="flex flex-col gap-3">
                    <div className="text-xs font-bold text-slate-400 font-mono tracking-wider px-1 flex items-center gap-1.5">
                      <Flame size={12} className="text-amber-400" />
                      NUTRITIONAL MACROS (SCALED)
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-slate-400 font-bold">CALORIES</span>
                        <span className="text-sm font-black text-white font-mono mt-1">{scaledMacros.calories}</span>
                      </div>
                      <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">PROTEIN</span>
                        <span className="text-sm font-black text-emerald-300 font-mono mt-1">{scaledMacros.protein}</span>
                      </div>
                      <div className="bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-indigo-400 font-bold">CARBS</span>
                        <span className="text-sm font-black text-indigo-300 font-mono mt-1">{scaledMacros.carbs}</span>
                      </div>
                      <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl flex flex-col items-center">
                        <span className="text-[10px] font-mono text-rose-400 font-bold">FAT</span>
                        <span className="text-sm font-black text-rose-300 font-mono mt-1">{scaledMacros.fat}</span>
                      </div>
                    </div>
                  </div>

                  {/* Scaled Ingredients List */}
                  <div className="flex flex-col gap-2.5">
                    <div className="text-xs font-bold text-slate-400 font-mono tracking-wider px-1 flex items-center gap-1.5">
                      <Utensils size={12} className="text-indigo-400" />
                      REQUIRED RESCUE INGREDIENTS
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {scaledRecipeIngredients.map((ing, idx) => (
                        <div
                          key={`${ing.id}-${idx}`}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/10 transition-colors"
                        >
                          <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                            <span>{EMOJIS[ing.id] || "🥬"}</span>
                            <span>{ing.name}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            {ing.decay && (
                              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                                ing.decay === "critical" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
                                ing.decay === "warning" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                                "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}>
                                {ing.decay}
                              </span>
                            )}
                            <span className="text-xs font-bold text-white bg-slate-950 px-2.5 py-1 rounded-md border border-white/5 font-mono">
                              {renderIngredientAmount(ing.amount, ing.unit)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Meal Plan Scheduling Selector */}
                  <div className="flex flex-col gap-3 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
                    <div className="text-xs font-bold text-slate-400 font-mono tracking-wider flex items-center gap-1.5">
                      <Calendar size={12} className="text-indigo-400" />
                      SCHEDULE THIS DISH
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      <select
                        value={scheduledMeal.day}
                        onChange={(e) => setScheduledMeal(prev => ({ ...prev, day: e.target.value }))}
                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="Tonight">Tonight</option>
                        <option value="Tomorrow">Tomorrow</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                        <option value="Sunday">Sunday</option>
                      </select>
                      <select
                        value={scheduledMeal.meal}
                        onChange={(e) => setScheduledMeal(prev => ({ ...prev, meal: e.target.value }))}
                        className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="Breakfast">Breakfast</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Dinner">Dinner</option>
                        <option value="Snack">Snack</option>
                      </select>
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Bottom Actions Area */}
            {selectedNode.type === "recipe" && (
              <div className="p-6 border-t border-white/10 bg-slate-950/80 backdrop-blur-md relative z-10 mt-auto flex flex-col gap-3">
                <button
                  onClick={() => {
                    setIsSuccessAction(true);
                    setTimeout(() => {
                      setIsSuccessAction(false);
                      setSelectedNode(null);
                    }, 2400);
                  }}
                  className={`w-full py-4 px-6 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 border overflow-hidden relative ${
                    isSuccessAction
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-500/30 hover:shadow-[0_0_20px_rgba(52,211,153,0.35)] cursor-pointer"
                  }`}
                >
                  <AnimatePresence mode="wait">
                    {isSuccessAction ? (
                      <motion.div
                        key="success"
                        initial={{ scale: 0.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.3, opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <Check size={18} className="stroke-[3]" />
                        <span>Rescued & Scheduled for {scheduledMeal.day}!</span>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="standard"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2"
                      >
                        <Sparkles size={16} className="text-emerald-200 animate-pulse" />
                        <span>Scale & Cook Leftovers Rescue</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            )}

            {selectedNode.type === "ingredient" && (
              <div className="p-6 border-t border-white/10 bg-slate-950/80 backdrop-blur-md relative z-10 mt-auto">
                <button
                  onClick={() => setSelectedNode(null)}
                  className="w-full py-3.5 px-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 hover:text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Return to Synergy Canvas</span>
                </button>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
