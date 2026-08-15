---
name: Flowloom
description: A precise, AI-native diagram and scientific-figure workspace for structured editing, data visualization, and format migration.
colors:
  brand-honey: "oklch(0.680 0.170 76)"
  brand-honey-deep: "oklch(0.560 0.155 72)"
  accent-evergreen: "oklch(0.430 0.105 172)"
  canvas: "oklch(1.000 0.000 0)"
  surface: "oklch(0.975 0.000 0)"
  ink: "oklch(0.220 0.018 70)"
  muted: "oklch(0.500 0.014 70)"
  border: "oklch(0.885 0.000 0)"
typography:
  title:
    fontFamily: "Segoe UI, Microsoft YaHei UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Segoe UI, Microsoft YaHei UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Segoe UI, Microsoft YaHei UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  code:
    fontFamily: "Cascadia Code, SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-honey-deep}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 10px"
---

## Overview

Flowloom is a dense professional tool built around a white infinite canvas. Layout is predictable: command bar, reversible libraries, canvas, contextual inspector, and a compact status strip. Scientific work opens as a task-focused workbench for physical page setup, data mapping, preview, and quality checks. The visual mood is a drafting desk in clear late-afternoon office light: focused, legible, and warmed only by deliberate amber actions.

## Colors

The strategy is Restrained. Literal white owns the canvas; true neutral grays separate tool surfaces. Honey identifies primary action and active mode. Evergreen is reserved for successful structure, links, and complementary states. Semantic red, green, blue, and amber always include shape or text cues.

## Typography

Use a single native UI stack for instant loading and stable metrics. Product typography stays on a fixed rem scale. Labels are compact and semibold; document text remains at least 1rem; numeric canvas values use tabular figures. Letter spacing is always zero except where a platform control requires otherwise.

## Elevation

Depth comes primarily from tonal layers and hairline boundaries. Floating menus use one compact shadow with no decorative border-shadow pairing. Dark mode uses progressively lighter surfaces instead of shadows.

## Components

Icon buttons are square, 36px visually and at least 44px on coarse pointers. Cards are limited to repeated template items and framed tools. Panels use dividers, not nested cards. Selection, hover, focus, loading, disabled, error, and success states share one vocabulary across the application.

Scientific charts use the Okabe-Ito categorical palette with shape or line-style redundancy. Publication previews stay literal white even in dark application mode. Panel guides are dashed editing aids that never appear in export; provenance appears as a read-only inspector section with direct source-data downloads.

## Do's and Don'ts

Do keep the canvas dominant, preserve standard diagramming affordances, use icons with accessible tooltips, expose source-fidelity status, and collapse panels structurally on narrow screens. Do not use decorative gradients, oversized radii, gradient text, nested cards, hover-only commands, or color without a second state cue.
