from __future__ import annotations

from PIL import Image


class ThaiHandwritingReader:
    """Optional Thai handwriting recognizer.

    The model is loaded only when a user explicitly enables handwriting fallback.
    On first use, Hugging Face model weights may be downloaded and cached locally.
    """

    MODEL_ID = "openthaigpt/thai-trocr"

    def __init__(self) -> None:
        try:
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        except ImportError as exc:
            raise ImportError(
                "Thai-TrOCR dependencies are missing. Install requirements-handwriting.txt."
            ) from exc

        self._processor = TrOCRProcessor.from_pretrained(self.MODEL_ID)
        self._model = VisionEncoderDecoderModel.from_pretrained(self.MODEL_ID)
        self._model.eval()

    def read(self, image: Image.Image) -> str:
        import torch

        rgb = image.convert("RGB")
        pixel_values = self._processor(images=rgb, return_tensors="pt").pixel_values
        with torch.inference_mode():
            generated_ids = self._model.generate(pixel_values, max_new_tokens=128)
        text = self._processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        return text.strip()
