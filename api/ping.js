// 診斷端點：測試 Vercel 能否連上 MoneyDJ
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const tests = [];

  const urls = [
    'https://www.moneydj.com/funddj/yp/yp011001.djhtm?a=TLZF9',
    'https://www.moneydj.com/',
    'https://www.google.com',
  ];

  for (const url of urls) {
    try {
      const start = Date.now();
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.moneydj.com/' },
        signal: AbortSignal.timeout(8000),
      });
      const ms = Date.now() - start;
      const text = await r.text();
      tests.push({
        url,
        status: r.status,
        ok: r.ok,
        ms,
        preview: text.substring(0, 100).replace(/\s+/g, ' '),
      });
    } catch (e) {
      tests.push({ url, error: e.message });
    }
  }

  res.status(200).json({ time: new Date().toISOString(), tests });
};
