// 割引率しきい値設定
const config = {
  threshold15: 15,
  threshold30: 30,
  threshold50: 50,
  threshold70: 70,
  threshold90: 90
};

// ページのURL判定。/seeMore が含まれている場合のみ実行
function isTargetPage() {
  const url = window.location.href;
  const path = window.location.pathname;
  const target = path.includes('/seeMore') || url.includes('seeMore') || url.includes('ContinueSeriesDRS_V2');
  console.log(`[Amazon割引チェッカー] ページ判定: URL=${url}, 判定結果=${target}`);
  return target;
}

// Shadow DOMを含むすべての要素を再帰的に走査して取得する
function getAllElementsDeep(root = document) {
  let elements = [];
  try {
    // もし root 自体が shadowRoot を持っているホスト要素なら、その shadowRoot 内の要素も追加する
    if (root.shadowRoot) {
      elements = elements.concat(getAllElementsDeep(root.shadowRoot));
    }
    
    const all = Array.from(root.querySelectorAll('*'));
    elements = elements.concat(all);
    
    // 各要素の shadowRoot をチェックして再帰的に探索
    all.forEach(el => {
      if (el && el.shadowRoot) {
        elements = elements.concat(getAllElementsDeep(el.shadowRoot));
      }
    });
  } catch (e) {
    console.error("[Amazon割引チェッカー] 要素の深層走査中にエラーが発生しました:", e);
  }
  return elements;
}

// 深層の親要素を取得する（Shadow DOM対応）
function getParentElementDeep(el) {
  if (!el) return null;
  if (el.parentElement) return el.parentElement;
  if (el.parentNode && el.parentNode.host) {
    return el.parentNode.host;
  }
  return null;
}

// Shadow DOMを含むすべてのテキストコンテンツを再帰的に取得する
function getTextContentDeep(el) {
  if (!el) return '';
  if (el.nodeType === Node.TEXT_NODE) {
    return el.nodeValue;
  }
  
  let text = '';
  // Shadow DOMがある場合はそちらを優先的に探索
  if (el.shadowRoot) {
    Array.from(el.shadowRoot.childNodes).forEach(child => {
      text += ' ' + getTextContentDeep(child);
    });
  } else if (el.childNodes && el.childNodes.length > 0) {
    Array.from(el.childNodes).forEach(child => {
      text += ' ' + getTextContentDeep(child);
    });
  }
  return text;
}

// 本のカード要素を特定する
function getBookCards() {
  // Shadow DOMを含め、すべての要素を走査
  const elements = getAllElementsDeep(document);
  
  // 起点となる各種ラベルの検索
  const startLabels = elements.filter(el => {
    let txt = (el.innerText || el.textContent || '').trim();
    // 非改行スペース (nbsp) や全角スペースなどを通常の半角スペースに統一
    txt = txt.replace(/[\u00a0\u3000\s]+/g, ' ').trim();
    if (!txt) return false;
    
    // 起点1: 「Kindle版」に一致する要素（最下層の葉ノードに近いもの）
    if (txt === 'Kindle版' || txt.includes('Kindle版') && txt.length < 15) {
      const hasChildKindle = Array.from(el.children).some(child => {
        const childTxt = (child.innerText || child.textContent || '').replace(/[\u00a0\u3000\s]+/g, ' ').trim();
        return childTxt.includes('Kindle版');
      });
      return !hasChildKindle;
    }
    
    // 起点2: 「紙の本の価格」や「紙の書籍」に一致する要素
    if ((txt.includes('紙の本の価格') || txt.includes('紙の書籍') || txt.includes('紙の本')) && txt.length < 30) {
      const hasChildPrint = Array.from(el.children).some(child => {
        const childTxt = (child.innerText || child.textContent || '').replace(/[\u00a0\u3000\s]+/g, ' ').trim();
        return childTxt.includes('紙の本の価格') || childTxt.includes('紙の書籍') || childTxt.includes('紙の本');
      });
      return !hasChildPrint;
    }
    
    // 起点3: 「￥」で始まる価格表示 (例: ￥792)
    if (txt.startsWith('￥') && txt.length < 15) {
      const hasChildPrice = Array.from(el.children).some(child => {
        const childTxt = (child.innerText || child.textContent || '').trim();
        return childTxt.startsWith('￥');
      });
      return !hasChildPrice;
    }
    
    return false;
  });

  const cards = [];
  startLabels.forEach(label => {
    let parent = getParentElementDeep(label);
    let card = null;
    
    // 親を辿る（画面解像度やレスポンシブ幅の影響を受けないよう、物理サイズチェックを廃止し、画像数とクラス名で特定）
    while (parent && parent !== document.body) {
      // Shadow DOM内部も含めてすべての画像を検索
      const imgs = getAllElementsDeep(parent).filter(el => el.tagName === 'IMG');
      const hasImg = imgs.length >= 1;
      
      // Amazonの一般的な書籍カードコンテナのクラス・属性判定
      const isCardUI = parent.classList.contains('a-cardui') || 
                       parent.classList.contains('a-section') ||
                       parent.classList.contains('a-spacing-base') ||
                       parent.classList.contains('a-spacing-medium') ||
                       parent.classList.contains('p13n-grid-content') ||
                       parent.classList.contains('grid-item') ||
                       parent.classList.contains('unified-book-faceout') ||
                       parent.tagName === 'LI' ||
                       parent.getAttribute('data-asin');
      
      // 画像を含み、かつカード用クラスに合致している場合
      if (hasImg && isCardUI) {
        // 巨大な全体コンテナ（多数の書籍画像を含むもの）は除外する
        // ただし、'unified-book-faceout' や 'a-cardui' のように明確に個別カードを示すクラスの場合は、画像数が多くても（星評価画像等を含むため）採用する
        const isSpecificCard = parent.classList.contains('unified-book-faceout') ||
                               parent.classList.contains('a-cardui') ||
                               parent.getAttribute('data-asin');
                               
        if (imgs.length > 3 && !isSpecificCard) {
          parent = getParentElementDeep(parent);
          continue; // 大きすぎるコンテナなのでさらに親へ
        }
        
        card = parent;
        break; // 最も内側の書籍カードコンテナを採用
      }
      
      parent = getParentElementDeep(parent);
    }
    
    if (card && !cards.includes(card)) {
      cards.push(card);
    }
  });

  return cards;
}

// 1つのカードの情報を解析する
function parseCardData(card) {
  const text = getTextContentDeep(card).replace(/[\u00a0\u3000\s]+/g, ' ');
  
  // 1. 割引率（Amazon公式の赤字表記、例：-2%）
  const discountMatch = text.match(/-([0-9]+)%/);
  const amazonDiscount = discountMatch ? parseInt(discountMatch[1], 10) : 0;
  
  // 2. 紙の本の価格
  const printPriceMatch = text.match(/(?:紙の本の価格|紙の書籍|紙の本|紙版の価格)[:：]?[ \t]*￥[ \t]*([0-9,]+)/) || 
                          text.match(/紙の本の価格[:：]?[ \t]*([0-9,]+)/);
  let printPrice = printPriceMatch ? parseInt(printPriceMatch[1].replace(/,/g, ''), 10) : null;
  
  // 3. Kindle価格
  let cleanText = text.replace(/(?:紙の本の価格|紙の書籍|紙の本|紙版の価格)[:：]?[ \t]*￥[ \t]*[0-9,]+/g, '');
  cleanText = cleanText.replace(/ポイント\s*\(.*?\)/g, '');
  
  const kindlePriceMatch = cleanText.match(/￥[ \t]*([0-9,]+)/);
  let kindlePrice = kindlePriceMatch ? parseInt(kindlePriceMatch[1].replace(/,/g, ''), 10) : null;
  
  // 4. ポイント
  const pointsMatch = text.match(/([0-9,]+)[ \t]*ポイント/);
  const points = pointsMatch ? parseInt(pointsMatch[1].replace(/,/g, ''), 10) : 0;
  
  const pointsPercentMatch = text.match(/ポイント[ \t]*\([ \t]*([0-9]+)%[ \t]*\)/);
  const pointsPercent = pointsPercentMatch ? parseInt(pointsPercentMatch[1], 10) : 0;

  return {
    kindlePrice,
    printPrice,
    amazonDiscount,
    points,
    pointsPercent
  };
}

// 割引率と実質価格の計算
function calculateDiscounts(data) {
  const { kindlePrice, printPrice, amazonDiscount, points } = data;
  
  if (!kindlePrice) return null;
  
  // ポイント還元額の計算 (常に考慮)
  const pointOffset = points;
  
  // 実質価格 (クーポン引きは廃止)
  const effectivePrice = Math.max(0, kindlePrice - pointOffset);
  
  // 基準価格 of 決定 (紙の本の価格があればそれを優先、なければ逆算、それもなければKindle価格)
  let basePrice = printPrice;
  if (!basePrice) {
    if (amazonDiscount > 0) {
      basePrice = Math.round(kindlePrice / (1 - (amazonDiscount / 100)));
    } else {
      basePrice = kindlePrice;
    }
  }
  
  // 実質割引率
  let effectiveDiscountRate = 0;
  if (basePrice > 0) {
    effectiveDiscountRate = ((basePrice - effectivePrice) / basePrice) * 100;
  }
  
  return {
    basePrice,
    effectivePrice,
    effectiveDiscountRate,
    pointOffset
  };
}

// カードの装飾とバッジ挿入
function applyCardDecorations(card, data, calc) {
  if (!data.kindlePrice || !calc) return;
  
  // すでにバッジが挿入されており、価格データが変更されていない場合は何もしない（無限ループ防止）
  let badge = card.querySelector('.amazon-discount-badge');
  if (badge) {
    const existingPrice = badge.getAttribute('data-price');
    if (existingPrice === String(calc.effectivePrice)) {
      return; // すでに最新の状態で描画されているためスキップ
    }
    badge.remove(); // 異なる場合は古いバッジを削除
  }
  
  // カード自体の position: relative を確保し、transition も適用
  card.style.setProperty('position', 'relative', 'important');
  card.style.setProperty('transition', 'all 0.25s ease', 'important');
  
  const rate = calc.effectiveDiscountRate;
  
  // 15%未満はバッジを作らず、装飾をクリアして早期リターン (kiseppeの cutoff 互換)
  if (rate < config.threshold15) {
    card.style.removeProperty('border');
    card.style.removeProperty('background-color');
    card.style.removeProperty('box-shadow');
    return;
  }
  
  let levelClass = 'discount-level-15';
  let badgeLabel = 'お得';
  
  let borderColor = '';
  let bgColor = '';
  let boxShadow = '';
  let borderStyle = 'solid';
  
  // 割引しきい値判定とスタイルの設定
  // 背景色の不透明度（アルファ）はkiseppeのロジック (rate / 100 * 0.2) に近づけつつ、各段階で設定
  if (rate >= config.threshold90) {
    levelClass = 'discount-level-90';
    badgeLabel = '神割引！';
    borderColor = '#ff0000'; // 90%以上: 純赤
    bgColor = 'rgba(255, 0, 0, 0.18)'; // 90/100 * 0.2 = 0.18
    boxShadow = '0 4px 14px rgba(255, 0, 0, 0.2)';
    borderStyle = 'dashed';
  } else if (rate >= config.threshold70) {
    levelClass = 'discount-level-70';
    badgeLabel = '超特価';
    borderColor = '#ff3366'; // 70%-90%: 濃いピンクレッド
    bgColor = 'rgba(255, 0, 0, 0.14)'; // 70/100 * 0.2 = 0.14
    boxShadow = '0 4px 12px rgba(255, 51, 102, 0.15)';
  } else if (rate >= config.threshold50) {
    levelClass = 'discount-level-50';
    badgeLabel = '大特価';
    borderColor = '#ff4d6d'; // 50%-70%: ディープピンク
    bgColor = 'rgba(255, 0, 0, 0.10)'; // 50/100 * 0.2 = 0.10
    boxShadow = '0 4px 12px rgba(255, 77, 109, 0.12)';
  } else if (rate >= config.threshold30) {
    levelClass = 'discount-level-30';
    badgeLabel = '注目';
    borderColor = '#ff758f'; // 30%-50%: ローズピンク
    bgColor = 'rgba(255, 0, 0, 0.06)'; // 30/100 * 0.2 = 0.06
    boxShadow = '0 4px 12px rgba(255, 117, 143, 0.1)';
  } else {
    levelClass = 'discount-level-15';
    badgeLabel = 'お得';
    borderColor = '#ffccd5'; // 15%-30%: ソフトピンク (kiseppe cutoff以上)
    bgColor = 'rgba(255, 0, 0, 0.03)'; // 15/100 * 0.2 = 0.03
    boxShadow = '0 4px 12px rgba(255, 179, 198, 0.08)';
  }
  
  // インラインスタイルの直接変更
  card.style.setProperty('border', `2px ${borderStyle} ${borderColor}`, 'important');
  card.style.setProperty('background-color', bgColor, 'important');
  card.style.setProperty('box-shadow', boxShadow, 'important');
  
  // バッジ要素の作成
  badge = document.createElement('div');
  badge.className = `amazon-discount-badge ${levelClass}`;
  badge.setAttribute('data-price', String(calc.effectivePrice));
  
  // 表示用テキストの整形
  const formattedRate = rate.toFixed(1);
  badge.innerHTML = `
    <span class="badge-tag">${badgeLabel}</span>
    <span class="badge-rate">実質 -${formattedRate}%</span>
    <div class="discount-tooltip">
      <div class="tooltip-row"><span>基準価格 (紙本等):</span><strong>￥${calc.basePrice.toLocaleString()}</strong></div>
      <div class="tooltip-row"><span>Kindle価格:</span><strong>￥${data.kindlePrice.toLocaleString()}</strong></div>
      ${calc.pointOffset > 0 ? `<div class="tooltip-row text-green"><span>ポイント還元:</span><strong>-￥${calc.pointOffset.toLocaleString()}</strong></div>` : ''}
      <hr class="tooltip-divider" />
      <div class="tooltip-row total-row"><span>実質価格:</span><strong>￥${calc.effectivePrice.toLocaleString()}</strong></div>
      <div class="tooltip-row total-row"><span>実質割引率:</span><strong class="color-highlight">${formattedRate}% OFF</strong></div>
    </div>
  `;
  
  // Shadow DOM用のスタイルシートがまだ挿入されていない場合、作成して挿入する (外部CSSがShadow DOM内に届かない対策)
  // getRootNode() を使って shadowRoot 直下に差し込むことで完全にスタイルを適用する
  const root = card.getRootNode();
  if (root) {
    let shadowStyle = root.querySelector('#amazon-discount-shadow-style');
    if (!shadowStyle) {
      shadowStyle = document.createElement('style');
      shadowStyle.id = 'amazon-discount-shadow-style';
      shadowStyle.textContent = `
        .amazon-discount-badge {
          position: absolute !important;
          top: 8px !important;
          left: 8px !important;
          z-index: 100 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          padding: 5px 9px !important;
          border-radius: 4px !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          font-weight: 900 !important;
          background-color: #ffffff !important; /* 下敷きをしろ */
          color: #000000 !important; /* 文字を黒 */
          box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.15) !important;
          cursor: help !important;
          user-select: none !important;
          border: 2px solid #7f8c8d !important;
          line-height: 1.1 !important;
        }
        
        /* レベル別の枠線色 (赤系グラデーション) */
        .amazon-discount-badge.discount-level-15 { border-color: #ffccd5 !important; }
        .amazon-discount-badge.discount-level-30 { border-color: #ff85a1 !important; }
        .amazon-discount-badge.discount-level-50 { border-color: #ff4d6d !important; }
        .amazon-discount-badge.discount-level-70 { border-color: #ff0a54 !important; }
        .amazon-discount-badge.discount-level-90 {
          border-color: #ff0000 !important;
          animation: pulse-badge 1s infinite alternate !important;
        }
        
        /* 割引率の数値をテーマ色で強調して読みやすくする */
        .amazon-discount-badge.discount-level-15 .badge-rate { color: #ff5c8a !important; }
        .amazon-discount-badge.discount-level-30 .badge-rate { color: #ff4d6d !important; }
        .amazon-discount-badge.discount-level-50 .badge-rate { color: #c9184a !important; }
        .amazon-discount-badge.discount-level-70 .badge-rate { color: #a4133c !important; }
        .amazon-discount-badge.discount-level-90 .badge-rate { color: #ff0000 !important; }

        @keyframes pulse-badge {
          0% { transform: scale(1); }
          100% { transform: scale(1.05); }
        }
        .badge-tag {
          font-size: 9px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.8px !important;
          color: #ffb3c6 !important;
          line-height: 1 !important;
          margin-bottom: 3px !important;
        }
        .amazon-discount-badge.discount-level-15 .badge-tag { color: #ff5c8a !important; }
        .amazon-discount-badge.discount-level-30 .badge-tag { color: #ff4d6d !important; }
        .amazon-discount-badge.discount-level-50 .badge-tag { color: #c9184a !important; }
        .amazon-discount-badge.discount-level-70 .badge-tag { color: #a4133c !important; }
        .amazon-discount-badge.discount-level-90 .badge-tag { color: #ff0000 !important; }

        .badge-rate {
          font-size: 13px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          letter-spacing: 0.3px !important;
        }
        .discount-tooltip {
          visibility: hidden !important;
          opacity: 0 !important;
          width: 200px !important;
          background-color: #ffffff !important; /* 下敷きをしろ */
          color: #333333 !important; /* 文字を黒 */
          text-align: left !important;
          border-radius: 6px !important;
          padding: 10px !important;
          position: absolute !important;
          z-index: 200 !important;
          top: 100% !important;
          left: 0 !important;
          margin-top: 6px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1) !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          font-weight: normal !important;
          text-shadow: none !important;
          font-size: 11px !important;
          transition: opacity 0.2s ease, transform 0.2s ease !important;
          transform: translateY(-5px) !important;
          pointer-events: none !important;
          border: 1px solid #ddd !important;
        }
        .amazon-discount-badge:hover .discount-tooltip {
          visibility: visible !important;
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        .tooltip-row {
          display: flex !important;
          justify-content: space-between !important;
          margin-bottom: 4px !important;
        }
        .tooltip-row span { color: #666666 !important; }
        .tooltip-row strong { color: #000000 !important; }
        .text-green strong { color: #27ae60 !important; }
        .text-red strong { color: #c0392b !important; }
        .tooltip-divider {
          border: 0 !important;
          border-top: 1px solid #eee !important;
          margin: 6px 0 !important;
        }
        .total-row {
          font-size: 12px !important;
          font-weight: bold !important;
        }
        .color-highlight {
          color: #c0392b !important; /* 赤 */
          font-size: 13px !important;
        }
      `;
      root.appendChild(shadowStyle);
    }
  }
  
  // カードの直下にバッジを配置して絶対配置で重ねる (React管理下の要素破壊を防ぐ)
  card.appendChild(badge);
}

// ページ全体の解析処理を実行
function processPage() {
  if (!isTargetPage()) return;
  
  const cards = getBookCards();
  console.log(`[Amazon割引チェッカー] processPage実行: カード数=${cards.length}個`);
  cards.forEach(card => {
    const data = parseCardData(card);
    const calc = calculateDiscounts(data);
    applyCardDecorations(card, data, calc);
  });
}

// 動的更新の監視 (無限スクロール、タブ切り替え、SPA遷移に対応)
let observer = null;
function startObserver() {
  if (observer) observer.disconnect();
  
  let lastUrl = location.href;
  
  observer = new MutationObserver((mutations) => {
    // URLの変更チェック (SPA遷移対策)
    if (location.href !== lastUrl) {
      console.log(`[Amazon割引チェッカー] URL変更検知: ${lastUrl} -> ${location.href}`);
      lastUrl = location.href;
      if (isTargetPage()) {
        processPage();
      }
      return;
    }
    
    // ターゲットページでない場合は、DOM変更の解析を行わない
    if (!isTargetPage()) return;
    
    let shouldProcess = false;
    for (const mutation of mutations) {
      const added = Array.from(mutation.addedNodes);
      
      // 自身が追加した割引バッジのみの変更の場合は無視する（無限ループ防止）
      const hasRealAddedNodes = added.some(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        // 自身が追加したバッジ、またはその子孫である場合は対象外
        if (node.classList.contains('amazon-discount-badge') || node.closest('.amazon-discount-badge')) {
          return false;
        }
        return true;
      });
      
      if (hasRealAddedNodes || mutation.type === 'characterData') {
        shouldProcess = true;
        break;
      }
    }
    
    if (shouldProcess) {
      // 連続する書き込みを抑えるために少し遅延させる
      clearTimeout(window.processTimeout);
      window.processTimeout = setTimeout(() => {
        processPage();
      }, 300);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// 初期実行
function init() {
  console.log("[Amazon割引チェッカー] 拡張機能が初期化されました。URL:", location.href);
  if (isTargetPage()) {
    processPage();
    // 遅延読み込み (Reactの非同期描画タイミング) への対策
    setTimeout(processPage, 300);
    setTimeout(processPage, 1000);
    setTimeout(processPage, 2500);
  }
  // ターゲットページでなくても、SPA遷移を検知するため常に監視を開始する
  startObserver();
}

// DOMContentLoaded または即座に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
