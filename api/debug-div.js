// 診斷：查看 MoneyDJ 配息頁面實際內容
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const code = req.query.code || 'TLZF9';
  const results = [];

  const pages = ['yp131', 'yp011001', 'yp133'];
  for (const page of pages) {
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

      // 找所有含「配息|除息」的表格片段
      const divTables = [];
      const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
      for (const tbl of tables) {
        if (/配息|除息|dividend/i.test(tbl)) {
          divTables.push(tbl.replace(/\s+/g, ' ').substring(0, 800));
        }
      }

      // 找所有日期
      const dates = [...new Set((html.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) || []))];

      // 找所有小數
      const nums = [...new Set((html.match(/\b\d+\.\d{4,6}\b/g) || []))].slice(0, 10);

      // 找含配息關鍵字的文字段落
      const divKeywords = (html.match(/.{0,30}(?:配息|除息|每單位).{0,50}/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(s => s.length > 5)
        .slice(0, 10);

      results.push({
        page, url, status: r.status,
        htmlLength: html.length,
        divTableCount: divTables.length,
        divTables,
        dates,
        nums,
        divKeywords,
      });
    } catch (e) {
      results.push({ page, url, error: e.message });
    }
  }

  res.status(200).json({ code, results });
};
