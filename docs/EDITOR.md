# Editor: keyboard shortcuts and structure notes

## Keyboard (editing mode; nothing fires while typing in a field or while a dialog is open)

| Keys | Action |
|---|---|
| `Tab` / `Shift+Tab` | move between toolbar, canvas items (each is focusable and named), inspector and navigation |
| `Enter` / `Space` | activate the focused button, link or navigation item |
| `Arrow keys` | move the selected item by one grid unit (free-position surfaces: 1 px; `Alt` = 10 px) |
| `Shift` + `Arrow keys` | resize the selected item the same way |
| `Ctrl/Cmd+C`, `Ctrl/Cmd+V` | copy / paste the selected item (editor-internal clipboard) |
| `Ctrl/Cmd+Z` | undo · `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z` redo (one history entry per user action, including a Smart Grid reflow) |
| `Escape` | cancel a drag in progress · deselect the selected item (focus stays on it) · close a dialog or popup · leave full-screen Test Mode (a popup / dialog gets the key first) |

**Configuration modals never close on a click outside them**: only Apply, Cancel / Close or Escape (= Cancel) close them — see [POPUPS.md](POPUPS.md#configuration-modals-the-dismissal-rule).

There is no keyboard shortcut for delete, duplicate or save: use the buttons (delete asks for a second press to confirm).

**Containers.** Duplicate and copy / paste of a *container* copy the container only and say so (“without its items”); duplicating a *page* copies everything on it. Deleting a container removes its items (one undo restores all). A container can hold widgets but not another container (one level of nesting). Pasting while a container is selected puts the widget inside it.

**Tabbed containers.** The same rules, per tab: one tab is edited at a time (press it on the canvas, or pick it in the panel), and adding, pasting or moving into the container places items in that tab. Removing a tab removes its items (one undo restores both). See [POPUPS.md](POPUPS.md).

## Structure notes for a future full-screen editor

Assessment, no code change made for it: the dashboard surface (`.ed-stage` → `.ed-frame`) already runs without any editor chrome — Test Mode hides the toolbar,
preview bar, inspector and overlay and only scales the stage. The inspector already has two presentations (docked side panel, collapsible bottom sheet on narrow
screens). What would need untangling if the toolbar and inspector became floating panels over a full-screen canvas: `layout()` sizes the frame from
`stage.clientWidth` and the window height available under the toolbar (`deviceRoom()`), and the stage's own size depends on the docked inspector; the selection /
guide overlay already lives inside the stage and is independent of the chrome.
