"""Draw the TextLab home-screen icons. A bracket mark, readable at small sizes."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "icons"
INK = (31, 77, 58)
PAPER = (244, 239, 230)
BRACKET = (240, 210, 196)


def icon(size, maskable=False):
    image = Image.new("RGB", (size, size), INK)
    draw = ImageDraw.Draw(image)
    scale = size / 512
    def px(value):
        return int(round(value * scale))

    inset = 0.18 if maskable else 0.12
    left = int(size * (0.22 + inset * 0.15))
    line_right = int(size * 0.58)
    top = int(size * (0.30 if not maskable else 0.32))
    thickness = max(px(14), 2)
    gap = int(size * 0.09)
    for index in range(4):
        y = top + index * gap
        draw.rounded_rectangle([left, y, line_right, y + thickness], radius=thickness, fill=PAPER)
    hook_x = int(size * 0.64)
    hook_top = int(size * (0.26 if not maskable else 0.28))
    hook_bot = int(size * (0.74 if not maskable else 0.72))
    hook_right = int(size * 0.78)
    weight = max(px(16), 3)
    draw.rounded_rectangle([hook_x, hook_top, hook_x + weight, hook_bot], radius=px(4), fill=BRACKET)
    draw.rounded_rectangle([hook_x, hook_top, hook_right, hook_top + weight], radius=px(4), fill=BRACKET)
    draw.rounded_rectangle([hook_x, hook_bot - weight, hook_right, hook_bot], radius=px(4), fill=BRACKET)
    return image


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    icon(512).save(ROOT / "icon-512.png")
    icon(192).save(ROOT / "icon-192.png")
    icon(180).save(ROOT / "apple-touch-icon.png")
    icon(32).save(ROOT / "favicon-32.png")
    icon(512, maskable=True).save(ROOT / "icon-maskable-512.png")


if __name__ == "__main__":
    main()
