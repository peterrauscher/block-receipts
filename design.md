---
version: alpha
name: xAI
description: Stark monochrome. Futuristic minimalism.
colors:
  primary: "#FFFFFF"
  secondary: "#9A9A9A"
  tertiary: "#FFFFFF"
  neutral: "#000000"
  surface: "#050505"
  on-primary: "#000000"
typography:
  display:
    fontFamily: Inter
    fontSize: 5rem
    fontWeight: 300
    letterSpacing: "-0.04em"
  h1:
    fontFamily: Inter
    fontSize: 2.4rem
    fontWeight: 400
  body:
    fontFamily: Inter
    fontSize: 0.95rem
    lineHeight: 1.55
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.72rem
    letterSpacing: "0.12em"
rounded:
  sm: 0px
  md: 0px
  lg: 2px
spacing:
  sm: 8px
  md: 16px
  lg: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    padding: 12px 20px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
---
## Overview

xAI: stark monochrome futuristic minimalism — pure white on pure black, condensed uppercase display.

## Colors

The palette is built around high-contrast neutrals and a single accent that drives interaction.

- **Primary (`#FFFFFF`):** Headlines and core text.
- **Secondary (`#9A9A9A`):** Borders, captions, and metadata.
- **Tertiary (`#FFFFFF`):** The sole driver for interaction. Reserve it.
- **Neutral (`#000000`):** The page foundation.

## Typography

- **display:** Inter 5rem
- **h1:** Inter 2.4rem
- **body:** Inter 0.95rem
- **label:** JetBrains Mono 0.72rem

## Do's and Don'ts

- **Do** use Tertiary for exactly one action per screen.
- **Do** let Neutral carry the composition — negative space is a feature.
- **Don't** introduce gradients. This system is flat on purpose.
- **Don't** mix Tertiary with alternate accents; the single-accent rule is load-bearing.
