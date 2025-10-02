import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, jidNormalizedUser } from "@whiskeysockets/baileys"
import express from "express"
import qrcode from "qrcode"
import axios from "axios"
import fs from "fs"

const app = express()
let qrCodeData = "En attente..."

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ghostify", "Chrome", "1.0"],
    printQRInTerminal: false // On gère le QR via /qr
  })

  sock.ev.on("creds.update", saveCreds)

  // QR Code event
  sock.ev.on("connection.update", ({ qr }) => {
    if (qr) {
      qrcode.toDataURL(qr, (err, url) => {
        qrCodeData = url
      })
    }
  })

  // 📩 Messages entrants
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    const from = msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

    // 🔹 MENU
    if (text === "!menu") {
      await sock.sendMessage(from, { text: `
📜 Liste des commandes disponibles :

!audio – Envoie la note vocale depuis Google Drive
!coinflip – Lance une pièce
!delete – Supprime un message (admin requis)
!demote <numéro> – Rétrograde un admin en membre
!extract – Sauvegarde un média (image, vidéo, audio, document)
!guess – Jeu de devinette
!kick <numéro> – Exclut un membre du groupe
!ping – Teste la réactivité du bot
!pp <numéro> – Télécharge la photo de profil d'une personne
!promote <numéro> – Rend un membre admin
!statusall – Récupère les statuts récents
!sticker – Crée un sticker
!tagall – Mentionne tout le monde
!play <artiste - titre> – Télécharge une musique en audio
      ` })
    }

    // 🔹 PING
    if (text === "!ping") {
      await sock.sendMessage(from, { text: "🏓 Pong! Ghostify est en ligne 🚀" })
    }

    // 🔹 COINFLIP
    if (text === "!coinflip") {
  const result = Math.random() > 0.5 ? "Pile" : "Face";
  await sock.sendMessage(from, { text: `🪙 Résultat : *${result}*` });
    }

    // 🔹 TAGALL
    if (text === "!tagall") {
      try {
        const metadata = await sock.groupMetadata(from);
        const mentions = metadata.participants.map(p => p.id);
        const names = metadata.participants.map(p => `@${p.id.split("@")[0]}`).join("\n");
        await sock.sendMessage(from, { text: `📢 Mention de tous :\n\n${names}`, mentions });
      } catch (e) {
        await sock.sendMessage(from, { text: "❌ Impossible d’extraire les participants (peut-être pas un groupe)." });
      }
    }

    // 🔹 STICKER
    if (msg.message.imageMessage && text.includes("!sticker")) {
      const buffer = await sock.downloadMediaMessage(msg)
      await sock.sendMessage(from, { sticker: buffer })
    }

    // 🔹 PLAY
    if (text.startsWith("!play")) {
  const query = text.replace("!play", "").trim();
  if (!query) return sock.sendMessage(from, { text: "❌ Merci de donner artiste + titre !" });
  await sock.sendMessage(from, { text: `🔎 Recherche de *${query}*...` });

      try {
        // ⚠ Remplacer par ton API YouTube/Spotify pour musique réelle
        const url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        const audio = await axios.get(url, { responseType: "arraybuffer" })
        fs.writeFileSync("music.mp3", audio.data)
        await sock.sendMessage(from, { audio: { url: "./music.mp3" }, mimetype: "audio/mpeg" })
      } catch (err) {
        await sock.sendMessage(from, { text: "❌ Impossible de télécharger la musique." })
      }
    }

    // 🔹 KICK
    if (text.startsWith("!kick")) {
      const number = text.split(" ")[1];
      if (!number) return sock.sendMessage(from, { text: "❌ Utilisation : !kick <numéro>" });
      try {
        await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], "remove");
      } catch (e) {
        await sock.sendMessage(from, { text: "❌ Impossible d’exclure ce membre." });
      }
    }

    // 🔹 PROMOTE
    if (text.startsWith("!promote")) {
      const number = text.split(" ")[1];
      if (!number) return sock.sendMessage(from, { text: "❌ Utilisation : !promote <numéro>" });
      try {
        await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], "promote");
      } catch (e) {
        await sock.sendMessage(from, { text: "❌ Impossible de promouvoir ce membre." });
      }
    }

    // 🔹 DEMOTE
    if (text.startsWith("!demote")) {
      const number = text.split(" ")[1];
      if (!number) return sock.sendMessage(from, { text: "❌ Utilisation : !demote <numéro>" });
      try {
        await sock.groupParticipantsUpdate(from, [`${number}@s.whatsapp.net`], "demote");
      } catch (e) {
        await sock.sendMessage(from, { text: "❌ Impossible de rétrograder ce membre." });
      }
    }

    // 🔹 DELETE (admin)
    if (text === "!delete" && msg.key.participant) {
      try { await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: msg.key.participant } }) }
      catch { await sock.sendMessage(from, { text: "❌ Impossible de supprimer ce message." }) }
    }

    // 🔹 PHOTO DE PROFIL
    if (text.startsWith("!pp")) {
      const number = text.split(" ")[1];
      if (!number) return sock.sendMessage(from, { text: "❌ Utilisation : !pp <numéro>" });
      try {
        const ppUrl = await sock.profilePictureUrl(`${number}@s.whatsapp.net`, "image");
        await sock.sendMessage(from, { image: { url: ppUrl }, caption: `📸 Photo de profil de ${number}` });
      } catch (e) {
        await sock.sendMessage(from, { text: "❌ Impossible de récupérer la photo de profil." });
      }
    }

    // 🔹 STATUSALL
    if (text === "!statusall") {
      await sock.sendMessage(from, { text: "⚠ Fonction StatusAll non disponible avec Baileys (limitation WhatsApp)." })
    }

    // 🔹 AUDIO (depuis Google Drive exemple)
    if (text.startsWith("!audio")) {
      try {
        const url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
        const audio = await axios.get(url, { responseType: "arraybuffer" })
        fs.writeFileSync("audio.mp3", audio.data)
        await sock.sendMessage(from, { audio: { url: "./audio.mp3" }, mimetype: "audio/mpeg" })
      } catch {
        await sock.sendMessage(from, { text: "❌ Impossible d’envoyer la note vocale." })
      }
    }

    // 🔹 EXTRACT (sauvegarde média)
    if (text === "!extract") {
      if (msg.message.imageMessage || msg.message.videoMessage || msg.message.audioMessage || msg.message.documentMessage) {
        const buffer = await sock.downloadMediaMessage(msg)
        fs.writeFileSync("extract.bin", buffer)
        await sock.sendMessage(from, { text: "✅ Média extrait et sauvegardé." })
      } else {
        await sock.sendMessage(from, { text: "❌ Pas de média à extraire." })
      }
    }

    // 🔹 GUESS (jeu simple)
    if (text.startsWith("!guess")) {
      const number = Math.floor(Math.random() * 10) + 1
      await sock.sendMessage(from, { text: `🎲 Devine un nombre entre 1 et 10. Le bon était *${number}*.` })
    }
  })
}

// Lancer le bot
startBot()

// Route pour afficher QR Code
app.get("/qr", (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;">
        <h1>Ghostify Bot - QR Code</h1>
        <img src="${qrCodeData}" />
        <p>Scannez ce QR Code dans WhatsApp (Appareils connectés)</p>
      </body>
    </html>
  `)
})

// Keep-alive pour UptimeRobot
app.get("/", (req, res) => res.send("✅ Ghostify est en ligne"))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log("✅ Serveur en ligne sur port " + PORT))