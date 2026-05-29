from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.face_service import FaceSearchService


class IncrementalRebuildCacheTest(unittest.TestCase):
    def test_rebuild_reuses_cached_embedding_for_unchanged_reference(self) -> None:
        base_dir = Path(__file__).resolve().parents[2] / 'storage' / 'app' / 'private' / 'testing' / 'faceid-incremental-cache'
        reference_dir = base_dir / 'references'
        cache_dir = base_dir / 'cache'
        reference_dir.mkdir(parents=True, exist_ok=True)
        cache_dir.mkdir(parents=True, exist_ok=True)

        cached_reference = {
            'image_id': 10,
            'employee_id': 100,
            'name': 'Cached Person',
            'image_path': reference_dir.joinpath('cached.jpg'),
            'source': 'temporary_pass',
            'profile': {'groupKey': 'temporary_contractor:cached'},
            'image_hash': 'hash-cached',
            'reference_url': '/reference-images/temporary/cached.jpg',
        }
        fresh_reference = {
            'image_id': 11,
            'employee_id': 101,
            'name': 'Fresh Person',
            'image_path': reference_dir.joinpath('fresh.jpg'),
            'source': 'temporary_pass',
            'profile': {'groupKey': 'temporary_contractor:fresh'},
            'image_hash': 'hash-fresh',
            'reference_url': '/reference-images/temporary/fresh.jpg',
        }

        cache_file = cache_dir / 'reference_vectors.json'
        cache_file.write_text(
            json.dumps(
                {
                    'cache_signature': {'schemaVersion': 6},
                    'reference_source_count': 1,
                    'dump_stats': {},
                    'entries': [
                        {
                            'image_id': cached_reference['image_id'],
                            'employee_id': cached_reference['employee_id'],
                            'name': cached_reference['name'],
                            'image_path': cached_reference['image_path'].as_posix(),
                            'embedding': [0.25, 0.75],
                            'source': cached_reference['source'],
                            'profile': cached_reference['profile'],
                            'image_hash': cached_reference['image_hash'],
                            'reference_url': cached_reference['reference_url'],
                        }
                    ],
                    'skipped': [],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding='utf-8',
        )

        service = object.__new__(FaceSearchService)
        service.project_dir = Path(__file__).resolve().parents[1]
        service.dump_path = service.project_dir / 'sigur_20260506.sql'
        service.backend_dir = service.project_dir / 'backend'
        service.cache_dir = cache_dir
        service.models_dir = service.backend_dir / 'models'
        service.reference_dir = reference_dir
        service.reference_manifest_path = base_dir / 'reference-manifest.json'
        service.cache_file = cache_file
        service.custom_profiles_path = base_dir / 'custom_profiles.json'
        service.reference_faces = []
        service.embedding_matrix = np.empty((0, 0), dtype=np.float32)
        service.skipped_references = []
        service.pre_index_skipped_references = []
        service.dump_stats = {}
        service.reference_source_count = 0

        def extract_reference_images() -> list[dict[str, object]]:
            service.pre_index_skipped_references = []
            service.reference_source_count = 2
            return [cached_reference, fresh_reference]

        service.extract_reference_images = extract_reference_images
        service.load_image = mock.Mock(return_value=np.ones((4, 4, 3), dtype=np.uint8))
        service.extract_embedding = mock.Mock(return_value=np.array([0.5, 0.5], dtype=np.float32))

        FaceSearchService.rebuild_index(service)

        service.extract_embedding.assert_called_once()
        self.assertEqual(2, len(service.reference_faces))
        self.assertTrue(np.allclose(service.reference_faces[0].embedding, np.array([0.25, 0.75], dtype=np.float32)))
        self.assertTrue(np.allclose(service.reference_faces[1].embedding, np.array([0.5, 0.5], dtype=np.float32)))


if __name__ == '__main__':
    unittest.main()