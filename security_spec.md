# Security Specification (Phase 0)

## Data Invariants
1. No unauthenticated or unverified-email user can read, list, create, update, or delete any document in `/pools` or its subcollections.
2. Every `Pool` document has `ownerId == request.auth.uid` on creation, `memberIds` bounded to 1–10 valid UIDs, and `ownerId` immutable thereafter.
3. No PII (`email`, `phone`, `address`) is stored in `/pools`, `/measurements`, `/products`, or `/treatments`.
4. Every subcollection document (`measurements`, `products`, `treatments`) MUST belong to an existing parent pool where the caller is a member (`request.auth.uid in get(/databases/$(database)/documents/pools/$(poolId)).data.memberIds`).
5. Every `allow list` rule evaluates `request.auth.uid in resource.data.memberIds` directly without calling `get()` or `exists()`.
6. Every `create` enforces `createdAt == request.time && updatedAt == request.time`, and every `update` enforces `createdAt == existing().createdAt && updatedAt == request.time`.
7. Document IDs are strictly bounded (`<= 128` chars) and match `^[a-zA-Z0-9_\-]+$`.

## Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/pools/piscine-48m3` -> DENIED.
2. Authenticated user with `email_verified: false` creating a pool -> DENIED.
3. Creating a pool with `ownerId` spoofed to another UID -> DENIED.
4. Creating a pool with an extra ghost field (`isAdmin: true`) -> DENIED via `keys().hasOnly(...)`.
5. Creating a pool with `volumeM3: -10` or `volumeM3: 99999` -> DENIED.
6. Joining a pool while overwriting `ownerId` or `volumeM3` or adding a third-party UID -> DENIED.
7. Listing `/pools` or `/pools/{id}/measurements` without `array-contains` on `memberIds` -> DENIED.
8. Injecting a 2KB oversized `poolId` or invalid characters (`../admin`) -> DENIED via `isValidId()`.
9. Creating a `WaterMeasurement` with `authorId != request.auth.uid` -> DENIED.
10. Updating `WaterMeasurement` with a fake `createdAt` or invalid `source: 'hacked'` -> DENIED.
11. Creating a `PoolProduct` with negative `quantity: -5` -> DENIED.
12. Deleting a `/pools/{poolId}` document as a non-owner member -> DENIED.
