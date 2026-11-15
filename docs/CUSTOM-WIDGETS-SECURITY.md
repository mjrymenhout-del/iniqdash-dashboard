# Custom widgets — what is (and is not) protected, and the plan

## Today
A custom widget package is a folder in `widgets/custom/<id>/` (a `widget.json` manifest, a script and a stylesheet). The server
discovers it on every page load and validates the **manifest** (`server/WidgetPackages.php`): id, version, entry files inside the folder,
declared roles and actions. The actions a package may request are **re-checked on the server** for every call (the same allow-list as
built-in widgets), so a package cannot make the server call an arbitrary Home Assistant service.

**It is not sandboxed.** The package's script runs as ordinary JavaScript in the IniqDash page, with the same rights as IniqDash itself:
it can read the page, the dashboards the signed-in user can see, and call IniqDash's own endpoints as that user (including saving
dashboards and **changing the Home Assistant connection**, which needs a token that the new address accepts). It cannot read the Home
Assistant token: the server never returns it and sends the saved token only to the saved address (until 2026-11-05 a blank-token
connection test could send it elsewhere — fixed, `tests/security.mjs`). It can ask the server to perform any action the allow-list
permits for the entities it is given — and, with ordinary DOM access, for others too. Under a Home Assistant App's ingress it would also
run on Home Assistant's own origin (see `packaging/ha-app/README.md`).

**Content-Security-Policy:** IniqDash pages allow scripts only from IniqDash's own files. A package's entry script is such a file, so it
runs; a package that relies on inline `<script>`, `eval` / `new Function`, or loading code, images or data from another host is blocked
(the browser console names the directive). The policy limits what injected markup can do; it does **not** limit a package's own script.

**Therefore: only install widgets you have read or whose author you trust.** There is no community library, signature, permission
prompt or update mechanism.

## Plan (before any community library)
1. **Isolation.** Run each package in a sandboxed `<iframe sandbox="allow-scripts">` (no same-origin), talking to the host only through
   `postMessage` with a narrow, versioned protocol: it receives the normalised values of its declared roles and the shared visual components
   it needs (rendered by the host or a copy inside the frame), and sends declared intents (e.g. `press`, `set value`) that the host validates
   against the manifest and the binding before anything reaches the server. The existing public interface (`IniqDashUI`) is the starting point.
2. **Permissions in the manifest**, shown before install: which entity roles, which actions, network access (none by default).
3. **Validation and signing:** manifest schema version, file hashes, a signature from a known publisher key; refuse unknown file types.
4. **Compatibility:** the manifest declares the IniqDash / `IniqDashUI` version range it supports; incompatible packages are disabled, not broken.
5. **Install / update / remove** from the UI, with the diff of permissions on update and a rollback.
6. Only then a curated community library.

Until step 1 exists, no documentation should describe custom widgets as safe for untrusted code.
