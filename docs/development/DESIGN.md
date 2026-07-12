# Design System

## Design Read

A personal research workstation for prolonged reading and triage, combining the precision of a laboratory instrument with the speed of a mature developer tool.

## Global Dials

- DESIGN_VARIANCE: 5
- MOTION_INTENSITY: 3
- VISUAL_DENSITY: 7

## Theme

The discovery surface uses a light, low-glare reading field with a graphite navigation rail and task band. Full-screen readers use graphite toolbars around light evidence panes. The contrast should feel technical without turning the whole product into a dark developer console.

## Color Strategy

Restrained. Cold neutral architecture, graphite operational surfaces, and one signal-green accent reserved for selection, readiness, and primary actions.

```css
--bg: oklch(0.985 0.004 225);
--surface: oklch(0.955 0.008 225);
--surface-strong: oklch(0.91 0.012 225);
--ink: oklch(0.18 0.016 230);
--ink-soft: oklch(0.36 0.018 230);
--muted: oklch(0.48 0.014 230);
--line: oklch(0.865 0.012 225);
--primary: oklch(0.51 0.145 154);
--primary-hover: oklch(0.43 0.13 154);
--primary-soft: oklch(0.93 0.045 154);
--signal: oklch(0.78 0.17 151);
--danger: oklch(0.52 0.16 28);
--warning: oklch(0.68 0.14 75);
```

## Typography

Use `Segoe UI Variable`, `Segoe UI`, and system sans-serif fallbacks. Use a compact fixed scale suited to product UI. Paper titles carry the strongest weight; metadata stays quiet but readable. Body prose is capped near 72 characters per line in the explanation pane.

## Shape

- Panels and popovers: 8px radius.
- Inputs and compact buttons: 6px radius.
- Status tags: full pill only when the shape communicates a compact categorical value.
- No large rounded cards or nested card containers.

## Layout

Desktop discovery uses navigation, a dense paper stream, and an optional detail pane. Recommended papers open a focused full-screen reader with PDF on the left and explanation, chat, or translation on the right. Information is grouped with spacing and dividers rather than repeated cards. Below 980px the reader becomes a two-row workspace; below 720px navigation collapses into a compact top bar.

## Motion

Use 150-220ms ease-out transitions for selection, pane opening, filter changes, and feedback. Never animate page layout continuously. Provide reduced-motion alternatives.

## Components

- App rail with saved views and topic counts.
- Search and refresh toolbar.
- Persistent filter strip with native controls.
- Dense paper rows with venue, authors, topic, recency, and reading state.
- Reading pane with source metadata, abstract, generated explanation, and actions.
- Full-screen PDF reader with score evidence, full-text explanation, grounded chat, and page translation tabs.
- Full-screen project reader with repository tree, source file viewer, README, code explanation, and grounded chat.
- Skeleton rows, educational empty states, inline errors, and non-blocking status messages.

## Content Rules

- Generated explanations are labeled `AI 讲解` or `摘要导读`.
- Source abstracts remain visibly separate from generated interpretation.
- Dates use `YYYY-MM-DD`; counts and scores explain what they mean.
- Avoid hype words such as breakthrough unless present in a quoted source.
