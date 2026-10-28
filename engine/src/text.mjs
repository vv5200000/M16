// 文本归一化：NFKC（全半角）→ 繁简小表 → 去标点/符号/emoji/空白 → 小写。
// 纯函数，无 I/O、无随机、无时间依赖。

const TRAD_TO_SIMP = {
  賬: '账', 帳: '账', 規: '规', 槍: '枪', 劃: '划', 線: '线', 鎖: '锁',
  鑰: '钥', 屍: '尸', 凍: '冻', 證: '证', 據: '据', 沒: '没', 開: '开',
  過: '过', 說: '说', 誰: '谁', 麼: '么', 樣: '样', 張: '张', 東: '东',
  車: '车', 錢: '钱', 關: '关', 係: '系', 錯: '错', 覺: '觉', 記: '记',
  憶: '忆', 遺: '遗', 樹: '树', 葉: '叶', 門: '门', 問: '问', 題: '题',
  裡: '里', 邊: '边', 還: '还', 這: '这', 個: '个', 時: '时', 間: '间',
  條: '条', 燈: '灯', 莊: '庄', 獵: '猎', 鐘: '钟', 錶: '表', 帶: '带',
  錄: '录', 聲: '声', 響: '响', 頭: '头', 腳: '脚', 體: '体', 會: '会',
  護: '护', 著: '着', 選: '选', 擇: '择', 裡: '里', 麼: '么', 幾: '几',
};

const KEEP = /[\p{L}\p{N}]/u;

/** 归一化任意输入为可匹配文本。 */
export function normalize(input) {
  if (input === null || input === undefined) return '';
  const source = String(input).normalize('NFKC');
  let out = '';
  for (const ch of source) {
    const mapped = TRAD_TO_SIMP[ch] ?? ch;
    for (const c of mapped) {
      if (KEEP.test(c)) out += c.toLowerCase();
    }
  }
  return out;
}

/** 按码点切分，避免 emoji / 代理对截断。 */
export function chars(text) {
  return Array.from(String(text));
}

/** 3-gram 集合（码点口径）。 */
export function trigrams(text) {
  const list = chars(text);
  const set = new Set();
  for (let i = 0; i + 3 <= list.length; i += 1) {
    set.add(list[i] + list[i + 1] + list[i + 2]);
  }
  return set;
}

/** |a ∩ b| / |a|；a 为空时返回 0。 */
export function overlapRatio(a, b) {
  if (a.size === 0) return 0;
  let hit = 0;
  for (const gram of a) if (b.has(gram)) hit += 1;
  return hit / a.size;
}

/** 码点截断。 */
export function truncateChars(text, max) {
  const list = chars(text);
  if (list.length <= max) return { value: text, truncated: false };
  return { value: list.slice(0, max).join(''), truncated: true };
}

/** 稳定字符串哈希（FNV-1a 32bit），用于把 seed 变成整数。 */
export function hashSeed(seed) {
  const text = String(seed ?? '0');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 确定性伪随机（仅用于呈现顺序，不作为人格信号）。 */
export function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
