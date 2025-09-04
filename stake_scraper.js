// stake_scraper.js
// Puppeteer script to read Provably Fair values from Stake,
// save them into seeds.json, and compute HMAC + multiplier.
//
// Usage: node stake_scraper.js

import puppeteer from "puppeteer";
import fs from "fs";
import crypto from "crypto";

// === دوال مساعدة للتحقق ===
function hmacSha256Hex(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest("hex");
}

function hex4BytesToUint32(hex4) {
  return parseInt(hex4, 16) >>> 0;
}

function uint32ToFloat(u32) {
  return u32 / 4294967296; // 2^32
}

function floatToMultiplier(randomFloat, opts = {}) {
  const precision = opts.precision || 2;
  let rtp = typeof opts.rtp === "number" ? opts.rtp : 0.99; // افتراضي 99% RTP
  if (randomFloat <= 0) randomFloat = Number.MIN_VALUE;
  let raw = rtp / randomFloat;
  if (!Number.isFinite(raw)) raw = Number.MAX_SAFE_INTEGER;
  const mult = Math.max(1, raw);
  const factor = Math.pow(10, precision);
  return Math.floor(mult * factor) / factor;
}

// === الدالة الرئيسية ===
async function scrapeStakeSeeds() {
  const browser = await puppeteer.launch({
    headless: false, // افتح المتصفح عشان تسجّل دخول يدوي
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.goto("https://stake.com/provably-fair", {
    waitUntil: "networkidle2",
  });

  console.log("➡️ سجّل دخولك في Stake، وانتظر لحظة...");

  await page.waitForSelector("input[value]", { timeout: 0 });

  // جلب القيم من الصفحة
  const seeds = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input[value]"));
    let result = {};
    inputs.forEach((input) => {
      const label = input.closest("div")?.querySelector("label")?.innerText;
      if (label && input.value) {
        result[label.trim()] = input.value.trim();
      }
    });
    return result;
  });

  console.log("✅ القيم المستخرجة:");
  console.log(seeds);

  // حفظ القيم في seeds.json
  fs.writeFileSync("seeds.json", JSON.stringify(seeds, null, 2));
  console.log("💾 تم حفظ القيم في seeds.json");

  // === حساب HMAC + multiplier ===
  const serverSeed = seeds["Server seed (revealed)"] || seeds["Server seed"];
  const clientSeed = seeds["Client seed"];
  const nonce = seeds["Nonce"] || "0";

  if (serverSeed && clientSeed) {
    const msg = `${clientSeed}:${nonce}`;
    const hash = hmacSha256Hex(serverSeed, msg);
    const first8 = hash.slice(0, 8);
    const u32 = hex4BytesToUint32(first8);
    const float = uint32ToFloat(u32);
    const multiplier = floatToMultiplier(float, { rtp: 0.99, precision: 2 });

    console.log("🔎 تحقق من الجولة:");
    console.log("HMAC       :", hash);
    console.log("Uint32     :", u32);
    console.log("Float      :", float);
    console.log("Multiplier :", multiplier);
  } else {
    console.log("⚠️ لم يتم العثور على Server Seed / Client Seed صالح.");
  }

  // يمكنك ترك المتصفح مفتوح أو إغلاقه
  // await browser.close();
}

scrapeStakeSeeds();
