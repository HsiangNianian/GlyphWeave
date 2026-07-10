#!/usr/bin/env python3
"""Build the deterministic GlyphWeave .gemap v3 conformance corpus.

The script intentionally uses only Python's standard library.  Its compact
BLAKE3 implementation is checked against the official empty and ``abc`` test
vectors before it is allowed to produce a fixture.
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import warnings
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parent
DEFINITIONS = ROOT / "definitions.json"
EXPANDED_VALID = ROOT / "expanded" / "v3-valid"
EXPANDED_INVALID = ROOT / "expanded" / "v3-invalid"
ARCHIVE_VALID = ROOT / "v3-valid"
ARCHIVE_INVALID = ROOT / "v3-invalid"

CHUNK_EDGE = 16
CHUNK_VOLUME = CHUNK_EDGE**3
REGION_EDGE = 32
HASH_DOMAIN = b"GEMAP-CHUNK-V1\0"


# Minimal unkeyed BLAKE3, sufficient for fixture generation and independently
# guarded by published vectors below.
_IV = [
    0x6A09E667,
    0xBB67AE85,
    0x3C6EF372,
    0xA54FF53A,
    0x510E527F,
    0x9B05688C,
    0x1F83D9AB,
    0x5BE0CD19,
]
_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]
_CHUNK_START = 1
_CHUNK_END = 2
_PARENT = 4
_ROOT = 8
_MASK32 = 0xFFFFFFFF


def _rotr32(value: int, amount: int) -> int:
    return ((value >> amount) | (value << (32 - amount))) & _MASK32


def _g(state: list[int], a: int, b: int, c: int, d: int, mx: int, my: int) -> None:
    state[a] = (state[a] + state[b] + mx) & _MASK32
    state[d] = _rotr32(state[d] ^ state[a], 16)
    state[c] = (state[c] + state[d]) & _MASK32
    state[b] = _rotr32(state[b] ^ state[c], 12)
    state[a] = (state[a] + state[b] + my) & _MASK32
    state[d] = _rotr32(state[d] ^ state[a], 8)
    state[c] = (state[c] + state[d]) & _MASK32
    state[b] = _rotr32(state[b] ^ state[c], 7)


def _round(state: list[int], message: list[int]) -> None:
    _g(state, 0, 4, 8, 12, message[0], message[1])
    _g(state, 1, 5, 9, 13, message[2], message[3])
    _g(state, 2, 6, 10, 14, message[4], message[5])
    _g(state, 3, 7, 11, 15, message[6], message[7])
    _g(state, 0, 5, 10, 15, message[8], message[9])
    _g(state, 1, 6, 11, 12, message[10], message[11])
    _g(state, 2, 7, 8, 13, message[12], message[13])
    _g(state, 3, 4, 9, 14, message[14], message[15])


def _words(block: bytes) -> list[int]:
    return list(struct.unpack("<16I", block.ljust(64, b"\0")))


def _compress(
    chaining_value: list[int],
    block_words: list[int],
    counter: int,
    block_length: int,
    flags: int,
) -> list[int]:
    state = chaining_value[:] + _IV[:4] + [
        counter & _MASK32,
        (counter >> 32) & _MASK32,
        block_length,
        flags,
    ]
    message = block_words[:]
    for round_index in range(7):
        _round(state, message)
        if round_index != 6:
            message = [message[index] for index in _PERMUTATION]
    return [state[i] ^ state[i + 8] for i in range(8)] + [
        state[i + 8] ^ chaining_value[i] for i in range(8)
    ]


@dataclass(frozen=True)
class _Blake3Output:
    input_cv: list[int]
    block_words: list[int]
    counter: int
    block_length: int
    flags: int

    def chaining_value(self) -> list[int]:
        return _compress(
            self.input_cv,
            self.block_words,
            self.counter,
            self.block_length,
            self.flags,
        )[:8]

    def root_digest(self) -> bytes:
        words = _compress(
            self.input_cv,
            self.block_words,
            0,
            self.block_length,
            self.flags | _ROOT,
        )
        return struct.pack("<16I", *words)[:32]


def _chunk_output(chunk: bytes, chunk_counter: int) -> _Blake3Output:
    cv = _IV[:]
    blocks_compressed = 0
    remaining = chunk
    while len(remaining) > 64:
        flags = _CHUNK_START if blocks_compressed == 0 else 0
        cv = _compress(cv, _words(remaining[:64]), chunk_counter, 64, flags)[:8]
        blocks_compressed += 1
        remaining = remaining[64:]
    flags = _CHUNK_END
    if blocks_compressed == 0:
        flags |= _CHUNK_START
    return _Blake3Output(cv, _words(remaining), chunk_counter, len(remaining), flags)


def _parent_output(left_cv: list[int], right_cv: list[int]) -> _Blake3Output:
    return _Blake3Output(_IV[:], left_cv + right_cv, 0, 64, _PARENT)


def blake3(data: bytes) -> bytes:
    chunks = [data[offset : offset + 1024] for offset in range(0, len(data), 1024)]
    if not chunks:
        chunks = [b""]

    cv_stack: list[list[int]] = []
    for chunk_index, chunk in enumerate(chunks[:-1]):
        cv = _chunk_output(chunk, chunk_index).chaining_value()
        total_chunks = chunk_index + 1
        while total_chunks & 1 == 0:
            cv = _parent_output(cv_stack.pop(), cv).chaining_value()
            total_chunks >>= 1
        cv_stack.append(cv)

    output = _chunk_output(chunks[-1], len(chunks) - 1)
    while cv_stack:
        output = _parent_output(cv_stack.pop(), output.chaining_value())
    return output.root_digest()


def verify_blake3() -> None:
    vectors = {
        b"": "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
        b"abc": "6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85",
    }
    for message, expected in vectors.items():
        actual = blake3(message).hex()
        if actual != expected:
            raise RuntimeError(f"BLAKE3 self-test failed: {actual} != {expected}")


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)


def clean_generated() -> None:
    for directory in (EXPANDED_VALID, EXPANDED_INVALID, ARCHIVE_VALID, ARCHIVE_INVALID):
        directory.mkdir(parents=True, exist_ok=True)
        for child in directory.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()


def pack_indices(indices: Iterable[int], bits: int) -> bytes:
    values = list(indices)
    packed = bytearray(math.ceil(len(values) * bits / 8))
    mask = (1 << bits) - 1
    for voxel_index, value in enumerate(values):
        if value < 0 or value > mask:
            raise ValueError(f"palette index {value} does not fit in {bits} bits")
        bit_offset = voxel_index * bits
        for value_bit in range(bits):
            if value & (1 << value_bit):
                absolute_bit = bit_offset + value_bit
                packed[absolute_bit // 8] |= 1 << (absolute_bit % 8)
    return bytes(packed)


def canonical_chunk(blocks: list[int]) -> tuple[list[int], int, bytes, str]:
    palette = sorted(set(blocks))
    palette_index = {block_id: index for index, block_id in enumerate(palette)}
    bits = max(1, (len(palette) - 1).bit_length())
    packed = pack_indices((palette_index[block_id] for block_id in blocks), bits)
    identity = bytearray(HASH_DOMAIN)
    identity += struct.pack("<I", len(palette))
    for block_id in palette:
        identity += struct.pack("<I", block_id)
    identity.append(bits)
    identity += packed
    return palette, bits, packed, blake3(bytes(identity)).hex()


def coord_to_chunk(z: int, x: int, y: int) -> tuple[tuple[int, int, int], int]:
    cz, cx, cy = z // CHUNK_EDGE, x // CHUNK_EDGE, y // CHUNK_EDGE
    lz, lx, ly = z % CHUNK_EDGE, x % CHUNK_EDGE, y % CHUNK_EDGE
    local_index = ((lz * CHUNK_EDGE) + ly) * CHUNK_EDGE + lx
    return (cz, cx, cy), local_index


def expand_case_voxels(case: dict[str, Any]) -> dict[tuple[int, int, int], int]:
    voxels: dict[tuple[int, int, int], int] = {}
    for z, x, y, block_id in case.get("voxels", []):
        voxels[(z, x, y)] = block_id
    for run in case.get("linearRuns", []):
        cz, cx, cy = run["chunk"]
        for index, block_id in enumerate(run["blockIds"]):
            if block_id == 0:
                continue
            lx = index % CHUNK_EDGE
            quotient = index // CHUNK_EDGE
            ly = quotient % CHUNK_EDGE
            lz = quotient // CHUNK_EDGE
            voxels[(cz * CHUNK_EDGE + lz, cx * CHUNK_EDGE + lx, cy * CHUNK_EDGE + ly)] = block_id
    return voxels


def section_sort_key(key: str) -> tuple[int, ...]:
    return tuple(int(part) for part in key.split(","))


def path_for_region(rx: int, ry: int) -> str:
    return f"regions/{rx}.{ry}/region.json"


def build_valid_case(case: dict[str, Any]) -> tuple[dict[str, bytes], dict[str, Any]]:
    block_registry = {str(key): value for key, value in case["blockRegistry"].items()}
    known_ids = {int(key) for key in block_registry}
    voxels = expand_case_voxels(case)
    if any(block_id == 0 or block_id not in known_ids for block_id in voxels.values()):
        raise ValueError(f"{case['id']}: every stored voxel must be a registered non-air block")

    chunks: dict[tuple[int, int, int], list[int]] = {}
    for coord, block_id in voxels.items():
        chunk_coord, local_index = coord_to_chunk(*coord)
        chunks.setdefault(chunk_coord, [0] * CHUNK_VOLUME)[local_index] = block_id

    region_chunks: dict[tuple[int, int], list[tuple[tuple[int, int, int], list[int]]]] = {}
    for (cz, cx, cy), blocks in chunks.items():
        region = (cx // REGION_EDGE, cy // REGION_EDGE)
        region_chunks.setdefault(region, []).append(((cz, cx, cy), blocks))

    manifest = {
        "axisOrder": "z,x,y",
        "blockRegistry": block_registry,
        "chunkShape": [16, 16, 16],
        "format": "glyphweave-map",
        "metadata": {"fixture": case["id"]},
        "regionShape": ["infinite", 32, 32],
        "regions": {
            f"{rx},{ry}": path_for_region(rx, ry) for rx, ry in sorted(region_chunks)
        },
        "version": 3,
        "world": {"name": case["worldName"]},
    }
    entries: dict[str, bytes] = {"manifest.json": json_bytes(manifest)}
    expected_regions: dict[str, Any] = {}

    for rx, ry in sorted(region_chunks):
        sections: dict[str, str] = {}
        chunk_records: dict[str, dict[str, Any]] = {}
        expected_chunk_records: dict[str, Any] = {}
        region_base = f"regions/{rx}.{ry}"
        for (cz, cx, cy), blocks in sorted(region_chunks[(rx, ry)]):
            palette, bits, packed, chunk_id = canonical_chunk(blocks)
            section_key = f"{cz},{cx % REGION_EDGE},{cy % REGION_EDGE}"
            sections[section_key] = chunk_id
            if chunk_id not in chunk_records:
                data_path = f"chunks/{chunk_id}.bin"
                chunk_records[chunk_id] = {
                    "bits": bits,
                    "data": data_path,
                    "palette": palette,
                }
                entries[f"{region_base}/{data_path}"] = packed
                expected_chunk_records[chunk_id] = {
                    "bits": bits,
                    "byteLength": len(packed),
                    "dataSha256": hashlib.sha256(packed).hexdigest(),
                    "packedPrefixHex": packed[:16].hex(),
                    "palette": palette,
                    "referenceCount": 0,
                }
            expected_chunk_records[chunk_id]["referenceCount"] += 1

        sections = dict(sorted(sections.items(), key=lambda item: section_sort_key(item[0])))
        region_json = {
            "chunks": dict(sorted(chunk_records.items())),
            "format": "glyphweave-region",
            "region": [rx, ry],
            "sections": sections,
            "version": 1,
        }
        entries[f"{region_base}/region.json"] = json_bytes(region_json)
        expected_regions[f"{rx},{ry}"] = {
            "chunks": expected_chunk_records,
            "sections": sections,
        }

    expected_voxels = [
        {"block": block_registry[str(block_id)], "coord": list(coord)}
        for coord, block_id in sorted(voxels.items())
    ]
    expected = {
        "accept": True,
        "archive": f"v3-valid/{case['id']}.gemap",
        "expanded": f"expanded/v3-valid/{case['id']}",
        "logicalVoxels": expected_voxels,
        "regions": expected_regions,
    }
    return entries, expected


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.flag_bits |= 0x800
    return info


def write_archive(path: Path, entries: list[tuple[str, bytes]], sort_entries: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(entries) if sort_entries else entries
    with zipfile.ZipFile(path, "w", allowZip64=True) as archive:
        for name, data in ordered:
            info = zip_info(name)
            info.compress_type = zipfile.ZIP_STORED if name.endswith(".bin") else zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)


def write_expanded(root: Path, entries: dict[str, bytes]) -> None:
    for name, data in sorted(entries.items()):
        write_bytes(root / name, data)


def origin_parts(valid_entries: dict[str, dict[str, bytes]]) -> tuple[str, str, bytes, dict[str, Any], bytes]:
    source = valid_entries["one-block-origin"]
    manifest = json.loads(source["manifest.json"])
    region_path = manifest["regions"]["0,0"]
    region = json.loads(source[region_path])
    chunk_id = next(iter(region["chunks"]))
    binary_path = f"regions/0.0/{region['chunks'][chunk_id]['data']}"
    return region_path, chunk_id, source[binary_path], region, source["manifest.json"]


def build_invalid_cases(valid_entries: dict[str, dict[str, bytes]]) -> dict[str, dict[str, bytes]]:
    region_path, chunk_id, binary, origin_region, manifest_bytes = origin_parts(valid_entries)
    cases: dict[str, dict[str, bytes]] = {}

    corrupt_id = "0" * 64
    corrupt_region = json.loads(json.dumps(origin_region))
    record = corrupt_region["chunks"].pop(chunk_id)
    record["data"] = f"chunks/{corrupt_id}.bin"
    corrupt_region["chunks"][corrupt_id] = record
    corrupt_region["sections"] = {
        key: corrupt_id for key in corrupt_region["sections"]
    }
    cases["corrupt-hash"] = {
        "manifest.json": manifest_bytes,
        region_path: json_bytes(corrupt_region),
        f"regions/0.0/chunks/{corrupt_id}.bin": binary,
    }

    cases["truncated-binary"] = {
        "manifest.json": manifest_bytes,
        region_path: json_bytes(origin_region),
        f"regions/0.0/chunks/{chunk_id}.bin": binary[:-1],
    }

    bad_manifest = {
        "axisOrder": "z,x,y",
        "blockRegistry": {"0": "glyphweave:air"},
        "chunkShape": [16, 16, 16],
        "format": "glyphweave-map",
        "regionShape": ["infinite", 32, 32],
        "regions": {"0,0": "../escape/region.json"},
        "version": 3,
        "world": {"name": "Unsafe Path"},
    }
    cases["bad-path"] = {"manifest.json": json_bytes(bad_manifest)}
    return cases


def write_invalid_archives(
    invalid_cases: dict[str, dict[str, bytes]],
    empty_manifest: bytes,
) -> None:
    for case_id, entries in invalid_cases.items():
        write_expanded(EXPANDED_INVALID / case_id, entries)
        write_archive(ARCHIVE_INVALID / f"{case_id}.gemap", list(entries.items()))

    duplicate_recipe = {
        "entriesInOrder": ["manifest.json", "manifest.json"],
        "note": "The two entries are byte-identical; duplicate names are invalid.",
    }
    write_bytes(
        EXPANDED_INVALID / "duplicate-entry" / "recipe.json",
        json_bytes(duplicate_recipe),
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        write_archive(
            ARCHIVE_INVALID / "duplicate-entry.gemap",
            [("manifest.json", empty_manifest), ("manifest.json", empty_manifest)],
            sort_entries=False,
        )

    bomb_size = 1_048_576
    bomb_recipe = {
        "entry": "metadata/padding.bin",
        "uncompressedBytes": bomb_size,
        "fillByteHex": "00",
        "note": "Bounded synthetic compression bomb; never expand this entry into the repository.",
    }
    write_bytes(
        EXPANDED_INVALID / "zip-bomb-limit" / "recipe.json",
        json_bytes(bomb_recipe),
    )
    bomb_path = ARCHIVE_INVALID / "zip-bomb-limit.gemap"
    with zipfile.ZipFile(bomb_path, "w", allowZip64=True) as archive:
        for name, data in [
            ("manifest.json", empty_manifest),
            ("metadata/padding.bin", b"\0" * bomb_size),
        ]:
            info = zip_info(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)


def legacy_expectations() -> dict[str, Any]:
    return {
        "flat-v1": {
            "accept": True,
            "input": "v2/flat-v1.gemap",
            "migrations": {
                "flatten": {
                    "logicalVoxels": [
                        {"coord": [0, -1, -1], "block": "glyphweave:wall"},
                        {"coord": [0, 0, 0], "block": "glyphweave:floor"},
                        {"coord": [0, 4, 5], "block": "legacy:mystery-tile"},
                    ],
                    "report": {
                        "mode": "flatten",
                        "outputVoxelCount": 3,
                        "overwrittenTileCount": 0,
                        "skippedHiddenLayers": [],
                        "sourceVersion": 1,
                        "unknownTileIds": ["mysteryTile"],
                    },
                },
                "preserve-layers": {
                    "layerZ": {"layer-1": 0},
                    "logicalVoxels": [
                        {"coord": [0, -1, -1], "block": "glyphweave:wall"},
                        {"coord": [0, 0, 0], "block": "glyphweave:floor"},
                        {"coord": [0, 4, 5], "block": "legacy:mystery-tile"},
                    ],
                    "report": {
                        "mode": "preserve-layers",
                        "outputVoxelCount": 3,
                        "overwrittenTileCount": 0,
                        "skippedHiddenLayers": [],
                        "sourceVersion": 1,
                        "unknownTileIds": ["mysteryTile"],
                    },
                },
            },
        },
        "layered-v2": {
            "accept": True,
            "input": "v2/layered-v2.gemap",
            "migrations": {
                "flatten": {
                    "logicalVoxels": [
                        {"coord": [0, -1, -1], "block": "glyphweave:floor-alt"},
                        {"coord": [0, 0, 0], "block": "glyphweave:blood"},
                        {"coord": [0, 1, 0], "block": "glyphweave:grass"},
                        {"coord": [0, 2, 0], "block": "glyphweave:door"},
                        {"coord": [0, 5, 0], "block": "legacy:mystery-tile"},
                    ],
                    "report": {
                        "mode": "flatten",
                        "outputVoxelCount": 5,
                        "overwrittenTileCount": 2,
                        "skippedHiddenLayers": [
                            {"id": "secrets", "name": "Hidden Secrets", "tileCount": 2}
                        ],
                        "sourceVersion": 2,
                        "unknownTileIds": ["mysteryTile"],
                    },
                },
                "preserve-layers": {
                    "layerZ": {"details": 3, "secrets": 2, "structures": 1, "terrain": 0},
                    "logicalVoxels": [
                        {"coord": [0, -1, -1], "block": "glyphweave:floor-alt"},
                        {"coord": [0, 0, 0], "block": "glyphweave:floor"},
                        {"coord": [0, 1, 0], "block": "glyphweave:grass"},
                        {"coord": [1, 0, 0], "block": "glyphweave:wall"},
                        {"coord": [1, 2, 0], "block": "glyphweave:door"},
                        {"coord": [2, 0, 0], "block": "glyphweave:treasure"},
                        {"coord": [2, 4, 0], "block": "glyphweave:tree"},
                        {"coord": [3, 0, 0], "block": "glyphweave:blood"},
                        {"coord": [3, 5, 0], "block": "legacy:mystery-tile"},
                    ],
                    "report": {
                        "mode": "preserve-layers",
                        "outputVoxelCount": 9,
                        "overwrittenTileCount": 0,
                        "skippedHiddenLayers": [],
                        "sourceVersion": 2,
                        "unknownTileIds": ["mysteryTile"],
                    },
                },
            },
        },
    }


def archive_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    verify_blake3()
    definitions = json.loads(DEFINITIONS.read_text(encoding="utf-8"))
    clean_generated()

    valid_entries: dict[str, dict[str, bytes]] = {}
    expected_valid: dict[str, Any] = {}
    for case in definitions["v3Valid"]:
        entries, expected = build_valid_case(case)
        case_id = case["id"]
        valid_entries[case_id] = entries
        write_expanded(EXPANDED_VALID / case_id, entries)
        archive_path = ARCHIVE_VALID / f"{case_id}.gemap"
        write_archive(archive_path, list(entries.items()))
        expected["archiveSha256"] = archive_sha256(archive_path)
        expected_valid[case_id] = expected

    invalid_cases = build_invalid_cases(valid_entries)
    empty_manifest = valid_entries["empty-world"]["manifest.json"]
    write_invalid_archives(invalid_cases, empty_manifest)

    invalid_errors = {case["id"]: case["expectedError"] for case in definitions["v3Invalid"]}
    expected_invalid = {
        case_id: {
            "accept": False,
            "archive": f"v3-invalid/{case_id}.gemap",
            "archiveSha256": archive_sha256(ARCHIVE_INVALID / f"{case_id}.gemap"),
            "expectedError": error,
        }
        for case_id, error in sorted(invalid_errors.items())
    }
    expected_invalid["zip-bomb-limit"]["conformanceLimits"] = {
        "maxCompressionRatio": 100,
        "maxEntryUncompressedBytes": 262_144,
        "maxEntries": 128,
        "maxTotalUncompressedBytes": 524_288,
    }

    expectations = {
        "corpusVersion": definitions["corpusVersion"],
        "legacy": legacy_expectations(),
        "v3Invalid": expected_invalid,
        "v3Valid": expected_valid,
    }
    write_bytes(ROOT / "expectations.json", json_bytes(expectations))

    archive_paths = sorted(ARCHIVE_VALID.glob("*.gemap")) + sorted(ARCHIVE_INVALID.glob("*.gemap"))
    checksum_lines = [
        f"{archive_sha256(path)}  {path.relative_to(ROOT).as_posix()}" for path in archive_paths
    ]
    write_bytes(ROOT / "SHA256SUMS", ("\n".join(checksum_lines) + "\n").encode())

    legacy_checksums = {
        path.stem: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted((ROOT / "v2").glob("*.gemap"))
    }
    write_bytes(ROOT / "v2" / "SHA256SUMS", (
        "\n".join(
            f"{checksum}  {case_id}.gemap" for case_id, checksum in legacy_checksums.items()
        ) + "\n"
    ).encode())

    print(
        f"generated {len(expected_valid)} valid, {len(expected_invalid)} invalid, "
        f"and {len(legacy_checksums)} legacy fixtures"
    )


if __name__ == "__main__":
    main()
