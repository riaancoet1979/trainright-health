"""Generate TrainRight Health PWA icons.

Design: dark slate background, brand-green dumbbell + heart-pulse line.
Outputs:
  public/pwa-192x192.png       (any)
  public/pwa-512x512.png       (any)
  public/pwa-maskable-512.png  (any maskable — extra safe-zone padding)
  public/apple-touch-icon.png  (180x180, iOS home screen)

Run: python scripts/generate_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

BG = (15, 23, 42)          # slate-900
BG_MASK = (15, 23, 42)
BRAND = (34, 197, 94)      # tailwind primary-500 (green)
BRAND_DIM = (22, 163, 74)  # primary-600
WHITE = (243, 244, 246)

OUT = Path(__file__).resolve().parent.parent / "public"


def draw_logo(canvas: int, *, safe: float = 1.0) -> Image.Image:
    """Render the logo at <canvas> px square.

    `safe` shrinks the artwork (1.0 = full, 0.8 = maskable safe-zone padding).
    """
    # Render at 4x then downsample for clean antialiasing
    scale = 4
    sz = canvas * scale
    img = Image.new("RGB", (sz, sz), BG)
    d = ImageDraw.Draw(img)

    cx = sz / 2
    cy = sz / 2
    R = (sz / 2) * safe  # bounding radius for artwork

    # --- Dumbbell ---
    bar_w = R * 1.10            # total bar width
    bar_h = R * 0.13            # bar thickness
    plate_w = R * 0.22          # plate width (each side)
    plate_h = R * 0.62          # plate height
    plate_radius = R * 0.10

    bar_y_offset = -R * 0.28    # lift up so pulse sits below

    # Bar
    d.rounded_rectangle(
        (cx - bar_w / 2, cy + bar_y_offset - bar_h / 2,
         cx + bar_w / 2, cy + bar_y_offset + bar_h / 2),
        radius=bar_h / 2,
        fill=BRAND,
    )

    # Left plate
    d.rounded_rectangle(
        (cx - bar_w / 2 - plate_w * 0.4, cy + bar_y_offset - plate_h / 2,
         cx - bar_w / 2 + plate_w * 0.6, cy + bar_y_offset + plate_h / 2),
        radius=plate_radius,
        fill=BRAND,
    )
    # Right plate
    d.rounded_rectangle(
        (cx + bar_w / 2 - plate_w * 0.6, cy + bar_y_offset - plate_h / 2,
         cx + bar_w / 2 + plate_w * 0.4, cy + bar_y_offset + plate_h / 2),
        radius=plate_radius,
        fill=BRAND,
    )

    # --- Heart-pulse line below the bar ---
    pulse_y = cy + R * 0.42
    pulse_amp = R * 0.22
    line_w = max(int(R * 0.10), 2)
    half = R * 0.85
    pts = [
        (cx - half,                 pulse_y),
        (cx - half * 0.55,          pulse_y),
        (cx - half * 0.30,          pulse_y - pulse_amp * 0.45),
        (cx - half * 0.10,          pulse_y + pulse_amp * 0.95),
        (cx + half * 0.05,          pulse_y - pulse_amp * 1.10),
        (cx + half * 0.25,          pulse_y + pulse_amp * 0.45),
        (cx + half * 0.50,          pulse_y),
        (cx + half,                 pulse_y),
    ]
    d.line(pts, fill=WHITE, width=line_w, joint="curve")

    # Downsample for smoothness
    return img.resize((canvas, canvas), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("pwa-192x192.png", 192, 0.85),
        ("pwa-512x512.png", 512, 0.85),
        ("pwa-maskable-512.png", 512, 0.65),  # safe zone for adaptive masks
        ("apple-touch-icon.png", 180, 0.85),
    ]
    for name, size, safe in targets:
        path = OUT / name
        draw_logo(size, safe=safe).save(path, "PNG", optimize=True)
        print(f"wrote {path.relative_to(OUT.parent)} ({path.stat().st_size} B)")


if __name__ == "__main__":
    main()
