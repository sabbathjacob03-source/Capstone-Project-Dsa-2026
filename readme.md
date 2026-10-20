# Event Ticketing and Booking

A terminal-only capstone project with event inventory, bookings, publishing,
event search, stable sorting, and automated tests. It uses plain JavaScript ES
modules and Node.js built-in modules; no third-party packages are required.

## Requirements

- Node.js 22.13.0 or newer

Check your installed version with:

```bash
node --version
```

## Run the project

From the project root, run the demo:

```bash
npm run demo
```

The demo creates an event and a ticket tier, sells out the tier, shows a booking
being refused with `SOLD_OUT`, adds two people to the waitlist, cancels a
booking, and names the next person in line.

Run the lookup benchmark with:

```bash
npm run benchmark
```

It compares finding bookings in an array with looking them up by reference in
a `Map`. Array search is O(n); Map lookup is O(1) on average.

Run the automated tests with:

```bash
npm test
```

The event search functions filter published event summaries by text, city,
date, price and availability, then sort them using a stable merge sort.

## Project structure

```text
src/domain/                 Event, inventory, search, sorting, ID, and queue logic
scripts/                    Lookup benchmark
test/                       Automated tests using node:test
demo.js                     Guided terminal demonstration
package.json                ES module configuration and npm scripts
docs/ai-log.md              Build-by-build notes on AI-assisted work
```

## Domain overview

- A booking holds 1 to 10 tickets from a single tier.
- Ticket prices are stored as whole cents.
- Bookings cannot exceed a tier's capacity. A sold-out attempt throws a
  `DomainError` with the `SOLD_OUT` code and does not change inventory.
- Cancelling a booking releases its seats. A booking cannot be cancelled twice.
- Booking references are generated with `node:crypto` and can be used for
  direct `Map` lookup.
- The waitlist is a linked-list queue, so enqueueing, peeking, and dequeuing
  take O(1) time.

See [docs/ai-log.md](docs/ai-log.md) for the AI-work log.
See [docs/build-2.md](docs/build-2.md) for the Build 2 publishing criteria.