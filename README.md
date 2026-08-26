# ScriptGuard AI

Micro-SaaS developed by **Abdelati Zarzori**.

ScriptGuard AI is a browser-based code review workspace for inspecting source files, viewing security and quality findings, translating Python comments and string literals, and packaging local files as ZIP archives. The interface supports Arabic RTL presentation and keeps file-manager operations local to the browser.

## Current capabilities

The Python translator scans comments and single, double, and triple-quoted string literals while preserving Python keywords, identifiers, operators, indentation, and file structure. It protects f-string expressions and placeholders and leaves byte-string bodies unchanged. The file manager accepts multiple files or a complete directory, preserves relative paths, provides local read/edit/save controls for text files, and creates a downloadable ZIP without automatic upload.

The local translator is a structure-preserving fallback, not a complete natural-language engine: unfamiliar words may remain untranslated, malformed or unterminated Python strings are not rewritten, and the UI warns the user when the server translation route is unavailable. For complete language translation, configure the server and use `POST /api/translate`; review all generated code before execution.

The code-analysis screen can use the configured API when available. If the API cannot be reached, the interface falls back to clearly labelled local demonstration data; demonstration results must not be treated as a real security audit.

## Run locally

Serve the repository with any static HTTP server, for example:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`. The project currently uses CDN dependencies for Tailwind CSS, Prism, Font Awesome, and JSZip, so an internet connection is required for the full visual experience.

## API configuration

The current frontend defaults to `http://localhost:3000`. The repository now includes an optional deployable `server.mjs` API. Run it with `PORT=3000 node server.mjs`; configure `OPENAI_API_BASE`, `OPENAI_API_KEY`, `LLM_MODEL`, and `ALLOWED_ORIGIN` only as server environment variables. It exposes `GET /api/health`, `POST /api/analyze`, and `POST /api/translate`. The browser translator remains structure-first and local by default; the API translator is available for a deployment that has been reviewed for privacy and credentials. Never place API keys, passwords, or provider credentials in this repository or in browser code.

## Privacy and safety

Files selected in the ZIP manager remain in browser memory and are not uploaded automatically. Editing a file changes only the in-memory ZIP item until the user downloads the archive. Do not upload secrets, private keys, production credentials, or confidential source code to an analysis service unless the deployment's privacy policy and server configuration have been reviewed.

## Tests

Run `npm run test:translator` to exercise comments, docstrings, triple-quoted strings, escaped quotes, raw strings, byte strings, f-string expressions, nested braces, and identifier preservation. Run `node --check app.js` and `node --check server.mjs` for syntax validation.

## Developer

**Abdelati Zarzori** — product owner and lead developer.

## License

Add a project license before public redistribution.
