from __future__ import annotations
import json
import sys
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
import pytest

MODULE=Path(__file__).parents[2]/'scripts'/'export_mp4.py'
spec=spec_from_file_location('export_mp4',MODULE)
assert spec and spec.loader
module=module_from_spec(spec)
sys.modules['export_mp4']=module
spec.loader.exec_module(module)


def manifest(clips):return {'format':'edushareclass-export-v1','clips':clips}

def clip(**kwargs):return {'segmentId':'valid-uuid','sourceInMs':0,'sourceOutMs':2000,'rate':1,**kwargs}

def test_good_manifest():
    assert len(module.check_manifest(manifest([clip()])))==1

@pytest.mark.parametrize('bad',[{'segmentId':'../../etc/passwd'},{'rate':0},{'sourceInMs':1000,'sourceOutMs':100},{'sourceOutMs':float('nan')}])
def test_bad_params(bad):
    data=clip();data.update(bad)
    with pytest.raises(module.ExportError):module.check_manifest(manifest([data]))

def test_private_source_file(tmp_path):
    (tmp_path/'valid-uuid.webm').write_bytes(b'placeholder')
    assert module.file_for(tmp_path,'valid-uuid').name=='valid-uuid.webm'
    with pytest.raises(module.ExportError):module.file_for(tmp_path,'missing')
