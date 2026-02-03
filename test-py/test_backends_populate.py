import pathlib

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.populate import populateBackend
from fontra.core.classes import unstructure

expectedFontData = {
    "sources": {
        "c793bc16": {
            "name": "Regular",
            "lineMetricsHorizontalLayout": {
                "ascender": {"value": 750, "zone": 16},
                "descender": {"value": -250, "zone": -16},
                "xHeight": {"value": 500, "zone": 16},
                "capHeight": {"value": 750, "zone": 16},
                "baseline": {"value": 0, "zone": -16},
            },
        }
    },
    "customData": {
        "fontra.projectGlyphSets": [
            {
                "commentChars": "#",
                "dataFormat": "glyph-names",
                "name": "GF Latin Kernel",
                "url": "https://cdn.jsdelivr.net/gh/googlefonts/glyphsets/"
                + "data/results/txt/nice-names/GF_Latin_Kernel.txt",
            }
        ]
    },
}


async def test_populate(tmpdir):
    tmpdir = pathlib.Path(tmpdir)

    backendPath = tmpdir / "test.fontra"

    backend = newFileSystemBackend(backendPath)

    await populateBackend(backend)

    await backend.aclose()

    reopenedBackend = getFileSystemBackend(backendPath)
    fontData = unstructure(reopenedBackend.fontData)

    assert len(fontData["sources"]) == 1

    [expectedKey] = expectedFontData["sources"].keys()
    [sourceKey] = fontData["sources"].keys()

    fontData["sources"][expectedKey] = fontData["sources"][sourceKey]
    del fontData["sources"][sourceKey]

    assert expectedFontData == fontData
