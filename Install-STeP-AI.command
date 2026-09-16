#!/bin/bash
# STeP AI Setup (Pilot v0.1) for macOS
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

cd "$(dirname "$0")" || exit 1

# Ensure execute permissions on install script
chmod +x ./install/install-mac.sh 2>/dev/null || true

bash ./install/install-mac.sh
exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo ""
    echo "============================================================"
    echo " [ERROR] การติดตั้งไม่สำเร็จ (Exit Code: $exit_code)"
    echo "============================================================"
    echo "กด Enter เพื่อปิดหน้าต่างนี้..."
    read -r
fi
