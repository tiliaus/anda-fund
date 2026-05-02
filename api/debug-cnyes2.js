// 批量測試所有基金在鉅亨的正確代碼
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://fund.cnyes.com/',
    'Origin': 'https://fund.cnyes.com',
  };

  // 所有代碼（移除逗號格式）
  const allCodes = [
    // 美元基金
    {name:'安聯AMg7美元', code:'B20168'}, {name:'安聯AMg7美元', code:'B20164'},
    {name:'安聯AM美元', code:'B20073'},
    {name:'聯博多元資產', code:'A18086'},
    {name:'聯博美國成長', code:'B03870'},
    {name:'富盛M&G美元', code:'B31138'},
    {name:'施羅德環球收益', code:'B23573'},
    {name:'貝萊德A6美元', code:'B09325'},
    {name:'貝萊德世界科技', code:'B09460'},
    {name:'瀚亞多重收益', code:'A07205'},
    {name:'東方匯理美元', code:'B32270'},
    {name:'摩根多重收益', code:'B08291'},
    // 南非幣基金
    {name:'安聯AM南非幣', code:'B20088'},
    {name:'貝萊德A8南非幣', code:'B09355'},
    {name:'施羅德環球C', code:'B23594'},
    {name:'東方匯理綜合南非', code:'B32282'},
    {name:'東方匯理南非幣', code:'B32167'},
    {name:'聯博全球多元南非', code:'B03636'},
    // 澳幣基金
    {name:'安聯AMg7澳幣', code:'B20187'},
    {name:'貝萊德A8澳幣', code:'B09327'},
  ];

  const results = [];
  for (const {name, code} of allCodes) {
    try {
      // 測試 nav
      const navUrl = `https://fund.api.cnyes.com/fund/api/v1/funds/${code}/nav?format=table&page=1`;
      const navR = await fetch(navUrl, { headers, signal: AbortSignal.timeout(5000) });
      let navOk = navR.status === 200;
      let navNav = null;
      if (navOk) {
        try {
          const j = await navR.json();
          navNav = j?.items?.data?.[0]?.[1] || j?.data?.items?.[0]?.nav || null;
        } catch {}
      }

      // 測試 div
      const divUrl = `https://fund.api.cnyes.com/fund/api/v1/funds/${code}/dividends`;
      const divR = await fetch(divUrl, { headers, signal: AbortSignal.timeout(5000) });
      let divOk = divR.status === 200;
      let divPreview = null;
      if (divOk) {
        try {
          const t = await divR.text();
          divPreview = t.substring(0, 200);
        } catch {}
      }

      results.push({
        name, code,
        nav: { status: navR.status, ok: navOk, nav: navNav },
        div: { status: divR.status, ok: divOk, preview: divPreview },
      });
    } catch(e) {
      results.push({ name, code, error: e.message });
    }
  }

  // 彙總：哪些成功
  const working = results.filter(r => r.nav?.ok);
  const divWorking = results.filter(r => r.div?.ok);

  res.status(200).json({
    summary: { navWorking: working.length, divWorking: divWorking.length, total: allCodes.length },
    workingNav: working.map(r => `${r.name}(${r.code}): nav=${r.nav.nav}`),
    workingDiv: divWorking.map(r => `${r.name}(${r.code})`),
    all: results,
  });
};
