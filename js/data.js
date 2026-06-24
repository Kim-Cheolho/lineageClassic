// 🟢 전역 데이터베이스 객체
let items_db = {};
let recipes_db = {};

const CSV_LINKS = {
  weapon: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWs-z11xovyh5nZXXYjI-bsbl2PosmBM3SQPQrQDZefquGCW8hF_UAraVl6arynMAAd9npzE1Zk5v4/pub?output=csv",
  armor: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTD1PGa-37lEOkLalru3wz74OFXtYb1OGrN2cXVbN0ARU4jJXoYKLVG-TXX7sr_2uYShyHKLnn-zXl5/pub?output=csv",
  accessory: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPQ2pDBMWZxedMQzI6zCztAPg7A0BiThJsLnT3KpBMILzWAglSxjFcjaj6_msNiurJUvUYbqCeOIAy/pub?output=csv",
  material: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG1PEgePbi1Lz8J5dH8uGhj2bOI6Ty7fZiT2t0Gs6QhttJy8PGCm7CtqeH5o4ZF59EhMwBhJoL5VZX/pub?output=csv",
  recipe: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTlpXNyQitzPZ7u9THzc8UBlMR1lNEcBzXOkjefIJFUcd52P4HMU3mrlqgMo0xYGeB6iCUu0qQlW1e9/pub?output=csv",
};

const STAT_ORDER = ["종류", "공격력(작은/큰)", "방어력", "한손/양손", "클래스", "무게", "재질", "인챈트", "레벨 제한", "손상 여부"];
const ITEM_SYSTEM_COLS = ["ID", "이름", "아이콘", "이미지", "분류", "설명", "세트 효과", "세트 아이템", "줄임말", "창고", "사망 시 드롭", "교환", "삭제"];

// 🟢 [보안] XSS 취약점 방어를 위한 HTML 이스케이프 함수
function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

function parseCSVRow(str) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') { inQuotes = !inQuotes; } 
    else if (char === "," && !inQuotes) { result.push(current.trim()); current = ""; } 
    else { current += char; }
  }
  result.push(current.trim());
  return result.map((s) => s.replace(/(^"|"$)/g, ""));
}

async function processItemSheet(url, categoryName) {
  if (!url) return;
  const response = await fetch(url);
  const csvText = await response.text();

  const rows = csvText.split("\n");
  const headers = parseCSVRow(rows[0]);

  rows.slice(1).forEach((row) => {
    if (!row.trim()) return;
    const values = parseCSVRow(row);
    const rowData = {};
    headers.forEach((h, i) => (rowData[h.trim()] = escapeHTML(values[i] || "")));

    const id = rowData["ID"];
    if (!id) return;

    let stats = [];
    headers.forEach((h) => {
      const key = h.trim();
      let val = rowData[key];

      if (key === "클래스" && val === "") {
        if (categoryName === "weapon" || categoryName === "armor" || categoryName === "accessory") val = "전체";
      }

      if (!ITEM_SYSTEM_COLS.includes(key) && val !== "") {
        if (key === "옵션") {
          const mergedOptions = val.split(",").map((opt) => opt.trim()).join("<br>");
          stats.push({ label: "옵션", value: mergedOptions });
        } else {
          stats.push({ label: key, value: val });
        }
      }
    });

    stats.sort((a, b) => {
      let indexA = STAT_ORDER.indexOf(a.label);
      let indexB = STAT_ORDER.indexOf(b.label);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });

    const setEffectDesc = rowData["세트 효과"];
    const setItemsStr = rowData["세트 아이템"];
    const aliasStr = rowData["줄임말"];

    let setEffect = undefined;
    if (setEffectDesc || setItemsStr) {
      setEffect = {
        description: setEffectDesc || "",
        items: setItemsStr ? setItemsStr.split(",").map((s) => s.trim()) : [],
      };
    }

    const tradeInfo = {
      storage: rowData["창고"] || "O",
      drop: rowData["사망 시 드롭"] || "O",
      trade: rowData["교환"] || "O",
      delete: rowData["삭제"] || "O",
    };

    items_db[id] = {
      id: id,
      name: rowData["이름"] || id,
      category: categoryName,
      type: rowData["분류"] || "",
      desc: rowData["설명"] || "",
      icon: rowData["아이콘"] || "",
      image: rowData["이미지"] || "",
      stats: stats.length > 0 ? stats : undefined,
      setEffect: setEffect,
      aliases: aliasStr ? aliasStr.split(",").map((s) => s.trim().replace(/\s+/g, "").toLowerCase()) : [],
      tradeInfo: tradeInfo,
    };
  });
}

async function processRecipeSheet(url) {
  if (!url) return;
  const response = await fetch(url);
  const csvText = await response.text();

  const rows = csvText.split("\n");
  const headers = parseCSVRow(rows[0]);

  rows.slice(1).forEach((row) => {
    if (!row.trim()) return;
    const values = parseCSVRow(row);
    const rowData = {};
    headers.forEach((h, i) => (rowData[h.trim()] = escapeHTML(values[i] || "")));

    const id = rowData["ID"];
    if (!id) return;

    const materialsStr = rowData["재료"];
    if (!materialsStr) return;

    recipes_db[id] = {
      npc: rowData["NPC"] || "",
      location: rowData["장소"] || "",
      yield: parseInt(rowData["제작수량"]) || 1,
      materials: materialsStr.split(",").map((mat) => {
        const parts = mat.split(":");
        return { id: parts[0].trim(), count: parseInt(parts[1]) || 1 };
      }),
    };
  });
}

// 🟢 [핵심] 캐싱(Storage) 완전 제거 + 부모 창을 통한 Promise 공유 (네트워크 중복 호출 방지)
async function loadDatabaseFromSheet() {
  try {
    const parentWin = window.parent || window;

    // 1. 이미 다운로드되어 부모 창에 저장된 데이터가 있다면 즉시 복사 후 종료 (0초 컷, 네트워크 호출 안 함)
    if (parentWin.__SHARED_ITEMS_DB__) {
      items_db = parentWin.__SHARED_ITEMS_DB__;
      recipes_db = parentWin.__SHARED_RECIPES_DB__;
      return true;
    }

    // 2. 다른 탭(Iframe)이 이미 다운로드를 시작했다면, 그 탭이 끝날 때까지 대기
    if (parentWin.__DB_FETCH_PROMISE__) {
      await parentWin.__DB_FETCH_PROMISE__;
      items_db = parentWin.__SHARED_ITEMS_DB__;
      recipes_db = parentWin.__SHARED_RECIPES_DB__;
      return true;
    }

    // 3. 내가 최초 호출자라면 다운로드 시작 (Promise를 부모 창에 등록하여 다른 탭과 공유)
    parentWin.__DB_FETCH_PROMISE__ = (async () => {
      const itemPromises = Object.entries(CSV_LINKS)
        .filter(([cat]) => cat !== "recipe")
        .map(([cat, url]) => processItemSheet(url, cat));

      const recipePromise = processRecipeSheet(CSV_LINKS.recipe);

      // 5개 시트 1회 단일 호출
      await Promise.all([...itemPromises, recipePromise]);

      // 다운로드가 끝나면 완성된 DB 객체를 부모 창 메모리에 공유 (다른 탭들이 쓸 수 있게 함)
      parentWin.__SHARED_ITEMS_DB__ = items_db;
      parentWin.__SHARED_RECIPES_DB__ = recipes_db;
    })();

    // 4. 다운로드 완료 대기
    await parentWin.__DB_FETCH_PROMISE__;
    return true;
  } catch (error) {
    console.error("🚨 데이터베이스 로드 중 오류 발생:", error);
    alert("데이터베이스를 불러올 수 없습니다. 인터넷 연결을 확인하세요.");
    return false;
  }
}

const decomposeChosung = (str) => {
  const map = { ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ", ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ", ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ", ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ", ㅄ: "ㅂㅅ" };
  return str.split("").map((c) => map[c] || c).join("");
};

const CHOSUNG_RANGES = {
  ㄱ: "[가-깋]", ㄲ: "[까-낗]", ㄴ: "[나-닣]", ㄷ: "[다-딯]", ㄸ: "[따-띻]", ㄹ: "[라-맇]", ㅁ: "[마-밓]", ㅂ: "[바-빟]", ㅃ: "[빠-삫]", ㅅ: "[사-싷]", ㅆ: "[싸-앃]", ㅇ: "[아-잏]", ㅈ: "[자-짛]", ㅉ: "[짜-찧]", ㅊ: "[차-칳]", ㅋ: "[카-킿]", ㅌ: "[타-탛]", ㅍ: "[파-핗]", ㅎ: "[하-힣]",
};

const getHybridRegex = (keyword, forHighlight = false) => {
  let pattern = "";
  for (let i = 0; i < keyword.length; i++) {
    const char = keyword[i];
    if (CHOSUNG_RANGES[char]) pattern += CHOSUNG_RANGES[char];
    else pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (forHighlight && i < keyword.length - 1) pattern += "\\s*";
  }
  return new RegExp(pattern, forHighlight ? "gi" : "i");
};

const QWERTY_TO_KOR = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ", a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ", z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ", Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};

const convertEngToKorJamo = (str) => {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    result += QWERTY_TO_KOR[char] || char;
  }
  return result;
};

const checkSearchMatch = (itemId, keyword) => {
  if (!keyword || keyword.length > 30) return false;

  let rawKeyword = decomposeChosung(keyword.replace(/\s+/g, ""));
  let cleanKeyword = rawKeyword.toLowerCase();
  let korKeyword = convertEngToKorJamo(rawKeyword).toLowerCase();

  const item = items_db[itemId];
  const itemName = item.name;
  const cleanItemName = itemName.replace(/\s+/g, "").toLowerCase();

  const regexNormal = getHybridRegex(cleanKeyword);
  const regexKor = getHybridRegex(korKeyword);

  if (item.aliases && item.aliases.length > 0) {
    for (const alias of item.aliases) {
      if (regexNormal.test(alias) || regexKor.test(alias)) return true;
    }
  }

  if (regexNormal.test(cleanItemName) || regexKor.test(cleanItemName)) return true;

  const recipe = recipes_db[itemId];
  if (recipe && recipe.materials) {
    for (const mat of recipe.materials) {
      if (checkSearchMatch(mat.id, keyword)) return true;
    }
  }
  return false;
};

const getHighlightedName = (itemId, itemName, keyword) => {
  if (!keyword || keyword.length > 30) return itemName;

  const rawKeyword = decomposeChosung(keyword.replace(/\s+/g, ""));
  const cleanKeyword = rawKeyword.toLowerCase();
  const korKeyword = convertEngToKorJamo(rawKeyword).toLowerCase();
  const item = items_db[itemId];

  const aliasStyle = "bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";
  const partialStyle = "bg-rose-500 text-white dark:bg-rose-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";

  if (item.aliases && item.aliases.length > 0) {
    const regexAliasNormal = getHybridRegex(cleanKeyword, false);
    const regexAliasKor = getHybridRegex(korKeyword, false);
    for (const alias of item.aliases) {
      if (regexAliasNormal.test(alias) || regexAliasKor.test(alias)) {
        return `<span class="${aliasStyle}">${itemName}</span>`;
      }
    }
  }

  const regexHighlightNormal = getHybridRegex(cleanKeyword, true);
  const regexHighlightKor = getHybridRegex(korKeyword, true);

  if (itemName.match(regexHighlightNormal)) {
    return itemName.replace(regexHighlightNormal, (match) => `<span class="${partialStyle}">${match}</span>`);
  } else if (itemName.match(regexHighlightKor)) {
    return itemName.replace(regexHighlightKor, (match) => `<span class="${partialStyle}">${match}</span>`);
  }

  return itemName;
};
