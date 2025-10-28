#!/usr/bin/env python3
"""
Generate self-signed SSL certificates for local HTTPS development
This allows camera access when serving the AR app over the network
"""

import os
import subprocess
import sys
from pathlib import Path

def generate_certificates():
    """Generate self-signed SSL certificates using OpenSSL"""
    
    # Create ssl directory if it doesn't exist
    ssl_dir = Path('ssl')
    ssl_dir.mkdir(exist_ok=True)
    
    cert_file = ssl_dir / 'cert.pem'
    key_file = ssl_dir / 'key.pem'
    
    # Check if certificates already exist
    if cert_file.exists() and key_file.exists():
        print("✓ SSL certificates already exist in ssl/ directory")
        print(f"  - Certificate: {cert_file}")
        print(f"  - Private Key: {key_file}")
        
        overwrite = input("\nDo you want to regenerate them? (y/N): ").strip().lower()
        if overwrite != 'y':
            print("\nUsing existing certificates.")
            return True
        print("\nRegenerating certificates...")
    
    print("\nGenerating self-signed SSL certificates...")
    print("=" * 60)
    
    # OpenSSL command to generate self-signed certificate
    # Valid for 365 days, RSA 2048 bit key
    openssl_cmd = [
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', str(key_file),
        '-out', str(cert_file),
        '-days', '365',
        '-nodes',
        '-subj', '/CN=10.179.214.200/O=AR Fitness App/C=US'
    ]
    
    try:
        result = subprocess.run(openssl_cmd, check=True, capture_output=True, text=True)
        print("✓ Successfully generated SSL certificates!")
        print(f"  - Certificate: {cert_file}")
        print(f"  - Private Key: {key_file}")
        print("\n" + "=" * 60)
        print("\nIMPORTANT: Accept the security warning on your mobile device")
        print("=" * 60)
        print("\nWhen you first access https://10.179.214.200:8000 on your mobile:")
        print("1. You'll see a security warning (certificate not trusted)")
        print("2. Click 'Advanced' or 'Details'")
        print("3. Click 'Proceed to 10.179.214.200 (unsafe)' or similar")
        print("4. This is safe for local development")
        print("\nAfter accepting once, the camera should work!\n")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Error generating certificates: {e}")
        print(f"Error output: {e.stderr}")
        return False
    except FileNotFoundError:
        print("\n✗ OpenSSL not found!")
        print("\nPlease install OpenSSL:")
        print("  Windows: Download from https://slproweb.com/products/Win32OpenSSL.html")
        print("  macOS: brew install openssl")
        print("  Linux: sudo apt-get install openssl (Ubuntu/Debian)")
        return False

def main():
    print("\n" + "=" * 60)
    print("AR Fitness App - SSL Certificate Generator")
    print("=" * 60)
    
    success = generate_certificates()
    
    if success:
        print("\n" + "=" * 60)
        print("Next Steps:")
        print("=" * 60)
        print("\n1. Start the HTTPS server:")
        print("   python https_server.py")
        print("\n2. Start the relay server (WSS):")
        print("   cd relay-server")
        print("   python server.py")
        print("\n3. Access the app on your mobile:")
        print("   https://10.179.214.200:8000")
        print("\n4. Accept the security warning on your mobile")
        print("\n5. Grant camera permissions when prompted")
        print("\n" + "=" * 60 + "\n")
        return 0
    else:
        print("\n✗ Certificate generation failed!")
        return 1

if __name__ == '__main__':
    sys.exit(main())

