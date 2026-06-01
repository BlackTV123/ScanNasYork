# ScanNasYork Design System: Lovable Dark Mode

## 1. Visual Theme & Atmosphere

The ScanNasYork platform operates exclusively in **Permanent Dark Mode**. This design choice was made to reduce eye strain during long screening sessions, enhance focus on critical data, and create a sleek, professional "Quantamental" terminal feel. 

The dark mode is not purely black—it uses a sophisticated layering of deep charcoal and off-black tones to establish hierarchy, inspired by modern developer tools and high-end financial terminals. We prioritize **high contrast**, bold typography, and clear boundary definitions to ensure numerical data and technical metrics are instantly readable.

**Key Characteristics:**
- **Exclusive Dark Mode**: No light mode. The entire app uses a deep charcoal background (`#0a0a0b`).
- **High-Contrast Readability**: Text is stark white or bright off-white (`#f8fafc`, `#e2e8f0`) to pop against the dark backgrounds.
- **Bold Typography**: Font weights are increased across the board (e.g., standard text at 500, headers at 600+) for maximum clarity.
- **Thicker Boundaries**: Borders and dividers use slightly thicker strokes (`1.5px` - `2px` for active states) and distinct border colors (`#2f3336`) to clearly separate dense data rows and interactive components.
- **Favorite System (Stars)**: Integrated `★` (active/yellow) and `☆` (inactive/muted) star toggles for quick stock bookmarking.

## 2. Color Palette & Roles

### Background & Surfaces
- **Page Background**: `#0a0a0b` (Deepest charcoal, essentially black).
- **Card / Table Surface**: `#141415` (Slightly elevated dark gray for containers).
- **Hover Surface**: `#1f1f22` (For table row hovers and button hovers).

### Text & Typography
- **Primary Text**: `#f8fafc` (Bright white for maximum contrast).
- **Secondary Text**: `#9ca3af` (Muted gray for labels, table headers, and secondary info).
- **Emphasis Text**: `#ffffff` with `font-weight: 600` or `700`.

### Borders & Dividers
- **Standard Border**: `#2f3336` (Used for table borders, card outlines, and inputs).
- **Active/Focus Border**: `#3b82f6` (Vibrant blue, often 2px thick for focus states).

### Functional & Sentiment Colors
- **Positive / Bullish**: `#10b981` (Vibrant green for positive growth, uptrends, MACD > 0).
- **Negative / Bearish**: `#ef4444` (Vibrant red for declines, downtrends, EPS drops).
- **Favorites (Star)**: `#facc15` (Vibrant yellow/gold for active favorite stars).
- **Brand Accent**: `#3b82f6` (Primary blue for key actions and toggles).

## 3. Typography Rules

### Font Family
- **Primary**: `Inter`, `Camera Plain Variable`, or standard `system-ui, sans-serif`.
- **Weight range**: 
  - 500 (Base reading/table data)
  - 600 (Table Headers, Buttons, Secondary titles)
  - 700 (Main display titles, Tickers)

### Hierarchy & Sizing
- **Screener Tickers**: Extremely bold (e.g., `font-weight: 700`) and slightly larger to make symbols scan easily.
- **Table Data**: Must be crisp. Use `font-weight: 500` to prevent thin fonts from bleeding into the dark background.
- **Buttons / Toggles**: `font-weight: 600` to feel tactile and substantial.

## 4. Component Stylings

### Buttons & Toggles
- **Primary Actions**: Solid background (`#ffffff` or `#3b82f6`), dark text (`#0a0a0b`), and bold weight.
- **Filter Toggles (e.g., Sector, MACD)**: 
  - Inactive: `#141415` background, `#f8fafc` text, `#2f3336` border.
  - Active: `#f8fafc` background, `#0a0a0b` text, `font-weight: 600`.
- **Chart Range Buttons (1D, 1W, 1M, etc.)**: 
  - Must use high-contrast styling so they are visible against dark backgrounds. Active states use solid white backgrounds with dark text.

### Tables (Screener)
- **Header (`<th>`)**: `#9ca3af` text, `font-weight: 600`, uppercase styling, with a solid `#2f3336` bottom border.
- **Rows (`<tr>`)**: `border-bottom: 1px solid #2f3336`. On hover, background shifts to `#1f1f22`.
- **Padding**: Generous padding (e.g., `12px 16px`) to give data room to breathe.
- **Star Column**: First column reserved for the `★` toggle. Center-aligned, `font-size: 1.2rem`.

### Inputs (Search Bar)
- Background: `#141415`
- Border: `2px solid #2f3336` (Thicker for visibility)
- Focus: `2px solid #3b82f6`
- Text: `#f8fafc`, `font-weight: 500`

### Favorite Star (★)
- **Inactive (`☆`)**: `#9ca3af` (Muted), hover shifts to yellow.
- **Active (`★`)**: `#facc15` (Vibrant yellow), with an `.active` class.
- Embedded directly in table rows and on the Stock Detail header. Filters allow isolation of favorited stocks.

## 5. Layout & Spacing

- **Containers**: Max-width of `1400px` for the main screener to utilize modern wide monitors while preventing horizontal sprawl.
- **Gaps**: Use `gap: 12px` or `gap: 16px` in filter bars to ensure interactive elements are distinct and don't clump together.
- **Border Radius**: 
  - `8px` for inputs, cards, and standard buttons.
  - `9999px` (Pill) for specific badge-like toggles or tags.

## 6. Do's and Don'ts

### Do
- **Do** ensure every text element passes WCAG AA contrast ratios against the `#0a0a0b` background.
- **Do** use `font-weight: 500` as the minimum weight for any critical data (tickers, prices, percentages).
- **Do** make interactive borders thick and obvious (`1.5px` or `2px`).
- **Do** use the `★` character for the favorites system.

### Don't
- **Don't** use pure black (`#000000`) for surfaces; use `#141415` to create depth.
- **Don't** use thin font weights (`300` or `400`); they wash out on dark screens.
- **Don't** build a Light Mode. The application is strictly Dark Mode.
- **Don't** hide the Star column; it should always be accessible on the main screener.
