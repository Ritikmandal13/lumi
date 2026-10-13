import glob
import os
import re

def patch():
    patterns = glob.glob('managed_components/**/engine.c', recursive=True)
    if not patterns:
        print('No engine.c found in managed_components')
        return

    for path in patterns:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        c1, n1 = re.subn(
            r'(static\s+engine_err_t\s+enable_capture_sink\s*\(\s*engine_t\s*\*eng\s*\)\s*\{)',
            r'\1\n    if (eng->options.media.capturer == NULL) return ENGINE_ERR_NONE;',
            content
        )
        c2, n2 = re.subn(
            r'(static\s+engine_err_t\s+media_stream_begin\s*\(\s*engine_t\s*\*eng\s*\)\s*\{)',
            r'\1\n    if (eng->options.media.capturer == NULL) return ENGINE_ERR_NONE;',
            c1
        )
        c3, n3 = re.subn(
            r'(static\s+engine_err_t\s+media_stream_end\s*\(\s*engine_t\s*\*eng\s*\)\s*\{)',
            r'\1\n    if (eng->options.media.capturer == NULL) return ENGINE_ERR_NONE;',
            c2
        )
        c4, n4 = re.subn(
            r'(static\s+engine_err_t\s+subscribe_tracks\s*\(\s*engine_t\s*\*eng,\s*livekit_pb_track_info_t\s*\*tracks,\s*int\s+count\s*\)\s*\{)',
            r'\1\n    (void)eng; (void)tracks; (void)count; return ENGINE_ERR_NONE;',
            c3
        )

        with open(path, 'w', encoding='utf-8') as f:
            f.write(c4)

        print(f'Successfully patched {path}: enable_capture_sink={n1}, media_stream_begin={n2}, media_stream_end={n3}, subscribe_tracks={n4}')

if __name__ == '__main__':
    patch()
