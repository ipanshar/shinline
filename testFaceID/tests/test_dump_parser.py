from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.dump_parser import parse_sigur_dump

PNG_1X1 = (
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000a49444154789c6360000002000100ffff030000060005"
    "57bfab0000000049454e44ae426082"
)
JPG_MINIMAL = "ffd8ffe000104a46494600010100000100010000ffd9"


class DumpParserTest(unittest.TestCase):
    def test_photo_rows_are_linked_to_personal_and_hires_wins(self) -> None:
        dump_path = self.write_dump(
            f"""
            -- dump personal
            INSERT INTO `personal` (`ID`, `PARENT_ID`, `TYPE`, `EMP_TYPE`, `NAME`) VALUES
              (10, NULL, 'EMP', 'WORKER', 'Alice', 'unused'),
              (11, NULL, 'EMP', 'WORKER', 'Bob', 'unused');
            -- dump photo
            INSERT INTO `photo` (`ID`, `TS`, `PREVIEW_RASTER`, `HIRES_RASTER`, `TVA_DESC`, `TVA_DESCTS`, `TVA_DESCTYPE`, `EXTVER`) VALUES
              (10, 1, _binary 0x{PNG_1X1}, _binary 0x{JPG_MINIMAL}, '', 0, '', 0),
              (11, 1, _binary 0x{PNG_1X1}, _binary '', '', 0, '', 0);
            """
        )

        result = parse_sigur_dump(dump_path)

        self.assertEqual(result.stats["personalParsed"], 2)
        self.assertEqual(result.stats["photoRows"], 2)
        self.assertEqual(result.stats["photoValidImages"], 2)

        first = result.references[0]
        self.assertEqual(first.employee_id, 10)
        self.assertEqual(first.name, "Alice")
        self.assertEqual(first.source, "sigur-photo")
        self.assertEqual(first.extension, ".jpg")
        self.assertEqual(first.image_bytes, bytes.fromhex(JPG_MINIMAL))

        second = result.references[1]
        self.assertEqual(second.employee_id, 11)
        self.assertEqual(second.extension, ".png")
        self.assertEqual(second.image_bytes, bytes.fromhex(PNG_1X1))

    def test_photo_rows_skip_empty_bad_and_unlinked_images(self) -> None:
        dump_path = self.write_dump(
            f"""
            -- dump personal
            INSERT INTO `personal` (`ID`, `PARENT_ID`, `TYPE`, `EMP_TYPE`, `NAME`) VALUES
              (20, NULL, 'EMP', 'WORKER', 'Carol');
            -- dump photo
            INSERT INTO `photo` (`ID`, `TS`, `PREVIEW_RASTER`, `HIRES_RASTER`, `TVA_DESC`, `TVA_DESCTS`, `TVA_DESCTYPE`, `EXTVER`) VALUES
              (20, 1, _binary '', _binary '', '', 0, '', 0),
              (20, 1, _binary 0xdeadbeef, _binary '', '', 0, '', 0),
              (99, 1, _binary 0x{PNG_1X1}, _binary '', '', 0, '', 0);
            """
        )

        result = parse_sigur_dump(dump_path)

        self.assertEqual(result.references, [])
        self.assertEqual(result.stats["photoEmptyImages"], 1)
        self.assertEqual(result.stats["photoInvalidImages"], 1)
        self.assertEqual(result.stats["photoMissingPerson"], 1)

    def test_personalimg_legacy_source_is_preserved(self) -> None:
        dump_path = self.write_dump(
            f"""
            -- dump personalimg
            INSERT INTO `personalimg` (`ID`, `EMP_ID`, `GB_ID`, `ORDER_IDX`, `NAME`, `DATA`) VALUES
              (7, 42, NULL, 1, 'Legacy Person', _binary 0x{PNG_1X1});
            """
        )

        result = parse_sigur_dump(dump_path)

        self.assertEqual(result.stats["personalimgRows"], 1)
        self.assertEqual(result.stats["personalimgValidImages"], 1)
        self.assertEqual(len(result.references), 1)
        self.assertEqual(result.references[0].employee_id, 42)
        self.assertEqual(result.references[0].name, "Legacy Person")
        self.assertEqual(result.references[0].source, "sigur-personalimg")

    def write_dump(self, content: str) -> Path:
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        path = Path(temp_dir.name) / "sigur.sql"
        path.write_text(textwrap.dedent(content).strip(), encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
