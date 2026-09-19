import json
import subprocess

import pytest
from typer.testing import CliRunner

from codeverse.bundle import build_bundle, write_bundle
from codeverse.cli import app


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


@pytest.fixture
def repo(tmp_path):
    git(tmp_path, "init", "-q")
    git(tmp_path, "config", "user.name", "Test Author")
    git(tmp_path, "config", "user.email", "private@example.com")
    return tmp_path


def commit(repo, message):
    git(repo, "add", "-A")
    return git(repo, "-c", "commit.gpgsign=false", "commit", "-qm", message, "--allow-empty")


def test_history_keeps_empty_commits_and_rename_delete_events(repo):
    path = repo / 'old file.py'
    path.write_text('first\nsecond\n')
    commit(repo, 'create')
    first = git(repo, 'rev-parse', 'HEAD')
    commit(repo, 'empty commit')
    path.rename(repo / 'new\tfile.py')
    commit(repo, 'rename')
    (repo / 'new\tfile.py').unlink()
    commit(repo, 'delete')
    bundle = build_bundle(repo)
    assert len(bundle['commits']) == 4
    assert [e[0] for e in bundle['events']] == [0, 2, 3]
    assert [e[2] for e in bundle['events']] == [0, 3, 2]
    assert [e[3] for e in bundle['events']] == [2, 2, 0]
    assert bundle['events'][1][4] == bundle['nodes'].index('old file.py')
    assert len(build_bundle(repo, first)['commits']) == 1
    assert 'private@example.com' not in json.dumps(bundle)


def test_binary_and_recreated_files(repo):
    (repo / 'image.bin').write_bytes(b'\0\1\2')
    (repo / 'empty.py').touch()
    commit(repo, 'binary and empty')
    b = build_bundle(repo)
    assert len(b['nodes']) == 2
    assert all(e[3] == 0 for e in b['events'])
    (repo / 'empty.py').unlink()
    commit(repo, 'delete empty')
    (repo / 'empty.py').write_text('new\n')
    commit(repo, 'recreate')
    assert build_bundle(repo)['events'][-1][2:4] == [0, 1]


def test_cli_and_atomic_export(repo):
    (repo / 'main.py').write_text('print(1)\n')
    commit(repo, 'initial')
    output = repo / 'out' / 'bundle.json'
    result = CliRunner().invoke(app, ['analyze', str(repo), '-o', str(output)])
    assert result.exit_code == 0, result.output
    assert json.loads(output.read_text())['repo'] == repo.name
    output.write_text('keep me')
    with pytest.raises(ValueError):
        write_bundle({'invalid': float('nan')}, output)
    assert output.read_text() == 'keep me'
    assert not list(output.parent.glob('.bundle.json.*'))


def test_invalid_repo_and_revision_preserve_output(repo):
    output = repo / 'bundle.json'
    output.write_text('untouched')
    result = CliRunner().invoke(app, ['analyze', str(repo), '-o', str(output)])
    assert result.exit_code == 1
    assert 'Analysis failed' in result.output
    assert output.read_text() == 'untouched'
    commit(repo, 'initial')
    with pytest.raises(ValueError):
        build_bundle(repo, '--all')


def test_merge_history_matches_first_parent_tree(repo):
    (repo / 'main.py').write_text('main\n')
    commit(repo, 'initial')
    branch = git(repo, 'branch', '--show-current')
    git(repo, 'checkout', '-qb', 'feature')
    (repo / 'feature.py').write_text('feature\n')
    commit(repo, 'feature')
    git(repo, 'checkout', '-q', branch)
    git(repo, '-c', 'commit.gpgsign=false', 'merge', '--no-ff', '-qm', 'merge feature', 'feature')
    b = build_bundle(repo)
    assert len(b['commits']) == 2
    assert b['nodes'] == ['main.py', 'feature.py']
    assert b['events'][-1][0] == 1
