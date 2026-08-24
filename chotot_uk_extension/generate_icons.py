#!/usr/bin/env python3
"""Generate PNG icons for the Chrome extension (stdlib only)."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


BLUE = (0, 87, 184, 255)
YELLOW = (255, 215, 0, 255)
WHITE = (255, 255, 255, 255)
DARK = (20, 40, 80, 255)


def write_png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row_start = y * width
        for x in range(width):
            raw.extend(pixels[row_start + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def draw_icon(size: int) -> list[tuple[int, int, int, int]]:
    pixels = [(0, 0, 0, 0)] * (size * size)
    radius = size / 2 - 0.5
    cx = cy = size / 2

    def set_px(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            pixels[y * size + x] = color

    def in_circle(x: int, y: int) -> bool:
        return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius**2

    for y in range(size):
        for x in range(size):
            if not in_circle(x, y):
                continue
            color = BLUE if y < size / 2 else YELLOW
            set_px(x, y, color)

    # Simple car silhouette in the center.
    scale = size / 128
    body = [
        (28, 62, 100, 86),
        (40, 48, 88, 64),
    ]
    wheels = [(40, 80, 14), (78, 80, 14)]
    windows = [(48, 52, 28, 12), (80, 52, 22, 12)]

    def scaled_rect(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        sx0, sy0 = int(x0 * scale), int(y0 * scale)
        sx1, sy1 = int(x1 * scale), int(y1 * scale)
        for y in range(sy0, sy1):
            for x in range(sx0, sx1):
                if in_circle(x, y):
                    set_px(x, y, color)

    def scaled_circle(cx0: int, cy0: int, r: int, color: tuple[int, int, int, int]) -> None:
        scx, scy, sr = int(cx0 * scale), int(cy0 * scale), max(2, int(r * scale))
        for y in range(scy - sr, scy + sr + 1):
            for x in range(scx - sr, scx + sr + 1):
                if (x - scx) ** 2 + (y - scy) ** 2 <= sr**2 and in_circle(x, y):
                    set_px(x, y, color)

    for box in body:
        scaled_rect(*box, WHITE)
    for box in windows:
        scaled_rect(*box, DARK)
    for wx, wy, wr in wheels:
        scaled_circle(wx, wy, wr, DARK)
        scaled_circle(wx, wy, wr - 4, WHITE)

    return pixels


def main() -> None:
    out_dir = Path(__file__).parent / "icons"
    out_dir.mkdir(exist_ok=True)
    for size in (16, 48, 128):
        write_png(out_dir / f"icon{size}.png", size, size, draw_icon(size))
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
