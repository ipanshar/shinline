from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path
from threading import Event
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app import FaceServiceController


class _SlowFaceService:
    init_calls = 0
    rebuild_calls = 0
    start_event = Event()
    release_event = Event()

    def __init__(self, *args, **kwargs) -> None:
        type(self).init_calls += 1
        type(self).start_event.set()
        type(self).release_event.wait(timeout=2)

    def rebuild_index(self) -> None:
        type(self).rebuild_calls += 1


class RebuildQueueTest(unittest.TestCase):
    def setUp(self) -> None:
        _SlowFaceService.init_calls = 0
        _SlowFaceService.rebuild_calls = 0
        _SlowFaceService.start_event = Event()
        _SlowFaceService.release_event = Event()

    def test_rebuild_request_is_queued_while_initial_load_is_running(self) -> None:
        base_dir = Path(__file__).resolve().parents[2] / 'storage' / 'app' / 'private' / 'testing' / 'faceid-controller'
        reference_dir = base_dir / 'references'
        cache_dir = base_dir / 'cache'
        manifest_path = base_dir / 'reference-manifest.json'
        reference_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

        controller = FaceServiceController(
            project_dir=Path(__file__).resolve().parents[1],
            dump_path=Path(__file__).resolve().parents[1] / 'sigur_20260506.sql',
            reference_dir=reference_dir,
            cache_dir=cache_dir,
            reference_manifest_path=manifest_path,
        )

        with mock.patch('backend.app.FaceSearchService', _SlowFaceService):
            controller.ensure_started()
            self.assertTrue(_SlowFaceService.start_event.wait(timeout=1), 'initial load did not start')

            controller.request_rebuild()
            _SlowFaceService.release_event.set()

            deadline = time.time() + 2
            while controller.is_loading() and time.time() < deadline:
                time.sleep(0.01)

        self.assertFalse(controller.is_loading())
        self.assertEqual(_SlowFaceService.init_calls, 1)
        self.assertEqual(_SlowFaceService.rebuild_calls, 1)


if __name__ == '__main__':
    unittest.main()