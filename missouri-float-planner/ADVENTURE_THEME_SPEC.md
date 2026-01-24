# Neo-Brutalist Adventure Theme

## Design Philosophy

Raw, bold, unapologetic. Neo-brutalism meets outdoor adventure - combining the stark honesty of brutalist design with the energy of the outdoors. Hard shadows, thick borders, saturated colors, and bold typography create an interface that demands attention.

**Core Principles:**
- **Hard edges** - Solid offset shadows, no soft blurs
- **Thick borders** - 2-4px black or dark borders on everything
- **Flat & bold** - Saturated solid colors, minimal gradients
- **High contrast** - Dark on light, light on dark, nothing subtle
- **Chunky elements** - Generous padding, large touch targets
- **Raw typography** - Bold weights, tight tracking, big sizes

---

## Color Palette

```
┌─────────────────────────────────────────────────────────────────┐
│  FOUNDATIONS                                                     │
├─────────────────────────────────────────────────────────────────┤
│  Void           #0D0C1D   Deepest black-purple                  │
│  Night          #1A1833   Primary dark background               │
│  Slate          #2D2A4A   Elevated surfaces, cards              │
├─────────────────────────────────────────────────────────────────┤
│  PRIMARY ACCENT                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Coral Pop      #FF6B6B   Primary CTA, key actions              │
│  Coral Light    #FF8E8E   Hover states                          │
├─────────────────────────────────────────────────────────────────┤
│  SECONDARY ACCENTS                                               │
├─────────────────────────────────────────────────────────────────┤
│  Electric Blue  #4ECDC4   Interactive, links, water             │
│  Lime Punch     #A8E6CF   Success, positive states              │
│  Gold Flash     #FFE66D   Warnings, highlights                  │
├─────────────────────────────────────────────────────────────────┤
│  NEUTRALS                                                        │
├─────────────────────────────────────────────────────────────────┤
│  White          #FFFFFF   Primary text on dark                  │
│  Off-White      #F5F5F5   Secondary backgrounds                 │
│  Gray           #6B6B8D   Muted text                            │
│  Border Dark    #000000   Hard borders on light                 │
│  Border Light   #FFFFFF   Hard borders on dark                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Shadow System

No soft shadows. Only hard, offset shadows that look like physical depth:

```css
/* Standard offset shadow */
--shadow-brutal: 4px 4px 0 #000000;
--shadow-brutal-sm: 2px 2px 0 #000000;
--shadow-brutal-lg: 6px 6px 0 #000000;
--shadow-brutal-xl: 8px 8px 0 #000000;

/* Colored shadows for emphasis */
--shadow-brutal-coral: 4px 4px 0 #FF6B6B;
--shadow-brutal-blue: 4px 4px 0 #4ECDC4;

/* Inverted for dark backgrounds */
--shadow-brutal-light: 4px 4px 0 rgba(255,255,255,0.3);
```

---

## Border System

Thick, visible borders are core to the aesthetic:

```css
/* Standard borders */
--border-brutal: 3px solid #000000;
--border-brutal-thick: 4px solid #000000;
--border-brutal-light: 3px solid #FFFFFF;

/* Colored borders */
--border-coral: 3px solid #FF6B6B;
--border-blue: 3px solid #4ECDC4;
```

---

## Typography

Bold and unapologetic:

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `text-brutal-hero` | 5rem | 900 | Hero headlines |
| `text-brutal-display` | 3.5rem | 800 | Section titles |
| `text-brutal-heading` | 2rem | 700 | Card titles |
| `text-brutal-subhead` | 1.25rem | 700 | Subsections |
| `text-brutal-body` | 1rem | 500 | Body text |
| `text-brutal-small` | 0.875rem | 500 | Labels |
| `text-brutal-micro` | 0.75rem | 600 | Tags, badges |

**Letter spacing:** Tight (-0.02em to -0.04em) for headlines, normal for body.

---

## Border Radius

Neo-brutalism often uses sharp corners OR intentionally chunky rounded corners:

```css
--radius-none: 0;           /* Sharp, raw */
--radius-brutal: 8px;       /* Slightly chunky */
--radius-brutal-lg: 16px;   /* Noticeably rounded */
--radius-pill: 9999px;      /* Pills and badges */
```

---

## Component Specs

### Buttons

```css
/* Primary - Coral with hard shadow */
.btn-brutal {
  background: #FF6B6B;
  color: #000000;
  border: 3px solid #000000;
  padding: 14px 28px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 4px 4px 0 #000000;
  transition: all 0.1s ease;
}

.btn-brutal:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 #000000;
}

.btn-brutal:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #000000;
}

/* Secondary - Outline style */
.btn-brutal-outline {
  background: transparent;
  color: #FFFFFF;
  border: 3px solid #FFFFFF;
  box-shadow: 4px 4px 0 rgba(255,255,255,0.3);
}

/* Ghost - Minimal */
.btn-brutal-ghost {
  background: transparent;
  color: #FFFFFF;
  border: none;
  text-decoration: underline;
  text-underline-offset: 4px;
}
```

### Cards

```css
/* Standard card */
.card-brutal {
  background: #2D2A4A;
  border: 3px solid #FFFFFF;
  padding: 24px;
  box-shadow: 6px 6px 0 rgba(255,255,255,0.2);
}

/* Feature card with accent border */
.card-brutal-accent {
  background: #2D2A4A;
  border: 4px solid #FF6B6B;
  box-shadow: 6px 6px 0 #FF6B6B;
}

/* Light card for contrast sections */
.card-brutal-light {
  background: #F5F5F5;
  color: #0D0C1D;
  border: 3px solid #000000;
  box-shadow: 6px 6px 0 #000000;
}
```

### Badges

```css
.badge-brutal {
  display: inline-block;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 2px solid currentColor;
}

/* Status variants */
.badge-brutal-success { background: #A8E6CF; color: #000; border-color: #000; }
.badge-brutal-warning { background: #FFE66D; color: #000; border-color: #000; }
.badge-brutal-danger { background: #FF6B6B; color: #000; border-color: #000; }
.badge-brutal-info { background: #4ECDC4; color: #000; border-color: #000; }
```

### Inputs

```css
.input-brutal {
  background: #1A1833;
  color: #FFFFFF;
  border: 3px solid #FFFFFF;
  padding: 14px 18px;
  font-weight: 500;
}

.input-brutal:focus {
  outline: none;
  border-color: #4ECDC4;
  box-shadow: 4px 4px 0 #4ECDC4;
}
```

---

## Interaction States

Brutalist interactions are snappy and tactile:

```css
/* Hover: lift up and expand shadow */
:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 [color];
}

/* Active/Click: push down and shrink shadow */
:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 [color];
}

/* Focus: colored border + shadow */
:focus {
  outline: none;
  border-color: #4ECDC4;
  box-shadow: 0 0 0 4px rgba(78, 205, 196, 0.3);
}
```

---

## Layout Principles

1. **Generous whitespace** - Let elements breathe
2. **Strong grid** - Visible structure, no floating elements
3. **Stacked sections** - Clear horizontal breaks between content
4. **Bold dividers** - Use thick lines or color blocks to separate sections
5. **Asymmetry welcome** - Off-center elements add visual interest

---

## Animation

Minimal and snappy - no floaty/bouncy animations:

```css
transition: all 0.1s ease;  /* Quick, direct */
```

Avoid: ease-in-out, spring animations, long durations

---

## Visual Example

```
┌────────────────────────────────────────────────┐
│  ██████████████████████████████████████████   │
│  █                                          █  │
│  █   FLOAT THE                              █  │
│  █   MISSOURI    ████████████               █  │
│  █               █ PLAN NOW █               █  │
│  █               ████████████               █  │
│  █                    ↑                     █  │
│  █             hard shadow button           █  │
│  ██████████████████████████████████████████   │
│                                                │
│  ┌──────────────┐  ┌──────────────┐           │
│  │ CURRENT FORK │  │ JACKS FORK   │  ← cards  │
│  │              │  │              │    with   │
│  │  ████████    │  │  ████████    │    offset │
│  │  Optimal     │  │  Low Water   │    shadow │
│  └──────────────┘  └──────────────┘           │
│       └───shadow        └───shadow            │
└────────────────────────────────────────────────┘
```
