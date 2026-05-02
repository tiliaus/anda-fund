// 診斷端點：回傳 MoneyDJ 頁面中含數字的關鍵片段
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const code = req.query.code || 'TLZF9';
  const page = req.query.page || 'yp011001';
  const url = `https://www.moneydj.com/funddj/yp/${page}.djhtm?a=${code}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-TW,zh;q=0.9',
        'Referer': 'https://www.moneydj.com/',
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await r.text();

    // 抓含數字的 td / span / div 片段
    const numCells = [...html.matchAll(/<(?:td|span|div)[^>]*>([^<]{0,60}[0-9]+\.[0-9]{2,6}[^<]{0,30})<\/(?:td|span|div)>/gi)]
      .map(m => m[0].replace(/\s+/g,' ').trim())
      .slice(0, 30);

    // 抓含「淨值」「基準」「配息」的段落
    const keywords = [...html.matchAll(/.{0,60}(?:淨值|基準|配息|除息|nav|price).{0,60}/gi)]
      .map(m => m[0].replace(/\s+/g,' ').trim())
      .slice(0, 20);

    // 抓所有日期
    const dates = [...new Set([...html.matchAll(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g)].map(m => m[0]))];

    // 抓所有合理的小數（可能是淨值）
    const allNums = [...new Set([...html.matchAll(/\b([1-9][0-9]{0,4}\.[0-9]{2,6})\b/g)].map(m => m[1]))]
      .map(Number).filter(n => n > 0.1 && n < 99999).sort((a,b)=>b-a).slice(0, 20);

    res.status(200).json({
      url, status: r.status, htmlLength: html.length,
      numCells, keywords, dates, allNums,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, url });
  }
};
