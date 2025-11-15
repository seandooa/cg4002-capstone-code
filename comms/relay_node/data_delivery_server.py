from http.server import BaseHTTPRequestHandler, HTTPServer
import socket
import struct

class MyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        fmt = "<i i i b"
        size = struct.calcsize(fmt)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", 5557))
        buffer = s.recv(size)
        s.close()
        values = struct.unpack(fmt, buffer)

        fmt2 = "<b b"
        size2 = struct.calcsize(fmt2)
        s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s2.connect(("127.0.0.1", 5558))
        buffer2 = s2.recv(size2)
        s2.close()
        values2 = struct.unpack(fmt2, buffer2)

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        html = f"<html><head><title>Test Page</title></head><body><h1>{values[0]},{values[1]},{values[2]},{values[3]},{values2[0]},{values2[1]}</h1></body></html>".encode()
        print(html)
        self.wfile.write(html)

def run(server_class=HTTPServer, handler_class=MyHandler, port=8081):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Serving custom HTML at http://localhost:{port}")
    httpd.serve_forever()

if __name__ == "__main__":
    run()
