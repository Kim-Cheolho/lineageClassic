// // 🟢 전역 데이터베이스 객체
let items_db = {};
let recipes_db = {};

// // 🟢 1. 구글 시트에서 5개의 탭(무기, 방어구, 장신구, 재료, 레시피)별로 발급받은 CSV 링크를 각각 넣어주세요.
const CSV_LINKS = {
  weapon:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWs-z11xovyh5nZXXYjI-bsbl2PosmBM3SQPQrQDZefquGCW8hF_UAraVl6arynMAAd9npzE1Zk5v4/pub?output=csv",
  armor:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTD1PGa-37lEOkLalru3wz74OFXtYb1OGrN2cXVbN0ARU4jJXoYKLVG-TXX7sr_2uYShyHKLnn-zXl5/pub?output=csv",
  accessory:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTPQ2pDBMWZxedMQzI6zCztAPg7A0BiThJsLnT3KpBMILzWAglSxjFcjaj6_msNiurJUvUYbqCeOIAy/pub?output=csv",
  material:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQG1PEgePbi1Lz8J5dH8uGhj2bOI6Ty7fZiT2t0Gs6QhttJy8PGCm7CtqeH5o4ZF59EhMwBhJoL5VZX/pub?output=csv",
  recipe:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTlpXNyQitzPZ7u9THzc8UBlMR1lNEcBzXOkjefIJFUcd52P4HMU3mrlqgMo0xYGeB6iCUu0qQlW1e9/pub?output=csv",
};

// // 🟢 2. 화면에 출력될 스탯의 '표준 순서'를 지정합니다.
const STAT_ORDER = [
  "종류",
  "공격력(작은/큰)",
  "방어력",
  "한손/양손",
  "클래스",
  "무게",
  "재질",
  "인챈트",
  "레벨 제한",
  "손상 여부",
];

// // 🟢 3. 아이템 탭에서 스탯으로 취급하지 않을 고정 시스템 컬럼들
const ITEM_SYSTEM_COLS = ["ID", "이름", "아이콘", "이미지", "분류", "설명", "세트 효과", "세트 아이템", "줄임말"];

function parseCSVRow(str) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((s) => s.replace(/(^"|"$)/g, ""));
}

async function processItemSheet(url, categoryName) {
  if (!url || url.includes("CSV_링크를_넣어주세요")) return;
  const response = await fetch(url);
  const csvText = await response.text();

  const rows = csvText.split("\n");
  const headers = parseCSVRow(rows[0]);

  rows.slice(1).forEach((row) => {
    if (!row.trim()) return;
    const values = parseCSVRow(row);
    const rowData = {};
    headers.forEach((h, i) => (rowData[h.trim()] = values[i] || ""));

    const id = rowData["ID"];
    if (!id) return;

    let stats = [];
    headers.forEach((h) => {
      const key = h.trim();
      let val = rowData[key];

      if (key === "클래스" && val === "") {
        if (categoryName === "weapon" || categoryName === "armor" || categoryName === "accessory") {
          val = "전체";
        }
      }

      if (!ITEM_SYSTEM_COLS.includes(key) && val !== "") {
        if (key === "옵션") {
          const mergedOptions = val
            .split(",")
            .map((opt) => opt.trim())
            .join("<br>");
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
    };
  });
}

async function processRecipeSheet(url) {
  if (!url || url.includes("CSV_링크를_넣어주세요")) return;

  const response = await fetch(url);
  const csvText = await response.text();

  const rows = csvText.split("\n");
  const headers = parseCSVRow(rows[0]);

  rows.slice(1).forEach((row) => {
    if (!row.trim()) return;
    const values = parseCSVRow(row);
    const rowData = {};
    headers.forEach((h, i) => (rowData[h.trim()] = values[i] || ""));

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

async function loadDatabaseFromSheet() {
  try {
    const itemPromises = Object.entries(CSV_LINKS)
      .filter(([cat]) => cat !== "recipe")
      .map(([cat, url]) => processItemSheet(url, cat));

    const recipePromise = processRecipeSheet(CSV_LINKS.recipe);

    await Promise.all([...itemPromises, recipePromise]);

    console.log("✅ 5개 탭 분리 데이터베이스 정규화 로드 완료:", items_db, recipes_db);
    return true;
  } catch (error) {
    console.error("🚨 데이터베이스 로드 중 오류 발생:", error);
    alert("데이터베이스를 불러올 수 없습니다. 인터넷 연결이나 5개의 탭 주소를 확인하세요.");
    return false;
  }
}

// ============================================================================
// 🟢 [AI 컨텍스트 및 지시문]
// 아래는 '초성 검색', '영타->한글 오타 교정', '겹자음 분해', '줄임말(별칭) 매칭'을
// 모두 지원하는 하이엔드 공용 검색 및 UI 강조 엔진입니다.
//
// [!] 향후 새로운 HTML(예: 아이템 정보 페이지)을 작성할 때, 검색이나 필터링이 필요하다면
// 반드시 아래의 `checkSearchMatch`와 `getHighlightedName` 함수를 재사용하여 아키텍처를 구성하세요.
// ============================================================================

// 🟢 겹자음 분해 매핑
const decomposeChosung = (str) => {
  const map = {
    ㄳ: "ㄱㅅ",
    ㄵ: "ㄴㅈ",
    ㄶ: "ㄴㅎ",
    ㄺ: "ㄹㄱ",
    ㄻ: "ㄹㅁ",
    ㄼ: "ㄹㅂ",
    ㄽ: "ㄹㅅ",
    ㄾ: "ㄹㅌ",
    ㄿ: "ㄹㅍ",
    ㅀ: "ㄹㅎ",
    ㅄ: "ㅂㅅ",
  };
  return str
    .split("")
    .map((c) => map[c] || c)
    .join("");
};

// 🟢 초성 유니코드 범위
const CHOSUNG_RANGES = {
  ㄱ: "[가-깋]",
  ㄲ: "[까-낗]",
  ㄴ: "[나-닣]",
  ㄷ: "[다-딯]",
  ㄸ: "[따-띻]",
  ㄹ: "[라-맇]",
  ㅁ: "[마-밓]",
  ㅂ: "[바-빟]",
  ㅃ: "[빠-삫]",
  ㅅ: "[사-싷]",
  ㅆ: "[싸-앃]",
  ㅇ: "[아-잏]",
  ㅈ: "[자-짛]",
  ㅉ: "[짜-찧]",
  ㅊ: "[차-칳]",
  ㅋ: "[카-킿]",
  ㅌ: "[타-탛]",
  ㅍ: "[파-핗]",
  ㅎ: "[하-힣]",
};

// 🟢 혼합 검색용 정규식 생성기 (강조 처리용 띄어쓰기 무시 기능 포함)
const getHybridRegex = (keyword, forHighlight = false) => {
  let pattern = "";
  for (let i = 0; i < keyword.length; i++) {
    const char = keyword[i];
    if (CHOSUNG_RANGES[char]) {
      pattern += CHOSUNG_RANGES[char];
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    if (forHighlight && i < keyword.length - 1) {
      pattern += "\\s*";
    }
  }
  return new RegExp(pattern, forHighlight ? "gi" : "i");
};

// 🟢 QWERTY 영타 -> 한글 자모 변환
const QWERTY_TO_KOR = {
  q: "ㅂ",
  w: "ㅈ",
  e: "ㄷ",
  r: "ㄱ",
  t: "ㅅ",
  y: "ㅛ",
  u: "ㅕ",
  i: "ㅑ",
  o: "ㅐ",
  p: "ㅔ",
  a: "ㅁ",
  s: "ㄴ",
  d: "ㅇ",
  f: "ㄹ",
  g: "ㅎ",
  h: "ㅗ",
  j: "ㅓ",
  k: "ㅏ",
  l: "ㅣ",
  z: "ㅋ",
  x: "ㅌ",
  c: "ㅊ",
  v: "ㅍ",
  b: "ㅠ",
  n: "ㅜ",
  m: "ㅡ",
  Q: "ㅃ",
  W: "ㅉ",
  E: "ㄸ",
  R: "ㄲ",
  T: "ㅆ",
  O: "ㅒ",
  P: "ㅖ",
};

const convertEngToKorJamo = (str) => {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    result += QWERTY_TO_KOR[char] || char;
  }
  return result;
};

// 🟢 [핵심] 공용 검색 매칭 엔진
const checkSearchMatch = (itemId, keyword) => {
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

// 🟢 [핵심] 공용 텍스트 강조 렌더링 함수
const getHighlightedName = (itemId, itemName, keyword) => {
  if (!keyword) return itemName;

  const rawKeyword = decomposeChosung(keyword.replace(/\s+/g, ""));
  const cleanKeyword = rawKeyword.toLowerCase();
  const korKeyword = convertEngToKorJamo(rawKeyword).toLowerCase();
  const item = items_db[itemId];

  const aliasStyle =
    "bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";
  const partialStyle =
    "bg-rose-500 text-white dark:bg-rose-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";

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
