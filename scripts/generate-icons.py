"""Generate the local Huntdeck mark with Python's standard library only."""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'icons'
ROOT.mkdir(exist_ok=True)

def inside(x, y):
    # Rounded green tile with a dark ascending bar / arrow mark.
    dx, dy = max(abs(x - 64) - 38, 0), max(abs(y - 64) - 38, 0)
    tile = dx * dx + dy * dy <= 18 * 18
    bars = (30 <= x <= 43 and 66 <= y <= 92) or (52 <= x <= 65 and 52 <= y <= 92) or (74 <= x <= 87 and 36 <= y <= 92)
    return (20, 33, 11, 255) if tile and bars else (181, 243, 105, 255) if tile else (0, 0, 0, 0)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

for size in (16, 32, 48, 128):
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples = [inside((x + (sx + .5) / 4) * 128 / size, (y + (sy + .5) / 4) * 128 / size) for sy in range(4) for sx in range(4)]
            alpha = sum(p[3] for p in samples)
            pixels.extend([round(sum(p[c] * p[3] for p in samples) / alpha) if alpha else 0 for c in range(3)] + [round(alpha / 16)])
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels, 9)) + chunk(b'IEND', b'')
    (ROOT / f'icon-{size}.png').write_bytes(data)
