#!/usr/bin/env python3
"""Assemble the pass 4 film from captured stills.

Every frame here is a real capture of the live page: nothing is interpolated or synthesised.
The film is stepped because this container renders the scene in software at about one frame
per second — a capture *is* a frame of the page, and there are only so many of them.

usage: python3 tools/p4-assemble.py <mainDir> <loaderDir> <out.mp4> [fps] [hold] [loaderHold]
"""
import os
import subprocess
import sys

main_dir, loader_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
fps = int(sys.argv[4]) if len(sys.argv) > 4 else 24
hold = int(sys.argv[5]) if len(sys.argv) > 5 else 3
lhold = int(sys.argv[6]) if len(sys.argv) > 6 else 4


def frames(d):
    if not d or not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f.startswith('f') and f.endswith('.jpg'))


seq_dir = os.path.join(os.path.dirname(out) or '.', '_seq')
os.makedirs(seq_dir, exist_ok=True)
for f in os.listdir(seq_dir):
    os.remove(os.path.join(seq_dir, f))

order = []
for f in frames(loader_dir):
    order += [os.path.join(loader_dir, f)] * lhold
for f in frames(main_dir):
    order += [os.path.join(main_dir, f)] * hold

for i, src in enumerate(order):
    os.symlink(os.path.abspath(src), os.path.join(seq_dir, 'f%05d.jpg' % i))

print('loader', len(frames(loader_dir)), 'main', len(frames(main_dir)), '->', len(order), 'frames',
      '(%.1f s at %d fps)' % (len(order) / fps, fps))

cmd = [
    'ffmpeg', '-y', '-loglevel', 'error',
    '-framerate', str(fps), '-i', os.path.join(seq_dir, 'f%05d.jpg'),
    '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-r', str(fps),
    out,
]
subprocess.run(cmd, check=True)
subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size',
                '-show_entries', 'stream=width,height,avg_frame_rate',
                '-of', 'default=noprint_wrappers=1', out], check=True)
