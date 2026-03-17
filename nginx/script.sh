#!/bin/bash

# Generates a self-signed SSL cert valid for 365 days
# Run this once from your project root before docker compose up

mkdir -p nginx/certs

sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/certs/key.pem \
  -out nginx/certs/cert.pem \
  -subj "/C=MA/ST=Casablanca/L=Casablanca/O=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" | echo ' '

echo "✅ Self-signed cert generated at nginx/certs/"
echo "   cert.pem → certificate"
echo "   key.pem  → private key"
