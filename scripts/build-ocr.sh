#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"
mkdir -p ocr/bin
swiftc -O -o ocr/bin/curbie-ocr ocr/curbie-ocr.swift
