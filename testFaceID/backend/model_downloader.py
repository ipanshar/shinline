from __future__ import annotations

from pathlib import Path

import requests

MODEL_URLS = {
    "face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def ensure_models(models_dir: Path) -> dict[str, Path]:
    models_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    for filename, url in MODEL_URLS.items():
        target = models_dir / filename
        if not target.exists():
            download_file(url, target)
        paths[filename] = target

    return paths


def download_file(url: str, target: Path) -> None:
    with requests.get(url, timeout=60, stream=True) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
