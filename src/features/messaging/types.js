/**
 * View models for messaging UI components. They describe what the components render, not the
 * API contract (that is conversationSchema / messageSchema in #shared); view-models.js
 * builds them. This file only holds documentation (JSDoc typedefs); it exports no runtime values.
 */

/**
 * One row in the conversation list.
 *
 * @typedef {object} ConversationSummary
 * @property {string} id
 * @property {string} title
 * @property {string} [avatarUrl]
 * @property {'online' | 'offline'} [presence]
 * @property {boolean} isGroup
 * @property {{ preview: string, sentAt: string, fromSelf: boolean }} [lastMessage]
 * @property {number} unreadCount
 * @property {boolean} [typing] The other person is typing.
 */

/**
 * Delivery state of a message the user sent.
 *
 * @typedef {'sending' | 'sent' | 'delivered' | 'read' | 'failed'} MessageStatus
 */

/**
 * One message in a conversation.
 *
 * @typedef {object} ChatMessage
 * @property {string} [key] Stable React key: "<senderId>:<clientMessageId>".
 * @property {string} id
 * @property {string} body
 * @property {string} sentAt ISO date-time.
 * @property {boolean} isOwn
 * @property {{ id: string, name: string, avatarUrl?: string }} author
 * @property {MessageStatus} [status]
 * @property {{ code: string, message: string } | null} [error] Why a failed message wasn't sent.
 * @property {() => void} [onRetry] Failed messages: send again with the same idempotency key.
 * @property {() => void} [onDiscard] Failed messages: remove it.
 */

export {};
