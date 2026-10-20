"""Static server with one deliberately slow endpoint, for filming the loader.

Everything is served normally except a .glb, which is written out in 32 KB pieces with a
120 ms pause between them -- about 260 KB/s with a real Content-Length, which is what a
visitor on a normal mobile connection gets. The panel's percentage comes from the browser's
own progress events on that response, so the film shows the real thing over a real (slow)
link instead of a value anyone typed in.

usage: python3 tools/serve-slow.py <root> <port> [bytesPerChunk] [msBetween]
"""
import functools
import http.server
import os
import socketserver
import sys
import time

CHUNK = int(sys.argv[3]) if len(sys.argv) > 3 else 32768
PAUSE = (int(sys.argv[4]) if len(sys.argv) > 4 else 120) / 1000.0


class SlowGLB(http.server.SimpleHTTPRequestHandler):
    def copyfile(self, source, outputfile):
        path = self.path.split('?')[0].lower()
        if not path.endswith('.glb'):
            return super().copyfile(source, outputfile)
        while True:
            buf = source.read(CHUNK)
            if not buf:
                break
            try:
                outputfile.write(buf)
                outputfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            time.sleep(PAUSE)

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    root, port = sys.argv[1], int(sys.argv[2])
    handler = functools.partial(SlowGLB, directory=root)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), handler) as httpd:
        print('slow server on', port, 'from', os.path.abspath(root), flush=True)
        httpd.serve_forever()
