# GoodSale chat

GoodSale chat is the protected conversation between a buyer and a seller around a
specific listing. Payments are never handled inside chat; links and cards point
back to GoodSale checkout and escrow.

## Inbox

- **All / Unread / Buying / Selling / Archived** filters plus inbox-wide search.
- Exact unread **message** counts, not conversation counts. The desktop header and
  mobile Chats tab share the same total.
- Per-conversation read positions survive refreshes and are stored in
  `chat_rooms.buyer_last_read_at` / `chat_rooms.seller_last_read_at`.
- The unread divider is captured when a conversation opens, before the read
  position advances.
- Muting suppresses in-app notifications for that conversation. Archiving removes
  it from the main inbox without deleting messages.

## Conversation

- Optimistic text sending with Enter-to-send, Shift+Enter for a new line, an
  auto-growing composer, emoji insertion and per-conversation local drafts.
- Message search across text, order numbers and listing titles.
- Read receipts use the other participant's persisted read position.
- Typing indicators use ephemeral Supabase Realtime broadcasts; they are never
  stored in the database.
- Photo and video attachments upload to the `chat-media` bucket through the
  authenticated `/api/upload` route. Images are compressed client-side before
  upload. Limits: 8 MB images, 25 MB videos.
- Replies, emoji reactions, escrow receipts, listing cards, price offers,
  calls/call history, reporting and conversation details remain available.
- A related order card appears when the buyer and seller have an existing order
  for the listing.

## Data integrity

Migration `027_chat_experience.sql` adds:

- read positions, mute/archive preferences and authoritative last-message fields;
- `chat_after_message_insert`, which writes the inbox preview and creates one
  deduped `CHAT` notification per two-minute sender burst;
- `chat_mark_read(room_id)` and `chat_set_preferences(room_id, muted, archived)`,
  callable only by authenticated participants;
- a unique thread index per buyer, seller and listing when existing data is clean.

Opening a new listing creates an empty thread. GoodSale never fabricates a seller
greeting or a message the seller did not send.

## Verify

```bash
npm run verify:chat
```

The check runs inside a transaction and rolls it back. It verifies schema,
function grants, participant checks, read positions, text/photo previews,
notification dedupe, mute and archive, and rejects non-participants.
