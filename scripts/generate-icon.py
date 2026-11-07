"""Generate the Qimu app icon as PNG + multi-resolution ICO."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "resources"
RES.mkdir(exist_ok=True)
S = 2048

# Diagonal moss gradient
y, x = np.mgrid[0:S, 0:S].astype(np.float32)
t = np.clip((x * 0.32 + y * 0.68) / S, 0, 1)
start = np.array([111, 145, 118], dtype=np.float32)
end = np.array([64, 101, 80], dtype=np.float32)
rgb = start[None, None, :] * (1 - t[:, :, None]) + end[None, None, :] * t[:, :, None]
img = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")

# Soft light bloom in the upper-left
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((-S * 0.28, -S * 0.4, S * 0.72, S * 0.55), fill=(255, 255, 255, 30))
glow = glow.filter(ImageFilter.GaussianBlur(S // 20))
img = Image.alpha_composite(img, glow)

# Rounded-square mask
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.225), fill=255)
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(img, (0, 0), mask)

draw = ImageDraw.Draw(icon, "RGBA")

# A pointed, gently curved leaf between base and tip.
def leaf(base, tip, bend, width_ratio, fill):
    bx, by = base[0] * S, base[1] * S
    tx, ty = tip[0] * S, tip[1] * S
    dx, dy = tx - bx, ty - by
    length = math.hypot(dx, dy)
    nx, ny = -dy / length, dx / length
    bend = bend * length
    points_left, points_right = [], []
    steps = 80
    for i in range(steps + 1):
        p = i / steps
        cx = bx + dx * p + nx * math.sin(math.pi * p) * bend
        cy = by + dy * p + ny * math.sin(math.pi * p) * bend
        half = math.sin(math.pi * p) ** 0.72 * length * width_ratio
        points_left.append((cx + nx * half, cy + ny * half))
        points_right.append((cx - nx * half, cy - ny * half))
    draw.polygon(points_left + list(reversed(points_right)), fill=fill)

# Leaves, stem and a quiet ground line
leaf((0.50, 0.565), (0.245, 0.305), 0.11, 0.165, (255, 255, 255, 150))
leaf((0.50, 0.51), (0.765, 0.235), -0.08, 0.175, (255, 255, 255, 238))

stem = []
for i in range(40):
    p = i / 39
    sx = 0.5 + math.sin(p * math.pi) * 0.012
    sy = 0.755 - p * 0.39
    stem.append((sx * S, sy * S))
draw.line(stem, fill=(255, 255, 255, 235), width=int(S * 0.031), joint="curve")
draw.ellipse((S * 0.474, S * 0.73, S * 0.526, S * 0.782), fill=(255, 255, 255, 238))

# Tiny decorative ground highlight
draw.arc((S * 0.30, S * 0.70, S * 0.70, S * 0.90), 28, 152, fill=(255, 255, 255, 45), width=int(S * 0.009))

# Subtle inner rim
rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
rim_draw = ImageDraw.Draw(rim)
rim_draw.rounded_rectangle(
    (1, 1, S - 2, S - 2),
    radius=int(S * 0.225),
    outline=(255, 255, 255, 42),
    width=int(S * 0.006),
)
icon = Image.alpha_composite(icon, rim)

icon = icon.resize((512, 512), Image.Resampling.LANCZOS)
icon.save(RES / "icon.png", "PNG")
icon.save(
    RES / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(f"wrote {RES / 'icon.png'} and {RES / 'icon.ico'}")
