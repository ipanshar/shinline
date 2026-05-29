from __future__ import annotations

import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.face_service import FaceSearchService


class _DetectorWithFirstFailure:
    def __init__(self) -> None:
        self.calls = 0

    def setInputSize(self, size: tuple[int, int]) -> None:
        self.last_input_size = size

    def detect(self, image: np.ndarray) -> tuple[None, np.ndarray | None]:
        self.calls += 1
        if self.calls == 1:
            raise cv2.error("synthetic detector failure")

        return None, np.array([[0, 0, 4, 4]], dtype=np.float32)


class _DetectorAlwaysFailing:
    def setInputSize(self, size: tuple[int, int]) -> None:
        self.last_input_size = size

    def detect(self, image: np.ndarray) -> tuple[None, np.ndarray | None]:
        raise cv2.error("synthetic detector failure")


class _RecognizerStub:
    def alignCrop(self, image: np.ndarray, face: np.ndarray) -> np.ndarray:
        return image

    def feature(self, aligned: np.ndarray) -> np.ndarray:
        return np.array([[3.0, 4.0]], dtype=np.float32)


class FaceServiceErrorHandlingTest(unittest.TestCase):
    def build_service(self, detector: object) -> FaceSearchService:
        service = FaceSearchService.__new__(FaceSearchService)
        service.detector = detector
        service.recognizer = _RecognizerStub()
        return service

    def test_extract_embedding_recovers_after_opencv_error_on_first_candidate(self) -> None:
        service = self.build_service(_DetectorWithFirstFailure())
        image = np.zeros((16, 16, 3), dtype=np.uint8)
        candidate_a = np.zeros((12, 12, 3), dtype=np.uint8)
        candidate_b = np.zeros((18, 18, 3), dtype=np.uint8)
        service.iter_detection_candidates = lambda value: [candidate_a, candidate_b]

        embedding = FaceSearchService.extract_embedding(service, image)

        self.assertIsNotNone(embedding)
        assert embedding is not None
        self.assertTrue(np.allclose(embedding, np.array([0.6, 0.8], dtype=np.float32)))

    def test_extract_embedding_converts_terminal_opencv_error_to_value_error(self) -> None:
        service = self.build_service(_DetectorAlwaysFailing())
        image = np.zeros((16, 16, 3), dtype=np.uint8)
        service.iter_detection_candidates = lambda value: [image]

        with self.assertRaisesRegex(ValueError, "Face detection failed while processing the image"):
            FaceSearchService.extract_embedding(service, image)


if __name__ == "__main__":
    unittest.main()