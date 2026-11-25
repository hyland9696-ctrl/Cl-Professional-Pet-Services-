"""Stitch PNG frames into a looping GIF with one shared palette.
Usage: python3 tools/frames-to-gif.py <frames-dir> <out.gif> [ms-per-frame]"""
import sys, glob
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
ms = int(sys.argv[3]) if len(sys.argv) > 3 else 90
frames = [Image.open(f).convert('RGB') for f in sorted(glob.glob(src + '/f*.png'))]
# one palette from a strip of several frames, so colours do not flicker between frames
strip = Image.new('RGB', (frames[0].width, frames[0].height * 4))
for i, k in enumerate([0, len(frames) // 4, len(frames) // 2, 3 * len(frames) // 4]): strip.paste(frames[k], (0, i * frames[0].height))
# small details (the logo's green) are a sliver of the picture and would lose
# their colours to the background; weigh the top-centre in by pasting it large
w, h = frames[0].size
detail = frames[0].crop((int(w * .42), 0, int(w * .58), int(h * .32))).resize((w, h))
strip2 = Image.new('RGB', (w, strip.height + h)); strip2.paste(strip, (0, 0)); strip2.paste(detail, (0, strip.height)); strip = strip2
pal = strip.quantize(colors=int(sys.argv[4]) if len(sys.argv) > 4 else 96, method=Image.MEDIANCUT, dither=Image.NONE)
q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=ms, loop=0, optimize=True, disposal=1)
frames[0].save(out.rsplit('.', 1)[0] + '.png', optimize=True)
print(out, len(frames), 'frames')
