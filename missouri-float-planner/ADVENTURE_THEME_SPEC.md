# Adventure Theme Design Spec

## Overview

A bright, optimistic "outdoor adventure" visual refresh inspired by mountain landscapes, alpine lakes, and sunrise vistas. The theme maintains the existing dark foundation while introducing warmer, more vibrant accent colors and layered depth through gradients and elevated surfaces.

---

## Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Depth through layers** | Mountain silhouettes inspire stacked gradients that create visual depth |
| **Warm optimism** | Coral and peach accents bring warmth to the deep indigo foundation |
| **Water highlights** | Teal/blue for interactive elements mirrors calm lake reflections |
| **Soft elevation** | Large border-radius and subtle glows make surfaces feel approachable |
| **Natural contrast** | Deep nights meet warm dawns - dark backgrounds with vibrant accents |

---

## Color Palette

### Primary Tokens (Adventure Theme)

```
┌─────────────────────────────────────────────────────────────────┐
│  FOUNDATIONS                                                     │
├─────────────────────────────────────────────────────────────────┤
│  Deep Indigo     #15143D   Base backgrounds, darkest layer      │
│  Night Purple    #2B1F6B   Card backgrounds, elevated surfaces  │
│  Mountain Violet #5144A8   Tertiary UI, subtle highlights       │
├─────────────────────────────────────────────────────────────────┤
│  ACCENTS                                                         │
├─────────────────────────────────────────────────────────────────┤
│  Coral Accent    #F37A8A   Primary CTA, warm highlights         │
│  Sunrise Peach   #F2B7A0   Secondary warm, hover states         │
├─────────────────────────────────────────────────────────────────┤
│  FUNCTIONAL                                                      │
├─────────────────────────────────────────────────────────────────┤
│  Teal Lake       #3AA0C9   River lines, interactive elements    │
│  Green Treeline  #478559   Success states, put-in markers       │
├─────────────────────────────────────────────────────────────────┤
│  TEXT & NEUTRALS                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Cloud White     #F7F6FB   Primary text on dark backgrounds     │
│  Text Primary    #1E1B3A   Text on light backgrounds            │
│  Text Muted      #6E6A8E   Secondary text, captions             │
│  Mist Gray       #B8B5C9   Disabled states, borders             │
└─────────────────────────────────────────────────────────────────┘
```

### Color Mapping (Old → New)

| Current Token | New Token | Hex Change |
|---------------|-----------|------------|
| `river-night` | `adventure-night` | `#0f132f` → `#15143D` |
| `river-deep` | `adventure-deep` | `#161748` → `#2B1F6B` |
| `sky-warm` | `adventure-coral` | `#f95d9b` → `#F37A8A` |
| `sky-soft` | `adventure-peach` | `#f7a1c4` → `#F2B7A0` |
| `river-water` | `adventure-lake` | `#39a0ca` → `#3AA0C9` |
| `river-forest` | `adventure-forest` | `#478559` → `#478559` (unchanged) |
| `river-gravel` | `adventure-mist` | `#c7b8a6` → `#B8B5C9` |

---

## Gradient System

### Background Gradients

```css
/* Hero Mountain Gradient - Multi-layered depth */
gradient-mountain: linear-gradient(
  180deg,
  #15143D 0%,      /* Deep indigo sky */
  #2B1F6B 30%,     /* Night purple mid */
  #5144A8 60%,     /* Mountain violet */
  #2B1F6B 85%,     /* Back to night */
  #15143D 100%     /* Deep base */
);

/* Sunrise Horizon - Warm accent gradient */
gradient-sunrise: linear-gradient(
  180deg,
  #F37A8A 0%,      /* Coral top */
  #F2B7A0 50%,     /* Peach mid */
  #5144A8 100%     /* Fade to violet */
);

/* Lake Reflection - Cool interactive gradient */
gradient-lake: linear-gradient(
  135deg,
  #3AA0C9 0%,      /* Teal lake */
  #478559 100%     /* Forest edge */
);

/* Card Overlay - Subtle depth */
gradient-card-overlay: linear-gradient(
  180deg,
  rgba(255, 255, 255, 0.08) 0%,
  rgba(255, 255, 255, 0) 100%
);
```

### Text Gradients

```css
/* Adventure Title - Hero text */
text-gradient-adventure: linear-gradient(
  135deg,
  #F37A8A 0%,
  #F2B7A0 50%,
  #3AA0C9 100%
);

/* Lake Text - Subtle accent */
text-gradient-lake: linear-gradient(
  135deg,
  #3AA0C9 0%,
  #478559 100%
);
```

---

## Typography Scale

### Font Sizes

| Token | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| `text-hero` | 4rem (64px) | 1.1 | Hero headlines |
| `text-display` | 3rem (48px) | 1.15 | Section titles |
| `text-heading` | 2rem (32px) | 1.2 | Card titles |
| `text-subhead` | 1.5rem (24px) | 1.3 | Subsections |
| `text-body-lg` | 1.125rem (18px) | 1.6 | Lead paragraphs |
| `text-body` | 1rem (16px) | 1.6 | Body text |
| `text-small` | 0.875rem (14px) | 1.5 | Captions, labels |
| `text-micro` | 0.75rem (12px) | 1.4 | Tags, badges |

### Font Weights

```
thin:       100
light:      300
normal:     400
medium:     500
semibold:   600
bold:       700
extrabold:  800
```

### Letter Spacing

```
tight:     -0.025em  /* Headlines */
normal:     0        /* Body */
wide:       0.025em  /* Buttons, labels */
wider:      0.05em   /* All caps text */
```

---

## Spacing Scale

Using a 4px base unit with a harmonious scale:

| Token | Value | Use Case |
|-------|-------|----------|
| `space-1` | 4px | Inline spacing, icon gaps |
| `space-2` | 8px | Tight element spacing |
| `space-3` | 12px | Button padding (vertical) |
| `space-4` | 16px | Card padding, input padding |
| `space-5` | 20px | Section padding (small) |
| `space-6` | 24px | Card gaps |
| `space-8` | 32px | Component spacing |
| `space-10` | 40px | Section margins |
| `space-12` | 48px | Large section gaps |
| `space-16` | 64px | Hero padding |
| `space-20` | 80px | Section breaks |
| `space-24` | 96px | Major section padding |

---

## Border Radius Scale

Soft, organic shapes that feel approachable:

| Token | Value | Use Case |
|-------|-------|----------|
| `rounded-sm` | 6px | Badges, small elements |
| `rounded-md` | 10px | Inputs, small buttons |
| `rounded-lg` | 16px | Cards, panels |
| `rounded-xl` | 24px | Hero cards, modals |
| `rounded-2xl` | 32px | Feature sections |
| `rounded-full` | 9999px | Pills, avatars |

---

## Shadow & Elevation

### Shadows

```css
/* Subtle card shadow */
shadow-card: 0 4px 16px rgba(21, 20, 61, 0.25);

/* Elevated card (hover) */
shadow-card-elevated: 0 8px 32px rgba(21, 20, 61, 0.35);

/* Glow effects */
shadow-glow-coral: 0 0 24px rgba(243, 122, 138, 0.3);
shadow-glow-lake: 0 0 24px rgba(58, 160, 201, 0.3);
shadow-glow-soft: 0 0 40px rgba(243, 122, 138, 0.15);

/* Inner shadow for depth */
shadow-inner-soft: inset 0 2px 4px rgba(0, 0, 0, 0.1);
```

---

## Component Specifications

### Buttons

#### Primary Button (Coral)
```css
.btn-adventure-primary {
  background: linear-gradient(135deg, #F37A8A 0%, #E66B7B 100%);
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  letter-spacing: 0.025em;
  box-shadow: 0 4px 16px rgba(243, 122, 138, 0.3);
  transition: all 0.2s ease-out;
}

.btn-adventure-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(243, 122, 138, 0.4);
}
```

#### Secondary Button (Lake)
```css
.btn-adventure-secondary {
  background: transparent;
  color: #3AA0C9;
  border: 2px solid rgba(58, 160, 201, 0.4);
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  transition: all 0.2s ease-out;
}

.btn-adventure-secondary:hover {
  background: rgba(58, 160, 201, 0.1);
  border-color: #3AA0C9;
}
```

#### Ghost Button
```css
.btn-adventure-ghost {
  background: transparent;
  color: #F7F6FB;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 500;
  transition: all 0.2s ease-out;
}

.btn-adventure-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
}
```

### Cards

#### Standard Card
```css
.card-adventure {
  background: #2B1F6B;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(21, 20, 61, 0.25);
  transition: all 0.2s ease-out;
}

.card-adventure:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(21, 20, 61, 0.35);
  border-color: rgba(58, 160, 201, 0.3);
}
```

#### Feature Card (with gradient header)
```css
.card-adventure-feature {
  background: linear-gradient(
    180deg,
    rgba(81, 68, 168, 0.3) 0%,
    #2B1F6B 40%
  );
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  overflow: hidden;
}
```

### Navigation

```css
.nav-adventure {
  background: rgba(21, 20, 61, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.nav-link-adventure {
  color: #B8B5C9;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 0.15s ease-out;
}

.nav-link-adventure:hover {
  color: #F7F6FB;
  background: rgba(255, 255, 255, 0.06);
}

.nav-link-adventure.active {
  color: #F37A8A;
  background: rgba(243, 122, 138, 0.1);
}
```

### Badges

```css
/* Status badges */
.badge-adventure-optimal {
  background: rgba(71, 133, 89, 0.2);
  color: #7EE7A0;
  border: 1px solid rgba(71, 133, 89, 0.4);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.badge-adventure-warning {
  background: rgba(242, 183, 160, 0.2);
  color: #F2B7A0;
  border: 1px solid rgba(242, 183, 160, 0.4);
}

.badge-adventure-danger {
  background: rgba(243, 122, 138, 0.2);
  color: #F37A8A;
  border: 1px solid rgba(243, 122, 138, 0.4);
}
```

---

## Implementation Checklist

- [ ] Add adventure color tokens to `tailwind.config.ts`
- [ ] Create CSS variables in `:root` for adventure palette
- [ ] Add gradient utilities to Tailwind config
- [ ] Create adventure-prefixed component classes in `globals.css`
- [ ] Add typography scale tokens
- [ ] Add spacing scale tokens
- [ ] Add shadow utilities
- [ ] Create text gradient utilities
- [ ] Test with existing components for compatibility

---

## Visual Reference

The theme draws inspiration from:
- **Mountains at dusk**: Deep indigo/purple foundations
- **Alpine lakes**: Teal/cyan for interactive elements
- **Sunrise warmth**: Coral and peach for CTAs and accents
- **Forest edges**: Green for success/positive states
- **Cloud mist**: Soft white/gray for text and neutral elements

The overall effect should feel like standing at a mountain viewpoint during golden hour - calm, inspiring, and full of possibility.
