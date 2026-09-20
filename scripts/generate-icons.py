#!/usr/bin/env python3
"""Generate PWA PNG icons with the standard library only."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

PAPER = (244, 239, 228, 255)
FOREST = (61, 74, 58, 255)
GOLD = (212, 175, 80, 255)
CREAM = (252, 248, 240, 255)


def write_png(path: Path, size: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        row = y * size
        for x in range(size):
            raw.extend(pixels[row + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def fill_round_rect(
    pixels: list[tuple[int, int, int, int]],
    size: int,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    radius: int,
    color: tuple[int, int, int, int],
) -> None:
    r = max(0, radius)

    def setp(x: int, y: int) -> None:
        if 0 <= x < size and 0 <= y < size:
            pixels[y * size + x] = color

    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if x < x0 + r and y < y0 + r:
                if (x - (x0 + r)) ** 2 + (y - (y0 + r)) ** 2 > r * r:
                    continue
            elif x > x1 - r and y < y0 + r:
                if (x - (x1 - r)) ** 2 + (y - (y0 + r)) ** 2 > r * r:
                    continue
            elif x < x0 + r and y > y1 - r:
                if (x - (x0 + r)) ** 2 + (y - (y1 - r)) ** 2 > r * r:
                    continue
            elif x > x1 - r and y > y1 - r:
                if (x - (x1 - r)) ** 2 + (y - (y1 - r)) ** 2 > r * r:
                    continue
            setp(x, y)


def draw_icon(size: int, *, maskable: bool) -> list[tuple[int, int, int, int]]:
    pixels = [PAPER] * (size * size)
    pad = int(size * (0.18 if maskable else 0.07))
    fill_round_rect(
        pixels,
        size,
        pad,
        pad,
        size - 1 - pad,
        size - 1 - pad,
        int(size * 0.14),
        FOREST,
    )

    inner = 0.26 if maskable else 0.20
    bx0 = int(size * inner)
    bx1 = int(size * (1 - inner))
    by0 = int(size * inner)
    by1 = int(size * (1 - inner))
    fill_round_rect(pixels, size, bx0, by0, bx1, by1, int(size * 0.04), CREAM)

    mid = (bx0 + bx1) // 2
    spine = max(1, size // 90)
    for y in range(by0, by1 + 1):
        for x in range(mid - spine, mid + spine + 1):
            if 0 <= x < size:
                pixels[y * size + x] = FOREST

    lx0 = mid + int(size * 0.05)
    lx1 = bx1 - int(size * 0.07)
    thickness = max(1, size // 64)
    for i, frac in enumerate((0.40, 0.50, 0.60)):
        y = int(size * frac)
        color = GOLD if i == 0 else FOREST
        for x in range(lx0, lx1 + 1):
            for t in range(-thickness, thickness + 1):
                yy = y + t
                if 0 <= x < size and 0 <= yy < size:
                    pixels[yy * size + x] = color
    return pixels


def main() -> None:
    out = Path("public/icons")
    out.mkdir(parents=True, exist_ok=True)
    write_png(out / "icon-192.png", 192, draw_icon(192, maskable=False))
    write_png(out / "icon-512.png", 512, draw_icon(512, maskable=False))
    write_png(
        out / "icon-512-maskable.png", 512, draw_icon(512, maskable=True)
    )
    write_png(out / "apple-touch-icon.png", 180, draw_icon(180, maskable=False))


if __name__ == "__main__":
    main()
