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
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTlpXNyQitzPZ7u9THzc8UBlMR1lNEcBzXOkjefIJFUcd52P4HMU3mrlqgMo0xYGeB6iCUu0qQlW1e9/pub?output=csv", // // 🟢 레시피 전용 시트 링크 추가
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

  // 🔴 삭제: 기존 우회 프록시 통신 코드 제거
  // const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
  // const response = await fetch(proxyUrl);

  // 🟢 추가: 다이렉트 통신으로 수정 (로컬 서버 환경 최적화)
  const response = await fetch(url);
  const csvText = await response.text();

  const rows = csvText.split("\n");
  const headers = parseCSVRow(rows[0]);

  rows.slice(1).forEach((row) => {
    if (!row.trim()) return;
    const values = parseCSVRow(row);
    const rowData = {};
    headers.forEach((h, i) => (rowData[h.trim()] = values[i] || ""));

    const id = rowData["ID"]; // 제작 결과물 ID
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

// // 🟢 6. 총 5개의 시트를 Promise.all을 통해 동시 다발적으로 로드합니다.
async function loadDatabaseFromSheet() {
  try {
    const itemPromises = Object.entries(CSV_LINKS)
      .filter(([cat]) => cat !== "recipe")
      .map(([cat, url]) => processItemSheet(url, cat));

    const recipePromise = processRecipeSheet(CSV_LINKS.recipe);

    // 모든 다운로드와 파싱이 완료될 때까지 대기
    await Promise.all([...itemPromises, recipePromise]);

    console.log("✅ 5개 탭 분리 데이터베이스 정규화 로드 완료:", items_db, recipes_db);
    return true;
  } catch (error) {
    console.error("🚨 데이터베이스 로드 중 오류 발생:", error);
    alert("데이터베이스를 불러올 수 없습니다. 인터넷 연결이나 5개의 탭 주소를 확인하세요.");
    return false;
  }
}
