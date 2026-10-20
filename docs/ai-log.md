# AI work log

## Build 1: Domain core

- **Asked:** Implement the terminal-only Build 1 event-ticketing domain using
  plain JavaScript ES modules and Node.js built-ins: domain errors, secure IDs
  and readable references, a linked-list FIFO queue, inventory and booking
  rules, a demo, and a lookup benchmark.
- **What came back:** The project files and demo flow were available in a
  nested clone, while the root project had only a demo and package manifest.
  The root demo imported modules from a location that did not exist in the root,
  and the root npm scripts pointed into the clone.
- **What was wrong and what changed:** The root project was not self-contained,
  so running its demo depended on the clone. Added the domain modules and
  benchmark under the root, corrected the root demo imports, and changed the
  npm scripts to run root-project files. Added this log and root usage
  instructions.
- **Checks run:** `npm run demo`, `npm run benchmark`, and JavaScript syntax
  checks passed. The demo showed the sold-out refusal, cancellation, and
  first-in-line waitlist name; the benchmark showed `Map.get` substantially
  faster than `Array.find` for the measured lookups.

## Build 2: Event search, sorting, and tests

- **Asked:** Add stable merge sort, publishable event summaries, pure event
  filtering and sorting, acceptance-criteria tests, and an `npm test` script.
- **What came back:** The source Build 2 document had no S04 publishing
  criteria written in its placeholder section.
- **What was wrong and what changed:** Asked for the missing criteria before
  implementing S04. Used the agreed criteria: publishing requires a ticket
  tier, a published event appears in the public list, and unpublishing hides
  it. Added those criteria to the root `docs/build-2.md`. Implemented Build 2
  in the root project without changing the nested clone.
- **Checks run:** `npm test` (28 tests), `npm run demo`, `npm run benchmark`,
  JavaScript syntax checks, and `git diff --check` all passed.
