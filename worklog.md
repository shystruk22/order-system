---
Task ID: 1
Agent: Main Agent
Task: Unify all HTML files with shared infrastructure and real-time sync

Work Log:
- Read all 3 HTML files (assortment.html 1259 lines, sneki.html 2568 lines, fish-order.html 3304 lines)
- Read all shared JS files (shared-utils.js v3.0 root, v3.1 sneki-app/, shared-data.js, storage.js)
- Identified problems: each file uses different localStorage keys, duplicate parsing code, no cross-tab sync
- Copied sneki-app/shared-utils.js (v3.1) to root (replaces v3.0)
- Copied sneki-app/shared-data.js to root (didn't exist before)
- Copied sneki-app/storage.js to root (sneki.html referenced it but it wasn't at root)
- Rebuilt assortment.html: removed ~350 lines of duplicate code, added shared script refs, added SharedData sync
- Updated sneki.html: added shared-data.js ref, added useEffect to sync products to SharedData
- Updated fish-order.html: added shared-data.js ref, added syncFishAssortment() helper, added onChange listener

Stage Summary:
- All 3 files now share: shared-utils.js, shared-data.js, storage.js
- Real-time cross-tab sync via SharedData (500ms polling + storage events)
- Shared data flow: assortment.html ↔ SharedData ↔ sneki.html / fish-order.html
- Files saved: assortment.html, sneki.html, fish-order.html + 3 shared JS files at root
