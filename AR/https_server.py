#!/usr/bin/env python3
"""
HTTPS server for AR Fitness App
Serves the app over HTTPS to enable camera access on mobile devices
"""

import http.server
import ssl
import os
import sys
from pathlib import Path

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler with better MIME types and CORS support"""
    
    def end_headers(self):
        # Add CORS headers to allow cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Prevent caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight"""
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    # Configuration
    HOST = '0.0.0.0'  # Listen on all interfaces
    PORT = 8000
    
    # SSL certificate paths
    ssl_dir = Path('ssl')
    cert_file = ssl_dir / 'cert.pem'
    key_file = ssl_dir / 'key.pem'
    
    # Check if SSL certificates exist
    if not cert_file.exists() or not key_file.exists():
        print("\n" + "=" * 60)
        print("ERROR: SSL certificates not found!")
        print("=" * 60)
        print(f"\nExpected certificates at:")
        print(f"  - {cert_file}")
        print(f"  - {key_file}")
        print("\nPlease generate certificates first:")
        print("  python generate_ssl_certificates.py")
        print("\n" + "=" * 60 + "\n")
        return 1
    
    # Create HTTPS server
    try:
        server_address = (HOST, PORT)
        httpd = http.server.HTTPServer(server_address, CustomHTTPRequestHandler)
        
        # Wrap with SSL
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        
        print("\n" + "=" * 60)
        print("AR Fitness App - HTTPS Server")
        print("=" * 60)
        print(f"\n✓ Server running on https://{HOST}:{PORT}")
        print(f"✓ Using SSL certificates from: {ssl_dir}")
        print("\n" + "=" * 60)
        print("Access URLs:")
        print("=" * 60)
        print(f"\nOn your mobile device, open:")
        print(f"  https://10.179.214.200:{PORT}")
        print("\nOn this laptop (localhost):")
        print(f"  https://localhost:{PORT}")
        print("\n" + "=" * 60)
        print("IMPORTANT:")
        print("=" * 60)
        print("\n1. You'll see a security warning on first access")
        print("2. Click 'Advanced' and 'Proceed anyway'")
        print("3. This is safe for local development")
        print("4. Camera access should work after accepting!")
        print("\n" + "=" * 60)
        print("\nPress Ctrl+C to stop the server\n")
        
        # Start serving
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        httpd.shutdown()
        print("Server stopped.")
        return 0
    except Exception as e:
        print(f"\n✗ Error starting server: {e}")
        return 1

if __name__ == '__main__':
    sys.exit(main())

