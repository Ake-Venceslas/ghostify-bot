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

            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            const tempFile = path.join(tempDir, `music_${Date.now()}.mp3`);

            // Try download with retries and better format selection
            const maxAttempts = 3;
            let lastErr = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    console.log(`[PLAY] Tentative ${attempt} - ${video.url} (${video.title})`);

                    // Get info and choose an audio-only format with highest bitrate
                    const info = await ytdl.getInfo(video.url);
                    const formats = info.formats
                        .filter(f => f.hasAudio && !f.hasVideo && f.container && f.container !== 'webm')
                        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

                    const chosen = formats.length > 0 ? formats[0] : null;
                    const streamOptions = chosen ? { quality: chosen.itag } : { filter: 'audioonly', quality: 'highestaudio' };

                    const audioStream = ytdl.downloadFromInfo(info, streamOptions);
                    const writeStream = fs.createWriteStream(tempFile);
                    audioStream.pipe(writeStream);

                    await new Promise((resolve, reject) => {
                        writeStream.on('finish', resolve);
                        writeStream.on('error', reject);
                        audioStream.on('error', reject);
                    });

                    // Send audio
                    await sock.sendMessage(from, { audio: { url: tempFile }, mimetype: 'audio/mpeg' }, { quoted: msg });

                    // Cleanup
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                    console.log('[PLAY] Envoi terminé');
                    lastErr = null;
                    break; // success
                } catch (err) {
                    console.error(`[PLAY] Erreur tentative ${attempt}:`, err && err.message ? err.message : err);
                    lastErr = err;
                    // small backoff before retry
                    await new Promise(r => setTimeout(r, 800 * attempt));
                }
            }

            if (lastErr) {
                console.error('[PLAY] Toutes les tentatives ont échoué');
                const msgErr = lastErr.message || String(lastErr);
                await replyWithTag(sock, from, msg, `❌ Impossible de télécharger la musique : ${msgErr}`);
            }
        } catch (err) {
            console.error('[PLAY] Erreur :', err);
            try { await replyWithTag(sock, from, msg, '❌ Impossible de télécharger la musique.'); } catch {}
        }
    }
};
