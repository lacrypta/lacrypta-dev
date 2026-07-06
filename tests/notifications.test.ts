import assert from "node:assert/strict";
import test from "node:test";
import {
  countUnread,
  effectiveCreatedAt,
  emptyReadState,
  isUnread,
  mergeReadState,
  passesJoinFloor,
  pruneReadState,
} from "../lib/notifications/logic";
import type {
  AppNotification,
  NostrEventLike,
  NotificationSourceCtx,
  ReadState,
} from "../lib/notifications/types";
import { badgeAwardSource } from "../lib/notifications/sources/badgeAward";
import { zapSource } from "../lib/notifications/sources/zap";
import { appNotificationSource } from "../lib/notifications/sources/appNotification";
import { broadcastSource } from "../lib/notifications/sources/broadcast";
import { normalizeBroadcastHref } from "../lib/notifications/broadcast";

const ME = "a".repeat(64);
const ISSUER = "b".repeat(64);
const PUBLISHER = "c".repeat(64);
const FRIEND = "d".repeat(64);
const STRANGER = "e".repeat(64);

function notif(over: Partial<AppNotification>): AppNotification {
  return {
    id: "n1",
    type: "badge-award",
    createdAt: 1000,
    title: "t",
    trusted: true,
    ...over,
  };
}

function ctx(over: Partial<NotificationSourceCtx> = {}): NotificationSourceCtx {
  return {
    pubkey: ME,
    publisherPubkey: PUBLISHER,
    follows: new Set([FRIEND]),
    installedAt: 500,
    now: 2000,
    ...over,
  };
}

// ── logic ────────────────────────────────────────────────────────────────────

test("effectiveCreatedAt clamps a future created_at to first-seen", () => {
  assert.equal(effectiveCreatedAt(9999, 1000), 1000);
  assert.equal(effectiveCreatedAt(800, 1000), 800);
});

test("join floor drops pre-install relay events but never static ones", () => {
  assert.equal(passesJoinFloor(notif({ createdAt: 400 }), 500), false);
  assert.equal(passesJoinFloor(notif({ createdAt: 600 }), 500), true);
  // static types are exempt even when before the floor
  assert.equal(
    passesJoinFloor(notif({ type: "new-hackathon", createdAt: 400 }), 500),
    true,
  );
  assert.equal(
    passesJoinFloor(notif({ type: "community-call", createdAt: 1 }), 500),
    true,
  );
});

test("unread respects trust, dismiss, mute, lastReadAt and readIds", () => {
  const base = emptyReadState(0);
  // fresh trusted item, lastReadAt=0 → unread
  assert.equal(isUnread(notif({ createdAt: 1000 }), base), true);
  // untrusted (request) never unread
  assert.equal(isUnread(notif({ trusted: false }), base), false);
  // covered by lastReadAt floor
  assert.equal(
    isUnread(notif({ createdAt: 1000 }), { ...base, lastReadAt: 1000 }),
    false,
  );
  // explicit read id wins even if newer than lastReadAt
  assert.equal(
    isUnread(notif({ id: "x", createdAt: 5000 }), { ...base, readIds: ["x"] }),
    false,
  );
  // dismissed hidden
  assert.equal(
    isUnread(notif({ id: "x", createdAt: 5000 }), {
      ...base,
      dismissedIds: ["x"],
    }),
    false,
  );
  // muted type not unread
  assert.equal(
    isUnread(notif({ type: "zap", createdAt: 5000 }), {
      ...base,
      mutedTypes: ["zap"],
    }),
    false,
  );
});

test("countUnread only counts eligible items", () => {
  const state = emptyReadState(0);
  const items = [
    notif({ id: "1", createdAt: 1000 }),
    notif({ id: "2", createdAt: 1000, trusted: false }),
    notif({ id: "3", createdAt: 1000 }),
  ];
  assert.equal(countUnread(items, state), 2);
});

test("mergeReadState unions ids, keeps newest read and earliest install", () => {
  const a: ReadState = {
    version: 1,
    installedAt: 500,
    lastReadAt: 1000,
    readIds: ["r1"],
    dismissedIds: ["d1"],
    mutedTypes: ["zap"],
  };
  const b: ReadState = {
    version: 1,
    installedAt: 300,
    lastReadAt: 900,
    readIds: ["r2"],
    dismissedIds: ["d1", "d2"],
    mutedTypes: [],
  };
  const m = mergeReadState(a, b);
  assert.equal(m.installedAt, 300);
  assert.equal(m.lastReadAt, 1000);
  assert.deepEqual(m.readIds.sort(), ["r1", "r2"]);
  assert.deepEqual(m.dismissedIds.sort(), ["d1", "d2"]);
  assert.deepEqual(m.mutedTypes, ["zap"]);
});

test("pruneReadState caps id arrays", () => {
  const many = Array.from({ length: 1000 }, (_, i) => `id${i}`);
  const pruned = pruneReadState({
    ...emptyReadState(0),
    readIds: many,
    dismissedIds: many,
  });
  assert.ok(pruned.readIds.length <= 300);
  assert.ok(pruned.dismissedIds.length <= 400);
  // keeps the most recent ids
  assert.equal(pruned.readIds.at(-1), "id999");
});

// ── source self/trust filters ────────────────────────────────────────────────

test("badge source drops self-awards, surfaces others", () => {
  const award = (author: string): NostrEventLike => ({
    id: "aw1",
    pubkey: author,
    kind: 8,
    created_at: 1000,
    tags: [
      ["p", ME],
      ["badge", "rank-1"],
      ["hackathon", "commerce"],
    ],
    content: "1er Puesto Commerce",
  });
  assert.equal(badgeAwardSource.normalize(award(ME), ctx()), null);
  const n = badgeAwardSource.normalize(award(ISSUER), ctx());
  assert.ok(n);
  assert.equal(n!.type, "badge-award");
  assert.equal(n!.actorPubkey, ISSUER);
  assert.equal(n!.trusted, true);
});

test("zap source parses sender/amount from the receipt description and drops self-zaps", () => {
  const receipt = (sender: string): NostrEventLike => ({
    id: "zp1",
    pubkey: "f".repeat(64), // LNURL server pubkey — NOT the sender
    kind: 9735,
    created_at: 1234,
    tags: [
      ["p", ME],
      [
        "description",
        JSON.stringify({
          kind: 9734,
          pubkey: sender,
          content: "gg",
          tags: [["amount", "21000"]],
        }),
      ],
    ],
    content: "",
  });
  assert.equal(zapSource.normalize(receipt(ME), ctx()), null); // self-zap
  const n = zapSource.normalize(receipt(FRIEND), ctx());
  assert.ok(n);
  assert.equal(n!.actorPubkey, FRIEND);
  assert.match(n!.title, /21/); // 21000 msat → 21 sats
});

test("app-notification trust: publisher & follows trusted, strangers not, unknown ntype dropped", () => {
  const ping = (author: string, ntype: string): NostrEventLike => ({
    id: `p_${author}_${ntype}`,
    pubkey: author,
    kind: 1616,
    created_at: 1500,
    tags: [
      ["p", ME],
      ["t", "lacrypta-dev-notification"],
      ["ntype", ntype],
    ],
    content: JSON.stringify({ title: "hola", body: "b" }),
  });

  // self → dropped
  assert.equal(appNotificationSource.normalize(ping(ME, "message"), ctx()), null);
  // unknown ntype → dropped (allowlist)
  assert.equal(
    appNotificationSource.normalize(ping(FRIEND, "phishing"), ctx()),
    null,
  );
  // publisher → trusted, body kept
  const fromPub = appNotificationSource.normalize(
    ping(PUBLISHER, "pitch-request"),
    ctx(),
  );
  assert.equal(fromPub!.trusted, true);
  assert.equal(fromPub!.body, "b");
  assert.equal(fromPub!.type, "pitch-request");
  // followed → trusted
  assert.equal(
    appNotificationSource.normalize(ping(FRIEND, "recommendation"), ctx())!
      .trusted,
    true,
  );
  // stranger → untrusted, body & href stripped
  const stranger = appNotificationSource.normalize(
    ping(STRANGER, "message"),
    ctx(),
  );
  assert.equal(stranger!.trusted, false);
  assert.equal(stranger!.body, undefined);
  assert.equal(stranger!.href, undefined);
});

test("broadcast href only accepts internal paths", () => {
  assert.equal(normalizeBroadcastHref("/hackathons"), "/hackathons");
  assert.equal(normalizeBroadcastHref("  /badges  "), "/badges");
  assert.equal(normalizeBroadcastHref("https://evil.example"), undefined);
  assert.equal(normalizeBroadcastHref("//evil.example"), undefined); // protocol-relative
  assert.equal(normalizeBroadcastHref("javascript:alert(1)"), undefined);
  assert.equal(normalizeBroadcastHref(""), undefined);
  assert.equal(normalizeBroadcastHref(undefined), undefined);
});

test("broadcast source: publisher → announcement, others dropped, bad content dropped", () => {
  const bc = (author: string, content: string): NostrEventLike => ({
    id: `bc_${author}`,
    pubkey: author,
    kind: 1616,
    created_at: 1500,
    tags: [
      ["t", "lacrypta-dev-broadcast"],
      ["client", "La Crypta Dev"],
    ],
    content,
  });
  const payload = JSON.stringify({
    title: "Nuevo hackatón",
    body: "Arranca el martes",
    href: "/hackathons",
  });

  const ok = broadcastSource.normalize(bc(PUBLISHER, payload), ctx());
  assert.ok(ok);
  assert.equal(ok!.type, "announcement");
  assert.equal(ok!.trusted, true);
  assert.equal(ok!.href, "/hackathons");
  assert.equal(ok!.actorPubkey, PUBLISHER);

  // not from publisher → dropped
  assert.equal(broadcastSource.normalize(bc(STRANGER, payload), ctx()), null);
  // malformed content → dropped
  assert.equal(broadcastSource.normalize(bc(PUBLISHER, "{"), ctx()), null);
  // external link inside a valid payload is stripped
  const withExternal = broadcastSource.normalize(
    bc(PUBLISHER, JSON.stringify({ title: "x", href: "https://evil" })),
    ctx(),
  );
  assert.equal(withExternal!.href, undefined);
});
