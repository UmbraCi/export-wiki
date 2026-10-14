"""Opt-in real export check using the app's existing credential, never printing it."""
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sidecar'))
from confluence_export_sidecar.exporter import export_migration_package
from confluence_export_sidecar.log import set_log_secrets

ids = ['119216273','110887961','119211130','119211353','119216305','119216308','119216310','119216315','119216318','119217959','119219054','119219659','119220688','119221270','119221366','119221798','119221801','119223437','119223820','119224041','119226611','119228180','119228183','119228194','119228310','119228319','119230098','119234027','119234827','119236793','119241479']
stored = json.loads((Path.home() / 'Library/Application Support/export-wiki/auth.json').read_text())
auth = dict(stored['metadata'])
auth['cookie' if auth['method'] in {'sso', 'cookie'} else 'api_token'] = stored['secret']
set_log_secrets(auth)
output = Path.home() / 'Downloads/wiki_export_md/resumable-test'
result = export_migration_package(page_ids=ids, auth=auth, output_dir=str(output))
with zipfile.ZipFile(result['package_path']) as archive:
    assert archive.testzip() is None
    pages = [name for name in archive.namelist() if name.endswith('.md')]
    assert len(pages) == len(ids), (len(pages), len(ids))
    print(json.dumps({'package':result['package_path'], 'pages':len(pages), 'attachments':result['attachments'], 'zip_bytes':Path(result['package_path']).stat().st_size}, ensure_ascii=False))
