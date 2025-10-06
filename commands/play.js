import axios from "axios";
import fs from "fs";
import ytdl from "ytdl-core";
import ytSearch from "yt-search";

export default async function playCommand(sock, from, text) {
  const query = text.replace("!play", "").trim();
  if (!query) {
    await sock.sendMessage(from, { text: "❌ Merci de donner artiste + titre !" });
    return;
  }
  await sock.sendMessage(from, { text: `🔎 Recherche de *${query}*...` });
  try {
    const searchResult = await ytSearch(query);
    const video = searchResult.videos && searchResult.videos.length > 0 ? searchResult.videos[0] : null;
    if (!video) {
      await sock.sendMessage(from, { text: "❌ Aucun résultat trouvé sur YouTube." });
      return;
    }
    const audioStream = ytdl(video.url, { filter: "audioonly", quality: "highestaudio" });
    const filePath = "music.mp3";
    const writeStream = fs.createWriteStream(filePath);
    audioStream.pipe(writeStream);
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    await sock.sendMessage(from, { audio: { url: `./${filePath}` }, mimetype: "audio/mpeg" });
    fs.unlinkSync(filePath); // Nettoyage du fichier après envoi
  } catch (err) {
    await sock.sendMessage(from, { text: "❌ Impossible de télécharger la musique." });
  }
}
