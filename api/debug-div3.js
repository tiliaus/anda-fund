// 深度分析 yp011001 頁面中的配息資料
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const code = req.query.code || 'TLZF9';
  const url = `https://www.moneydj.com/funddj/yp/yp011001.djhtm?a=${code}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    'Referer': 'https://www.moneydj.com/',
  };

  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
    const html = await r.text();

    // 1. 找所有日期前後 200 字的上下文
    const dateContexts = [];
    const dateRegex = /\d{4}\/\d{1,2}\/\d{1,2}/g;
    let m;
    while ((m = dateRegex.exec(html)) !== null) {
      const start = Math.max(0, m.index - 100);
      const end = Math.min(html.length, m.index + 150);
      const context = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (context.length > 5) dateContexts.push({ date: m[0], context });
    }

    // 2. 找小數（0.01~1 範圍，可能是配息金額）
    const smallNums = [...new Set(
      (html.match(/\b0\.\d{4,6}\b/g) || [])
        .concat(html.match(/\b[1-9]\d*\.\d{4,6}\b/g) || [])
        .filter(n => parseFloat(n) < 5)
    )];

    // 3. 找所有 <tr> 中有日期的行
    const trWithDates = (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [])
      .filter(tr => /\d{4}\/\d{1,2}\/\d{1,2}/.test(tr))
      .map(tr => tr.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
      .slice(0, 20);

    // 4. 找 JavaScript 變數中的配息資料
    const jsData = (html.match(/(?:div|dividend|distribution|配息)[^;{]{0,200}/gi) || [])
      .map(s => s.replace(/\s+/g, ' ').trim())
      .slice(0, 10);

    // 5. 找包含 0.06 或 0.07 的段落（配息金額範圍）
    const amountContexts = [];
    const amtRegex = /0\.[0-9]{4,6}/g;
    let am;
    while ((am = amtRegex.exec(html)) !== null) {
      const start = Math.max(0, am.index - 80);
      const end = Math.min(html.length, am.index + 80);
      const ctx = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      amountContexts.push({ amount: am[0], context: ctx });
    }

    res.status(200).json({
      url, htmlLength: html.length,
      dateContexts: dateContexts.slice(0, 15),
      smallNums: smallNums.slice(0, 20),
      trWithDates: trWithDates.slice(0, 15),
      jsData,
      amountContexts: amountContexts.slice(0, 10),
    });
  } catch(e) {
    res.status(500).json({ error: e.message, url });
  }
};
