# Vault Visualization Design Spec

## Overview
Phase 6 focuses on creating a visual, interactive representation of the local markdown recipe vault (`vault/mains` and `vault/sides`). The goal is to provide a premium, visually engaging browsing experience that aligns with the AetherFlow design system.

## Architecture & Layout
- **Masonry Grid**: Recipes will be displayed in a fluid masonry layout. 
- **Filtering & Sorting**: 
  - A clean, minimal search bar at the top.
  - Simple segmented tabs for "All", "Mains", and "Sides".

## Component Design

### 1. Recipe Cards (Visual-First)
- **Aesthetic**: Extreme Glassmorphism (24-48px backdrop blur, dark slate theme).
- **Default State**: Focuses on visual vibe. Displays the recipe title, glowing category tags, and abstract procedurally-generated gradients or shapes.
- **Hover State**: Macros (Calories, Protein, Carbs, Fat) fade in or slide up on hover. Glowing borders intensify.

### 2. Recipe Expansion (Shared Element Transition)
- **Interaction**: Combines in-place expansion with a modal overlay.
- **Animation (Framer Motion)**: Using `layoutId`, clicking a card causes it to seamlessly animate from its grid position into a large, centered modal.
- **Background**: The surrounding masonry grid blurs and dims (XOR masking / refraction) when a card is expanded.
- **Content**: The expanded modal reveals the full markdown content, rendering the YAML frontmatter and the detailed step-by-step instructions.

## Data Flow
- A new server action or API route will scan the `vault/mains` and `vault/sides` directories.
- It will parse the YAML frontmatter (using `gray-matter` or similar) to extract titles, tags, and macros.
- This lightweight metadata array is passed to the client-side Masonry Grid for rendering and filtering.
- The full markdown body is either fetched eagerly or lazily loaded upon card expansion.

## Dependencies
- `framer-motion` (already in stack) for `layoutId` animations.
- `gray-matter` or a custom regex parser for extracting YAML metadata from the `.md` files.