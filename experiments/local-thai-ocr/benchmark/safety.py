from pathlib import Path


def external_path(path, checkout):
    resolved = Path(path).expanduser().resolve()
    root = Path(checkout).resolve()
    if resolved == root or root in resolved.parents:
        raise ValueError('Private benchmark paths must be outside the checkout, including symlinks')
    for ancestor in (resolved, *resolved.parents):
        marker = ancestor / '.git'
        if marker.is_file() or marker.is_dir() and (marker / 'HEAD').exists():
            raise ValueError('Private benchmark paths must be outside every Git checkout')
    return resolved
