# Design language

promptdraw's look and feel, distilled from a study of open-source whiteboard tools and adapted for building prompts instead of drawings.

Those tools are used for general feel and common interaction patterns only. promptdraw has its own name, accent hue, copy, icons and file format, and copies no code, logos or illustrations from them.

## Principles

Six rules that every screen and component should follow; when two designs compete, pick the one that honours more of these.

1. **The canvas is the product.** Controls live on small floating islands over an infinite, plain canvas. There is no app header, no permanently open sidebar and no page chrome.
2. **Two type voices.** Canvas content is hand-drawn and loose; controls use a clean, quiet UI font. The contrast between the two is the signature look.
3. **Few colours, one accent.** Chrome is near-white and grey. A single soft violet marks primary, selected and focused states.
4. **Show controls only when they apply.** The properties island appears only when something is selected or a styled tool is active. Hints appear only on an empty canvas.
5. **Keyboard first, mouse friendly.** Every tool has a one-key shortcut, and the digit is printed on its button.
6. **Local first, no account.** Work autosaves to the browser and can be exported or imported as a file. Nothing needs a server.

## Tokens

All visual values are CSS custom properties defined once and consumed everywhere; components never hard-code a colour, radius or font.

### Colour

A neutral grey scale plus one violet accent, with semantic names so light and dark themes swap values without touching components.

- **Accent:** violet `#6c63ff`, picked to keep a distinct identity. It has darker hover and pressed steps, a pale "light" tint for the active tool, and a "primary container" tint for selected states. Filled accent surfaces carrying white text (Copy, the current mode, primary buttons, step numbers) and small accent text use a deeper `--color-primary-fill` step (`#5a50e8`, 5.6:1 against white) so they pass WCAG AA; the lighter violet stays for outlines, rings, tints and icons. In dark mode both are the same pale violet under dark text.
- **Surfaces:** canvas and island are white. Buttons and inputs sit on a faint low surface and darken one step on hover.
- **Text:** a near-black primary, a muted grey for labels, and a fainter grey for shortcut digits.
- **Lines:** one hairline colour for island borders and dividers.
- **Canvas interaction:** selection boxes and handles use the accent stroke over a ~8% accent fill. Destructive actions use one red.
- **Elevation:** islands get a soft three-layer hairline shadow instead of a border. Modals get one deeper shadow over a dimmed backdrop.
- **Layers:** one z-index scale in `tokens.css`, lowest first: canvas overlays, islands, phone bottom sheets (with the docked tab bar and stage bar riding on them), popovers (menus), the toast, modal dialogs, tooltips.

### Theme

Light, dark and system modes; the UI chrome is themed by tokens while the canvas keeps light-mode colours and is inverted as a whole in dark mode.

- An explicit `data-theme` attribute on the root element wins. Without one, the system colour-scheme preference decides.
- Dark mode inverts only the canvas layer (invert ~93% plus a 180° hue rotate), so stored documents never depend on the theme and exported images look the same either way.
- In dark mode islands also get a 1px hairline border, because shadows read poorly on dark backgrounds.
- The chosen mode is remembered per viewer and applied before first paint to avoid a flash of the wrong theme.

### Shape and size

A 4px spacing unit and a small radius scale keep every island, button and swatch visually related.

- Spacing: 4px base. Islands use 4px inner padding and sit 12px in from the viewport edge. A component that is also an island (menus, dialogs, the inspector) sets its own padding on `.name.island`, since the island rule loads later and would win; menus keep 6px. Content inside a group is inset equally on every side it meets the edge, so nothing sits flush on the bottom.
- Radius: 4px for swatches and chips, 6px for buttons and inputs, 8px for islands and menus, 12px for modals.
- Buttons: 36px square in the toolbar, 32px in panels. Icons are 16 to 20px.
- Dividers: 1px wide, 24px tall, hairline colour.
- Swatches: 1.75rem squares; the selected one gets a 1px accent outline with a 2px offset.
- Islands: properties island about 200px wide; sidebars about 300px.

### Typography

Two voices: a hand-drawn marker font for canvas content and a neutral sans for chrome, plus monospace for compiled prompt text.

- **Hand-drawn:** Kalam at 700 for block titles and canvas text (the 400 cut is too faint at canvas sizes). Caveat 700 for the handwritten hint labels.
- **UI:** Assistant, falling back to the system UI stack. 15px base at weight 500, 13px labels at 600, 700 for panel and dialog titles; nothing below 12px, shortcut digits included. Text is not forced to grayscale antialiasing, which thins it on macOS.
- **Sturdy by default:** every weight is a token (`--weight-body`, `--weight-label`, `--weight-heading`, `--weight-title`, `--weight-hand`) so the whole UI can be made heavier or lighter in one place.
- **Monospace:** a code stack (Cascadia Code, JetBrains Mono, system mono) for prompt bodies and the compiled-prompt preview.
- All fonts are OFL-licensed and self-hosted from the build, so the app makes no third-party font requests.

### Icons

Outline icons in one consistent style so the toolbar reads as a single family.

- Stroke only, 1.75 on a 24 grid (heavy enough to sit beside 600-weight labels), round caps and joins, no fill, `currentColor`.
- Source from an open icon set with a matching style (Tabler or Lucide). Draw custom icons for anything prompt-specific.

### App icon

A dark "night canvas" tile where a function card and a stage card flow into a large prompt card, drawn in the canvas block colours.

- One hand-drawn SVG, `public/favicon.svg`, serves as the browser tab icon and the README logo.
- Dark ink tile (`#1f1d2b`) with the canvas dot grid. A pink function card and a violet stage card sit on the left, and their curved arrows lead into a blue prompt card that fills the right half and holds a `>_` caret.
- Each card has a second offset outline for the sketched look. The prompt card and caret are big enough that the icon still reads at 16px.

## Layout anatomy

A full-viewport canvas with islands pinned to its corners and edges; each island owns one job and nothing else sits on top of the canvas.

- **Main menu (top-left):** one labelled button opening a dropdown island with open, save, export, import, reset, help and the theme switch: a segmented control whose Light, Dark and System segments each carry an icon and its word. Closes on Escape or an outside click.
- **Toolbar (top-centre):** tool lock, divider, the tools in shortcut order, divider, an overflow for rarer tools. Each button shows its shortcut digit small and muted in the bottom-right corner; the active tool has the pale accent fill.
- **Properties island (left, under the menu):** edits whatever is selected. Groups are separated by small grey sentence-case labels. It scrolls when taller than the viewport and is hidden when there is nothing to edit.
- **Zoom and history (bottom-left):** a minus / percentage / plus island, where clicking the percentage resets to 100%, next to an undo/redo island whose buttons grey out when there is nothing to do.
- **Help (bottom-right):** a labelled `?` button that opens the shortcuts dialog.
- **Star ribbon (top-right of the free canvas):** a diagonal "★ Star on GitHub" band in the accent fill, linking to the repository. It sits just left of whatever holds the right edge's top and hides when the top row leaves it no room, so it never covers a close button or a tool.
- **Sidebar (right):** slides in from a top-right button for the library and, for promptdraw, the compiled prompt. When pinned, the canvas shrinks instead of being covered.
- **Welcome overlay:** on an empty canvas only. A hand-drawn wordmark, the job in three numbered steps (1 Describe the task → 2 Tick how the agent should work → 3 Copy the prompt), a muted line explaining that work stays in the browser, three or four quick actions with shortcut hints closed by a Got it button with an accent outline inside the frame (touch screens drop the key chips and the keyboard-only actions; a card narrower than 40rem keeps the steps on one line as bare verbs, 1 Describe → 2 Tick → 3 Copy, and on phones the wordmark shrinks and the muted line goes, so the card stays a short strip), and handwritten arrows pointing at the menu, the toolbar's Copy ("3 · Copy it here", step 3) and help. It ignores the pointer except on its actions and disappears once the canvas has content.
- **Mobile (under 730px wide):** the toolbar moves to a bottom bar, properties open as a bottom sheet, the menu stays top-left, and zoom buttons give way to pinch-zoom.

## Interaction rules

How input maps to behaviour; consistency here matters more than any single gesture, because every surface reads from the same action list.

### Tools

Single-key tool switching with an optional lock, so drawing several blocks in a row is quick.

- promptdraw's tools: `1` select, `2` block, `3` note, `4` arrow, `5` text, `0` eraser, `H` hand, `Q` tool lock.
- Without the lock the app returns to Select after each placement. With it, the lock icon fills with the accent.
- Double-click empty canvas to add text; double-click a block or press Enter on it to edit it.

### Navigation

Pan and zoom follow common whiteboard conventions so the canvas feels familiar without a tutorial.

- Pan with Space+drag, middle-mouse drag, the Hand tool, the scroll wheel (Shift for horizontal) or two-finger trackpad scroll.
- Zoom with Ctrl/Cmd+wheel toward the cursor, pinch, or Ctrl/Cmd plus and minus. Ctrl/Cmd+0 or clicking the percentage resets.
- Shift+1 fits everything; Shift+2 zooms to the selection. Zoom ranges from 10% to 3000% in 10% steps.
- The Simple task board zooms from 25% to 200%; its zoom island carries Fit (Shift+1) too, which shows the whole flow centred in the free canvas, never above 100% (a flow too big even at 25% starts at the free area's top-left).
- Every camera move is animated, never a jump: wheel, pinch and drag ease toward where they point, and buttons, keys and fit glide there. Reduced motion turns this off.

### Selection and editing

Direct manipulation with keyboard equivalents for every edit.

- Click selects, Shift+click adds, dragging on empty canvas draws a marquee with an accent outline and pale accent fill.
- A selection shows a dashed accent bounding box with square handles.
- Standard shortcuts: select all, duplicate, delete, group, nudge with arrow keys (Shift for bigger steps), layer order with brackets, copy, cut, paste, and undo/redo kept as snapshots of the element list.
- Arrows bind to blocks, so moving a block keeps its connections attached.

### Menus and dialogs

Every command is registered once and surfaced through the toolbar, context menu, command palette and shortcuts dialog alike.

- **Action registry:** each action has an id, label, icon, keywords, shortcut, an availability check and a perform function. All surfaces read from it, so shortcuts and labels never drift apart.
- **Context menu:** styled like an island (8px radius, 32px rows, a grey shortcut hint on the right, dividers between groups). Destructive items are red.
- **Command palette:** Ctrl/Cmd+/ opens a centred ~560px modal with fuzzy search, results grouped by category, arrow-key navigation and recent commands first.
- **Dialogs:** centred, 12px radius, 20–24px inner padding (not the island's 4px), dimmed backdrop. They close on Escape or a backdrop click, trap focus and are announced as modal dialogs. The shortcuts dialog lists keys as small `kbd` chips.

### Persistence

Local-first storage under promptdraw's own key namespace, with an explicit file format for moving work between browsers.

- Autosave is debounced after each change and also runs when the tab hides or closes.
- Only durable state is saved (document, theme, zoom, scroll, grid, current styles), never transient UI such as open menus.
- Other tabs are kept in sync by listening for storage changes and reloading when another tab is newer.
- Files carry their own `type` string and version, are validated on import, and are migrated forward by version.

## Motion

Every change on screen moves briefly to say where something came from; nothing waits on it. Only transform and opacity animate, and exits run about 30% faster than entries.

Tokens: `--dur-1` 120ms (hover, press), `--dur-2` 200ms (popovers, rows, cards), `--dur-3` 280ms (panels, sheets, dialogs); `--ease-out` for entries, `--ease-in` for exits ([[src/ui/lib/motion.ts#DUR]] mirrors them for script). CSS motion lives in `src/ui/styles/motion.css`.

- Panels: How to work slides in by its width on reopen and out on its ×; the Prompt panel slides 24px in as How to work fades (and back); the Settings panel grows from 96%; phone sheets slide up and down ([[src/ui/lib/motion.ts#usePanelMotion]]).
- How to work rows: a ticked option's settings drop 4px in and fold away; rows the search brings back fade in, rows it drops fold away; the chevron turns 180°.
- The Simple task board ([[src/ui/lib/boardMotion.ts#useBoardMotion]]): new cards grow from 96% 40ms apart, removed ones shrink away, cards that stay glide to their new place with their frames, a new loop or group frame fades in, and locking dims gradually. An arrow whose path is unchanged stays still; a new or re-routed one is hidden until the cards land, then draws along its path (a dashed one fades), so no arrow points at where a card was.
- Chrome: hover colours ease, a press dips to 97%, the mode pill slides between Simple task and Stages, menus drop 4px and grow from 98%, dialogs grow from 96% over a fading backdrop, toasts rise 6px, Copy prompt's icon cross-fades and its tick draws, the welcome arrows draw before their words, and switching tabs fades the canvas in while an empty island carries the right-hand panel from where it stood to where the new tab's panel stands ([[src/ui/lib/motion.ts#morphPanel]]).

A reload draws everything in place: entries wait for `:root[data-motion]`, set two frames after the first paint ([[src/ui/lib/motion.ts#useMotionReady]]), and the board animates only when its cards or locks change. Exits use inert copies of what left ([[src/ui/lib/motion.ts#ghost]]), put in place only once React has really removed the original, so unmounting stays immediate. Reduced motion turns all of it off, pseudo-elements (tooltips) included.

Panels keep one inset: the Prompt panel 16px on every side (over `.island`'s own padding), with its note, text and counts sharing a 12px inner inset; How to work 12px throughout.

## Rendering

How the hand-drawn look is produced while keeping redraws stable and cheap.

- Shapes are drawn with rough.js on a canvas, and SVG export uses its SVG renderer.
- Each element stores a random seed at creation and passes it to rough.js, so its wobble stays identical between redraws.
- Sloppiness maps to rough.js roughness (0, 1, 2); stroke width to 1, 2 or 4; fill to hachure, cross-hatch or solid.
- Two layers: a static canvas redrawn only when the document changes, and an interactive canvas on top for selection, handles and the marquee.
- Each element's rough drawable is cached and regenerated only when that element's version changes. Off-screen elements are skipped.
- Fonts are loaded before the first paint so text layout does not jump.

## Prompt builder mapping

How the whiteboard vocabulary becomes promptdraw's vocabulary: shapes become prompt blocks and arrows become ordering.

- **Blocks:** stages, notes, functions and the intentions block are drawn as rough rectangles with a hand-drawn title and a monospace body.
- **Arrows and groups:** flow order, parallel groups and loops are shown with arrows and hand-drawn frames around the blocks they contain.
- **Properties island:** edits the selected block's fields in one calm column: a sticky title row, sections under small all-caps headings, short labels with one-line hints, 18px side padding and 16px between fields; colour tags reuse the swatch component.
- **Library:** holds reusable stage templates and prompt snippets.
- **Command palette:** adds prompt actions such as compile, copy compiled prompt and insert a function call.
- **Export:** a prompt (Markdown) option alongside image and JSON export.

## Where the app departs from this spec

This document is the target language; the app implements most of it. These parts of the spec are not built yet, and the app works around them as noted.

- **Task tab canvas:** pans and zooms like a board, but is bounded to its sheet (it can't be panned out of sight) and zooms 50–200%.
- **Context menu:** only the Stages canvas has one; the Task tab has none.
- **Image export:** there is no PNG, SVG or copy-as-image dialog; export covers settings JSON, workflow YAML and the prompt as Markdown.
- **Library sidebar:** saved workflows are reached from the stage bar's File menu, not a library sidebar.
- **Grid toggle and tool lock:** neither exists; the dot grid is always shown.
- **Labelled tools:** toolbar and stage-bar buttons carry a word beside the icon and the key in a badge, rather than an icon with a corner digit, so modes read without hovering ([[src/ui/components/ToolButton.tsx#ToolButton]]).
- **Tool keys:** the `1` select, `2` block … keymap above is not used. `1` and `2` switch the Task and Stages modes, `3` and `4` toggle the panels, and on the Stages tab letters add blocks (`S` stage, `P` prompt, `F` function, `I` intentions).
- **Rendering:** shapes are rough.js SVG paths rendered by React ([[src/ui/stages/sketch.ts]], [[src/ui/components/RoughFrame.tsx#RoughFrame]]), not two stacked canvases. Seeds are hashed from element ids ([[src/ui/stages/scene.ts#seedOf]]) and drawables are cached by their arguments rather than by an element version.
- **Block colour tags:** blocks have no colour swatches; card kinds are told apart by their tag and shape.
- **Palette prompt actions:** the palette has Copy prompt and the stage add, loop and parallel commands, but no separate compile or insert-function-call action; calls are added from the inspector's uses panel.
- **Library contents:** stage templates come from the add menu, and the browser library holds whole saved workflows, not prompt snippets.
- **Stage navigation:** zoom runs 10–300% ([[src/ui/stages/viewport.ts#ZOOM_MAX]]) and there is no Shift+2 zoom-to-selection; Shift+1 fits.
- **Stage selection:** blocks sit in an automatic flow layout, so there is no marquee, free placement, duplicate, copy/paste, nudging or layer order. Shift/Ctrl/Cmd-click or tick boxes tick blocks for grouping (a plain click only focuses), Alt+arrows move a block within the flow, and arrows walk the cards.
- **File format:** files use the Python app's own `.prompt_builder.json` and workflow YAML, with no promptdraw `type` string or version, so they stay interchangeable with the Python app.

## Borrow versus avoid

The line between using common, openly licensed patterns and imitating another product's identity.

- **Borrow:** floating islands, a single violet-family accent, hairline shadows, number-key tools with printed digits, tool lock, Space-drag pan, Ctrl-wheel zoom, a hand-drawn content font paired with a clean UI font, rough.js, local-first autosave, file import/export, a library, the command palette, grouped context menus and the shortcuts dialog.
- **Avoid:** any such tool's name, logo, favicon, wordmark and illustrations; its exact copy, menu wording and links; its file `type` string and extension; and verbatim icons, stylesheets or components. Never combine one tool's exact palette, layout and fonts so closely that promptdraw could pass for it.
- **Attribution:** the README or About credits "design inspired by open-source whiteboard tools", and third-party licences are listed in the notices file.
