import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(__dirname, 'config.json'), 'utf8'));
const PREFIX = process.env.PREFIX || config.prefix || '.';
const OWNER_NUMBER = digitsOnly(process.env.OWNER_NUMBER || config.ownerNumber);
const PROTECTED_NUMBERS = new Set(
  [OWNER_NUMBER, ...(config.protectedNumbers || [])]
    .map(digitsOnly)
    .filter(Boolean),
);
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '.data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const PAIRING_NUMBER = digitsOnly(process.env.PAIRING_NUMBER || '');
const startedAt = Date.now();

function digitsOnly(value = '') {
  return String(value).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function freshState() {
  return {
    features: {
      react: false,
      autoreply: true,
      welcome: false,
      goodbye: false,
      antilink: false,
      antispam: false,
      bot: true,
    },
    autoReplies: [],
  };
}

await mkdir(DATA_DIR, { recursive: true });
await mkdir(AUTH_DIR, { recursive: true });
let state = freshState();
try {
  const saved = JSON.parse(await readFile(STATE_PATH, 'utf8'));
  state = {
    ...freshState(),
    ...saved,
    features: { ...freshState().features, ...(saved.features || {}) },
    autoReplies: Array.isArray(saved.autoReplies) ? saved.autoReplies : [],
  };
} catch (error) {
  if (error.code !== 'ENOENT') console.error('Could not read saved settings:', error.message);
}

async function saveState() {
  const tmp = `${STATE_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE_PATH);
}

const randomJokes = [
  'Why did the phone go to school? It wanted to improve its cell-f-esteem.',
  'I told my computer I needed a break. It said: “No problem, I will go to sleep.”',
  'Why was the Wi-Fi always invited? It had great connections.',
];
const quotes = [
  '“Great things are done by a series of small things brought together.” — Vincent van Gogh',
  '“It always seems impossible until it is done.” — Nelson Mandela',
  '“The secret of getting ahead is getting started.” — Mark Twain',
];
const spamEvents = new Map();
let sock;
let reconnectTimer;
let reconnecting = false;

const helpText = () => `
╔════════════════════════════════╗
║                                ║
║   🦊 *F R O X Y  -  V 1* 🦊    ║
║                                ║
║   *💜 THE PURPLE BEAST 💜*      ║
║                                ║
║  _"Not just a bot, it's your_  ║
║  _WhatsApp Empire Engine"_      ║
║                                ║
╚════════════════════════════════╝

⚡ *POWERED BY FXT SOLUTIONS*
🔥 *24/7 UPTIME | ANTI-BAN* (no bot can guarantee this)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  *👑 BUILT FOR LEGENDS, NOT USERS 👑*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Why Froxy V1 is Different?*
> 🧠 FROXY SI - Smart AI Inside (configure API key)
> 👥 Group Management Like Boss
> 💬 Auto Reply - Business helper
> ⚡ Pair in 5 Seconds - No QR Stress

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┏━━━━━━ *⚡ PAIRING* ━━━━━━┓
┃ • .pair 2637xxxxxx
┃   ↳ First pairing code is shown in Hostless logs
┃ • .qr - QR appears in logs if no pair number is set
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━ *💓 ALIVE* ━━━━━━┓
┃ • .alive - Bot online check
┃ • .ping - Speed test
┃ • .info / .bot - Bot stats
┃ • .uptime - Runtime
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━ *👑 OWNER* ━━━━━━┓
┃ • .owner - Show owner
┃ • .react on/off
┃ • .autoreply list/add/del/toggle
┃ • .setpp - Set bot pfp (reply to image)
┃ • .restart - Hostless dashboard restart guide
┗━━━━━━━━━━━━━━━━━━━━┛

┏━━━━ *👥 GROUP MANAGE* ━━━━┓
┃ • .tagall / .hidetag - Tag
┃ • .kick @ / .add 2637xx
┃ • .promote / .demote @
┃ • .group open/close
┃ • .link / .revoke
┃ • .setname / .setdesc
┗━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━ *🤖 FROXY SI - GROUP AI* ━┓
┃ • .froxy <ask> - Ask Froxy AI
┃ • .ask <question> - AI chat
┃ • .welcome on/off - Welcome
┃ • .goodbye on/off - Goodbye
┃ • .antilink on/off - Link killer
┃ • .antispam on/off
┃ • .bot on/off - Enable SI
┗━━━━━━━━━━━━━━━━━━━━━━━━┛

┏━━━━━━ *🎲 FUN & TOOLS* ━━━━━━┓
┃ • .help / .menu - This menu
┃ • .joke - Random joke
┃ • .quote - Quote
┃ • .sticker / .toimg
┗━━━━━━━━━━━━━━━━━━━━━━━━┛

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔗 *OFFICIAL LINKS - FROXY FAMILY*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Website: ${config.website || 'FROXY BOT V1 — WhatsApp'}
💬 Support Group: ${config.supportGroup || 'FROXY BOT UPDATE'}

💜 *Join the Froxy community*
© 2026 FXT Solutions | Froxy Labs

*Type .help to open the menu 🚀*
`.trim();

function unwrapMessage(message) {
  let current = message;
  while (current) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message;
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message;
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message;
    else if (current.documentWithCaptionMessage?.message) current = current.documentWithCaptionMessage.message;
    else break;
  }
  return current || {};
}

function messageText(message) {
  const content = unwrapMessage(message);
  return String(
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.templateButtonReplyMessage?.selectedId ||
    ''
  ).trim();
}

function contextInfoOf(message) {
  const content = unwrapMessage(message);
  for (const value of Object.values(content)) {
    if (value?.contextInfo) return value.contextInfo;
  }
  return null;
}

function jidDigits(jid) {
  return digitsOnly(jid || '');
}

function samePerson(jidA, jidB) {
  if (!jidA || !jidB) return false;
  if (jidA === jidB) return true;
  const a = jidDigits(jidA);
  const b = jidDigits(jidB);
  return Boolean(a && b && a === b);
}

function isProtectedJid(jid, metadata) {
  if (PROTECTED_NUMBERS.has(jidDigits(jid))) return true;
  // Newer WhatsApp group participant records can expose both an LID and phone number.
  // Use that mapping when WhatsApp supplies it; never guess an LID's phone number.
  for (const participant of metadata?.participants || []) {
    const participantId = participant.id || participant.jid || '';
    if (participantId === jid || samePerson(participantId, jid)) {
      const linkedNumbers = [participant.phoneNumber, participant.phoneNumberJid, participant.pn]
        .map(jidDigits)
        .filter(Boolean);
      if (linkedNumbers.some(number => PROTECTED_NUMBERS.has(number))) return true;
    }
  }
  return false;
}

function isAdminJid(jid, metadata) {
  return (metadata?.participants || []).some(participant =>
    samePerson(participant.id || participant.jid, jid) &&
    ['admin', 'superadmin'].includes(participant.admin),
  );
}

function getQuotedMessage(msg) {
  const ctx = contextInfoOf(msg.message);
  if (!ctx?.quotedMessage) return null;
  return {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
      fromMe: false,
    },
    message: ctx.quotedMessage,
  };
}

function containsMedia(message, types = ['imageMessage', 'stickerMessage']) {
  const content = unwrapMessage(message?.message || message || {});
  return types.some(type => Boolean(content[type]));
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

async function sendText(chat, text, quoted) {
  return sock.sendMessage(chat, { text }, quoted ? { quoted } : {});
}

function getMentionedJids(msg) {
  const ctx = contextInfoOf(msg.message);
  return ctx?.mentionedJid || [];
}

function resolveTarget(msg, args, metadata) {
  const mentioned = getMentionedJids(msg);
  if (mentioned.length) return mentioned[0];
  const quoted = contextInfoOf(msg.message);
  if (quoted?.participant) return quoted.participant;
  const number = digitsOnly(args[0] || '');
  if (!number) return null;
  if (PROTECTED_NUMBERS.has(number)) return `${number}@s.whatsapp.net`;
  const existing = (metadata?.participants || []).find(p => jidDigits(p.id || p.jid) === number);
  return existing?.id || existing?.jid || `${number}@s.whatsapp.net`;
}

function isGroupJid(jid) {
  return String(jid || '').endsWith('@g.us');
}

async function requireGroupAdmin(chat, sender, metadata, quotedMsg) {
  if (!isGroupJid(chat)) {
    await sendText(chat, 'This command only works inside a group.', quotedMsg);
    return false;
  }
  if (!isProtectedJid(sender, metadata) && !isAdminJid(sender, metadata)) {
    await sendText(chat, 'Only group admins or FROXY TECH can use this command.', quotedMsg);
    return false;
  }
  if (!isAdminJid(sock.user?.id, metadata)) {
    await sendText(chat, 'Please make Froxy a group admin first.', quotedMsg);
    return false;
  }
  return true;
}

async function getAIReply(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return 'Froxy SI is not connected yet. Add OPENAI_API_KEY in Hostless environment variables to enable AI replies.';
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are Froxy SI, a friendly and concise assistant inside a WhatsApp bot. Do not claim to perform actions that you did not perform.' },
          { role: 'user', content: prompt.slice(0, 4000) },
        ],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(25000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('AI provider error:', response.status, data.error?.message || 'No details');
      return 'Froxy SI could not get an answer from the AI provider. Check the API key, model, and billing settings.';
    }
    return data.choices?.[0]?.message?.content?.trim() || 'Froxy SI did not receive a reply. Try again.';
  } catch (error) {
    console.error('AI request failed:', error.message);
    return 'Froxy SI is temporarily unavailable. Please try again later.';
  }
}

async function handleMessage(msg) {
  if (!msg?.message || msg.key?.fromMe) return;
  const chat = msg.key.remoteJid;
  if (!chat || chat === 'status@broadcast' || chat.endsWith('@newsletter')) return;

  const sender = msg.key.participant || chat;
  const text = messageText(msg.message);
  if (!text) return;

  let metadata = null;
  if (isGroupJid(chat)) {
    try { metadata = await sock.groupMetadata(chat); } catch { metadata = null; }
  }
  const protectedSender = isProtectedJid(sender, metadata);
  const isOwner = protectedSender;
  const quotedMsg = msg;

  // The protected number is explicitly exempt from automated message deletion.
  if (isGroupJid(chat) && !protectedSender && !isAdminJid(sender, metadata)) {
    if (state.features.antilink && /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|t\.me\/)/i.test(text)) {
      if (isAdminJid(sock.user?.id, metadata)) {
        try { await sock.sendMessage(chat, { delete: msg.key }); } catch (error) { console.error('Could not remove link:', error.message); }
        await sendText(chat, '🔗 Links are restricted in this group.', msg);
      }
      return;
    }
    if (state.features.antispam) {
      const now = Date.now();
      const key = `${chat}:${sender}`;
      const recent = (spamEvents.get(key) || []).filter(timestamp => now - timestamp < 10000);
      recent.push(now);
      spamEvents.set(key, recent);
      if (recent.length > 8 && isAdminJid(sock.user?.id, metadata)) {
        try { await sock.sendMessage(chat, { delete: msg.key }); } catch (error) { console.error('Could not remove spam:', error.message); }
        if (recent.length === 9) await sendText(chat, '⚠️ Slow down — anti-spam is active.', msg);
        return;
      }
    }
  }

  if (state.features.react && !text.startsWith(PREFIX)) {
    try { await sock.sendMessage(chat, { react: { text: '💜', key: msg.key } }); } catch { /* reactions are optional */ }
  }

  const commandLine = text.startsWith(PREFIX);
  if (!commandLine) {
    if (!state.features.bot) return;
    if (state.features.autoreply) {
      const lowered = text.toLowerCase();
      const match = state.autoReplies.find(item => item.enabled && lowered.includes(item.trigger.toLowerCase()));
      if (match) await sendText(chat, match.reply, msg);
    }
    return;
  }

  const body = text.slice(PREFIX.length).trim();
  const [commandRaw = '', ...args] = body.split(/\s+/);
  const command = commandRaw.toLowerCase();
  const tail = body.slice(commandRaw.length).trim();

  if (!state.features.bot && !(isOwner && command === 'bot' && args[0]?.toLowerCase() === 'on')) return;

  if (['help', 'menu'].includes(command)) return sendText(chat, helpText(), msg);
  if (command === 'alive') return sendText(chat, '💜 *FROXY V1 IS ONLINE*\n🦊 The Purple Beast is ready.', msg);
  if (command === 'ping') {
    const before = performance.now();
    await sock.sendMessage(chat, { text: '🏓 Pong!' }, { quoted: msg });
    const elapsed = Math.round(performance.now() - before);
    return sendText(chat, `⚡ Response time: ${elapsed} ms`, msg);
  }
  if (command === 'info' || (command === 'bot' && args.length === 0)) {
    let groupCount = 'unavailable';
    try { groupCount = Object.keys(await sock.groupFetchAllParticipating()).length; } catch { /* ignore */ }
    return sendText(chat,
      `🦊 *${config.botName}*\n` +
      `Owner: ${config.ownerName} (+${OWNER_NUMBER})\n` +
      `Uptime: ${formatDuration(Date.now() - startedAt)}\n` +
      `Groups: ${groupCount}\n` +
      `Prefix: ${PREFIX}\n` +
      `Froxy SI: ${process.env.OPENAI_API_KEY ? 'configured' : 'needs API key'}\n` +
      `Protected number: +${OWNER_NUMBER}`, msg);
  }
  if (command === 'uptime') return sendText(chat, `⏱️ Froxy uptime: ${formatDuration(Date.now() - startedAt)}`, msg);
  if (command === 'owner') return sendText(chat, `👑 *${config.ownerName}*\nWhatsApp: +${OWNER_NUMBER}\n🛡️ Froxy will not kick this number or delete its messages.`, msg);
  if (command === 'pair') return sendText(chat,
    `🔐 Pairing is done before Froxy is linked. In Hostless, set PAIRING_NUMBER to your WhatsApp number with country code and digits only, then restart the app. The pairing code will appear in deployment logs.\n\nCurrent session: ${sock.user ? 'already linked or connecting' : 'not connected'}.`, msg);
  if (command === 'qr') return sendText(chat,
    `📲 To pair Froxy, set PAIRING_NUMBER in Hostless and read the code in deployment logs. If PAIRING_NUMBER is empty on a fresh start, the QR may be printed in logs. Never share your pairing code or session folder.`, msg);
  if (command === 'joke') return sendText(chat, `😂 ${randomJokes[Math.floor(Math.random() * randomJokes.length)]}`, msg);
  if (command === 'quote') return sendText(chat, `💭 ${quotes[Math.floor(Math.random() * quotes.length)]}`, msg);

  if (['froxy', 'ask'].includes(command)) {
    if (!tail) return sendText(chat, `Ask Froxy SI a question. Example: ${PREFIX}froxy give me three study tips`, msg);
    return sendText(chat, await getAIReply(tail), msg);
  }

  if (command === 'bot') {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can change the global bot switch.', msg);
    const value = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(value)) return sendText(chat, 'Use .bot on or .bot off', msg);
    state.features.bot = value === 'on';
    await saveState();
    return sendText(chat, `🤖 Froxy is now ${value === 'on' ? 'enabled' : 'paused'}.`, msg);
  }

  if (command === 'react') {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can change this setting.', msg);
    const value = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(value)) return sendText(chat, 'Use .react on or .react off', msg);
    state.features.react = value === 'on';
    await saveState();
    return sendText(chat, `💜 Auto-reaction is ${value}.`, msg);
  }

  if (command === 'autoreply') {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can manage auto-replies.', msg);
    const action = (args[0] || '').toLowerCase();
    if (action === 'toggle') {
      state.features.autoreply = !state.features.autoreply;
      await saveState();
      return sendText(chat, `💬 Auto-reply is ${state.features.autoreply ? 'on' : 'off'}.`, msg);
    }
    if (action === 'list') {
      const lines = state.autoReplies.map((item, index) => `${index + 1}. ${item.trigger} → ${item.reply} [${item.enabled ? 'on' : 'off'}]`);
      return sendText(chat, lines.length ? `📋 *Auto-replies*\n${lines.join('\n')}` : 'No auto-replies saved yet. Use .autoreply add trigger|reply', msg);
    }
    if (action === 'add') {
      const entry = body.slice(commandRaw.length).trim().replace(/^add\s+/i, '');
      const splitAt = entry.indexOf('|');
      if (splitAt < 1 || !entry.slice(splitAt + 1).trim()) return sendText(chat, 'Use: .autoreply add trigger|reply text', msg);
      const trigger = entry.slice(0, splitAt).trim();
      const reply = entry.slice(splitAt + 1).trim();
      if (trigger.length > 80 || reply.length > 800) return sendText(chat, 'Keep triggers under 80 characters and replies under 800 characters.', msg);
      state.autoReplies.push({ trigger, reply, enabled: true });
      await saveState();
      return sendText(chat, `✅ Auto-reply added for: ${trigger}`, msg);
    }
    if (['del', 'delete', 'remove'].includes(action)) {
      const index = Number(args[1]);
      if (!Number.isInteger(index) || index < 1 || index > state.autoReplies.length) return sendText(chat, 'Use .autoreply del number (see .autoreply list)', msg);
      const removed = state.autoReplies.splice(index - 1, 1)[0];
      await saveState();
      return sendText(chat, `🗑️ Removed auto-reply: ${removed.trigger}`, msg);
    }
    return sendText(chat, 'Use .autoreply list, .autoreply add trigger|reply, .autoreply del number, or .autoreply toggle', msg);
  }

  if (['welcome', 'goodbye', 'antilink', 'antispam'].includes(command)) {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can change Froxy security and welcome settings.', msg);
    const value = args[0]?.toLowerCase();
    if (!['on', 'off'].includes(value)) return sendText(chat, `Use ${PREFIX}${command} on or ${PREFIX}${command} off`, msg);
    state.features[command] = value === 'on';
    await saveState();
    return sendText(chat, `✅ ${command} is now ${value}.`, msg);
  }

  if (command === 'restart') {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can request a restart.', msg);
    return sendText(chat, '🔄 Open Hostless → your Froxy app → Restart/Deploy. This avoids stopping the process without a confirmed supervisor restart.', msg);
  }

  if (['tagall', 'hidetag'].includes(command)) {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    const participants = (metadata?.participants || []).map(p => p.id || p.jid).filter(Boolean);
    if (!participants.length) return sendText(chat, 'Could not load group participants.', msg);
    const tagMessage = tail || (command === 'hidetag' ? '💜 Froxy has a message for everyone.' : '📣 Attention everyone!');
    return sock.sendMessage(chat, { text: tagMessage, mentions: participants });
  }

  if (['kick', 'add', 'promote', 'demote'].includes(command)) {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    const target = resolveTarget(msg, args, metadata);
    if (!target) return sendText(chat, `Mention or reply to a user, or provide a phone number. Example: ${PREFIX}${command} @user`, msg);
    if (isProtectedJid(target, metadata) || PROTECTED_NUMBERS.has(jidDigits(target))) {
      return sendText(chat, '🛡️ That’s FROXY TECH — we can’t kick, demote, or delete his messages.', msg);
    }
    const action = command === 'kick' ? 'remove' : command === 'add' ? 'add' : command;
    try {
      await sock.groupParticipantsUpdate(chat, [target], action);
      const labels = { remove: 'removed from the group', add: 'invited/added to the group', promote: 'promoted to admin', demote: 'demoted from admin' };
      return sendText(chat, `✅ @${jidDigits(target)} ${labels[action]}.`, msg);
    } catch (error) {
      console.error(`Group ${action} failed:`, error.message);
      return sendText(chat, `Could not ${command} that user. Check bot admin permissions and the target number.`, msg);
    }
  }

  if (command === 'group') {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    const value = args[0]?.toLowerCase();
    if (!['open', 'close'].includes(value)) return sendText(chat, 'Use .group open or .group close', msg);
    try {
      await sock.groupSettingUpdate(chat, value === 'open' ? 'not_announcement' : 'announcement');
      return sendText(chat, `🔐 Group is now ${value === 'open' ? 'open for members' : 'admins-only for messages'}.`, msg);
    } catch (error) {
      return sendText(chat, `Could not change group settings: ${error.message}`, msg);
    }
  }

  if (command === 'link') {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    try {
      const code = await sock.groupInviteCode(chat);
      return sendText(chat, `🔗 https://chat.whatsapp.com/${code}`, msg);
    } catch (error) { return sendText(chat, `Could not fetch invite link: ${error.message}`, msg); }
  }

  if (command === 'revoke') {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    try {
      await sock.groupRevokeInvite(chat);
      return sendText(chat, '✅ Group invite link has been reset.', msg);
    } catch (error) { return sendText(chat, `Could not reset invite link: ${error.message}`, msg); }
  }

  if (command === 'setname') {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    if (!tail) return sendText(chat, 'Use .setname New group name', msg);
    try { await sock.groupUpdateSubject(chat, tail.slice(0, 100)); return sendText(chat, '✅ Group name updated.', msg); }
    catch (error) { return sendText(chat, `Could not update group name: ${error.message}`, msg); }
  }

  if (command === 'setdesc') {
    if (!(await requireGroupAdmin(chat, sender, metadata, msg))) return;
    if (!tail) return sendText(chat, 'Use .setdesc New group description', msg);
    try { await sock.groupUpdateDescription(chat, tail.slice(0, 2048)); return sendText(chat, '✅ Group description updated.', msg); }
    catch (error) { return sendText(chat, `Could not update group description: ${error.message}`, msg); }
  }

  if (command === 'setpp') {
    if (!isOwner) return sendText(chat, 'Only FROXY TECH can change Froxy’s profile picture.', msg);
    const source = containsMedia(msg) ? msg : getQuotedMessage(msg);
    if (!source || !containsMedia(source)) return sendText(chat, 'Reply to an image with .setpp, or send an image with the caption .setpp.', msg);
    try {
      const input = await downloadMediaMessage(source, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const output = await sharp(input).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
      await sock.updateProfilePicture(sock.user.id, output);
      return sendText(chat, '✅ Froxy profile picture updated.', msg);
    } catch (error) {
      console.error('Profile picture update failed:', error.message);
      return sendText(chat, 'Could not update the profile picture. Use a normal image and confirm Froxy is connected.', msg);
    }
  }

  if (command === 'sticker') {
    const source = containsMedia(msg, ['imageMessage']) ? msg : getQuotedMessage(msg);
    if (!source || !containsMedia(source, ['imageMessage'])) return sendText(chat, 'Send an image with caption .sticker, or reply to an image with .sticker.', msg);
    try {
      const input = await downloadMediaMessage(source, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const output = await sharp(input).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82 }).toBuffer();
      return sock.sendMessage(chat, { sticker: output }, { quoted: msg });
    } catch (error) {
      console.error('Sticker creation failed:', error.message);
      return sendText(chat, 'Could not create the sticker. Try a smaller PNG or JPEG image.', msg);
    }
  }

  if (command === 'toimg') {
    const source = containsMedia(msg, ['stickerMessage']) ? msg : getQuotedMessage(msg);
    if (!source || !containsMedia(source, ['stickerMessage'])) return sendText(chat, 'Reply to a sticker with .toimg.', msg);
    try {
      const input = await downloadMediaMessage(source, 'buffer', {}, { logger: pino({ level: 'silent' }) });
      const output = await sharp(input).png().toBuffer();
      return sock.sendMessage(chat, { image: output, caption: '🖼️ Converted by Froxy V1' }, { quoted: msg });
    } catch (error) {
      console.error('Sticker conversion failed:', error.message);
      return sendText(chat, 'Could not convert this sticker to an image.', msg);
    }
  }
}

async function startBot() {
  if (reconnecting) return;
  reconnecting = true;
  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    sock = makeWASocket({
      auth: authState,
      logger: pino({ level: process.env.LOG_LEVEL || 'silent' }),
      printQRInTerminal: !PAIRING_NUMBER,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        console.log(`✅ ${config.botName} connected as ${sock.user?.id || 'WhatsApp account'}`);
        if (PAIRING_NUMBER) console.log('Pairing number is configured. Remove PAIRING_NUMBER after successful linking if you do not need it again.');
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.error('WhatsApp connection closed:', statusCode || lastDisconnect?.error?.message || 'unknown reason');
        if (shouldReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            reconnecting = false;
            startBot().catch(error => console.error('Reconnect failed:', error));
          }, 3000);
        } else {
          console.error('WhatsApp logged this session out. Remove/renew the auth directory and pair again.');
        }
      }
    });

    if (PAIRING_NUMBER && !authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(PAIRING_NUMBER);
          console.log('\n========================================');
          console.log(`FROXY V1 PAIRING CODE: ${code}`);
          console.log('Enter this code in WhatsApp → Linked devices → Link with phone number.');
          console.log('========================================\n');
        } catch (error) {
          console.error('Could not request pairing code:', error.message);
          console.error('Check PAIRING_NUMBER: country code + digits only, without +, spaces, or dashes.');
        }
      }, 1800);
    }

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const message of messages || []) {
        try { await handleMessage(message); }
        catch (error) { console.error('Message handler error:', error?.stack || error); }
      }
    });

    sock.ev.on('group-participants.update', async update => {
      if (!state.features.bot) return;
      const { id: groupJid, participants = [], action } = update;
      if (action === 'add' && state.features.welcome) {
        for (const participant of participants) {
          const number = jidDigits(participant);
          await sendText(groupJid, `💜 Welcome ${number ? `@${number}` : 'to the group'}! Please read the group rules and enjoy your stay.`, null)
            .catch(error => console.error('Welcome message failed:', error.message));
        }
      }
      if (['remove', 'leave'].includes(action) && state.features.goodbye) {
        for (const participant of participants) {
          const number = jidDigits(participant);
          await sendText(groupJid, `👋 ${number ? `@${number}` : 'A member'} has left the group.`, null)
            .catch(error => console.error('Goodbye message failed:', error.message));
        }
      }
    });
  } finally {
    reconnecting = false;
  }
}

// Hostless app health endpoint: the WhatsApp connection itself runs in this same process.
const port = Number(process.env.PORT || 3000);
const server = createServer((request, response) => {
  if (request.url === '/health' || request.url === '/') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, bot: config.botName, connected: Boolean(sock?.user), uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '0.0.0.0', () => console.log(`Froxy health server listening on 0.0.0.0:${port}`));

startBot().catch(error => {
  console.error('Froxy failed to start:', error?.stack || error);
  process.exitCode = 1;
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received; closing health server.');
  server.close();
  try { sock?.end(new Error('Hostless is stopping the app')); } catch { /* ignore */ }
});
