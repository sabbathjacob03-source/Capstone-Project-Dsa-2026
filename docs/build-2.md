# Build 2: Search, sorting, and first tests

## S04: Publish and unpublish events

1. Only an event with at least one ticket tier can be published; attempting to
   publish an event with no tiers returns `INVALID_STATE`.
2. Publishing a valid event marks it as `published` and includes it in the
   public event list.
3. Unpublishing an event hides it from the public event list again.

These criteria were agreed for the root project while implementing Build 2.
