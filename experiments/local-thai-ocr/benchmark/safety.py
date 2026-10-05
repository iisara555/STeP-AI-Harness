from pathlib import Path


def external_path(path, checkout):
    resolved = Path(path).expanduser().resolve()
    root = Path(checkout).resolve()
    if resolved == root or root in resolved.parents:
        raise ValueError('Private benchmark paths must be outside the checkout, including symlinks')
    return resolved
