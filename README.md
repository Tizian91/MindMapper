# MindMapper

Offline mind-mapping tool that runs in the browser. No installation, no account, no build step.

**Start:** double-click `index.html` (Edge or Chrome recommended: there "Save" writes directly back into the file).

**As a web app:** put the folder on any web server with **https** (e.g. GitHub Pages, or Web Station on a NAS)
and open it in Chrome or Edge. The project folder feature needs https (or localhost). Chrome / Edge then offer
**"Install app"**: own window, start menu entry, works offline (`manifest.webmanifest`, `sw.js`).
Your maps stay in your local project folder – nothing is sent to the server.

**Handbook (German):** [`HANDBUCH.md`](HANDBUCH.md) – also reachable from the toolbar button **?**, which can
load the example map again (it is shown on the very first start and contains a short version of the handbook).

## Code layout

| File | Purpose |
|---|---|
| `js/state.js` | Data model (notes, connections), app state, undo/redo |
| `js/geometry.js` | Shapes, anchor points, connection routing, arrowheads (pure math) |
| `js/snapping.js` | Smart guides & grid snapping |
| `js/render.js` | Draws the model into the DOM (HTML notes + SVG connections) |
| `js/meta.js` | Deadline / estimate / priority, tags, chips and filter logic |
| `js/tasks.js` | Task hierarchy of the open map: sub-tasks (arrows, derived maps) and the calculated progress of main tasks |
| `js/views.js` | Automatic views (tree, radial, bubble, treemap) and auto-layout of the notes |
| `js/workload.js` | Planned hours per day / week from estimates and deadlines, buffer until each deadline |
| `js/routines.js` | Recurring notes (meetings, weekly time budgets): rules, capacity, entries in new day / week plans |
| `js/images.js` | Image import (file picker, clipboard, drag & drop), image assets |
| `js/files.js` | Data notes: copy any file into `Assets/`, open / replace it |
| `js/editing.js` | In-place text editing |
| `js/emoji.js` | Emoji / symbol picker (into a note's text or as its own note) |
| `js/actions.js` | Commands (align, copy/paste, zoom, …) used by toolbar, panel and keys |
| `js/interaction.js` | Mouse & keyboard handling |
| `js/panel.js` | Properties panel on the right |
| `js/contextmenu.js` | Right-click menu and the toolbar's "+ Insert" drop-down |
| `js/filterbar.js` | Filter bar (search, tags, priority, deadline, type) |
| `js/storage.js` | Open/save JSON files, auto-save into the file, backup in browser storage |
| `js/project.js` | Project folder sidebar (several maps, sub folders, "New map" dialog, rename/move/delete) |
| `js/templates.js` | Templates for new maps (blank, day, week, month) and carrying over unfinished work |
| `js/transfer.js` | Moving notes between maps (copy + "moved" marker on the original) and the map picker |
| `js/links.js` | Links of notes: other maps of the project, web addresses, or folders / files on the PC (file list in a new tab + path copied for Explorer) |
| `js/overview.js` | Overview of the tasks of all maps in the project folder (type filter, progress, derived maps) |
| `js/main.js` | Startup, toolbar, status bar, demo map |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable web app and offline copy (only when served over https / localhost) |

Rule of thumb: change the model in `MM.state.doc`, then call `MM.commit()`. That records an undo step, autosaves, and redraws.

Handy keys: `Enter`/`F2` edit, `Tab` child note, `Ctrl+D` duplicate, `Ctrl+.` emoji picker,
`Ctrl+Shift+S` save as, `Shift+1` fit, `Ctrl+click` a note opens its link / attached file.

## File format

A map is saved as readable JSON (`*.mindmap.json`); see the comment at the top of `js/state.js`.

Fields added for the newer features (all optional, older files keep working):

| Field | Meaning |
|---|---|
| `node.file` | `{ path, name, size, mime }` of a `file` note; `path` is relative to the project folder (`Assets/…`) |
| `node.meta.progress` | Progress of a task in percent (`0`–`100`, `null` = not set) |
| `node.derivedMap` | Path of the map created from this note (right-click → "Create map from note…") |
| `node.repeat` | Routine rule (`kind`: weekly / monthly-day / monthly-nth / budget / off, `every`, `days`, `day`, `nth`, `weekday`, `time`, `from`, `until`); the duration is `meta.estimate` |
| `item.routine` | To-do entry created from a routine (id of the routine note); not carried over |
| `doc.carriedOver` | `false` for a day / week / month plan created ahead of time: once its period starts, opening it offers the unfinished work of the previous plan (missing = `true`) |
| `node.movedTo` / `node.movedCopyId` | The note was moved to another map; `movedTo` holds its path, `movedCopyId` the id of the copy |
| `node.movedFrom` | Set on that copy: path of the map the note came from |
| `node.movedHintId` | On such a copy: id of the "Moved from …" hint note next to it (removed again by "Undo move") |

Files of data notes live in the project folder under `Assets/`; the map only stores the relative path.
Deleting a note never deletes the file. HTML, SVG and XML files are downloaded instead of shown in a tab,
because scripts inside them would run with the app's rights. `Assets/` is skipped when the project folder is scanned, so
dropped JSON files never show up as maps.

Writing into the folder needs a project directory with read/write permission. If the browser only
"prompts" for it (typical after a restart), the app asks again before copying a file, and a failed
copy is reported instead of silently leaving the note without its asset. Opening a note whose file is
missing offers to pick the file again.

## Roadmap

- [x] Canvas, zoom/pan, shapes, drag & resize
- [x] Connections: anchors, auto-attach, follow notes, straight/elbow/rounded/curve, arrowheads, line styles, labels
- [x] Smart guides + grid (toggleable), align & distribute
- [x] Note types: note, heading, to-do list, outline (Logseq-like nested bullets)
- [x] Right-click context menu (insert, change type, align, route, …)
- [x] Images: as note (connectable, caption, clipped to shape) or as overlay above everything
- [x] Task note (outline + always visible deadline / priority / estimate)
- [x] Metadata (deadline, estimate, priority) + tags, shown as chips ("Details" toggle)
- [x] Filter bar: search, tags (any/all), priority, deadline, type; dim or hide
- [x] Status (open / in progress / blocked / done) incl. filter
- [x] Project folder with several maps, day/week/month templates, auto-save into files (Edge/Chrome)
- [x] Note types: link, code, group (moves the notes inside it)
- [x] Links between maps (month ↔ week ↔ day, missing maps created from the template), Back navigation
- [x] Rename / move / delete maps from the sidebar (links are updated automatically)
- [x] Overview of all tasks in the project, grouped by deadline with time sums, type filter and progress
- [x] Carry over unfinished work into the next week / month / day (old entries marked as migrated);
      plans created ahead of time get it only when their period starts
- [x] Move single notes to another map by right-click (quick picks: next day / week / month)
- [x] Filter: "Keep sub-notes" keeps connected sub-notes and group members visible
- [x] Task progress in percent (panel slider, bar in the note and in the overview)
- [x] Create a map from a note (right-click) and open it again from the note or the overview
- [x] Data notes: drop any file onto the canvas to get a note that opens it (stored in `Assets/`)
- [x] Emoji / symbol picker: into the note text (Ctrl+.) or as a note of its own
- [x] Task hierarchy in the overview ("By task"): an arrow from task A to task B makes B a sub-task of A;
      the tasks of a map derived from A hang below A; main tasks show the average progress of their sub-tasks (in the overview and in the note itself)
- [x] Workload: remaining estimated work (estimate × (1 − progress)) spread evenly over the work days until
      its deadline, across all maps; status bar (today / week / smallest buffer), overview page "Workload",
      effect preview in the panel; capacity (hours per day, work days) in the panel of the empty canvas
- [x] Routines: any note can repeat (weekly / every n weeks, monthly on a day or n-th weekday, weekly time
      budget); they take their time off the capacity and new day / week plans get them as entries;
      days off / vacation (from–until, whole or partial days) remove the capacity and skip appointments
- [x] Priority system per project folder: levels (low … urgent) or Eisenhower quadrants (`meta.quadrant`,
      stored next to `meta.priority`, so switching loses nothing); overview page "Matrix" with tasks as
      circles (area = estimate, inner circle = progress, ring = deadline soon / overdue, "!" = buffer too small),
      classified by dragging them into a quadrant (also in maps that are not open)
- [x] Delete button on task notes (same as Del)
- [ ] Hierarchy (outline sidebar + parent connections, nesting)
- [x] Views of the open map: tree (→ / ↓), radial mind map, bubble map, treemap (size = estimated time,
      color = status; toolbar "Views" or right-click "Show as"); tree and radial can be applied to the
      real notes as auto-layout (whole map or the sub-notes of one note, Ctrl+Z undoes it)
- [ ] Export PNG / SVG / PDF

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, change and share for any **noncommercial**
purpose (private use, friends, clubs, education, research). Commercial use needs the author's permission.
