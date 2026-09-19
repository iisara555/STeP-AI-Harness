#!/usr/bin/env bash
# Shared macOS runtime bootstrap for STeP AI.
# Node is pinned so employee installs are reproducible and do not trust a moving release target.
# CI verifies these pinned hashes against Node.js signed SHASUMS.

STEP_NODE_VERSION="22.23.2"
STEP_NODE_DIST="https://nodejs.org/dist/v${STEP_NODE_VERSION}"
STEP_NODE_SHA256_ARM64="61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6"
STEP_NODE_SHA256_X64="58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026"

step_node_major() {
    "$1" -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo "0"
}

step_node_is_usable() {
    local candidate="$1"
    [ -x "$candidate" ] || return 1
    local major
    major="$(step_node_major "$candidate")"
    [ "${major:-0}" -ge 20 ]
}

find_step_node() {
    local root_dir="$1"
    local candidate

    candidate="$root_dir/.step-ai/runtime/node/bin/node"
    if step_node_is_usable "$candidate"; then
        STEP_NODE_BIN="$candidate"
        return 0
    fi

    if command -v node >/dev/null 2>&1; then
        candidate="$(command -v node)"
        if step_node_is_usable "$candidate"; then
            STEP_NODE_BIN="$candidate"
            return 0
        fi
    fi

    for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
        if step_node_is_usable "$candidate"; then
            STEP_NODE_BIN="$candidate"
            return 0
        fi
    done

    if [ -d "$HOME/.nvm/versions/node" ]; then
        for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
            if step_node_is_usable "$candidate"; then
                STEP_NODE_BIN="$candidate"
                return 0
            fi
        done
    fi

    return 1
}

bootstrap_step_node() {
    local root_dir="$1"
    local node_arch expected_hash runtime_parent runtime_dir temp_dir node_file archive actual_hash extract_dir extracted_dir

    case "$(uname -m)" in
        arm64)
            node_arch="arm64"
            expected_hash="$STEP_NODE_SHA256_ARM64"
            ;;
        x86_64)
            node_arch="x64"
            expected_hash="$STEP_NODE_SHA256_X64"
            ;;
        *)
            echo "ไม่รองรับสถาปัตยกรรม Mac นี้: $(uname -m)"
            return 1
            ;;
    esac

    for tool in curl shasum tar awk; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "ไม่พบเครื่องมือระบบที่จำเป็น: $tool"
            return 1
        fi
    done

    runtime_parent="$root_dir/.step-ai/runtime"
    runtime_dir="$runtime_parent/node"
    temp_dir="$(mktemp -d -t step-ai-node.XXXXXX)" || return 1
    node_file="node-v${STEP_NODE_VERSION}-darwin-${node_arch}.tar.gz"
    archive="$temp_dir/$node_file"

    echo "กำลังเตรียม Node.js v$STEP_NODE_VERSION สำหรับ STeP AI (ติดตั้งเฉพาะในโฟลเดอร์นี้)..."

    if ! curl -fL --proto '=https' --tlsv1.2 --connect-timeout 10 --max-time 180 \
        -H "User-Agent: STeP-AI-Installer" \
        "$STEP_NODE_DIST/$node_file" -o "$archive"; then
        rm -rf "$temp_dir"
        echo "ดาวน์โหลด Node.js Runtime ไม่สำเร็จ"
        return 1
    fi

    actual_hash="$(shasum -a 256 "$archive" | awk '{ print $1 }')"
    if [ "$actual_hash" != "$expected_hash" ]; then
        rm -rf "$temp_dir"
        echo "SHA-256 ของ Node.js ไม่ตรงกับค่าที่ STeP AI pin ไว้ ยกเลิกการติดตั้ง"
        return 1
    fi

    extract_dir="$temp_dir/extract"
    mkdir -p "$extract_dir"
    if ! tar -xzf "$archive" -C "$extract_dir"; then
        rm -rf "$temp_dir"
        echo "แตกไฟล์ Node.js Runtime ไม่สำเร็จ"
        return 1
    fi

    extracted_dir="$extract_dir/${node_file%.tar.gz}"
    if [ ! -x "$extracted_dir/bin/node" ]; then
        rm -rf "$temp_dir"
        echo "Node.js Runtime ที่ดาวน์โหลดมาไม่สมบูรณ์"
        return 1
    fi

    mkdir -p "$runtime_parent"
    rm -rf "$runtime_parent/node.new"
    mv "$extracted_dir" "$runtime_parent/node.new"
    rm -rf "$runtime_dir"
    mv "$runtime_parent/node.new" "$runtime_dir"
    rm -rf "$temp_dir"

    STEP_NODE_BIN="$runtime_dir/bin/node"
    export PATH="$runtime_dir/bin:$PATH"

    echo "✓ เตรียม Node.js Runtime สำเร็จ: $("$STEP_NODE_BIN" -v)"
    return 0
}

resolve_step_node() {
    local root_dir="$1"

    if find_step_node "$root_dir"; then
        export PATH="$(dirname "$STEP_NODE_BIN"):$PATH"
        return 0
    fi

    bootstrap_step_node "$root_dir"
}
