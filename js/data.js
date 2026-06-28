// 🟢 전역 데이터베이스 객체
let items_db = {};
let recipes_db = {};
let monsters_db = {}; // 🟢 몬스터 DB 추가

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
  monster:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRZLxT4a4AaDRlvkIcr9bXQUC-jIuyvsqHDhRO58oFsOpJUaeFpnGJStwAz8PImhgLTajaZAaJjrnig/pub?output=csv",
};

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
const ITEM_SYSTEM_COLS = [
  "ID",
  "이름",
  "아이콘",
  "이미지",
  "분류",
  "설명",
  "세트 효과",
  "세트 아이템",
  "줄임말",
  "창고",
  "사망 시 드롭",
  "교환",
  "삭제",
];

function escapeHTML(str) {
  if (typeof str !== "string") return str;
  return str.replace(
    /[&<>'"]/g,
    (tag) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[tag],
  );
}

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

async function processItemSheet(url, categoryName, targetDB = items_db) {
  if (!url) return;
  try {
    const cacheBustUrl = url + `&t=${new Date().getTime()}`;
    const response = await fetch(cacheBustUrl, { cache: "no-store" });
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

      const tradeInfo = {
        storage: rowData["창고"] || "O",
        drop: rowData["사망 시 드롭"] || "O",
        trade: rowData["교환"] || "O",
        delete: rowData["삭제"] || "O",
      };

      targetDB[id] = {
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
  } catch (e) {}
}

async function processRecipeSheet(url, targetDB = recipes_db) {
  if (!url) return;
  try {
    const cacheBustUrl = url + `&t=${new Date().getTime()}`;
    const response = await fetch(cacheBustUrl, { cache: "no-store" });
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

      targetDB[id] = {
        npc: rowData["NPC"] || "",
        location: rowData["장소"] || "",
        yield: parseInt(rowData["제작수량"]) || 1,
        materials: materialsStr.split(",").map((mat) => {
          const parts = mat.split(":");
          return { id: parts[0].trim(), count: parseInt(parts[1]) || 1 };
        }),
      };
    });
  } catch (e) {}
}

async function processMonsterSheet(url, targetDB = monsters_db) {
  if (!url) return;
  try {
    const cacheBustUrl = url + `&t=${new Date().getTime()}`;
    const response = await fetch(cacheBustUrl, { cache: "no-store" });
    const csvText = await response.text();

    const rows = csvText.split("\n");
    const headers = parseCSVRow(rows[0]);

    // 🟢 forEach에 index 파라미터를 추가하여 구글 시트의 순서를 기록합니다.
    rows.slice(1).forEach((row, index) => {
      if (!row.trim()) return;
      const values = parseCSVRow(row);
      const rowData = {};
      headers.forEach((h, i) => (rowData[h.trim()] = escapeHTML(values[i] || "")));

      const id = rowData["ID"];
      if (!id) return;

      const dropsStr = rowData["드롭아이템"];
      const weaknessStr = rowData["취약속성"];
      const traitsStr = rowData["특성"];
      const locationsStr = rowData["출몰지역"];

      targetDB[id] = {
        id: id,
        sheetIndex: index, // 🟢 시트 상의 정렬 순서를 저장
        name: rowData["이름"] || id,
        level: parseInt(rowData["레벨"]) || 0,
        hp: parseInt(rowData["HP"]) || 0,
        mp: parseInt(rowData["MP"]) || 0,
        ac: parseInt(rowData["AC"]) || 0,
        mr: parseInt(rowData["MR"]) || 0,
        size: rowData["크기"] || "작은", // 🟢 기본값을 "소형"에서 "작은"으로 변경
        weakness: weaknessStr ? weaknessStr.split(",").map((s) => s.trim()) : ["무속성"],
        traits: traitsStr ? traitsStr.split(",").map((s) => s.trim()) : [],
        locations: locationsStr ? locationsStr.split(",").map((s) => s.trim()) : [],
        exp: parseInt(rowData["경험치"]) || 0,
        desc: rowData["설명"] || "",
        image: rowData["이미지"] || "",
        drops: dropsStr ? dropsStr.split(",").map((s) => s.trim()) : [],
        aliases: rowData["줄임말"]
          ? rowData["줄임말"].split(",").map((s) => s.trim().replace(/\s+/g, "").toLowerCase())
          : [],
      };
    });
  } catch (e) {}
}

async function loadDatabaseFromSheet() {
  try {
    const parentWin = window.parent || window;

    if (parentWin.__SHARED_ITEMS_DB__) {
      items_db = parentWin.__SHARED_ITEMS_DB__;
      recipes_db = parentWin.__SHARED_RECIPES_DB__;
      monsters_db = parentWin.__SHARED_MONSTERS_DB__ || {};
      return true;
    }

    const cachedItems = localStorage.getItem("lcraft_cached_items");
    const cachedRecipes = localStorage.getItem("lcraft_cached_recipes");
    const cachedMonsters = localStorage.getItem("lcraft_cached_monsters");
    let hasCache = false;

    if (cachedItems && cachedRecipes) {
      items_db = JSON.parse(cachedItems);
      recipes_db = JSON.parse(cachedRecipes);
      monsters_db = cachedMonsters ? JSON.parse(cachedMonsters) : {};
      hasCache = true;
      parentWin.__SHARED_ITEMS_DB__ = items_db;
      parentWin.__SHARED_RECIPES_DB__ = recipes_db;
      parentWin.__SHARED_MONSTERS_DB__ = monsters_db;
    }

    if (!parentWin.__DB_FETCH_PROMISE__) {
      parentWin.__DB_FETCH_PROMISE__ = (async () => {
        const temp_items = {};
        const temp_recipes = {};
        const temp_monsters = {};

        const itemPromises = Object.entries(CSV_LINKS)
          .filter(([cat]) => cat !== "recipe" && cat !== "monster")
          .map(([cat, url]) => processItemSheet(url, cat, temp_items));

        const recipePromise = processRecipeSheet(CSV_LINKS.recipe, temp_recipes);
        const monsterPromise = processMonsterSheet(CSV_LINKS.monster, temp_monsters);

        await Promise.all([...itemPromises, recipePromise, monsterPromise]);

        const newItemsStr = JSON.stringify(temp_items);
        const newRecipesStr = JSON.stringify(temp_recipes);
        const newMonstersStr = JSON.stringify(temp_monsters);

        if (cachedItems !== newItemsStr || cachedRecipes !== newRecipesStr || cachedMonsters !== newMonstersStr) {
          const changedIds = new Set();

          localStorage.setItem("lcraft_cached_items", newItemsStr);
          localStorage.setItem("lcraft_cached_recipes", newRecipesStr);
          localStorage.setItem("lcraft_cached_monsters", newMonstersStr);

          parentWin.__SHARED_ITEMS_DB__ = temp_items;
          parentWin.__SHARED_RECIPES_DB__ = temp_recipes;
          parentWin.__SHARED_MONSTERS_DB__ = temp_monsters;

          items_db = temp_items;
          recipes_db = temp_recipes;
          monsters_db = temp_monsters;

          parentWin.postMessage({ type: "DATA_BACKGROUND_UPDATED", changedIds: Array.from(changedIds) }, "*");
        }
      })();
    }

    if (!hasCache) {
      await parentWin.__DB_FETCH_PROMISE__;
      items_db = parentWin.__SHARED_ITEMS_DB__;
      recipes_db = parentWin.__SHARED_RECIPES_DB__;
      monsters_db = parentWin.__SHARED_MONSTERS_DB__ || {};
    }

    return true;
  } catch (error) {
    console.error("🚨 데이터베이스 로드 중 오류 발생:", error);
    return false;
  }
}

// 자음/모음 분리 및 검색 로직 (이전과 동일)
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

const checkSearchMatch = (itemId, keyword, isMonster = false) => {
  if (!keyword || keyword.length > 30) return false;

  let rawKeyword = decomposeChosung(keyword.replace(/\s+/g, ""));
  let cleanKeyword = rawKeyword.toLowerCase();
  let korKeyword = convertEngToKorJamo(rawKeyword).toLowerCase();

  const regexNormal = getHybridRegex(cleanKeyword);
  const regexKor = getHybridRegex(korKeyword);

  if (isMonster) {
    const mob = monsters_db[itemId];
    if (!mob) return false;
    const cleanName = mob.name.replace(/\s+/g, "").toLowerCase();

    if (mob.aliases && mob.aliases.length > 0) {
      for (const alias of mob.aliases) {
        if (regexNormal.test(alias) || regexKor.test(alias)) return true;
      }
    }
    if (regexNormal.test(cleanName) || regexKor.test(cleanName)) return true;

    // 드롭 아이템으로 몬스터 검색 허용
    if (mob.drops && mob.drops.length > 0) {
      for (const drop of mob.drops) {
        const cleanDrop = drop.replace(/\s+/g, "").toLowerCase();
        if (regexNormal.test(cleanDrop) || regexKor.test(cleanDrop)) return true;
      }
    }
    return false;
  }

  // 기존 아이템 검색 로직
  const item = items_db[itemId];
  if (!item) return false;
  const cleanItemName = item.name.replace(/\s+/g, "").toLowerCase();

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

const getHighlightedName = (itemId, itemName, keyword, isMonster = false) => {
  if (!keyword || keyword.length > 30) return itemName;

  const rawKeyword = decomposeChosung(keyword.replace(/\s+/g, ""));
  const cleanKeyword = rawKeyword.toLowerCase();
  const korKeyword = convertEngToKorJamo(rawKeyword).toLowerCase();

  const targetObj = isMonster ? monsters_db[itemId] : items_db[itemId];
  if (!targetObj) return itemName;

  const aliasStyle =
    "bg-indigo-500 text-white dark:bg-indigo-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";
  const partialStyle =
    "bg-rose-500 text-white dark:bg-rose-500 dark:text-white px-1 py-0.5 rounded shadow-sm font-black";

  if (targetObj.aliases && targetObj.aliases.length > 0) {
    const regexAliasNormal = getHybridRegex(cleanKeyword, false);
    const regexAliasKor = getHybridRegex(korKeyword, false);
    for (const alias of targetObj.aliases) {
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
