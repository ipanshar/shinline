from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class RuntimePathsTest(unittest.TestCase):
    def test_default_runtime_paths_point_to_shared_storage(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]

        with mock.patch.dict(
            os.environ,
            {
                "FACEID_REFERENCE_DIR": "",
                "FACEID_REFERENCE_MANIFEST_PATH": "",
            },
            clear=False,
        ):
            sys.modules.pop("backend.app", None)
            backend_app = importlib.import_module("backend.app")

        self.assertEqual(
            backend_app.REFERENCE_DIR,
            (repo_root / "storage/app/private/faceid/references").resolve(),
        )
        self.assertEqual(
            backend_app.REFERENCE_MANIFEST_PATH,
            (repo_root / "storage/app/private/faceid/reference-manifest.json").resolve(),
        )


if __name__ == "__main__":
    unittest.main()