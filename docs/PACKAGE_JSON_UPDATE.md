/**
 * v10.0 adds ONE new npm dependency:
 *
 *   @anthropic-ai/sdk
 *
 * Install with:
 *
 *   npm install @anthropic-ai/sdk
 *
 * (Claude Code will do this automatically when it sees the import in
 * app/api/m8-chat/route.ts.)
 *
 * After install, your package.json will have a new entry in
 * "dependencies":
 *
 *   "@anthropic-ai/sdk": "^0.32.0"   (or whatever the current version is)
 *
 * Nothing else in package.json changes.
 *
 * WHY THIS FILE EXISTS: I could ship a full package.json in this patch,
 * but doing so would overwrite whatever version Claude Code has been
 * bumping to. Instead, this note tells you (and Claude Code) which
 * package to add. Simpler and safer.
 */
