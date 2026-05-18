from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


IMAGE_EXTENSIONS: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
    (b"BM", ".bmp"),
)

HEX_RE = re.compile(r"^[0-9A-Fa-f]+$")


@dataclass(slots=True)
class DumpPerson:
    id: int
    name: str
    type: str = ""
    employee_type: str = ""
    iin: str = ""
    pos: str = ""
    status: str = ""

    @property
    def identity_key(self) -> str:
        return build_person_identity_key(self.iin, self.name)


@dataclass(slots=True)
class DumpReferenceImage:
    image_id: int
    employee_id: int
    name: str
    image_bytes: bytes
    extension: str
    source: str
    profile: dict[str, str]


@dataclass(slots=True)
class DumpParseResult:
    references: list[DumpReferenceImage] = field(default_factory=list)
    people: dict[int, DumpPerson] = field(default_factory=dict)
    stats: dict[str, Any] = field(default_factory=dict)


def parse_sigur_dump(dump_path: Path) -> DumpParseResult:
    people: dict[int, DumpPerson] = {}
    references: list[DumpReferenceImage] = []
    stats: dict[str, Any] = {
        "personalRows": 0,
        "personalParsed": 0,
        "personalAvailable": 0,
        "personalNotAvailable": 0,
        "personalimgRows": 0,
        "personalimgValidImages": 0,
        "personalimgInvalidImages": 0,
        "personalimgInactivePerson": 0,
        "personalimgMissingPerson": 0,
        "photoRows": 0,
        "photoRowsWithBinary": 0,
        "photoValidImages": 0,
        "photoEmptyImages": 0,
        "photoInvalidImages": 0,
        "photoMissingPerson": 0,
        "photoInactivePerson": 0,
        "referencesUniquePeople": 0,
        "referencesDuplicateHashes": 0,
    }

    active_table: str | None = None

    with dump_path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue

            if line.startswith("-- "):
                active_table = None
                continue

            if line.startswith("INSERT INTO `personal` "):
                active_table = "personal"
                continue

            if line.startswith("INSERT INTO `personalimg` "):
                active_table = "personalimg"
                continue

            if line.startswith("INSERT INTO `photo` "):
                active_table = "photo"
                continue

            if line.startswith("/*!40000 ALTER TABLE `"):
                active_table = None
                continue

            if not line.startswith("("):
                continue

            if active_table == "personal":
                parse_person_row(line, people, stats)
            elif active_table == "personalimg":
                parse_personalimg_row(line, people, references, stats)
            elif active_table == "photo":
                parse_photo_row(line, people, references, stats)

    references = deduplicate_references(references, stats)
    stats["referenceImagesFromDump"] = len(references)
    stats["referencesUniquePeople"] = len(
        {reference.profile.get("groupKey", str(reference.employee_id)) for reference in references}
    )
    return DumpParseResult(references=references, people=people, stats=stats)


def parse_person_row(line: str, people: dict[int, DumpPerson], stats: dict[str, Any]) -> None:
    stats["personalRows"] += 1
    fields = parse_tuple_fields(line, 9)
    if len(fields) < 9:
        return

    try:
        person_id = int(fields[0])
    except ValueError:
        return

    status = str(fields[8]).upper()

    people[person_id] = DumpPerson(
        id=person_id,
        type=str(fields[2]),
        employee_type=str(fields[3]),
        name=str(fields[4]) or f"ID {person_id}",
        iin=clean_profile_value(str(fields[5])),
        pos=clean_profile_value(str(fields[6])),
        status=status,
    )
    stats["personalParsed"] += 1
    if status == "AVAILABLE":
        stats["personalAvailable"] += 1
    else:
        stats["personalNotAvailable"] += 1


def parse_personalimg_row(
    line: str,
    people: dict[int, DumpPerson],
    references: list[DumpReferenceImage],
    stats: dict[str, Any],
) -> None:
    stats["personalimgRows"] += 1
    fields = parse_tuple_fields(line, 6)
    if len(fields) < 6:
        stats["personalimgInvalidImages"] += 1
        return

    image_bytes = decode_binary_field(fields[5])
    extension = detect_image_extension(image_bytes)
    if extension is None:
        stats["personalimgInvalidImages"] += 1
        return

    image_id = int(fields[0])
    employee_id = int(fields[1])
    person = people.get(employee_id)
    if person is None:
        stats["personalimgMissingPerson"] += 1
        return

    if person.status != "AVAILABLE":
        stats["personalimgInactivePerson"] += 1
        return

    stats["personalimgValidImages"] += 1
    references.append(
        DumpReferenceImage(
            image_id=image_id,
            employee_id=employee_id,
            name=person.name,
            image_bytes=image_bytes,
            extension=extension,
            source="sigur-personalimg",
            profile={
                "sourceLabel": "Sigur personalimg",
                "role": person.pos or "Сотрудник из personalimg",
                "department": "Импорт из SQL",
                "iin": person.iin,
                "status": person.status,
                "groupKey": person.identity_key,
            },
        )
    )


def parse_photo_row(
    line: str,
    people: dict[int, DumpPerson],
    references: list[DumpReferenceImage],
    stats: dict[str, Any],
) -> None:
    stats["photoRows"] += 1
    fields = parse_tuple_fields(line, 4)
    if len(fields) < 4:
        stats["photoInvalidImages"] += 1
        return

    image_id = int(fields[0])
    preview_bytes = decode_binary_field(fields[2])
    hires_bytes = decode_binary_field(fields[3])
    image_bytes = hires_bytes or preview_bytes
    if not image_bytes:
        stats["photoEmptyImages"] += 1
        return

    stats["photoRowsWithBinary"] += 1
    extension = detect_image_extension(image_bytes)
    if extension is None:
        stats["photoInvalidImages"] += 1
        return

    person = people.get(image_id)
    if person is None:
        stats["photoMissingPerson"] += 1
        return

    if person.status != "AVAILABLE":
        stats["photoInactivePerson"] += 1
        return

    stats["photoValidImages"] += 1
    references.append(
        DumpReferenceImage(
            image_id=image_id,
            employee_id=image_id,
            name=person.name,
            image_bytes=image_bytes,
            extension=extension,
            source="sigur-photo",
            profile={
                "sourceLabel": "Sigur photo",
                "role": person.pos,
                "department": "Справочник personal",
                "iin": person.iin,
                "status": person.status,
                "groupKey": person.identity_key,
            },
        )
    )


def deduplicate_references(
    references: list[DumpReferenceImage],
    stats: dict[str, Any],
) -> list[DumpReferenceImage]:
    unique: list[DumpReferenceImage] = []
    seen_hashes: set[tuple[str, str]] = set()

    for reference in references:
        identity_key = reference.profile.get("groupKey", str(reference.employee_id))
        image_hash = hashlib.sha1(reference.image_bytes).hexdigest()
        dedupe_key = (identity_key, image_hash)
        if dedupe_key in seen_hashes:
            stats["referencesDuplicateHashes"] += 1
            continue

        seen_hashes.add(dedupe_key)
        unique.append(reference)

    return unique


def parse_tuple_fields(line: str, max_fields: int) -> list[str]:
    text = line.strip()
    if not text.startswith("("):
        return []

    fields: list[str] = []
    index = 1
    while index < len(text) and len(fields) < max_fields:
        index = skip_spaces(text, index)
        if index >= len(text) or text[index] == ")":
            break

        if text[index] == "'":
            value, index = parse_quoted_string(text, index)
        elif text.startswith("_binary", index):
            value, index = parse_binary_token(text, index)
        else:
            start = index
            while index < len(text) and text[index] not in ",)":
                index += 1
            value = text[start:index].strip()

        fields.append(value)
        index = skip_spaces(text, index)
        if index < len(text) and text[index] == ",":
            index += 1

    return fields


def parse_quoted_string(text: str, index: int) -> tuple[str, int]:
    index += 1
    chunks: list[str] = []
    while index < len(text):
        char = text[index]
        if char == "'":
            if index + 1 < len(text) and text[index + 1] == "'":
                chunks.append("'")
                index += 2
                continue
            return "".join(chunks), index + 1

        chunks.append(char)
        index += 1

    return "".join(chunks), index


def parse_binary_token(text: str, index: int) -> tuple[str, int]:
    index += len("_binary")
    index = skip_spaces(text, index)

    if text.startswith("0x", index):
        index += 2
        start = index
        while index < len(text) and text[index] in "0123456789abcdefABCDEF":
            index += 1
        return "0x" + text[start:index], index

    if text.startswith("''", index):
        return "", index + 2

    if index < len(text) and text[index] == "'":
        return parse_quoted_string(text, index)

    start = index
    while index < len(text) and text[index] not in ",)":
        index += 1
    return text[start:index].strip(), index


def skip_spaces(text: str, index: int) -> int:
    while index < len(text) and text[index].isspace():
        index += 1
    return index


def decode_binary_field(value: str) -> bytes:
    if not value or value.upper() == "NULL":
        return b""

    if value.startswith("0x"):
        hex_value = value[2:]
        if len(hex_value) % 2 != 0 or HEX_RE.match(hex_value) is None:
            return b""
        return bytes.fromhex(hex_value)

    return value.encode("latin1", errors="ignore")


def detect_image_extension(image_bytes: bytes) -> str | None:
    if not image_bytes:
        return None

    if len(image_bytes) >= 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return ".webp"

    for signature, extension in IMAGE_EXTENSIONS:
        if image_bytes.startswith(signature):
            return extension

    return None


def clean_profile_value(value: str) -> str:
    if not value or value == "NULL":
        return ""

    if value.startswith("$"):
        return ""

    return value


def build_person_identity_key(iin: str, name: str) -> str:
    normalized_iin = re.sub(r"\D+", "", iin or "")
    if normalized_iin:
        return f"iin:{normalized_iin}"

    normalized_name = re.sub(r"\s+", " ", (name or "").strip().lower())
    return f"name:{normalized_name}"
