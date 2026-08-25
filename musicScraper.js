/**
 * SuzeNetwork - Native YouTube & Music Search Scraper
 * Fast, reliable, zero-dependency scraper for real-time music browsing.
 */

export async function searchMusic(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/);
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    const tracks = [];

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        if (item.videoRenderer && item.videoRenderer.videoId) {
          const v = item.videoRenderer;
          const title = v.title?.runs?.map(r => r.text).join('') || v.title?.simpleText || 'Unknown Song';
          const artist = v.ownerText?.runs?.map(r => r.text).join('') || v.shortBylineText?.runs?.map(r => r.text).join('') || 'Unknown Artist';
          const duration = v.lengthText?.simpleText || v.lengthText?.runs?.map(r => r.text).join('') || '3:30';
          const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          const views = v.viewCountText?.simpleText || v.shortViewCountText?.simpleText || '';

          tracks.push({
            id: v.videoId,
            title,
            artist,
            duration,
            thumbnail: thumb,
            views
          });

          if (tracks.length >= 25) break;
        }
      }
      if (tracks.length >= 25) break;
    }

    return tracks;
  } catch (err) {
    console.error('[MusicScraper] Error searching music:', err);
    return [];
  }
}
