---
name: Cybernetic Ops
colors:
  surface: '#121413'
  surface-dim: '#121413'
  surface-bright: '#383a38'
  surface-container-lowest: '#0c0f0e'
  surface-container-low: '#1a1c1b'
  surface-container: '#1e201f'
  surface-container-high: '#282a29'
  surface-container-highest: '#333534'
  on-surface: '#e2e3e0'
  on-surface-variant: '#bacbbe'
  inverse-surface: '#e2e3e0'
  inverse-on-surface: '#2f312f'
  outline: '#849589'
  outline-variant: '#3b4a41'
  surface-tint: '#00e297'
  primary: '#6dffba'
  on-primary: '#003822'
  primary-container: '#00e599'
  on-primary-container: '#00613e'
  inverse-primary: '#006c46'
  secondary: '#f4fff5'
  on-secondary: '#003822'
  secondary-container: '#00ffaa'
  on-secondary-container: '#007149'
  tertiary: '#c1efd5'
  on-tertiary: '#093826'
  tertiary-container: '#a5d3b9'
  on-tertiary-container: '#325c48'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#4dffb2'
  primary-fixed-dim: '#00e297'
  on-primary-fixed: '#002112'
  on-primary-fixed-variant: '#005234'
  secondary-fixed: '#4dffb1'
  secondary-fixed-dim: '#00e296'
  on-secondary-fixed: '#002112'
  on-secondary-fixed-variant: '#005233'
  tertiary-fixed: '#beedd2'
  tertiary-fixed-dim: '#a3d1b7'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#244f3b'
  background: '#121413'
  on-background: '#e2e3e0'
  surface-variant: '#333534'
  surface-base: '#070908'
  surface-elevated: '#0d110e'
  surface-card: '#131915'
  surface-card-hover: '#17221b'
  border-subtle: rgba(0, 229, 153, 0.12)
  border-active: rgba(0, 229, 153, 0.35)
  border-bright: '#00e599'
  text-primary: '#f2f5f3'
  text-secondary: '#8c9b91'
  text-muted: '#4d5b52'
  glow-pulse: rgba(0, 229, 153, 0.45)
  glow-ambient: rgba(0, 229, 153, 0.08)
typography:
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.02em
  display-hero-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.015em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  mono-metric:
    fontFamily: JetBrains Mono
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.03em
  mono-status:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.12em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 4rem
  space-3xl: 6rem
---

## Brand & Style

The design system embodies a mission-critical tactical control room aesthetic tailored for autonomous agent operations, device farms, and high-velocity workflow automation. It communicates absolute technical competence, stealth efficiency, and relentless 24/7 uptime.

The target audience consists of advanced operators, growth engineers, MMO project leads, and scale-focused technical founders who prize raw throughput over corporate fluff. The interface evokes the sensation of sitting before a live terminal console: precise, low-light, high-contrast, and glowing with active telemetry.

The visual style is a fusion of **Tactical Cybernetics** and **Refined Dark Glassmorphism**:

- Ultra-deep obsidian and charcoal surfaces eliminate visual fatigue.
- Intense electric neon green accents provide laser-targeted focus for primary actions and system states.
- Monospace indicators, diamond delimiters (`◆`), and uppercase system badges reinforce an industrial backend ethos.
- Subtle grid dot arrays, telemetry radar rings, and ambient green glows suggest continuous background execution without cognitive overload.

## Colors

The palette operates under an uncompromising dark mode paradigm. No blue, indigo, or purple hues appear anywhere in the interface; all chromatic energy is channeled through pure electric green frequencies.

### Color Tokens & Usage

- **Primary (`#00e599`)**: High-priority interactive elements, active telemetry spikes, primary CTA fills, and status checkmarks.
- **Secondary (`#00ffaa`)**: Accent highlights, glowing text spans, hover states on primary components, and radar sweeps.
- **Tertiary (`#0a3826`)**: Tonal substrate for badges, selected row highlights, and container depth borders.
- **Neutral Base (`#070908`)**: The pitch-black canvas foundation.
- **Surface Elevated (`#0d110e`)**: Outer container modules, navigation bars, and footer strips.
- **Surface Card (`#131915`)**: Component-level background fill for KPI tiles, feature blocks, and form containers.
- **Text Primary (`#f2f5f3`)**: Crisp, non-pure white ensuring maximum legibility against obsidian without harsh retinal vibration.
- **Text Secondary (`#8c9b91`)**: Subheaders, card body copy, and metadata descriptions.
- **Text Muted (`#4d5b52`)**: Grid markers, inactive icons, placeholder text, and secondary tags.

## Typography

The typography hierarchy pairs the sharp, geometric geometry of **Space Grotesk** for display headlines with the neutral clarity of **Geist** for dense operational copy, anchored by **JetBrains Mono** for all telemetry badges, KPIs, and machine status markers.

### Typographic Directives

- **Headlines (`Space Grotesk`)**: Rendered tight with subtle negative letter-spacing. Use uppercase transformations sparingly on major module headings (`PRODUCT.`, `WHAT WE OFFER.`) to preserve military-grade utility.
- **Body Text (`Geist`)**: Set with balanced line heights to maintain high legibility against pitch-black backgrounds. Avoid ultra-thin weights; stick strictly to `400` and `500`.
- **Telemetry & Status (`JetBrains Mono`)**: Always rendered in uppercase with deliberate positive letter tracking (`letterSpacing: 0.08em` to `0.12em`). Apply to all tickers, live status pills (`SYS.READY`), and numeric metrics.

## Layout & Spacing

The layout follows a 12-column responsive fluid grid with strict mathematical cadence. Spacing tokens enforce dense, utilitarian modularity reminiscent of dashboard consoles and server management control software.

### Layout Rules

- **Desktop (1200px+)**: 12 columns, `1.5rem` (24px) gutters, `2rem` (32px) canvas margins. Maximum readable container width is constrained to `1280px` centered.
- **Tablet (768px – 1199px)**: 8 columns, `1rem` (16px) gutters, `1.5rem` (24px) canvas margins.
- **Mobile (< 768px)**: 4 columns, `0.75rem` (12px) gutters, `1rem` (16px) canvas margins. Multi-column metric grids collapse into stacked 2-column or 1-column cards.
- **Vertical Cadence**: Major section blocks are spaced by `space-3xl` (96px) on desktop and `space-2xl` (64px) on mobile. Full-width separator marquees sit flush across the edge of the viewport.

## Elevation & Depth

Visual depth is achieved through translucent dark layers, cybernetic hairline borders, and localized electric green glow fields rather than standard drop shadows.

### Elevation Levels

- **Base Level (Canvas)**: Hex `#070908`. Overlaid with a 24px dot-matrix grid pattern (`radial-gradient(rgba(0, 229, 153, 0.08) 1px, transparent 0)`).
- **Surface Level 1 (Panels & Toolbars)**: Hex `#0d110e` with `backdrop-filter: blur(12px)` and a subtle 1px perimeter border of `rgba(0, 229, 153, 0.12)`.
- **Surface Level 2 (Cards & Modules)**: Hex `#131915`. Card borders use a directional hairline gradient transitioning from `rgba(0, 229, 153, 0.25)` at the top edge to `rgba(0, 229, 153, 0.05)` at the bottom edge.
- **Surface Level 3 (Active Focus / Modals)**: Hex `#17221b` surrounded by an active neon glow (`0 0 24px -4px rgba(0, 229, 153, 0.25)`).

### Atmospheric Elements

- **Radial Spotlights**: Soft ambient gradients behind critical hero graphics and 3D isometric stacks (`radial-gradient(circle, rgba(0, 229, 153, 0.18) 0%, transparent 70%)`).
- **Telemetry Pulses**: Glowing circular nodes with ping animations (`box-shadow: 0 0 8px #00e599`).

## Shapes

The shape system employs deliberate, low-radius curvature (`roundedness: 1` = `0.25rem` / 4px base radius). This produces crisp, engineered edges that evoke rack-mounted server hardware and microchip modules.

### Curvature Tokens

- **Micro / Pills (`rounded-sm` / 2px)**: Metric tags, status dots, and inline keycaps.
- **Base Components (`rounded-md` / 4px to 6px)**: Input fields, command buttons, interactive cards, and accordion rows.
- **Nested Containers (`rounded-lg` / 8px)**: Hero visual frames, metrics dashboard wrapper, and navigation menus.
- **Strict Prohibition**: No soft bulbous forms or fully rounded capsule buttons (`pill-shaped`), except for the miniaturized system status pulse indicator.

## Components

### Buttons & Interactive Triggers

- **Primary Action**: Solid electric neon background (`#00e599`), `#070908` bold monospace text, 4px border radius. Hover state transitions to `#00ffaa` with an ambient glow (`box-shadow: 0 0 16px rgba(0, 229, 153, 0.4)`). Always include a directional terminal arrow (`→`).
- **Secondary Ghost Action**: `#131915` surface, 1px border (`rgba(0, 229, 153, 0.25)`), `#f2f5f3` text. Hover state shifts border to `#00e599` with subtle green-tinted background fill (`rgba(0, 229, 153, 0.06)`).
- **Navigation Action**: Minimalist text link with animated underline or right-aligned arrow (`↗`).

### Badges & System Status Indicators

- **Pulse Badge (`SYS.READY`)**: Ultra-compact monospace label (`11px`), green-tinted dark pill fill (`rgba(0, 229, 153, 0.1)`), 1px green border (`rgba(0, 229, 153, 0.3)`). Preceded by an animated green glowing dot (`#00e599`) that pulses opacity between 0.4 and 1.0.
- **Operational Tag**: Monospace uppercase text enclosed in bracket syntax or accompanied by diamond delimiters (`◆ OUTSOURCED PROJECT OPS`).

### Cards & Modular Panels

- **Telemetry Metric Cards**: Pitch-black background (`#0d110e`), 1px cybernetic border (`rgba(0, 229, 153, 0.15)`). Displays large monospaced numerical metrics (`3,000+`, `98%`) in bright green, with muted micro-labels below and real-time status curves or radar graphs in the background.
- **Feature & Split Cards**: Dark container (`#131915`) featuring top-edge luminescence. On hover, the border luminescence increases to `rgba(0, 229, 153, 0.45)`. Interactive corner indicators (`+` or `▶`) sit anchored at the bottom right.

### Marquee Ticker Strips

- Continuous, edge-to-edge rolling ticker bar set against `#0d110e` with 1px top and bottom borders (`rgba(0, 229, 153, 0.15)`).
- Text items set in uppercase JetBrains Mono, separated by vibrant neon diamonds: `HARDWARE ◆ SOFTWARE ◆ AUTOMATED AGENTS ◆ OPS ◆ CONSULTANT`.

### Form Controls

- **Input Fields**: Charcoal background (`#0d110e`), 1px border (`rgba(255, 255, 255, 0.1)`), `#f2f5f3` text, and monospace placeholders (`rgba(255, 255, 255, 0.3)`).
- **Focus State**: Border snaps to `#00e599` with a crisp outer halo (`0 0 0 1px #00e599`).
- **Select Dropdown**: Custom caret indicator (`▾`) tinted in primary green.

### FAQ Accordion

- Bordered horizontal rows (`border-bottom: 1px solid rgba(0, 229, 153, 0.15)`).
- Expansion affordance is an electric green plus (`+`) that rotates 45 degrees upon expansion.
- Expanded content renders in `#8c9b91` with tight line breaks for technical clarity.

### AI Engine Shortcut Bar

- Centered or footer-docked utility pill row featuring fast-action prompt triggers for external LLM ingestion (ChatGPT, Claude, Perplexity, Gemini, Grok).
- Styled as low-profile monochrome micro-buttons that highlight with electric green borders on hover.
