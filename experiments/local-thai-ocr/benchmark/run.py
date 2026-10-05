"""Offline by default. Private input, answers and reports must remain outside Git."""
import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from importlib.metadata import version, PackageNotFoundError
from pathlib import Path

from .safety import external_path
from .score import FIELDS, score_fields

ROOT = Path(__file__).resolve().parents[1]
CHECKOUT = ROOT.parents[1]
HELPER = CHECKOUT / 'desktop/scripts/receipt-benchmark.ts'
TSX = CHECKOUT / 'desktop/node_modules/tsx/dist/cli.mjs'


def tree_bytes(path):
    if not path:
        return None
    root = Path(path).resolve()
    return sum(p.stat().st_size for p in root.rglob('*') if p.is_file() and not p.is_symlink())


def versions():
    result = {}
    for package in ('paddleocr', 'paddlepaddle', 'Pillow', 'easyocr', 'torch', 'transformers'):
        try:
            result[package] = version(package)
        except PackageNotFoundError:
            result[package] = 'not-installed'
    return result


def measured(command, payload=None, timeout=360):
    import psutil  # development-only, never part of the employee OCR requirements
    started, peak = time.perf_counter(), 0
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        child = subprocess.Popen(command, stdin=subprocess.PIPE if payload is not None else subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, cwd=ROOT)
        if payload is not None:
            child.stdin.write(json.dumps(payload).encode())
            child.stdin.close()
        proc = psutil.Process(child.pid)
        timed_out = False
        while child.poll() is None:
            try:
                peak = max(peak, sum(p.memory_info().rss for p in [proc, *proc.children(recursive=True)] if p.is_running()))
            except psutil.Error:
                pass
            if time.perf_counter() - started > timeout:
                timed_out = True
                try:
                    for descendant in proc.children(recursive=True):
                        descendant.kill()
                except psutil.Error:
                    pass
                child.kill()
                break
            time.sleep(.02)
        code = child.wait()
        stdout.seek(0)
        metrics = dict(seconds=round(time.perf_counter() - started, 3), peak_tree_rss_bytes=peak,
                       rss_method='20ms-sampled-process-tree', exit_code=code, timeout=timed_out)
        if code or timed_out:
            raise RuntimeError(json.dumps(metrics))
        return stdout.read().decode('utf-8'), metrics


def run(args):
    folder, output = args.input.resolve(), args.output.resolve()
    if args.private:
        folder, output = external_path(folder, CHECKOUT), external_path(output, CHECKOUT)
        if args.replay:
            external_path(args.replay, CHECKOUT)
    if output == folder or folder in output.parents or output in folder.parents:
        raise ValueError('Keep input and output directories separate')
    output.mkdir(parents=True, exist_ok=False)
    cases = sorted(folder.glob('*.truth.json'))[:args.limit]
    if not cases:
        raise ValueError('No paired ground-truth files; zero documents is not validation')
    rows, live_count = [], 0
    for truth_path in cases:
        # Private filenames never enter console or summary; per-document records use ordinal IDs.
        ident = f'doc-{len(rows) + 1:04}'
        row = dict(id=ident, mode=args.mode, status='failed', metrics={})
        try:
            truth = json.loads(truth_path.read_text(encoding='utf-8'))
            if not args.private and truth.get('synthetic') is not True:
                raise ValueError('Non-synthetic input requires --private')
            if not isinstance(truth.get('fields'), dict) or set(truth['fields']) != set(FIELDS):
                raise ValueError('Ground truth must contain exactly the seven receipt fields')
            stem = truth_path.name.removesuffix('.truth.json')
            image = next((folder / (stem + ext) for ext in ('.png', '.jpg', '.jpeg', '.pdf') if (folder / (stem + ext)).is_file()), None)
            if not image:
                raise ValueError('Missing paired image')
            if args.private:
                external_path(truth_path, CHECKOUT)
                external_path(image, CHECKOUT)
            ocr, vision_reply = {}, ''
            if args.replay:
                replay_path = args.replay / (stem + '.reading.json')
                if args.private:
                    external_path(replay_path, CHECKOUT)
                replay = json.loads(replay_path.read_text(encoding='utf-8'))
                ocr, vision_reply = replay.get('ocr', {}), replay.get('visionReply', '')
                row['evidence'] = 'replay-not-model-accuracy'
            else:
                row['evidence'] = 'executed-models'
                if args.mode in {'ocr', 'combined'}:
                    raw_path = output / (ident + '.ocr.json')
                    _, row['metrics']['ocr'] = measured([sys.executable, str(ROOT / 'ocr_worker.py'), str(image), str(raw_path),
                        str(args.threshold), str(int(args.handwriting)), str(int(args.crosscheck)), str(int(args.tesseract))])
                    ocr = json.loads(raw_path.read_text(encoding='utf-8'))
                    stats = ocr.get('summary', {})
                    row['observed'] = {key: stats.get(key) for key in ('crosschecked_lines', 'tesseract_checked_lines', 'handwriting_candidates')}
                    # Preserve actual engine warnings in the external raw result, never relabel a fallback as the requested variant.
                    row['ocr_warnings_present'] = bool(ocr.get('warnings'))
                if args.mode in {'vision', 'combined'}:
                    if not args.live_vision or live_count >= args.max_live:
                        raise ValueError('Live vision approval and remaining request budget required')
                    if image.suffix.lower() != '.png':
                        raise ValueError('Live benchmark currently accepts PNG; PDF must be explicitly rendered first')
                    live_count += 1
                    from PIL import Image
                    vision_image = output / (ident + '.vision-input.png')
                    with Image.open(image) as source:
                        picture = source.convert('RGB')
                        picture.thumbnail((1800, 1800))
                        picture.save(vision_image)
                    text, row['metrics']['vision'] = measured(['node', str(TSX), str(HELPER)], dict(action='vision', approveLive=True,
                        executable=args.codex, model=args.model, cwd=str(output), image=str(vision_image)), timeout=200)
                    reading = json.loads(text)
                    vision_reply = reading['reply']
                    row['provider'] = {k: reading[k] for k in ('provider', 'model', 'live')}
            if args.mode in {'vision', 'combined'} and not vision_reply:
                raise ValueError('Vision output missing; never score an unrun provider as successful')
            mapped, row['metrics']['mapping'] = measured(['node', str(TSX), str(HELPER)], dict(ocr=ocr, visionReply=vision_reply))
            reading = json.loads(mapped)[args.mode]
            row.update(status='completed', scenario=truth.get('scenario', 'pilot'),
                       simulated_handwriting=bool(truth.get('simulated_handwriting')),
                       score=score_fields(truth.get('raw_fields', truth['fields']), reading['fields'], reading['review']))
            (output / (ident + '.reading.json')).write_text(json.dumps(dict(ocr=ocr, visionReply=vision_reply), ensure_ascii=False, indent=2), encoding='utf-8')
        except Exception as error:
            # Error messages can contain private paths or engine text. Never serialize them into the summary.
            row['failure'] = type(error).__name__
            if isinstance(error, RuntimeError):
                try:
                    row['failed_operation_metrics'] = json.loads(str(error))
                except ValueError:
                    pass
        rows.append(row)
        print(ident + ': ' + row['status'], flush=True)
    completed = [r for r in rows if r['status'] == 'completed']
    totals = {k: sum(r['score']['review'][k] for r in completed) for k in ('tp', 'fp', 'fn', 'tn')}
    totals['precision'] = totals['tp'] / (totals['tp'] + totals['fp']) if totals['tp'] + totals['fp'] else None
    totals['recall'] = totals['tp'] / (totals['tp'] + totals['fn']) if totals['tp'] + totals['fn'] else None
    per_field = {field: dict(samples=len(completed),
        raw_exact=sum(r['score']['fields'][field]['raw_exact'] for r in completed),
        canonical_exact=sum(r['score']['fields'][field]['canonical_exact'] for r in completed),
        critical_errors=sum(r['score']['fields'][field]['critical_error'] for r in completed)) for field in FIELDS}
    summary = dict(schema='step-ocr-benchmark-report/v1', private=args.private, mode=args.mode,
                   host=dict(os=platform.system(), architecture=platform.machine(), logical_cpus=os.cpu_count()),
                   package_versions=versions(), runtime_bytes=tree_bytes(args.runtime_path), model_cache_bytes=tree_bytes(args.model_cache),
                   cache_state=args.cache_state, per_field=per_field, review=totals,
                   target_hosts=['Windows, 2 cores (RAM to be recorded)', 'macOS M1, 4 GB RAM'],
                   acceptance_owner='repository owner', gate='OPEN: real-document pilot and owner decision required',
                   model_initialization='new worker per OCR request; cached downloads are not warm-process inference',
                   requested_options=dict(threshold=args.threshold, crosscheck=args.crosscheck, tesseract=args.tesseract, handwriting=args.handwriting),
                   attempted=len(rows), completed=sum(r['status'] == 'completed' for r in rows), live_requests=live_count, documents=rows)
    (output / 'report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return 0 if summary['completed'] == summary['attempted'] else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--private', action='store_true')
    parser.add_argument('--mode', choices=['ocr', 'vision', 'combined'], default='ocr')
    parser.add_argument('--replay', type=Path, help='Explicit response replay; never labeled live/model accuracy')
    parser.add_argument('--limit', type=int, default=80)
    parser.add_argument('--threshold', type=float, default=.80)
    for option in ('crosscheck', 'tesseract', 'handwriting', 'live-vision'):
        parser.add_argument('--' + option, action='store_true')
    parser.add_argument('--max-live', type=int, default=0, help='Explicit cap of 1..10 live requests')
    parser.add_argument('--codex', default='codex', help='Already authenticated Codex runtime; no credential copying')
    parser.add_argument('--model', default='')
    parser.add_argument('--runtime-path', type=Path, help='Optional installed OCR runtime for disk-size measurement')
    parser.add_argument('--model-cache', type=Path, help='Optional model cache for disk-size measurement')
    parser.add_argument('--cache-state', choices=['unknown', 'first-download', 'cached-downloads'], default='unknown')
    args = parser.parse_args()
    if args.limit < 1 or not .1 <= args.threshold <= .99 or not 0 <= args.max_live <= 10:
        parser.error('Invalid limit, threshold or live request cap')
    try:
        return run(args)
    except Exception as error:
        print('BENCHMARK_FAILED: ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
