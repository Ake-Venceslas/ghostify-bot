// ===============================
//  GHOSTIFY BOT - MultiSession Ready ⚡
//  Auteur : Mr. Kuete
//  Version : 1.1.0 - Production Ready
// ===============================

// Charger les variables d'environnement en premier
require('dotenv').config();

const express = require('express');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidDecode
} = require('@whiskeysockets/baileys');
const QRCode = require("qrcode");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const db = require('./database');
const { initOpenAI, generateResponse, isAIAvailable } = require('./ai');
const startTime = new Date();

// ============================================
// Gestionnaires d'erreurs globaux (anti-crash)
// ============================================
process.on('uncaughtException', (error) => {
    console.error('💥 [CRASH PREVENTED] Uncaught Exception:', error.message);
    console.error(error.stack);
    // Ne pas quitter - continuer à fonctionner
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [CRASH PREVENTED] Unhandled Promise Rejection:', reason);
    // Ne pas quitter - continuer à fonctionner
});

// Initialiser OpenAI
initOpenAI();

// --- CONFIG ---
const SESSIONS_FOLDER = path.join(__dirname, "sessions"); // nouveau dossier
if (!fs.existsSync(SESSIONS_FOLDER)) fs.mkdirSync(SESSIONS_FOLDER);

const PREFIX = "!";
const BOT_NAME = "GHOSTIFY BOT";
const BOT_TAG = `*${BOT_NAME}* 👨🏻‍💻`;

let latestQR = null; // QR actuel

// --- Chargement des commandes dynamiques ---
const commands = new Map();
const commandFolder = path.join(__dirname, 'commands');
if (!fs.existsSync(commandFolder)) fs.mkdirSync(commandFolder);

function loadCommands() {
    commands.clear();
    fs.readdirSync(commandFolder)
        .filter(f => f.endsWith('.js'))
        .forEach(file => {
            try {
                const fullPath = path.join(commandFolder, file);
                delete require.cache[require.resolve(fullPath)];
                let command = require(fullPath);
                if (command && command.__esModule && command.default) command = command.default;
                const inferredName = path.basename(file, '.js');
                const commandName = command?.name || inferredName;

                if (!command || typeof command.run !== 'function') {
                    console.error(`[CommandLoader] Erreur: ${file} n'a pas de fonction run()`);
                    return;
                }

                commands.set(commandName, command);
                console.log(`[CommandLoader] ✅ Commande chargée : ${commandName}`);
            } catch (err) {
                console.error(`[CommandLoader] ❌ Erreur lors du chargement de ${file}:`, err);
            }
        });
}
loadCommands();

// --- Fonctions utilitaires ---
function replyWithTag(sock, jid, quoted, text) {
    return sock.sendMessage(jid, { text: `${BOT_TAG}\n\n${text}` }, { quoted });
}

function getMessageText(msg) {
    const m = msg.message;
    if (!m) return "";
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ""
    );
}

// --- Chargement du MP3 principal ---
let mp3Buffer = null;
try {
    const mp3Path = path.join(__dirname, 'fichier.mp3');
    if (fs.existsSync(mp3Path)) {
        mp3Buffer = fs.readFileSync(mp3Path);
        console.log('[MP3] ✅ fichier.mp3 chargé.');
    } else {
        console.warn('[MP3] ⚠ fichier.mp3 introuvable.');
    }
} catch (err) {
    console.error('[MP3] ❌ Erreur lecture fichier.mp3:', err);
}

// --- Démarrage du bot ---
async function startBot() {
    console.log("🚀 Démarrage du bot WhatsApp...");
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_FOLDER); // 🔥 gestion multi session

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
    });

    // --- Gestion de la connexion ---
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr;
            console.log("[QR] Nouveau QR généré. Accédez à 👉 http://localhost:3000/qr pour le scanner.");
        }

        if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            const reason = DisconnectReason[code] || code;
            console.log(`⚠️ Connexion fermée - Raison: ${reason} (code: ${code})`);
            
            if (code === DisconnectReason.loggedOut) {
                console.log("❌ Déconnecté définitivement. Supprime le dossier sessions/ pour reconnecter.");
            } else {
                // Reconnexion automatique avec délai
                const delay = 5000;
                console.log(`🔄 Reconnexion dans ${delay/1000} secondes...`);
                setTimeout(() => {
                    console.log("🔄 Tentative de reconnexion...");
                    startBot();
                }, delay);
            }
        } else if (connection === "open") {
            latestQR = null;
            console.log("");
            console.log("═══════════════════════════════════════");
            console.log(`✅ ${BOT_NAME} connecté à WhatsApp !`);
            console.log("═══════════════════════════════════════");
            console.log("📝 Le bot répond quand il est mentionné avec @");
            console.log("");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // --- Gestion des messages ---
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify" || !messages[0]?.message) return;
        const msg = messages[0];
        const remoteJid = msg.key.remoteJid;
        const senderId = msg.key.fromMe
            ? sock.user.id.split(':')[0] + '@s.whatsapp.net'
            : (remoteJid.endsWith('@g.us') ? msg.key.participant : remoteJid);

        await db.getOrRegisterUser(senderId, msg.pushName || "Unknown");

        const text = getMessageText(msg);
        const isGroup = remoteJid.endsWith('@g.us');

        // --- Réponse AI si le bot est mentionné avec @ ---
        if (isGroup) {
            // Vérifier si le bot est mentionné via les métadonnées Baileys
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            const botNumber = sock.user.id.split(':')[0];
            
            // Baileys stocke les mentions dans contextInfo.mentionedJid
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const isMentionedInMeta = mentionedJids.some(jid => jid.includes(botNumber));
            
            // Aussi vérifier si @numéro apparaît dans le texte
            const mentionPattern = new RegExp(`@${botNumber}`, 'i');
            const isMentionedInText = mentionPattern.test(text);
            
            const isBotMentioned = isMentionedInMeta || isMentionedInText;

            if (isBotMentioned && text.trim()) {
                console.log(`[AI] 🔔 Bot mentionné par ${msg.pushName || 'inconnu'}`);
                console.log(`[AI] 📝 Message: "${text}"`);
                console.log(`[AI] 🔧 AI disponible: ${isAIAvailable()}`);
                
                // Vérifier si l'AI est disponible
                if (!isAIAvailable()) {
                    console.log('[AI] ⚠️ OpenAI non configuré - OPENAI_API_KEY manquant dans .env');
                    await sock.sendMessage(remoteJid, { 
                        text: `${BOT_TAG}\n\n⚠️ L'IA n'est pas configurée. Le fichier .env avec OPENAI_API_KEY est requis.` 
                    }, { quoted: msg });
                    return;
                }

                try {
                    // Nettoyer le message - retirer la mention @
                    let cleanedMessage = text.replace(/@\d+/g, '').trim();
                    if (!cleanedMessage) cleanedMessage = 'Salut !';

                    const userName = msg.pushName || 'Quelqu\'un';
                    console.log(`[AI] 📨 ${userName}: ${cleanedMessage}`);

                    // Indicateur de frappe (non-bloquant)
                    sock.sendPresenceUpdate('composing', remoteJid).catch(() => {});

                    // Générer la réponse AI
                    const startTime = Date.now();
                    const result = await generateResponse(cleanedMessage, senderId, userName);
                    console.log(`[AI] ⏱️ Temps total: ${Date.now() - startTime}ms`);

                    // Arrêter l'indicateur de frappe (non-bloquant)
                    sock.sendPresenceUpdate('paused', remoteJid).catch(() => {});

                    if (result.success) {
                        console.log(`[AI] 📤 Réponse envoyée à ${userName}`);
                        await sock.sendMessage(remoteJid, { 
                            text: `${BOT_TAG}\n\n${result.response}` 
                        }, { quoted: msg });
                    } else {
                        await sock.sendMessage(remoteJid, { 
                            text: `${BOT_TAG}\n\n${result.error}` 
                        }, { quoted: msg });
                    }
                } catch (err) {
                    console.error('[AI] Erreur:', err.message);
                    try {
                        await sock.sendMessage(remoteJid, { 
                            text: `${BOT_TAG}\n\nOups ! Une erreur est survenue. 😅` 
                        }, { quoted: msg });
                    } catch { }
                }
            }
        }

        // --- Envoi auto d'un mp3 si "bot" est mentionné (optionnel, désactivé par défaut) ---
        // if (isGroup && mp3Buffer && text.toLowerCase().includes('bot')) {
        //     try {
        //         await sock.sendMessage(remoteJid, {
        //             audio: mp3Buffer,
        //             mimetype: 'audio/mpeg',
        //             fileName: 'fichier.mp3'
        //         }, { quoted: msg });
        //         console.log(`[MP3] fichier.mp3 envoyé à ${senderId}`);
        //     } catch (err) {
        //         console.error('[MP3] Erreur lors de l\'envoi:', err);
        //     }
        // }

        // --- Commande spéciale !downloadbot ---
    if (text.toLowerCase() === `${PREFIX}downloadbot`) {
            const mp3Files = ['fichier1.mp3', 'fichier2.mp3', 'fichier3.mp3'];
            for (const file of mp3Files) {
                const mp3Path = path.join(__dirname, file);
                if (!fs.existsSync(mp3Path)) {
                    await replyWithTag(sock, remoteJid, msg, `❌ Le fichier ${file} est introuvable.`);
                    continue;
                }

                try {
                    const mp3BufferVoice = fs.readFileSync(mp3Path);
                    await sock.sendMessage(remoteJid, {
                        audio: mp3BufferVoice,
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true,
                        fileName: file.replace('.mp3', '.ogg')
                    }, { quoted: msg });
                    console.log(`[Voice] ${file} envoyé à ${remoteJid}`);
                } catch (err) {
                    console.error(`[Voice] Erreur lors de l'envoi de ${file}:`, err);
                    await replyWithTag(sock, remoteJid, msg, `❌ Une erreur est survenue lors de l'envoi de ${file}.`);
                }
            }
        }

        // --- Commandes dynamiques ---
        if (!text.startsWith(PREFIX)) return;
        const args = text.slice(PREFIX.length).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        if (!commandName || !commands.has(commandName)) return;

        const command = commands.get(commandName);

        try {
            if (command.adminOnly && isGroup) {
                const groupMetadata = await sock.groupMetadata(remoteJid);
                const senderIsAdmin = groupMetadata.participants.some(
                    p => p.id === senderId && (p.admin === 'admin' || p.admin === 'superadmin')
                );
                if (!senderIsAdmin) return replyWithTag(sock, remoteJid, msg, "⛔ Seuls les admins peuvent utiliser cette commande.");
            }

            await command.run({ sock, msg, args, replyWithTag, commands, db });
            await db.incrementCommandCount(senderId);
        } catch (err) {
            console.error(`[ERREUR] Commande "${commandName}" :`, err);
            try { await replyWithTag(sock, remoteJid, msg, "❌ Une erreur est survenue."); } catch { }
        }
    });
}

// --- Serveur Express pour QR ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send({
    status: "online",
    botName: BOT_NAME,
    uptime: (new Date() - startTime) / 1000
}));

// --- Page QR ---
app.get("/qr", async (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Connexion ${BOT_NAME}</title>
            <style>
                body { display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; font-family:sans-serif; }
                img { width:300px; height:300px; margin:20px; }
                #status { font-size:18px; margin-top:10px; }
            </style>
        </head>
        <body>
            <h2>Connexion ${BOT_NAME}</h2>
            <img id="qrImg" src="" />
            <p id="status"></p>
            <script>
                async function fetchQR() {
                    try {
                        const res = await fetch('/qr-data');
                        const data = await res.json();
                        const img = document.getElementById('qrImg');
                        const status = document.getElementById('status');
                        if(data.qr) {
                            img.style.display = "block";
                            img.src = data.qr;
                            status.innerText = "📲 Scannez ce QR pour connecter votre compte WhatsApp";
                        } else {
                            img.style.display = "none";
                            status.innerText = "✅ Bot déjà connecté";
                        }
                    } catch(err) { console.error(err); }
                }
                fetchQR();
                setInterval(fetchQR, 10000);
            </script>
        </body>
        </html>
    `);
});

// --- Endpoint JSON du QR ---
app.get("/qr-data", async (req, res) => {
    if (!latestQR) return res.json({ qr: null });
    try {
        const qrImage = await QRCode.toDataURL(latestQR);
        res.json({ qr: qrImage });
    } catch (err) {
        res.json({ qr: null });
    }
});

// ============================================
// Gestionnaires d'arrêt gracieux
// ============================================
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt gracieux en cours...');
    console.log('👋 Au revoir !');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM reçu. Arrêt...');
    process.exit(0);
});

// --- Lancement du serveur ---
app.listen(PORT, () => {
    console.log(`[WebServer] 🌐 Serveur web lancé sur le port ${PORT}`);
    console.log(`[WebServer] 📱 Page QR: http://localhost:${PORT}/qr`);
    startBot();
});