import { expect } from "chai";

import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { getShaper } from "@fontra/core/shaper.js";

describe("shaper tests", () => {
  const testFontPath = join(
    dirname(__dirname),
    "..",
    "..",
    "test-py",
    "data",
    "mutatorsans",
    "MutatorSans.ttf"
  );

  const expectedGlyphs = [
    { g: 24, cl: 0, ax: 400, ay: 0, dx: 0, dy: 0, flags: 0, gn: "V" },
    { g: 1, cl: 1, ax: 396, ay: 0, dx: 0, dy: 0, flags: 0, gn: "A" },
    { g: 4, cl: 2, ax: 443, ay: 0, dx: 0, dy: 0, flags: 0, gn: "B" },
    { g: 5, cl: 3, ax: 499, ay: 0, dx: 0, dy: 0, flags: 0, gn: "C" },
    {
      g: 3,
      cl: 4,
      ax: 396,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "Adieresis",
    },
    {
      g: 29,
      cl: 5,
      ax: 398,
      ay: 0,
      dx: 0,
      dy: 0,
      flags: 0,
      gn: "S.closed",
    },
  ];

  it("test shape", async () => {
    const fontData = new Uint8Array(fs.readFileSync(testFontPath));
    const f = await getShaper(fontData);
    const glyphs = f.shape("VABCÄS", { wght: 0, wdth: 0 }, "-kern");
    expect(glyphs).to.deep.equal(expectedGlyphs);
  });
});
