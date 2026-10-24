"""The VICE-format label files ld65 writes with -Ln ("al 000800 .j_waitkey"), one per program."""

import pathlib
import re

LINE = re.compile(r'^al\s+(?:C:)?([0-9A-Fa-f]+)\s+\.(\S+)')


def read_labels(path):
    labels = {}
    for line in pathlib.Path(path).read_text().splitlines():
        match = LINE.match(line)
        if match and not match.group(2).startswith('@'):
            labels[match.group(2)] = int(match.group(1), 16)
    return labels
