// TTF から必要な文字だけを three.js の typeface.json 形式に変換するスクリプト。
// usage: node scripts/generateCharFont.mjs /path/to/font.ttf
// 出力: public/fonts/toy_chars.typeface.json
import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const CHARS = "Nautsホバー大喜利";
const OUT = new URL("../public/fonts/toy_chars.typeface.json", import.meta.url);

const ttfPath = process.argv[2];
if (!ttfPath) {
	console.error("usage: node scripts/generateCharFont.mjs <font.ttf>");
	process.exit(1);
}

const font = opentype.parse(readFileSync(ttfPath).buffer);
// facetype.js と同じスケーリング (resolution=1000 前提)
const scale = (1000 * 100) / ((font.unitsPerEm || 2048) * 72);
const r = (v) => Math.round(v * scale);

const glyphs = {};
for (const ch of CHARS) {
	const glyph = font.charToGlyph(ch);
	if (!glyph || glyph.index === 0) {
		console.error(`glyph not found: ${ch}`);
		process.exit(1);
	}
	const tokens = [];
	// glyph.path はフォントユニット座標 (y-up) — typeface 形式と同じ向き
	for (const cmd of glyph.path.commands) {
		if (cmd.type === "M") tokens.push("m", r(cmd.x), r(cmd.y));
		else if (cmd.type === "L") tokens.push("l", r(cmd.x), r(cmd.y));
		else if (cmd.type === "Q")
			tokens.push("q", r(cmd.x), r(cmd.y), r(cmd.x1), r(cmd.y1));
		else if (cmd.type === "C")
			tokens.push(
				"b",
				r(cmd.x),
				r(cmd.y),
				r(cmd.x1),
				r(cmd.y1),
				r(cmd.x2),
				r(cmd.y2),
			);
		// Z は typeface 形式では省略 (次の m で暗黙的に閉じる)
	}
	glyphs[ch] = { ha: r(glyph.advanceWidth), o: tokens.join(" ") };
}

const data = {
	glyphs,
	familyName: font.names.fontFamily?.en ?? "subset",
	ascender: r(font.ascender),
	descender: r(font.descender),
	underlinePosition: -100,
	underlineThickness: 50,
	boundingBox: {
		xMin: r(font.tables.head.xMin),
		xMax: r(font.tables.head.xMax),
		yMin: r(font.tables.head.yMin),
		yMax: r(font.tables.head.yMax),
	},
	resolution: 1000,
	original_font_information: {},
};

writeFileSync(OUT, JSON.stringify(data));
console.log(`wrote ${OUT.pathname} (${CHARS.length} glyphs)`);
