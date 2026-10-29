# ScanNasYork UI system

The home, screener, stock-detail and Forex pages share one restrained financial workspace.

Country economics uses a two-column, source-labelled policy and inflation comparison for the selected pair, stacking on mobile. Keep observation periods distinct from retrieval times, expose benchmark definitions in native details, and mark missing or stale observations explicitly. Commodity pages use one US column. Country-specific core inflation uses its actual measure name and a visible definition, with YoY/MoM adjustment labels and frequency. Native details expose alternative measures for Canada, Australia and Japan. Swiss HICP is explicitly a harmonised alternative. Missing rates show Unavailable. Do not imply that employment or calendar data are available.

The shared navigation launcher is a 44px icon button fixed 16px from the viewport's top and left on every page and screen width. Its location stays unchanged on scroll and header wrapping. Reserve header space for the brand so the launcher cannot overlap it; retain the accessible Open navigation label, tooltip and modal drawer behavior.

Forex charts use a Candle timeframe control (5m, 15m, 30m, 1H, 4H, 1D, 1W) with automatic history, defaulting to 1H. Display actual history coverage, distinguish source candle times from chart buckets and explain UTC-based 4H aggregation. Open on recent candles at readable spacing, preserve user zoom on resize, and allow the timeframe buttons to wrap on mobile.
The home page is `frontend/index.html`, uses `frontend/css/home.css` and shows saved market data without refreshing upstream sources. Both `/` and `/index.html` open Hero, including the default index on static servers. `/screener.html` opens the screener. Legacy `/home.html` and unknown browser routes redirect to `/`; unknown API routes remain JSON 404.
Keep the ScanNasYork name, emerald identity, all data fields, routes and API wiring.

- Theme: existing brand, with Vantage-inspired flat dark surfaces. No gradients, glass, glow or decorative motion.
- Typography: Geologica, with a system sans fallback. Labels use sentence case, normal tracking and the body face. Financial values use tabular numerals.
- Tokens: `frontend/css/tokens.css` owns colors, fonts, spacing and motion. `base.css` holds the Hallmark foundations, `style.css` the existing components, `workspace.css` the redesign, and `responsive.css` the breakpoint rules.
- Layout: centered container capped at 1480px. The screener places technical filters beside fundamental filters on desktop and stacks them below 960px. Tables retain all columns and scroll within their own container.
- Controls: 40px fields and 44px button or switch hit targets, visible keyboard focus, accessible state attributes and reduced-motion support.
- Data: preserve real values and existing loading, empty and error behavior. Do not introduce sample metrics or claims into the app.
- Financial history: show saved MySQL history independently of refresh requests. Preserve it through source failures. Label financial charts and earnings tables with each statement's reported currency (e.g. DKK); never label foreign-currency statements as USD. Distinguish loading, a failed database read, and genuinely empty history.
- Forex: `frontend/forex.html`, `frontend/css/forex.css` and `frontend/js/pages/forex.js` form an app workspace with an instrument rail, one primary candlestick chart, a price-statistics ledger and a dated FRED macro ledger. Use the same tokens, flat surfaces and 44px controls. Collapse the instrument rail into a native selector on mobile. Label commodity futures and quote units explicitly; distinguish real economic observations from explanatory context and cached/stale data.
- Organization: page behavior lives in `frontend/js/pages`, shared browser helpers in `frontend/js/shared`, stock source logic in `backend/services/stocks`, and Forex/FRED logic in `backend/services/markets`. Keep route handlers thin and maintenance scripts in `backend/scripts`.
- Navigation: `frontend/js/components/site-navigation.js` and `frontend/css/site-navigation.css` provide one shared, collapsible navigation sidebar across all pages. Use the native dialog top layer, subtle slide-in, current-page accent, focus containment/return, Escape and backdrop dismissal. The header contains a single Menu toggle instead of separate Screener/Forex buttons. Honor reduced-motion preferences.
- Hero exception: the user-supplied ASCII globe provides interactive motion with keyboard controls and reduced-motion support. Keep the globe free of visible controls, frame, coordinate readout and captions. Its Canvas runtime lives in `frontend/components/ui/`, alongside the original React TSX reference; market data remains in a separate section below it.

Review with Hallmark in app scope. Render the stock page through its HTTP URL with a `symbol` query parameter; rendering the bare file triggers its existing redirect.
