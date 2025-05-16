import Database from 'better-sqlite3';
import TelegramBot from 'node-telegram-bot-api';

const db = new Database('analytics.db');

/**
 * @param {TelegramBot.User | undefined} user 
 */
function getUserModel(user) {
  let userModel = null;

  if (user) {
    userModel = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

    if (!userModel) {
      db.prepare('INSERT INTO users (id, first_name, last_name, username, language_code) VALUES (?, ?, ?, ?, ?)').run([
        user.id,
        user.first_name,
        user.last_name,
        user.username,
        user.language_code,
      ]);

      return getUserModel(user);
    }
  }

  return userModel;
}

function getChatModel(chat) {
  let chatModel = null;

  if (chat) {
    chatModel = db.prepare('SELECT * FROM chats WHERE id = ?').get(chat.id);

    if (!chatModel) {
      db.prepare('INSERT INTO chats (id, type, title, username) VALUES (?, ?, ?, ?)').run([
        chat.id,
        chat.type,
        chat.title,
        chat.username,
      ]);

      return getChatModel(chat);
    }
  }

  return chatModel;
}

/**
 * @param {object} data
 * @param {number} data.id
 * @param {TelegramBot.Chat} data.chat
 * @param {TelegramBot.User | undefined} data.user
 * @param {string | undefined} data.text
 * @param {number} data.created_at
 */
export function insertMessage(data) {
  const userModel = getUserModel(data.user);
  const chatModel = getChatModel(data.chat);

  db.prepare('INSERT INTO messages (id, text, created_at, user_id, chat_id) VALUES (?, ?, ?, ?, ?)')
  .run(data.id, data.text, data.created_at, userModel?.id ?? null, chatModel?.id ?? null);
}

function getCounts() {
  return {
    messages: db.prepare('SELECT COUNT(*) as count FROM messages').get().count,
    users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
    chats: db.prepare('SELECT COUNT(*) as count FROM chats').get().count,
  };
}

function getLastMessages(count = 5) {
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?').all(count);

  return messages.map((message) => ({
    id: message.id,
    text: message.text,
    created_at: message.created_at,
    user: db.prepare('SELECT * FROM users WHERE id = ?').get(message.user_id),
    chat: db.prepare('SELECT * FROM chats WHERE id = ?').get(message.chat_id),
  }));
}

function getLastUsers(count = 5) {
  return db.prepare('SELECT * FROM users LEFT JOIN messages m ON users.id = m.user_id GROUP BY users.id ORDER BY m.created_at DESC LIMIT ?').all(count);
}

function getTopUsers(count = 5) {
  const users = db.prepare(`
    SELECT u.*, COUNT(m.id) as message_count
    FROM users u
    LEFT JOIN messages m ON u.id = m.user_id
    GROUP BY u.id
    ORDER BY message_count DESC
    LIMIT ?
  `).all(count);

  return users.map((user) => ({
    ...user,
    message_count: user.message_count,
  }));
}

export function getStats() {
  return {
    counts: getCounts(),
    lastMessages: getLastMessages(),
    lastUsers: getLastUsers(),
    topUsers: getTopUsers(),
  };
}