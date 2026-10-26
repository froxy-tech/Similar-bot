# 🦊 Froxy V1 — WhatsApp Bot

A Node.js starter built around Baileys for a WhatsApp Web linked-device session, prepared for deployment as a long-running Hostless app. It includes your Froxy menu, group tools, welcome/goodbye, link and spam protection, saved auto-replies, sticker conversions, optional AI replies, and an explicit protection rule for **FROXY TECH (+263712552662)**.

> **Important:** Baileys is an unofficial WhatsApp Web library. It is not affiliated with WhatsApp, and WhatsApp can change its behavior or restrict accounts. No code can guarantee “anti-ban” or 24/7 uptime. Use it responsibly and avoid unsolicited/bulk messaging.

## Files

- `index.js` — bot logic and Hostless health endpoint
- `config.json` — bot name, owner, prefix and protected number
- `package.json` — dependencies and start command
- `hostless.yaml` — basic Hostless build/start/health configuration

## Deploy on Hostless

1. Upload these files to a Git repository connected to Hostless, or copy them into your existing project.
2. Create a **Node.js App** (or worker if you do not need an app health URL). Use Node.js 20 or newer.
3. Set the build command to `npm install` and start command to `npm start`.
4. In Hostless environment variables, add `PAIRING_NUMBER` with your own WhatsApp number including country code, digits only. For example, use `2637XXXXXXXX`, with no `+`, spaces, or dashes. Do not use the protected owner's number unless that is the WhatsApp account you intend to link as the bot.
5. Deploy, open deployment logs, and copy the line labelled **FROXY V1 PAIRING CODE**. On the WhatsApp account you are linking, open **Linked devices → Link a device → Link with phone number** and enter the code. Do not share the code.
6. After the bot connects, remove `PAIRING_NUMBER` from Hostless variables and redeploy if you do not need another pairing attempt.
7. Keep the authentication directory (`auth_info_baileys/`) persistent across restarts/redeploys if Hostless offers persistent storage. Otherwise you may need to pair again after a fresh deployment. Never upload this directory to a public repository or share it.

If `PAIRING_NUMBER` is not set on a fresh session, Baileys may print a QR code in logs instead. Phone pairing is generally easier to use in a hosted log window.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | HTTP health server port (Hostless sets this) | `3000` |
| `PAIRING_NUMBER` | Number to request the initial pairing code for | unset |
| `OWNER_NUMBER` | Owner / protected number, digits only | `263712552662` |
| `PREFIX` | Command prefix | `.` |
| `AUTH_DIR` | Auth-session storage folder | `./auth_info_baileys` |
| `DATA_DIR` | Persistent settings folder | `./.data` |
| `OPENAI_API_KEY` | Enables `.ask` and `.froxy` | unset |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | AI model name | `gpt-4o-mini` |
| `LOG_LEVEL` | Pino log level | `silent` |

The bot stores toggles and auto-replies in `.data/state.json`. For settings to survive redeploys, put `DATA_DIR` on persistent storage if Hostless provides it.

## Protected owner behavior

The number `263712552662` is both the default owner and the protected number. The bot will refuse its own `.kick`, `.demote`, and automatic message-deletion actions against that number, and it will skip link/spam deletion when the sender is recognized as the protected number. The refusal text is:

> 🛡️ That’s FROXY TECH — we can’t kick, demote, or delete his messages.

WhatsApp sometimes represents group members with privacy-preserving LIDs instead of phone-number JIDs. The bot uses the phone-number mapping if WhatsApp supplies one; it cannot safely infer a phone number from an unmapped LID. Also, this rule controls **Froxy's own actions only**; it cannot prevent another group admin or WhatsApp from removing the member or deleting their messages.

## Commands

### Basic

- `.help` / `.menu`
- `.alive`, `.ping`, `.info`, `.bot`, `.uptime`, `.owner`
- `.pair`, `.qr` — explain/log initial pairing; pairing code is requested at startup from `PAIRING_NUMBER`
- `.joke`, `.quote`

### Owner settings (FROXY TECH only)

- `.react on/off`
- `.autoreply list`
- `.autoreply add trigger|reply`
- `.autoreply del number`
- `.autoreply toggle`
- `.welcome on/off`
- `.goodbye on/off`
- `.antilink on/off`
- `.antispam on/off`
- `.bot on/off`
- `.setpp` — send an image with this caption or reply to an image
- `.restart` — tells the owner to restart from Hostless dashboard rather than shutting down without a guaranteed supervisor restart

### Group tools

Make Froxy a group admin before using these. The command sender must also be a group admin or FROXY TECH.

- `.tagall` / `.hidetag [message]`
- `.kick @member` (or reply to their message with `.kick`)
- `.add 2637XXXXXXXX`
- `.promote @member`, `.demote @member`
- `.group open/close`
- `.link`, `.revoke`
- `.setname New name`, `.setdesc New description`

### AI and media

- `.froxy question` / `.ask question` — requires `OPENAI_API_KEY` (and a valid provider/model)
- `.sticker` — caption an image or reply to an image
- `.toimg` — reply to a sticker

## Safety and access notes

- Do not paste your pairing code, auth files, API keys, or environment-variable secrets into chats or public repositories.
- Link/spam filters only attempt deletions if Froxy is a group admin. They skip admins and the protected owner number when the sender can be recognized.
- Auto-spam protection deletes only the triggering message after a threshold; it does not kick members.
- The bot does not send bulk messages or guarantee that WhatsApp will not restrict an account.
- For live diagnostics, check the Hostless deployment logs and `https://YOUR-HOSTLESS-APP/health`.
