"use client";

import React, { useState, useMemo, useRef, useCallback } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import { motion, AnimatePresence } from 'framer-motion';
import { VaultRecipe } from '@/lib/vaultParser';
import { X, Search, Navigation, Layers, Compass, ZoomIn } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RecipeNutritionDetails } from './RecipeNutritionDetails';

interface VaultGraph3DClientProps {
  recipes: VaultRecipe[];
}

interface GraphNode {
  id: string;
  name: string;
  val: number;
  color: string;
  type: 'recipe' | 'tag';
  category?: string;
  recipe?: VaultRecipe;
}

interface GraphLink {
  source: string;
  target: string;
  color?: string;
}

export default function VaultGraph3DClient({ recipes }: VaultGraph3DClientProps) {
  const fgRef = useRef<any>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<VaultRecipe | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'network' | 'category-clusters'>('network');
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  // Category color mapper
  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'mains':
        return '#818cf8'; // Indigo 400
      case 'sides':
        return '#f472b6'; // Fuchsia 400
      case 'curated-current':
        return '#34d399'; // Emerald 400
      case 'curated-archive':
        return '#94a3b8'; // Slate 400
      default:
        return '#a78bfa'; // Violet 400
    }
  };

  // Generate graph data based on selected view mode
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const seenTags = new Set<string>();

    // Mode 1: Network View (recipes linked to tag nodes)
    if (viewMode === 'network') {
      recipes.forEach(recipe => {
        // Add recipe node
        nodes.push({
          id: recipe.id,
          name: recipe.title,
          val: 8,
          color: getCategoryColor(recipe.category),
          type: 'recipe',
          category: recipe.category,
          recipe
        });

        // Link recipe to its tags
        recipe.tags.forEach(tag => {
          const tagId = `tag-${tag.toLowerCase().trim()}`;
          if (!seenTags.has(tagId)) {
            seenTags.add(tagId);
            nodes.push({
              id: tagId,
              name: `#${tag}`,
              val: 4,
              color: '#38bdf8', // Sky 400 for tags
              type: 'tag'
            });
          }

          links.push({
            source: recipe.id,
            target: tagId
          });
        });
      });
    } else {
      // Mode 2: Category Clusters (recipes grouped and linked within their categories)
      const categories: { [key: string]: string[] } = {};

      recipes.forEach(recipe => {
        nodes.push({
          id: recipe.id,
          name: recipe.title,
          val: 9,
          color: getCategoryColor(recipe.category),
          type: 'recipe',
          category: recipe.category,
          recipe
        });

        if (!categories[recipe.category]) {
          categories[recipe.category] = [];
        }
        categories[recipe.category].push(recipe.id);
      });

      // Link recipes within same categories to form distinct visual orbits
      Object.keys(categories).forEach(cat => {
        const ids = categories[cat];
        for (let i = 0; i < ids.length - 1; i++) {
          links.push({
            source: ids[i],
            target: ids[i + 1]
          });
        }
        // Close the circle loop for neat visual clustering
        if (ids.length > 2) {
          links.push({
            source: ids[ids.length - 1],
            target: ids[0]
          });
        }
      });
    }

    return { nodes, links };
  }, [recipes, viewMode]);

  // Handle node clicks
  const handleNodeClick = useCallback((node: any) => {
    if (node.type === 'recipe' && node.recipe) {
      setSelectedRecipe(node.recipe);
      
      // Aim camera at clicked node
      const distance = 40;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
      
      fgRef.current?.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
        node, // lookAt
        2000  // transition ms
      );
    }
  }, []);

  // Handle node hover
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node || null);
  }, []);

  // Reset camera view
  const handleResetCamera = () => {
    fgRef.current?.zoomToFit(1200, 100);
  };

  // Search and highlight node
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const matchedNode = graphData.nodes.find(n => 
      n.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (matchedNode) {
      const node = matchedNode as any;
      if (fgRef.current) {
        // Fit coordinates and look
        fgRef.current.cameraPosition(
          { x: node.x ? node.x * 2.5 : 100, y: node.y ? node.y * 2.5 : 100, z: node.z ? node.z * 2.5 : 150 },
          node,
          1500
        );

        if (matchedNode.type === 'recipe' && matchedNode.recipe) {
          setSelectedRecipe(matchedNode.recipe);
        }
      }
    }
  };

  return (
    <div className="w-full h-[80vh] relative border border-white/5 rounded-3xl overflow-hidden bg-slate-950/20 backdrop-blur-md">
      
      {/* 3D Force Graph Layer */}
      <div className="w-full h-full cursor-grab active:cursor-grabbing">
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          nodeLabel="name"
          nodeColor={node => {
            if (hoveredNode && hoveredNode.id === node.id) {
              return '#ffffff'; // White highlight on hover
            }
            return (node as GraphNode).color;
          }}
          nodeVal={node => (node as GraphNode).val}
          linkWidth={1.5}
          linkColor={() => 'rgba(255, 255, 255, 0.08)'}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={1.5}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          showNavInfo={false}
          controlType="orbit"
        />
      </div>

      {/* Floating AetherFlow Control Panel */}
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-4 pointer-events-none w-80">
        
        {/* Search Panel */}
        <form 
          onSubmit={handleSearchSubmit}
          className="glass-panel border border-white/10 rounded-2xl p-2 flex items-center gap-2 pointer-events-auto bg-slate-900/50 backdrop-blur-2xl shadow-xl"
        >
          <Search className="w-4 h-4 text-slate-400 ml-2" />
          <input
            type="text"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-0 outline-none text-white text-sm w-full placeholder-slate-500"
          />
          <button 
            type="submit"
            className="px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-colors"
          >
            Go
          </button>
        </form>

        {/* View Controls */}
        <div className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-col gap-3 pointer-events-auto bg-slate-900/50 backdrop-blur-2xl shadow-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>Cosmos Controls</span>
            </span>
            <button
              onClick={handleResetCamera}
              className="p-1 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Reset Viewport"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle View Mode */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('network')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                viewMode === 'network'
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-500/10'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tag Network</span>
            </button>

            <button
              onClick={() => setViewMode('category-clusters')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                viewMode === 'category-clusters'
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-500/10'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Category Loops</span>
            </button>
          </div>

          {/* Legend */}
          <div className="space-y-1.5 mt-1 border-t border-white/5 pt-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <div className="w-2.5 h-2.5 rounded-full bg-[#818cf8]" />
              <span>Mains (Indigo)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <div className="w-2.5 h-2.5 rounded-full bg-[#f472b6]" />
              <span>Sides (Fuchsia)</span>
            </div>
            {viewMode === 'network' && (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
                <span>Culinary Tags (Sky)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Hover Legend / Quicktip */}
      <div className="absolute bottom-6 left-6 z-10 pointer-events-none text-slate-500 text-xs font-medium bg-slate-950/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 shadow-md">
        🖱️ Drag to rotate | 📜 Scroll to zoom | 👆 Click recipe to open
      </div>

      {/* Slide-out Glassmorphic Recipe Drawer (AetherFlow Styling) */}
      <AnimatePresence>
        {selectedRecipe && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full md:w-[480px] h-full fixed top-0 right-0 z-50 bg-slate-950/65 backdrop-blur-3xl border-l border-white/10 p-8 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-y-auto custom-scrollbar"
          >
            <div className="absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent pointer-events-none"></div>

            {/* Header / Actions */}
            <div className="flex justify-between items-center mb-6 relative z-10">
              <button
                onClick={() => setSelectedRecipe(null)}
                className="p-2 bg-white/5 hover:bg-white/15 border border-white/10 rounded-full text-slate-300 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-[10px] uppercase font-bold tracking-widest bg-fuchsia-500/20 border border-fuchsia-500/30 text-fuchsia-300 px-3 py-1 rounded-full">
                {selectedRecipe.category}
              </span>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative z-10">
              <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight mb-4 text-balance">
                {selectedRecipe.title}
              </h2>

              <div className="flex flex-wrap gap-1.5 mb-6">
                {selectedRecipe.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-0.5 text-xs rounded-full bg-slate-800/80 text-slate-300 border border-white/5">
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Seamless Nutrition Details widget */}
              <div className="mb-6">
                <RecipeNutritionDetails
                  recipeId={selectedRecipe.id}
                  recipeTitle={selectedRecipe.title}
                  initialMacros={selectedRecipe.macros}
                />
              </div>

              {/* Recipe Method Markdown */}
              <div className="prose prose-invert prose-indigo max-w-none mt-4 border-t border-white/5 pt-6">
                <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedRecipe.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
