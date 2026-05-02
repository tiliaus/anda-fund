// 精確找出 MoneyDJ 頁面中配息金額 0.06822 的確切位置
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

    // 1. 找所有 0.04~0.15 範圍的小數（月配息金額範圍）
    const smallDecimals = [];
    const sdRegex = /0\.(0[3-9]\d{2,4}|[1-2]\d{3,5})/g;
    let m;
    while ((m = sdRegex.exec(html)) !== null) {
      const start = Math.max(0, m.index - 200);
      const end = Math.min(html.length, m.index + 200);
      const raw = html.slice(start, end);
      const clean = raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      smallDecimals.push({ value: m[0], rawContext: raw.substring(0, 400), cleanContext: clean });
    }

    // 2. 找「每單位配息」附近
    const divKeywords = [];
    const kwRegex = /每單位|配息金額|單位配息|配發|發放/g;
    while ((m = kwRegex.exec(html)) !== null) {
      const start = Math.max(0, m.index - 50);
      const end = Math.min(html.length, m.index + 300);
      divKeywords.push({
        keyword: m[0],
        raw: html.slice(start, end).substring(0, 400),
        clean: html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
      });
    }

    // 3. 找 "djfund" 相關 JS 呼叫，可能有 AJAX 端點
    const djfundCalls = (html.match(/djfund[^'"<]{0,100}/g) || []).slice(0, 10);

    // 4. 找所有 iframe 或 script src（可能配息從外部載入）
    const iframes = (html.match(/<iframe[^>]+>/gi) || []).slice(0, 5);
    const scriptSrcs = (html.match(/src=["'][^"']+["']/gi) || []).slice(0, 20);

    // 5. 找 yp132 或 yp133 連結（可能是配息子頁）
    const subpages = (html.match(/yp1[23]\d\.djhtm[^"'<]{0,50}/g) || []);

    res.status(200).json({
      url, htmlLength: html.length,
      smallDecimalsCount: smallDecimals.length,
      smallDecimals: smallDecimals.slice(0, 5),
      divKeywords,
      djfundCalls,
      iframes,
      scriptSrcs: scriptSrcs.slice(0, 10),
      subpages,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
