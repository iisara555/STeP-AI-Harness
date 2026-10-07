"""Seeded Thai images + paired answers. No third-party document examples."""
import argparse
import hashlib
import json
import random
from functools import lru_cache
from pathlib import Path

from .score import FIELDS

LABELS = ('ผู้ขาย', 'เลขที่ใบเสร็จ', 'วันที่', 'เลขประจำตัวผู้เสียภาษี', 'ยอดก่อนภาษี', 'ภาษีมูลค่าเพิ่ม', 'ยอดรวม')


def generate(output, font_path, count=10, seed=20261005, fallback_font_path=None, include_phone_rotation=False):
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, features
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    if list(output.iterdir()):
        raise ValueError('Use an empty output directory; never overwrite existing evidence')
    if not features.check_feature('raqm'):
        raise RuntimeError('Pillow with RAQM is required for shaped Thai text')
    font_path = Path(font_path)
    font = ImageFont.truetype(str(font_path), 30, layout_engine=ImageFont.Layout.RAQM)
    fallback = ImageFont.truetype(str(fallback_font_path), 30, layout_engine=ImageFont.Layout.RAQM) if fallback_font_path else None
    fonts = [font] + ([fallback] if fallback else [])
    missing = [(f.getmask('\U0010ffff').size, bytes(f.getmask('\U0010ffff'))) for f in fonts]

    @lru_cache(maxsize=512)
    def face(character):
        for index, candidate in enumerate(fonts):
            mask = candidate.getmask(character)
            if (mask.size, bytes(mask)) != missing[index]:
                return candidate
        raise ValueError('Missing font glyph; supply a Thai+Latin font or --fallback-font before generating evidence')

    # Thai-only distro fonts often lack Latin digits: never publish tofu boxes
    # with a numeric answer file and count the resulting OCR failure as accuracy.
    coverage = ''.join(LABELS) + 'ร้านสังเคราะห์ทดสอบเลขผู้ซื้อใบเสร็จรับเงินใบกำกับภาษีอย่างย่อข้อมูลสมมติห้ามใช้เบิกจ่ายSAMPLE TEST ONLY SYN0123456789๐๑๒๓๔๕๖๗๘๙ /-.—'
    for character in coverage:
        face(character)

    def text(draw, position, value, fill='black'):
        x, y = position
        baseline = y + font.getmetrics()[0]
        runs = []
        for character in value:
            selected = face(character)
            if runs and runs[-1][0] is selected:
                runs[-1][1] += character
            else:
                runs.append([selected, character])
        for selected, run in runs:
            draw.text((x, baseline), run, font=selected, fill=fill, anchor='ls')
            x += draw.textlength(run, font=selected)
    rng = random.Random(seed)
    for scenario in 'HIJKLMNO':
        for index in range(count):
            ident = f'{scenario}-{index + 1:03}'
            subtotal = 100 + rng.randrange(1, 1000)
            vat = round(subtotal * .07, 2)
            values = ['ร้านสังเคราะห์ทดสอบ ' + str(index + 1), f'SYN-{index + 1:04}',
                      f'{index % 27 + 1:02}/10/2569', '0000000000000', f'{subtotal:.2f}', f'{vat:.2f}', f'{subtotal + vat:.2f}']
            title = 'ใบกำกับภาษีอย่างย่อ' if index % 2 else 'ใบเสร็จรับเงิน / ใบกำกับภาษี'
            if scenario == 'I':
                values[1] = ''
            if scenario == 'L':
                values[3] = ''
            fields = dict(zip(FIELDS, values))
            image = Image.new('RGB', (1400, 1000), '#fffef9')
            draw = ImageDraw.Draw(image)
            regions, source_lines = {}, []
            text(draw, (40, 15), 'SAMPLE / TEST ONLY — ข้อมูลสมมติ ห้ามใช้เบิกจ่าย', fill='#444444')
            text(draw, (40, 65), title)
            for n, (field, label, value) in enumerate(zip(FIELDS, LABELS, values)):
                y = 160 + n * 95
                printed = value.translate(str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙')) if index % 2 else value
                display = 'เลขผู้ซื้อ: 1111111111111' if scenario == 'L' and field == 'taxId' else printed
                text(draw, (40, y), label)
                text(draw, (650, y), display)
                regions[field] = [35, y - 5, 1370, y + 60]
                source_lines.extend([{'text': label, 'box': [40, y, 610, y + 50], 'confidence': .99},
                                     {'text': display, 'box': [650, y, 1370, y + 50], 'confidence': .99}])
            if scenario in {'N', 'O'}:
                # Explicit mocked engine conflict for offline review regressions, never live OCR evidence.
                source_lines[-1].update(crosscheck_candidate=f'{subtotal + vat + 1:.2f}',
                                        crosscheck_status='disagree', crosscheck_confidence=.95, needs_review=True)
                if scenario == 'O':
                    source_lines[-1].update(handwriting_candidate=values[-1], handwriting_candidate_unverified=True)
            distortions = []
            if scenario == 'J':
                image = ImageEnhance.Contrast(image).enhance(.25 + index % 3 * .1)
                image = image.filter(ImageFilter.GaussianBlur(.6))
                crease = ImageDraw.Draw(image)
                for x in (240, 720, 1120):
                    crease.line((x, 110, x + 25, 950), fill='#deddd8', width=4)
                # Crop blank paper margins, not the annotated evidence.
                image = image.crop((0, 0, 1380, 970))
                distortions.extend(['faded-thermal', 'blur', 'creased', 'cropped-margin'])
            if scenario == 'K':
                image = image.resize((5600, 4000))
                regions = {k: [v * 4 for v in box] for k, box in regions.items()}
                distortions.append('22.4MP')
            if scenario == 'N':
                image = image.rotate(2 + index % 3, expand=False, fillcolor='white')
                # Rotated-region alignment is not asserted by line metrics.
                regions = {}
                distortions.append('skew')
            if scenario == 'O':
                image = image.transform(image.size, Image.Transform.AFFINE, (1, .08, -40, 0, 1, 0), fillcolor='white')
                regions = {}
                distortions.append('simulated-handwriting-shear-not-real-handwriting')
            image.save(output / (ident + '.png'))
            truth = dict(schema='step-ocr-benchmark/v1', id=ident, scenario=scenario, synthetic=True,
                         seed=seed, fields=fields, raw_fields=dict(zip(FIELDS, [v.translate(str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙')) if index % 2 else v for v in values])),
                         document_type='abbreviated_tax_invoice' if index % 2 else 'tax_invoice',
                         regions=regions or {'document': [0, 0, image.width, image.height]},
                         region_alignment='document-only' if not regions else 'field',
                         distortions=distortions, simulated_handwriting=scenario == 'O',
                         font_sha256=hashlib.sha256(font_path.read_bytes()).hexdigest(),
                         fallback_font_sha256=hashlib.sha256(Path(fallback_font_path).read_bytes()).hexdigest() if fallback_font_path else None,
                         buyer_tax_id='1111111111111' if scenario == 'L' else '',
                         fixture_lines=source_lines)
            (output / (ident + '.truth.json')).write_text(json.dumps(truth, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    if include_phone_rotation:
        ident = 'N-phone-exif'
        with Image.open(output / 'H-001.png') as upright:
            exif = upright.getexif()
            exif[274] = 6
            upright.transpose(Image.Transpose.ROTATE_90).save(output / (ident + '.jpg'), quality=95, exif=exif)
        truth = json.loads((output / 'H-001.truth.json').read_text(encoding='utf-8'))
        truth.update(id=ident, scenario='N', distortions=['phone-EXIF-rotation'],
                     regions={'document': [0, 0, 1400, 1000]}, region_alignment='document-only', fixture_lines=[])
        (output / (ident + '.truth.json')).write_text(json.dumps(truth, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--font', required=True, type=Path, help='Licensed Thai TTF/OTF font, e.g. Noto Serif Thai (OFL)')
    parser.add_argument('--fallback-font', type=Path, help='Licensed Latin/digit TTF/OTF when the Thai font lacks those glyphs')
    parser.add_argument('--include-phone-rotation', action='store_true', help='Add one synthetic JPEG with phone EXIF rotation')
    parser.add_argument('--count', type=int, default=10, help='Images per scenario H–O')
    parser.add_argument('--seed', type=int, default=20261005)
    args = parser.parse_args()
    if not 1 <= args.count <= 100:
        parser.error('count must be 1..100')
    generate(args.output, args.font, args.count, args.seed, fallback_font_path=args.fallback_font,
             include_phone_rotation=args.include_phone_rotation)


if __name__ == '__main__':
    main()
