#!/usr/bin/env bash
# Shared macOS runtime bootstrap for STeP AI.
# Keeps Node.js local to the STeP AI folder so staff do not need Homebrew, sudo, or Terminal setup.

STEP_NODE_MAJOR="22"
STEP_NODE_DIST="https://nodejs.org/dist/latest-v${STEP_NODE_MAJOR}.x"

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
    local node_arch runtime_parent runtime_dir temp_dir sums_file node_file expected_hash archive actual_hash extract_dir extracted_dir

    case "$(uname -m)" in
        arm64) node_arch="arm64" ;;
        x86_64) node_arch="x64" ;;
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
    sums_file="$temp_dir/SHASUMS256.txt"

    echo "กำลังเตรียม Node.js Runtime สำหรับ STeP AI (ติดตั้งเฉพาะในโฟลเดอร์นี้)..."

    if ! curl -fsSL --connect-timeout 10 --max-time 60         -H "User-Agent: STeP-AI-Installer"         "$STEP_NODE_DIST/SHASUMS256.txt" -o "$sums_file"; then
        rm -rf "$temp_dir"
        echo "ดาวน์โหลดรายการตรวจสอบ Node.js ไม่สำเร็จ"
        return 1
    fi

    node_file="$(awk -v arch="$node_arch" '
        $2 ~ ("^node-v22\\.[0-9]+\\.[0-9]+-darwin-" arch "\\.tar\\.gz$") { print $2; exit }
    ' "$sums_file")"

    if [ -z "$node_file" ]; then
        rm -rf "$temp_dir"
        echo "ไม่พบ Node.js สำหรับ Mac สถาปัตยกรรม $node_arch"
        return 1
    fi

    expected_hash="$(awk -v file="$node_file" '$2 == file { print $1; exit }' "$sums_file")"
    archive="$temp_dir/$node_file"

    if ! curl -fL --connect-timeout 10 --max-time 180         -H "User-Agent: STeP-AI-Installer"         "$STEP_NODE_DIST/$node_file" -o "$archive"; then
        rm -rf "$temp_dir"
        echo "ดาวน์โหลด Node.js Runtime ไม่สำเร็จ"
        return 1
    fi

    actual_hash="$(shasum -a 256 "$archive" | awk '{ print $1 }')"
    if [ -z "$expected_hash" ] || [ "$actual_hash" != "$expected_hash" ]; then
        rm -rf "$temp_dir"
        echo "SHA-256 ของ Node.js ไม่ตรงกัน ยกเลิกการติดตั้งเพื่อความปลอดภัย"
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
