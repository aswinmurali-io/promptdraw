This directory defines the high-level concepts, business logic, and architecture of this project using markdown. It is managed by [lat.md](https://www.npmjs.com/package/lat.md) — a tool that anchors source code to these definitions. Install the `lat` command with `npm i -g lat.md` and run `lat --help`.

- [[architecture]] — Start here: the core, shell and stage-editor layers, how an edit flows to the prompt and storage, and the Python app's compatibility contract.
- [[core]] — The pure TypeScript port of the Python app's prompt logic: modules, deliberate differences from the Python, and the ported tests that guard it.
- [[ui]] — The React app shell: islands, intention cards, action registry and shortcuts, persistence, file import/export, and the Stages canvas mount point.
- [[stages]] — The stage editor: the hand-drawn infinite workflow canvas, its inspector island, menus, shortcuts and workflow library.
- [[design]] — Design language: principles, tokens, layout anatomy, interaction rules and rendering, distilled from a study of open-source whiteboard tools.
- [[testing]] — How the suites are organised, the ported tests, and how to regenerate the constants.
- [[deploy]] — The static build in `dist/`, hosting it on any static host, and where visitor data lives.
