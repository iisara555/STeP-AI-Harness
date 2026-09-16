#!/bin/bash
# STeP AI Update & Sync for macOS
# อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)

cd "$(dirname "$0")" || exit 1

# Ensure execute permissions on update script
chmod +x ./install/update-mac.sh 2>/dev/null || true

bash ./install/update-mac.sh
exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo ""
    echo "============================================================"
    echo " [ERROR] การอัปเดตไม่สำเร็จ (Exit Code: $exit_code)"
    echo "============================================================"
    echo "กด Enter เพื่อปิดหน้าต่างนี้..."
    read -r
fi
