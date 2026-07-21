/* ════════════════════════════════════════════════════════════════
   COMMUNITY — nav visibility switch
   ════════════════════════════════════════════════════════════════
   The community feature (חדר קהילה + community calendar) is built and
   wired in full, but users should not be pointed at it yet. This flag
   only controls whether nav ADVERTISES it:

   While COMMUNITY_ENABLED is false:
     • the sidebar "עוד" panel drops its community row;
     • the mobile menu drawer drops its community link.

   Deliberately NOT a route guard (owner call 2026-07-21): /community/*
   stays reachable by typing the URL, so the room can still be used and
   tested directly while it is hidden from everyone else. Nothing else
   changes — the screens, hooks, api layer and realtime subscriptions are
   untouched, and they only run once someone is on a /community route.

   Flip to true (one line) to put the feature back in the menu. */
export const COMMUNITY_ENABLED = false
