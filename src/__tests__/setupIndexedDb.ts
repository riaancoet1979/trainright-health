// jsdom provides no IndexedDB, so the sync outbox cannot open a database and
// every tracked write logs a queueing failure. Installing the shim globally
// keeps test output clean and, more usefully, means the existing storage tests
// exercise the real capture path rather than silently skipping it.
import 'fake-indexeddb/auto';
