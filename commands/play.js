const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
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

            // Try download with ffmpeg conversion; streaming ytdl into ffmpeg avoids some 410 issues
            const maxAttempts = 3;
            let lastErr = null;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    console.log(`[PLAY] Tentative ${attempt} - ${video.url} (${video.title})`);

                    // Use a direct ytdl stream (audio only) with robust headers
                    const ytdlOptions = {
                        filter: 'audioonly',
                        quality: 'highestaudio',
                        highWaterMark: 1 << 25,
                        requestOptions: {
                            headers: {
                                // use a common browser UA to reduce chance of 410 from remote
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Safari/537.36'
                            }
                        }
                    };

                    const audioStream = ytdl(video.url, ytdlOptions);

                    // Pipe through ffmpeg to produce an MP3 file
                    await new Promise((resolve, reject) => {
                        const proc = ffmpeg(audioStream)
                            .audioCodec('libmp3lame')
                            .audioBitrate(128)
                            .format('mp3')
                            .on('error', (err) => {
                                reject(err);
                            })
                            .on('end', () => resolve())
                            .save(tempFile);
                    });

                    // Send audio
                    await sock.sendMessage(from, { audio: { url: tempFile }, mimetype: 'audio/mpeg' }, { quoted: msg });

                    // Cleanup
                    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
                    console.log('[PLAY] Envoi terminé');
                    lastErr = null;
                    break; // success
                } catch (err) {
                    // Special-case status 410 (resource gone); try a short backoff and retry
                    const msgErr = err && err.message ? err.message : String(err);
                    console.error(`[PLAY] Erreur tentative ${attempt}:`, msgErr);
                    lastErr = err;
                    if (msgErr.includes('Status code 410')) {
                        // wait a little longer before retrying
                        await new Promise(r => setTimeout(r, 1500 * attempt));
                    } else {
                        await new Promise(r => setTimeout(r, 800 * attempt));
                    }
                }
            }

            if (lastErr) {
                console.error('[PLAY] Toutes les tentatives ont échoué');
                const msgErr = lastErr.message || String(lastErr);
                await replyWithTag(sock, from, msg, `❌ Impossible de télécharger la musique : ${msgErr}`);
                try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
            }
        } catch (err) {
            console.error('[PLAY] Erreur :', err);
            try { await replyWithTag(sock, from, msg, '❌ Impossible de télécharger la musique.'); } catch {}
        }
    }
};
