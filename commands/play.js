const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

module.exports = {
    name: 'play',
    description: 'Télécharge une piste YouTube et l’envoie en audio',
    adminOnly: false,
    run: async ({ sock, msg, args, replyWithTag }) => {
        const from = msg.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) return replyWithTag(sock, from, msg, '❌ Merci de donner artiste + titre !');

        await replyWithTag(sock, from, msg, `🔎 Recherche de *${query}*...`);

        try {
            const searchResult = await ytSearch(query);
            const video = searchResult.videos && searchResult.videos.length > 0 ? searchResult.videos[0] : null;
            if (!video) return replyWithTag(sock, from, msg, '❌ Aucun résultat trouvé sur YouTube.');

            const tempFile = path.join(__dirname, `../temp/music_${Date.now()}.mp3`);
            // ensure temp dir exists
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const audioStream = ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio' });
            const writeStream = fs.createWriteStream(tempFile);
            audioStream.pipe(writeStream);

            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
                audioStream.on('error', reject);
            });

            await sock.sendMessage(from, { audio: { url: tempFile }, mimetype: 'audio/mpeg' }, { quoted: msg });
            // cleanup
            if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        } catch (err) {
            console.error('[PLAY] Erreur :', err);
            try { await replyWithTag(sock, from, msg, '❌ Impossible de télécharger la musique.'); } catch {}
        }
    }
};
